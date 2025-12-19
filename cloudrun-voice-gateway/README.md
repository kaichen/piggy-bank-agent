# Cloud Run Gemini Voice Gateway

Python WebSocket gateway for Gemini Live API, compatible with Cloud Run.

## What it does

- Browser WS (PCM16 16kHz) -> Gemini Live WS
- Gemini audio output (PCM16 24kHz) -> Browser WS
- Emits control messages: `ready`, `interrupted`, `turn_complete`, `error`

## Prerequisites

- Enable the Generative Language API in your GCP project
- Cloud Run service account with permission to call the Gemini API

## Configure

The gateway uses OAuth2 (API keys are not supported by this WebSocket endpoint).

Optional environment variables:

- `GEMINI_MODEL` (default: `models/gemini-2.5-flash-native-audio-preview-12-2025`)
- `GEMINI_SYSTEM_INSTRUCTION` (override system prompt)
- `GEMINI_OAUTH_SCOPE` (default: `https://www.googleapis.com/auth/generative-language`)
- `GEMINI_ACCESS_TOKEN` (override token, useful for local testing)

## Deploy to Cloud Run

```bash
gcloud run deploy gemini-voice-gateway \
  --source . \
  --region <region> \
  --allow-unauthenticated
```

After deploy, set the front-end env:

```
NEXT_PUBLIC_VOICE_WS_BASE=wss://<cloudrun-service-domain>/ws
```

## Local development

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
uvicorn server:app --reload --port 8080
```

Then use:

```
NEXT_PUBLIC_VOICE_WS_BASE=ws://localhost:8080/ws
```

## Endpoints

- `GET /health` -> `ok`
- `GET /` -> `Gemini Live Voice Gateway`
- `WS /ws` -> voice session
