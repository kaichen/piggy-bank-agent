# Gemini Voice Gateway

Cloudflare Workers + Durable Objects WebSocket gateway for Gemini Live API.

## Setup

1. Install dependencies:

```bash
cd cloudflare-voice-gateway
npm install
```

2. Set up Gemini API key:

```bash
npx wrangler secret put GEMINI_API_KEY
# Enter your Gemini API key when prompted
```

3. Deploy to Cloudflare:

```bash
npm run deploy
```

4. Note your deployed URL (e.g., `https://gemini-voice-gateway.<your-subdomain>.workers.dev`)

5. Set the environment variable in your Next.js app:

```bash
# In .env.local
NEXT_PUBLIC_VOICE_WS_BASE=wss://gemini-voice-gateway.<your-subdomain>.workers.dev/ws
```

## Local Development

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`.

For local testing, use:
```
NEXT_PUBLIC_VOICE_WS_BASE=ws://localhost:8787/ws
```

## Architecture

```
Browser (Next.js)
    │
    │ WebSocket (PCM16 16kHz audio)
    ▼
Cloudflare Worker
    │
    │ Routes to Durable Object
    ▼
Durable Object (VoiceSession)
    │
    │ WebSocket (JSON + Base64 audio)
    ▼
Gemini Live API
```

## API

### WebSocket Endpoint

`GET /ws?sid=<session-id>`

- `sid` (optional): Session ID for reconnection. Auto-generated if not provided.

### Client → Gateway Messages

- **Binary (ArrayBuffer)**: PCM16 audio at 16kHz
- **JSON `{ type: "stop" }`**: End the session

### Gateway → Client Messages

- **Binary (ArrayBuffer)**: PCM16 audio at 24kHz from Gemini
- **JSON `{ type: "ready" }`**: Setup complete, ready for audio
- **JSON `{ type: "interrupted" }`**: Barge-in detected, clear playback queue
- **JSON `{ type: "turn_complete" }`**: Model finished speaking
- **JSON `{ type: "error", message: "..." }`**: Error occurred

## Features

- **Real-time voice chat** with Gemini
- **Barge-in support**: Interrupt the model by speaking
- **Automatic voice activity detection**: No push-to-talk needed
- **Session management**: Each connection gets a dedicated Durable Object
