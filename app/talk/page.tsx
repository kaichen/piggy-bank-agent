"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAccount } from "wagmi"
import { Menu, PhoneOff, Phone, Mic, MicOff } from "lucide-react"

// Audio constants - OpenAI uses 24kHz for both input and output
const TARGET_IN_RATE = 24000
const MODEL_OUT_RATE = 24000

type CallStatus = "idle" | "connecting" | "ready" | "running" | "error"

// Resample Float32 audio to Int16 PCM at target rate
function resampleToInt16(input: Float32Array, inRate: number, outRate: number): Int16Array {
  if (outRate === inRate) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
  }

  const ratio = inRate / outRate
  const newLen = Math.round(input.length / ratio)
  const out = new Int16Array(newLen)

  for (let o = 0; o < newLen; o++) {
    const srcIdx = o * ratio
    const srcIdxFloor = Math.floor(srcIdx)
    const srcIdxCeil = Math.min(srcIdxFloor + 1, input.length - 1)
    const t = srcIdx - srcIdxFloor
    const sample = input[srcIdxFloor] * (1 - t) + input[srcIdxCeil] * t
    const s = Math.max(-1, Math.min(1, sample))
    out[o] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export default function TalkPage() {
  const router = useRouter()
  const { address: walletAddress, isConnected: isWalletConnected } = useAccount()
  const [status, setStatus] = useState<CallStatus>("idle")
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [currentText, setCurrentText] = useState("Tap to start talking with Piggy Mentor")
  const [isMuted, setIsMuted] = useState(false)
  const statusRef = useRef<CallStatus>(status)
  const isMutedRef = useRef(isMuted)

  // WebSocket and audio refs
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  // Playback queue refs
  const playHeadRef = useRef<number>(0)
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())

  // Session ID
  const sid = useMemo(() => crypto.randomUUID(), [])

  // WebSocket base URL from env
  const wsBase = process.env.NEXT_PUBLIC_VOICE_WS_BASE || ""

  // Timer for call duration
  useEffect(() => {
    if (status !== "running") return
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [status])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  // Format elapsed time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }, [])

  // Stop all playback (for barge-in)
  const stopPlayback = useCallback(() => {
    const ctx = audioCtxRef.current
    for (const s of playingSourcesRef.current) {
      try {
        s.stop()
      } catch {}
    }
    playingSourcesRef.current.clear()
    playHeadRef.current = ctx ? ctx.currentTime : 0
  }, [])

  // Enqueue PCM 24kHz audio for playback
  const enqueuePcm = useCallback((chunk: ArrayBuffer) => {
    const ctx = audioCtxRef.current
    if (!ctx) return

    const i16 = new Int16Array(chunk)
    const f32 = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) {
      f32[i] = i16[i] / 32768
    }

    const buf = ctx.createBuffer(1, f32.length, MODEL_OUT_RATE)
    buf.copyToChannel(f32, 0)

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)

    const startAt = Math.max(playHeadRef.current, ctx.currentTime)
    src.start(startAt)
    playHeadRef.current = startAt + buf.duration

    playingSourcesRef.current.add(src)
    src.onended = () => playingSourcesRef.current.delete(src)
  }, [])

  const cleanupCall = useCallback(() => {
    stopPlayback()

    try {
      processorRef.current?.disconnect()
    } catch {}
    processorRef.current = null

    try {
      sourceRef.current?.disconnect()
    } catch {}
    sourceRef.current = null

    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) {
        t.stop()
      }
      streamRef.current = null
    }
  }, [stopPlayback])

  // Start microphone capture
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: TARGET_IN_RATE,
        },
      })

      streamRef.current = stream

      const ctx = audioCtxRef.current ?? new AudioContext({ sampleRate: TARGET_IN_RATE })
      audioCtxRef.current = ctx
      await ctx.resume()

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source

      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const w = wsRef.current
        if (!w || w.readyState !== WebSocket.OPEN || isMutedRef.current) return
        if (statusRef.current !== "running") return

        const input = e.inputBuffer.getChannelData(0)
        const pcm16 = resampleToInt16(input, ctx.sampleRate, TARGET_IN_RATE)
        w.send(pcm16.buffer)
      }

      source.connect(processor)
      processor.connect(ctx.destination)
      return true
    } catch (err) {
      console.error("Failed to start microphone:", err)
      setStatus("error")
      setCurrentText("Microphone access denied")
      return false
    }
  }, [])

  // Start voice call
  const startCall = useCallback(async () => {
    if (status !== "idle" || !wsBase) {
      if (!wsBase) {
        setCurrentText("Voice service not configured")
        setStatus("error")
      }
      return
    }

    setStatus("connecting")
    setCurrentText("Connecting to Piggy Mentor...")
    setElapsedSeconds(0)

    // Build WebSocket URL with session ID and wallet address
    const wsUrl = new URL(wsBase)
    wsUrl.searchParams.set("sid", sid)
    if (walletAddress) {
      wsUrl.searchParams.set("wallet", walletAddress)
    }

    const ws = new WebSocket(wsUrl.toString())
    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    ws.onopen = async () => {
      console.log("[Talk] WebSocket opened")
      // Initialize AudioContext
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext({ sampleRate: TARGET_IN_RATE })
      }
      await audioCtxRef.current.resume()
    }

    ws.onmessage = (ev) => {
      // Text message from gateway
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === "ready") {
            setStatus("ready")
            setCurrentText("Connected! Starting microphone...")
            startMic().then((ok) => {
              if (ok) {
                setStatus("running")
                setCurrentText("Listening...")
              }
            })
          }
          if (msg.type === "interrupted") {
            stopPlayback()
          }
          if (msg.type === "turn_complete") {
            setCurrentText("Listening...")
          }
          if (msg.type === "transcript") {
            if (msg.role === "assistant") {
              setCurrentText("Piggy is speaking...")
            }
          }
          if (msg.type === "error") {
            setStatus("error")
            setCurrentText(msg.message || "Connection error")
            try {
              ws.close()
            } catch {}
          }
        } catch {}
        return
      }

      // Binary message: audio from OpenAI
      if (ev.data instanceof ArrayBuffer) {
        setCurrentText("Piggy is speaking...")
        enqueuePcm(ev.data)
      }
    }

    ws.onerror = () => {
      setStatus("error")
      setCurrentText("Connection error")
      try {
        ws.close()
      } catch {}
    }

    ws.onclose = () => {
      console.log("[Talk] WebSocket closed")
      cleanupCall()
      if (statusRef.current !== "error") {
        setStatus("idle")
        setCurrentText("Call ended")
      }
    }
  }, [status, wsBase, sid, walletAddress, startMic, stopPlayback, enqueuePcm, cleanupCall])

  // Stop voice call
  const stopCall = useCallback(() => {
    try {
      wsRef.current?.send(JSON.stringify({ type: "stop" }))
    } catch {}
    try {
      wsRef.current?.close()
    } catch {}
    wsRef.current = null

    cleanupCall()

    setStatus("idle")
    setCurrentText("Call ended")
  }, [cleanupCall])

  // End call and navigate
  const handleEndCall = useCallback(() => {
    stopCall()
    router.push("/vault")
  }, [stopCall, router])

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev)
  }, [])

  // Cleanup on unmount
  const stopCallRef = useRef(stopCall)
  useEffect(() => {
    stopCallRef.current = stopCall
  }, [stopCall])

  useEffect(() => {
    return () => {
      stopCallRef.current()
    }
  }, [])

  const isConnected = status === "ready" || status === "running"
  const isIdle = status === "idle"

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-pink-50 to-pink-100">
      {/* Header */}
      <header className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
            <span className="text-sm font-bold text-white">🐷</span>
          </div>
          <span className="text-xl font-bold text-slate-900">BitPiggy</span>
        </div>
        <button className="p-2">
          <Menu className="h-6 w-6 text-slate-600" />
        </button>
      </header>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center px-6 py-8">
        {/* Avatar */}
        <div className="mb-6">
          <div
            className={`flex h-48 w-48 items-center justify-center overflow-hidden rounded-full border-4 border-white shadow-lg transition-all ${
              isConnected
                ? "bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500"
                : "bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400"
            } ${status === "running" ? "animate-pulse" : ""}`}
          >
            <span className="text-8xl">🐷</span>
          </div>
        </div>

        {/* Name */}
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Piggy Mentor</h1>

        {/* Call Duration / Status */}
        <div className="mb-8 flex items-center gap-2">
          {isConnected ? (
            <>
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="font-mono text-lg text-green-600">{formatTime(elapsedSeconds)}</span>
            </>
          ) : status === "connecting" ? (
            <>
              <div className="h-2 w-2 animate-ping rounded-full bg-orange-500" />
              <span className="font-mono text-lg text-orange-600">Connecting...</span>
            </>
          ) : status === "error" ? (
            <>
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="font-mono text-lg text-red-600">Error</span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="font-mono text-lg text-slate-500">Ready to call</span>
            </>
          )}
        </div>

        {/* Status Text */}
        <div className="mb-auto flex min-h-[80px] items-center justify-center px-4">
          <p className="text-center text-xl font-medium text-slate-600">
            {currentText}
          </p>
        </div>

        {/* Call Control Area */}
        <div className="w-full max-w-md rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-lg">
          <div className="flex items-center justify-center gap-6">
            {/* Mute Button (only when connected) */}
            {isConnected && (
              <button
                onClick={toggleMute}
                className={`flex h-14 w-14 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 active:scale-95 ${
                  isMuted ? "bg-orange-500" : "bg-slate-200"
                }`}
              >
                {isMuted ? (
                  <MicOff className="h-6 w-6 text-white" />
                ) : (
                  <Mic className="h-6 w-6 text-slate-600" />
                )}
              </button>
            )}

            {/* Main Call Button */}
            {isIdle || status === "error" ? (
              <button
                onClick={startCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                <Phone className="h-7 w-7 text-white" />
              </button>
            ) : (
              <button
                onClick={handleEndCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                <PhoneOff className="h-7 w-7 text-white" />
              </button>
            )}

            {/* Spacer for symmetry when connected */}
            {isConnected && <div className="h-14 w-14" />}
          </div>

          {/* Hint text */}
          <p className="mt-4 text-center text-sm text-slate-400">
            {isIdle || status === "error"
              ? "Tap to start a voice call"
              : isConnected
                ? "Speak naturally - Piggy will respond"
                : "Please wait..."}
          </p>
        </div>
      </div>
    </main>
  )
}
