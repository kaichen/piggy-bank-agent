/**
 * Cloudflare Voice Gateway for Gemini Live API
 *
 * This Worker + Durable Object acts as a WebSocket proxy between
 * the browser client and Gemini's real-time voice API.
 */

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_ACCESS_TOKEN?: string;
  GEMINI_OAUTH_SCOPE?: string;
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  VOICE_SESSIONS: DurableObjectNamespace;
}

// Gemini Live API WebSocket endpoint (use https with Upgrade: websocket)
const GEMINI_WS_URL =
  "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

// Model to use for voice
const MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";
const DEFAULT_OAUTH_SCOPE = "https://www.googleapis.com/auth/generative-language";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// System instruction for Piggy Mentor
const SYSTEM_INSTRUCTION = `A warm, rounded, and friendly male cartoon voice. The character sounds like a chubby, honest piggy. Thetone is soft, slightly deep but very cute, not scary. The speaking pace is relaxed and slightly slow,giving a feeling of being thoughtful and trustworthy, It has a tiny bit of nasal resonance (to hint atbeing a pig) but remains very clear and pleasant to listen to. Think of a mix between Winnie the Pooh andBaymax. It sounds optimistic, patient, and soothing for children. Please respond to the child.`;

/**
 * Main Worker entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // WebSocket endpoint
    if (url.pathname === "/ws") {
      const upgrade = request.headers.get("Upgrade");
      if (upgrade !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      // Get or create session ID
      const sid = url.searchParams.get("sid") || crypto.randomUUID();

      // Route to Durable Object
      const id = env.VOICE_SESSIONS.idFromName(sid);
      const stub = env.VOICE_SESSIONS.get(id);

      return stub.fetch(request);
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    return new Response("Gemini Voice Gateway", { status: 200 });
  },
};

/**
 * Helper: ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Helper: Base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signJwt(privateKeyPem: string, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(data));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return `${data}.${sigB64}`;
}

let cachedAccessToken: { value: string; expiresAtMs: number } | null = null;

async function getAccessToken(env: Env): Promise<string> {
  if (env.GEMINI_ACCESS_TOKEN) {
    return env.GEMINI_ACCESS_TOKEN;
  }

  if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Missing OAuth credentials: GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const scope = env.GEMINI_OAUTH_SCOPE || DEFAULT_OAUTH_SCOPE;
  const jwt = await signJwt(privateKey, {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope,
    aud: OAUTH_TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  });

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const resp = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await resp.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!resp.ok || !data.access_token) {
    throw new Error(`OAuth token exchange failed: ${resp.status} ${data.error || "unknown"}`);
  }

  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  cachedAccessToken = {
    value: data.access_token,
    expiresAtMs: Date.now() + expiresInMs,
  };

  return data.access_token;
}

async function getGeminiAuthHeaders(env: Env): Promise<{ headers: Record<string, string>; method: string }> {
  if (env.GEMINI_ACCESS_TOKEN || (env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY)) {
    const token = await getAccessToken(env);
    return { headers: { Authorization: `Bearer ${token}` }, method: "oauth" };
  }

  if (env.GEMINI_API_KEY) {
    return { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, method: "api_key" };
  }

  throw new Error("No Gemini authentication configured");
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function formatWsErrorEvent(event: Event): string {
  const anyEvent = event as { message?: unknown; error?: unknown; type?: unknown };
  const details: Record<string, unknown> = {
    type: anyEvent?.type ?? "unknown",
  };

  if (typeof anyEvent?.message === "string") {
    details.message = anyEvent.message;
  }
  if (anyEvent?.error !== undefined) {
    details.error = stringifyError(anyEvent.error);
  }

  return JSON.stringify(details);
}

function extractGeminiError(message: any): string | null {
  if (!message || typeof message !== "object") return null;
  if (message.error) {
    return stringifyError(message.error);
  }
  if (message.rpcStatus) {
    return stringifyError(message.rpcStatus);
  }
  return null;
}

/**
 * Client message types
 */
type ClientMessage = { type: "stop" };

/**
 * Durable Object for managing voice sessions
 */
export class VoiceSession {
  private state: DurableObjectState;
  private env: Env;

  private clientSocket?: WebSocket;
  private geminiSocket?: WebSocket;
  private isReady = false;
  private pendingAudio: ArrayBuffer[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(pair);

    // Accept the server side
    serverWs.accept();
    this.clientSocket = serverWs;

    // Set up client message handlers
    serverWs.addEventListener("message", (event) => {
      this.state.waitUntil(this.handleClientMessage(event));
    });

    serverWs.addEventListener("close", () => {
      this.cleanup("client_close");
    });

    serverWs.addEventListener("error", () => {
      this.cleanup("client_error");
    });

    // Connect to Gemini
    this.state.waitUntil(this.connectToGemini());

    // Return the client side of the WebSocket
    return new Response(null, {
      status: 101,
      webSocket: clientWs,
    });
  }

