"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useConversation } from "@elevenlabs/react"
import { Menu, PhoneOff, Phone, Mic, MicOff } from "lucide-react"

type CallStatus = "idle" | "connecting" | "connected" | "error"

export default function TalkPage() {
  const router = useRouter()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // ElevenLabs agent ID from environment
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || ""

  const conversation = useConversation({
    onConnect: () => {
      console.log("[Talk] Connected to ElevenLabs")
      setErrorMessage(null)
    },
    onDisconnect: () => {
      console.log("[Talk] Disconnected from ElevenLabs")
    },
    onError: (error) => {
      console.error("[Talk] ElevenLabs error:", error)
      setErrorMessage(error.message || "Connection error")
    },
    onMessage: (message) => {
      console.log("[Talk] Message:", message)
    },
  })

  // Derive status from conversation state
  const status: CallStatus =
    errorMessage ? "error" :
    conversation.status === "connected" ? "connected" :
    conversation.status === "connecting" ? "connecting" :
    "idle"

  // Timer for call duration
  useEffect(() => {
    if (status !== "connected") {
      setElapsedSeconds(0)
      return
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [status])

  // Format elapsed time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }, [])

  // Start voice call
  const startCall = useCallback(async () => {
    if (!agentId) {
      setErrorMessage("ElevenLabs agent not configured")
      return
    }

    setErrorMessage(null)

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true })

      // Start the conversation
      await conversation.startSession({
        agentId,
      })
    } catch (err) {
      console.error("[Talk] Failed to start:", err)
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setErrorMessage("Microphone access denied")
        } else {
          setErrorMessage(err.message)
        }
      } else {
        setErrorMessage("Failed to start conversation")
      }
    }
  }, [agentId, conversation])

  // Stop voice call
  const stopCall = useCallback(async () => {
    try {
      await conversation.endSession()
    } catch (err) {
      console.error("[Talk] Failed to stop:", err)
    }
  }, [conversation])

  // End call and navigate
  const handleEndCall = useCallback(() => {
    stopCall()
    router.push("/vault")
  }, [stopCall, router])

  // Toggle mute
  const toggleMute = useCallback(async () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)

    if (newMuted) {
      await conversation.setVolume({ volume: 0 })
    } else {
      await conversation.setVolume({ volume: 1 })
    }
  }, [isMuted, conversation])

  // Get status text
  const getStatusText = () => {
    if (errorMessage) return errorMessage
    if (status === "connecting") return "Connecting to Piggy Mentor..."
    if (status === "connected") {
      if (conversation.isSpeaking) return "Piggy is speaking..."
      return "Listening..."
    }
    return "Tap to start talking with Piggy Mentor"
  }

  const isConnected = status === "connected"
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
            } ${conversation.isSpeaking ? "animate-pulse" : ""}`}
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
            {getStatusText()}
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
