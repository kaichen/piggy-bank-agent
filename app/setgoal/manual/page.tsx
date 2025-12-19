"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

const BTC_PRICE = 87500 // Placeholder BTC price in USD
const DRAFT_KEY = "piggy-goal-draft"

interface GoalData {
  targetBTC: number
  durationYears: number
  vaultId?: string
}

export default function ManualSetGoalPage() {
  const [targetBTC, setTargetBTC] = useState(1.0)
  const [durationYears, setDurationYears] = useState(11)
  const [isLoaded, setIsLoaded] = useState(false)

  // Computed values
  const monthlyBTC = targetBTC / (durationYears * 12)
  const monthlyUSD = monthlyBTC * BTC_PRICE

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved) {
      try {
        const data: GoalData = JSON.parse(saved)
        setTargetBTC(data.targetBTC)
        setDurationYears(data.durationYears)
      } catch {
        // Invalid data, use defaults
      }
    }
    setIsLoaded(true)
  }, [])

  // Save to localStorage on change (only after initial load)
  useEffect(() => {
    if (!isLoaded) return
    const data: GoalData = { targetBTC, durationYears }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  }, [targetBTC, durationYears, isLoaded])

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
      {/* Header */}
      <header className="flex h-16 items-center px-4">
        <Link href="/setgoal" className="p-2">
          <ArrowLeft className="h-6 w-6 text-slate-600" />
        </Link>
      </header>

      {/* Content */}
      <div className="flex flex-col items-center px-6 py-6">
        {/* Bitcoin Icon */}
        <div className="mb-4 flex h-48 w-48 items-center justify-center">
          <DotLottieReact
            src="/lotties/deposit.json"
            loop
            autoplay
          />
        </div>

        {/* Target Goal Label */}
        <p className="mb-1 text-sm tracking-widest text-slate-500">TARGET GOAL</p>

        {/* Target Amount Display */}
        <h1 className="mb-6 text-5xl font-bold text-slate-900">
          {targetBTC.toFixed(1)} <span className="text-orange-500">BTC</span>
        </h1>

        {/* Goal Slider */}
        <div className="mb-8 w-full max-w-md">
          <Slider
            value={[targetBTC]}
            onValueChange={(values) => setTargetBTC(values[0])}
            min={0.1}
            max={10}
            step={0.1}
            className="[&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500 [&_[data-slot=slider-thumb]]:h-5 [&_[data-slot=slider-thumb]]:w-5 [&_[data-slot=slider-track]]:bg-slate-700 [&_[data-slot=slider-track]]:h-2"
          />
        </div>

        {/* Duration Card */}
        <div className="mb-6 w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-semibold text-slate-900">Duration</span>
            <span className="rounded-full border border-slate-200 px-4 py-1 text-sm font-medium text-slate-700">
              {durationYears} Years
            </span>
          </div>

          <Slider
            value={[durationYears]}
            onValueChange={(values) => setDurationYears(values[0])}
            min={1}
            max={21}
            step={1}
            className="mb-4 [&_[data-slot=slider-range]]:bg-slate-700 [&_[data-slot=slider-thumb]]:border-slate-700 [&_[data-slot=slider-thumb]]:h-5 [&_[data-slot=slider-thumb]]:w-5 [&_[data-slot=slider-track]]:bg-slate-300 [&_[data-slot=slider-track]]:h-2"
          />

          <p className="text-center text-sm text-slate-400">
            Until they turn {durationYears}
          </p>
        </div>

        {/* Monthly Plan Card */}
        <div className="mb-6 w-full max-w-md rounded-2xl bg-orange-500 p-6 text-white">
          <h3 className="mb-2 text-xl font-bold">Monthly Plan</h3>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-orange-100">You deposit</p>
              <p className="text-3xl font-bold">{monthlyBTC.toFixed(4)} BTC</p>
              <p className="text-sm text-orange-100">≈ ${monthlyUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-orange-100">Recurring</p>
              <p className="text-lg font-bold">Every 1st</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex w-full max-w-md gap-3">
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-slate-200 bg-white py-6 text-slate-700 hover:bg-slate-50"
            asChild
          >
            <Link href="/setgoal">Back</Link>
          </Button>
          <Button
            className="flex-[2] rounded-xl bg-slate-900 py-6 text-white hover:bg-slate-800"
            asChild
          >
            <Link href="/creating">Authorize &amp; Create</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