  /**
   * Connect to Gemini Live API
   */
  private async connectToGemini(): Promise<void> {
    try {
      const endpoint = new URL(GEMINI_WS_URL);
      console.log("Connecting to Gemini WS", {
        host: endpoint.host,
        path: endpoint.pathname,
        model: MODEL,
      });

      const auth = await getGeminiAuthHeaders(this.env);
      console.log("Gemini auth method", auth.method);

      const response = await fetch(GEMINI_WS_URL, {
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade",
          ...auth.headers,
        },
      });

      const ws = response.webSocket;
      if (!ws) {
        console.error("Gemini WS upgrade failed", { status: response.status });
        this.sendToClient({
          type: "error",
          message: "Gemini WS upgrade failed",
          details: `status=${response.status}`,
        });
        return;
      }

      ws.accept();
      this.geminiSocket = ws;

      console.log("Gemini WS open");
      console.log("Sending Gemini setup");
      ws.send(
        JSON.stringify({
          setup: {
            model: MODEL,
            generationConfig: {
              responseModalities: ["AUDIO"],
            },
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }],
            },
            realtimeInputConfig: {
              activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
            },
          },
        })
      );

      // Handle Gemini messages
      ws.addEventListener("message", (event) => {
        this.handleGeminiMessage(event);
      });

      ws.addEventListener("close", (event) => {
        const closeEvent = event as CloseEvent;
        console.log("Gemini connection closed", {
          code: closeEvent.code,
          reason: closeEvent.reason,
          wasClean: (closeEvent as unknown as { wasClean?: boolean }).wasClean,
        });
        this.cleanup("gemini_close");
      });

      ws.addEventListener("error", (event) => {
        const details = formatWsErrorEvent(event);
        console.error("Gemini connection error event:", details);
        this.sendToClient({
          type: "error",
          message: "Gemini connection error (see worker logs)",
          details,
        });
        this.cleanup("gemini_error");
      });
    } catch (error) {
      const details = stringifyError(error);
      console.error("Failed to connect to Gemini:", details);
      this.sendToClient({
        type: "error",
        message: "Failed to connect to Gemini (see worker logs)",
        details,
      });
    }
  }

  /**
   * Handle messages from Gemini
   */
  private handleGeminiMessage(event: MessageEvent): void {
    if (typeof event.data !== "string") return;

    let message: any;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    // Setup complete - ready to receive audio
    if (message.setupComplete) {
      console.log("Gemini setupComplete");
      this.isReady = true;
      this.sendToClient({ type: "ready" });

      // Flush any pending audio
      for (const audio of this.pendingAudio.splice(0)) {
        this.forwardAudioToGemini(audio);
      }
      return;
    }

    const serverContent = message.serverContent;
    const geminiError = extractGeminiError(message);
    if (geminiError) {
      console.error("Gemini error payload:", geminiError);
      this.sendToClient({
        type: "error",
        message: "Gemini returned an error (see worker logs)",
        details: geminiError,
      });
    }

    // Handle interruption (barge-in)
    if (serverContent?.interrupted) {
      this.sendToClient({ type: "interrupted" });
    }

    // Handle audio output
    const parts = serverContent?.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const inlineData = part.inlineData || part.inline_data;
        const base64Audio = inlineData?.data;

        if (typeof base64Audio === "string" && base64Audio.length > 0) {
          // Convert base64 to binary and send to client
          const audioBytes = base64ToUint8Array(base64Audio);
          this.clientSocket?.send(audioBytes);
        }
      }
    }

    // Handle turn complete
    if (serverContent?.turnComplete) {
      this.sendToClient({ type: "turn_complete" });
    }
  }

  /**
   * Handle messages from client
   */
  private async handleClientMessage(event: MessageEvent): Promise<void> {
    // Binary data = audio chunk
    if (event.data instanceof ArrayBuffer) {
      if (!this.isReady) {
        // Buffer audio until setup is complete
        if (this.pendingAudio.length < 10) {
          this.pendingAudio.push(event.data);
        }
        return;
      }

      this.forwardAudioToGemini(event.data);
      return;
    }

    // Text data = control message
    if (typeof event.data === "string") {
      let message: ClientMessage | undefined;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message?.type === "stop") {
        // Notify Gemini that audio stream ended
        try {
          this.geminiSocket?.send(
            JSON.stringify({
              realtimeInput: {
                audioStreamEnd: true,
              },
            })
          );
        } catch {}

        this.cleanup("client_stop");
      }
    }
  }

  /**
   * Forward audio chunk to Gemini
   */
  private forwardAudioToGemini(audioBuffer: ArrayBuffer): void {
    const base64Audio = arrayBufferToBase64(audioBuffer);

    this.geminiSocket?.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Audio,
          },
        },
      })
    );
  }

  /**
   * Send JSON message to client
   */
  private sendToClient(data: object): void {
    try {
      this.clientSocket?.send(JSON.stringify(data));
    } catch {}
  }

  /**
   * Clean up connections
   */
  private cleanup(reason: string): void {
    console.log(`Cleaning up session: ${reason}`);

    try {
      this.clientSocket?.close(1000, "Session ended");
    } catch {}

    try {
      this.geminiSocket?.close(1000, "Session ended");
    } catch {}

    this.clientSocket = undefined;
    this.geminiSocket = undefined;
    this.isReady = false;
    this.pendingAudio = [];
  }
}
