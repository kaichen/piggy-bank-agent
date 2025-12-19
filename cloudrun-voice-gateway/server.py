import asyncio
import base64
import json
import logging
import os
import time
from datetime import timezone
from typing import Any, Dict, Optional

import google.auth
from google.auth.transport.requests import Request
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
import websockets
from websockets.exceptions import ConnectionClosed

GEMINI_WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)
MODEL = os.getenv("GEMINI_MODEL", "models/gemini-2.5-flash-native-audio-preview-12-2025")
SYSTEM_INSTRUCTION = os.getenv(
    "GEMINI_SYSTEM_INSTRUCTION",
    "A warm, rounded, and friendly male cartoon voice. The character sounds like a chubby, honest piggy. "
    "The tone is soft, slightly deep but very cute, not scary. The speaking pace is relaxed and slightly slow, "
    "giving a feeling of being thoughtful and trustworthy. It has a tiny bit of nasal resonance (to hint at "
    "being a pig) but remains very clear and pleasant to listen to. Think of a mix between Winnie the Pooh and "
    "Baymax. It sounds optimistic, patient, and soothing for children. Please respond to the child.",
)
DEFAULT_OAUTH_SCOPE = "https://www.googleapis.com/auth/generative-language"

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("voice-gateway")

app = FastAPI()

_token_lock = asyncio.Lock()
_cached_token: Optional[str] = None
_cached_expiry: float = 0.0
_cached_credentials = None


def encode_base64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def decode_base64(data: str) -> bytes:
    return base64.b64decode(data)


async def _load_default_credentials(scope: str):
    global _cached_credentials
    if _cached_credentials is not None:
        return _cached_credentials

    def _load():
        credentials, _ = google.auth.default(scopes=[scope])
        return credentials

    _cached_credentials = await asyncio.to_thread(_load)
    return _cached_credentials


async def get_access_token() -> str:
    override = os.getenv("GEMINI_ACCESS_TOKEN")
    if override:
        return override

    if os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("API keys are not supported for Gemini Live API WebSocket. Use OAuth2.")

    scope = os.getenv("GEMINI_OAUTH_SCOPE", DEFAULT_OAUTH_SCOPE)

    global _cached_token, _cached_expiry
    async with _token_lock:
        if _cached_token and (_cached_expiry - time.time()) > 60:
            return _cached_token

        credentials = await _load_default_credentials(scope)
        await asyncio.to_thread(credentials.refresh, Request())

        token = credentials.token
        expiry = getattr(credentials, "expiry", None)
        if expiry is not None:
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            _cached_expiry = expiry.timestamp()
        else:
            _cached_expiry = time.time() + 3300

        if not token:
            raise RuntimeError("Failed to obtain access token")

        _cached_token = token
        return token


async def connect_gemini() -> websockets.WebSocketClientProtocol:
    token = await get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
    }
    logger.info("Connecting to Gemini WS")
    return await websockets.connect(
        GEMINI_WS_URL,
        extra_headers=headers,
        max_size=None,
        ping_interval=20,
        ping_timeout=20,
    )


def build_setup_message() -> Dict[str, Any]:
    return {
        "setup": {
            "model": MODEL,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
            },
            "systemInstruction": {
                "parts": [{"text": SYSTEM_INSTRUCTION}],
            },
            "realtimeInputConfig": {
                "activityHandling": "START_OF_ACTIVITY_INTERRUPTS",
            },
        }
    }


@app.get("/")
async def root():
    return PlainTextResponse("Gemini Live Voice Gateway")


@app.get("/health")
async def health():
    return PlainTextResponse("ok")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        gemini_ws = await connect_gemini()
    except Exception as error:
        logger.exception("Failed to connect to Gemini")
        await websocket.send_text(
            json.dumps({"type": "error", "message": str(error) or "Gemini connection failed"})
        )
        await websocket.close()
        return

    await gemini_ws.send(json.dumps(build_setup_message()))
    logger.info("Sent Gemini setup")

    ready_event = asyncio.Event()
    pending_audio: list[bytes] = []
    stop_event = asyncio.Event()

    async def send_audio_chunk(data: bytes) -> None:
        payload = {
            "realtimeInput": {
                "audio": {
                    "mimeType": "audio/pcm;rate=16000",
                    "data": encode_base64(data),
                }
            }
        }
        await gemini_ws.send(json.dumps(payload))

    async def handle_client_to_gemini() -> None:
        try:
            while True:
                message = await websocket.receive()
                if message.get("type") == "websocket.disconnect":
                    break

                data_bytes = message.get("bytes")
                data_text = message.get("text")

                if data_bytes is not None:
                    if not ready_event.is_set():
                        if len(pending_audio) < 8:
                            pending_audio.append(data_bytes)
                        continue
                    await send_audio_chunk(data_bytes)
                    continue

                if data_text:
                    try:
                        payload = json.loads(data_text)
                    except json.JSONDecodeError:
                        continue

                    if payload.get("type") == "stop":
                        await gemini_ws.send(
                            json.dumps({"realtimeInput": {"audioStreamEnd": True}})
                        )
                        break
        except WebSocketDisconnect:
            pass
        finally:
            stop_event.set()

    async def handle_gemini_to_client() -> None:
        try:
            async for raw in gemini_ws:
                if isinstance(raw, bytes):
                    continue

                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                if message.get("setupComplete"):
                    ready_event.set()
                    await websocket.send_text(json.dumps({"type": "ready"}))
                    while pending_audio:
                        await send_audio_chunk(pending_audio.pop(0))
                    continue

                if message.get("error") or message.get("rpcStatus"):
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "message": "Gemini error",
                                "details": message.get("error") or message.get("rpcStatus"),
                            }
                        )
                    )

                server_content = message.get("serverContent", {})
                if server_content.get("interrupted"):
                    await websocket.send_text(json.dumps({"type": "interrupted"}))

                parts = server_content.get("modelTurn", {}).get("parts", [])
                if isinstance(parts, list):
                    for part in parts:
                        inline_data = part.get("inlineData") or part.get("inline_data") or {}
                        data = inline_data.get("data")
                        if isinstance(data, str) and data:
                            await websocket.send_bytes(decode_base64(data))

                if server_content.get("turnComplete"):
                    await websocket.send_text(json.dumps({"type": "turn_complete"}))
        except ConnectionClosed:
            pass
        finally:
            stop_event.set()

    client_task = asyncio.create_task(handle_client_to_gemini())
    gemini_task = asyncio.create_task(handle_gemini_to_client())

    await stop_event.wait()
    for task in (client_task, gemini_task):
        task.cancel()

    try:
        await gemini_ws.close()
    except Exception:
        pass

    try:
        await websocket.close()
    except Exception:
        pass
