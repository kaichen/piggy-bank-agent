你要的“最小可跑通”形态是：**Vercel 只托管 Next.js 前端**（按钮开关 + 采集/播放音频），**Cloud Run 上跑 Python WebSocket 网关**（客户端 WS ↔ Gemini Live WS），因为 **Vercel Functions 仍不支持 WebSocket**。
Gemini Live API 的 WS 端点是 `.../GenerativeService.BidiGenerateContent`，消息必须是 `setup | realtimeInput | clientContent | toolResponse` 四选一；默认支持“start of activity interrupts（barge-in）”。
音频：输入 **PCM16 LE**（推荐 16kHz），输出 **PCM16 LE 24kHz**；音频 Blob 用 `mimeType` + `data(base64)`。

---

## 1) Cloud Run：Voice Gateway（Python）

网关在 `cloudrun-voice-gateway/`，用 FastAPI + WebSocket 代理客户端和 Gemini Live WS。

部署示例：

```bash
gcloud run deploy gemini-voice-gateway \
  --source cloudrun-voice-gateway \
  --region <region> \
  --allow-unauthenticated
```

前端配置：

```
NEXT_PUBLIC_VOICE_WS_BASE=wss://<cloudrun-service-domain>/ws
```

更多细节见 `cloudrun-voice-gateway/README.md`。

---

## 2) Vercel：Next.js 前端（单按钮开关 + 打断）

### 环境变量（Vercel）

`NEXT_PUBLIC_VOICE_WS_BASE = wss://<你的cloudflare域名>/ws`

### `app/talk/page.tsx`

```tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const TARGET_IN_RATE = 16000;
const MODEL_OUT_RATE = 24000;

function downsampleToInt16(input: Float32Array, inRate: number, outRate: number): Int16Array {
  if (outRate === inRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? (s * 0x8000) : (s * 0x7fff);
    }
    return out;
  }

  const ratio = inRate / outRate;
  const newLen = Math.round(input.length / ratio);
  const out = new Int16Array(newLen);

  let o = 0;
  let i = 0;
  while (o < newLen) {
    const nextI = Math.round((o + 1) * ratio);
    let sum = 0;
    let cnt = 0;
    for (; i < nextI && i < input.length; i++) {
      sum += input[i];
      cnt++;
    }
    const s = Math.max(-1, Math.min(1, cnt ? sum / cnt : 0));
    out[o++] = s < 0 ? (s * 0x8000) : (s * 0x7fff);
  }
  return out;
}

export default function Page() {
  const wsBase = process.env.NEXT_PUBLIC_VOICE_WS_BASE!;
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "running">("idle");

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // 播放队列（用于可打断）
  const playHeadRef = useRef<number>(0);
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const sid = useMemo(() => crypto.randomUUID(), []);

  function stopPlayback() {
    const ctx = audioCtxRef.current;
    for (const s of playingSourcesRef.current) {
      try { s.stop(); } catch {}
    }
    playingSourcesRef.current.clear();
    playHeadRef.current = ctx ? ctx.currentTime : 0;
  }

  function enqueuePcm24k(chunk: ArrayBuffer) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const i16 = new Int16Array(chunk);
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

    const buf = ctx.createBuffer(1, f32.length, MODEL_OUT_RATE);
    buf.copyToChannel(f32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const startAt = Math.max(playHeadRef.current, ctx.currentTime);
    src.start(startAt);
    playHeadRef.current = startAt + buf.duration;

    playingSourcesRef.current.add(src);
    src.onended = () => playingSourcesRef.current.delete(src);
  }

  async function start() {
    if (status !== "idle") return;

    setStatus("connecting");

    const ws = new WebSocket(`${wsBase}?sid=${sid}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = async () => {
      // 让 AudioContext 绑定到用户手势，避免 autoplay 限制
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      await audioCtxRef.current.resume();
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ready") {
          setStatus("ready");
          // ready 后再开麦（避免 setupComplete 前白送音频）
          void startMic();
          setStatus("running");
        }
        if (msg.type === "interrupted") {
          stopPlayback();
        }
        return;
      }

      if (ev.data instanceof ArrayBuffer) {
        enqueuePcm24k(ev.data);
      }
    };

    ws.onerror = () => stop();
    ws.onclose = () => stop();
  }

  async function startMic() {
    const ws = wsRef.current;
    if (!ws) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    streamRef.current = stream;

    const ctx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);

    // 最小实现用 ScriptProcessor（足够 Demo），拿到 PCM -> 下采样 16k -> Int16 -> WS 发送
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const w = wsRef.current;
      if (!w || w.readyState !== WebSocket.OPEN) return;

      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = downsampleToInt16(input, ctx.sampleRate, TARGET_IN_RATE);
      w.send(pcm16.buffer);
    };

    source.connect(processor);
    processor.connect(ctx.destination); // 某些浏览器需要连接到 destination 才会触发回调
  }

  function stop() {
    if (status === "idle") return;

    try { wsRef.current?.send(JSON.stringify({ type: "stop" })); } catch {}
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;

    stopPlayback();

    try { processorRef.current?.disconnect(); } catch {}
    processorRef.current = null;

    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }

    setStatus("idle");
  }

  // “打断”策略：你一开口，服务端默认 barge-in；客户端同时收到 interrupted 时清空播放队列 
  // 额外的“手动打断”：你也可以在 UI 上提供一个 stopPlayback() 按钮（这里省略，保持最小）

  useEffect(() => () => stop(), []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
      <h1>Gemini Native Audio 实时对话（最小版）</h1>

      <button
        onClick={status === "idle" ? start : stop}
        style={{ padding: "10px 14px", fontSize: 16 }}
      >
        {status === "idle" ? "开始对话" : "结束对话"}
      </button>

      <p style={{ marginTop: 12, opacity: 0.8 }}>
        当前状态：{status}
      </p>

      <p style={{ marginTop: 12, opacity: 0.8 }}>
        说明：开始后会持续送麦克风音频，Gemini 用 VAD 自动分轮；你说话即可打断模型语音输出（barge-in）。
      </p>
    </main>
  );
}
```

---

## 3) 你真正“只需改两处”就能得到按钮按住说话（Push-to-talk）

如果你不想“持续送音频”，而是“按按钮开始/结束一轮发言”：

* 在 setup 里把 `realtimeInputConfig.automaticActivityDetection.disabled = true`，并保留 `activityHandling: START_OF_ACTIVITY_INTERRUPTS`。
* 前端改为：按下按钮先发 `{"realtimeInput":{"activityStart":{}}}`，松开发 `{"realtimeInput":{"activityEnd":{}}}`（两条都是 JSON 文本），音频 chunk 只在按住期间发送。

你先把这个最小版跑起来（能说、能回、能打断）。下一步如果你要接 Vercel AI SDK 做 tool calling，我建议让 Cloudflare DO 收到 `toolCall` 后用 HTTP 调 Vercel 的 `/api/tools/...`，再用 `toolResponse` 回灌给 Gemini（这不会破坏实时链路，也不需要 Vercel 支持 WS）。
