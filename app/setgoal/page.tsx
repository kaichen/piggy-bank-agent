"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HeaderLogo } from "@/components/header-logo"
import { Slider } from "@/components/ui/slider"

const BTC_PRICE = 87500 // Placeholder BTC price in USD

type QuestionStep = "idle" | "age" | "budget" | "risk" | "generating" | "result"

interface PlanResult {
  targetBTC: number
  durationYears: number
  frequency: "weekly" | "monthly"
  monthlyAmount: number
}

export default function SetGoalPage() {
  const [step, setStep] = useState<QuestionStep>("idle")
  const [childAge, setChildAge] = useState(5)
  const [budget, setBudget] = useState<50 | 200 | 500 | null>(null)
  const [riskPreference, setRiskPreference] = useState<"afraid" | "neutral" | "excited" | null>(null)
  const [planResult, setPlanResult] = useState<PlanResult | null>(null)

  // Generate plan based on answers
  const generatePlan = () => {
    setStep("generating")

    // Simulate AI processing
    setTimeout(() => {
      const yearsUntil18 = Math.max(1, 18 - childAge)
      const monthlyBudget = budget || 50

      // Determine frequency based on risk preference
      const frequency: "weekly" | "monthly" = riskPreference === "afraid" ? "monthly" : "weekly"

      // Calculate target based on budget and duration
      const totalMonths = yearsUntil18 * 12
      const totalSavings = monthlyBudget * totalMonths
      const targetBTC = totalSavings / BTC_PRICE

      setPlanResult({
        targetBTC: Math.round(targetBTC * 100) / 100,
        durationYears: yearsUntil18,
        frequency,
        monthlyAmount: monthlyBudget,
      })
      setStep("result")
    }, 1500)
  }

  // Handle next step
  const handleNext = () => {
    if (step === "age") {
      setStep("budget")
    } else if (step === "budget" && budget !== null) {
      setStep("risk")
    } else if (step === "risk" && riskPreference !== null) {
      generatePlan()
    }
  }

  // Piggy header component
  const PiggyHeader = () => (
    <div className="mb-6 flex justify-center">
      <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white shadow-lg">
        <Image
          src="/logo.png"
          alt="Piggy"
          width={100}
          height={100}
          className="rounded-full"
        />
      </div>
    </div>
  )

  // Question 1: Child Age
  if (step === "age") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center px-4">
          <button onClick={() => setStep("idle")} className="p-2">
            <ArrowLeft className="h-6 w-6 text-slate-600" />
          </button>
        </header>

        <div className="flex flex-col items-center px-6 py-6">
          <PiggyHeader />

          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">How old is your child?</h2>
            <p className="mb-6 text-slate-500">I&apos;ll calculate the perfect duration.</p>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-medium text-orange-500">Newborn</span>
              <span className="text-4xl font-bold text-orange-500">{childAge}</span>
              <span className="text-lg font-medium text-slate-400">18</span>
            </div>

            <Slider
              value={[childAge]}
              onValueChange={(values) => setChildAge(values[0])}
              min={0}
              max={18}
              step={1}
              className="mb-4 [&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:border-orange-500 [&_[data-slot=slider-thumb]]:bg-orange-500 [&_[data-slot=slider-thumb]]:h-5 [&_[data-slot=slider-thumb]]:w-5 [&_[data-slot=slider-track]]:bg-slate-300 [&_[data-slot=slider-track]]:h-2"
            />
          </div>

          <Button
            onClick={handleNext}
            className="mt-6 w-full max-w-md rounded-xl bg-slate-900 py-6 text-lg font-semibold text-white hover:bg-slate-800"
          >
            Next
          </Button>
        </div>
      </main>
    )
  }

  // Question 2: Monthly Budget
  if (step === "budget") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center px-4">
          <button onClick={() => setStep("age")} className="p-2">
            <ArrowLeft className="h-6 w-6 text-slate-600" />
          </button>
        </header>

        <div className="flex flex-col items-center px-6 py-6">
          <PiggyHeader />

          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">Monthly Budget?</h2>
            <p className="mb-6 text-slate-500">How much can you comfortably save?</p>

            <div className="space-y-3">
              {[50, 200, 500].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setBudget(amount as 50 | 200 | 500)}
                  className={`w-full rounded-xl border-2 py-4 text-lg font-semibold transition-colors ${
                    budget === amount
                      ? "border-orange-500 bg-orange-50 text-orange-600"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  ${amount}{amount === 500 ? "+" : ""} / month
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleNext}
            disabled={budget === null}
            className="mt-6 w-full max-w-md rounded-xl bg-slate-900 py-6 text-lg font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Next
          </Button>
        </div>
      </main>
    )
  }

  // Question 3: Risk Preference
  if (step === "risk") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center px-4">
          <button onClick={() => setStep("budget")} className="p-2">
            <ArrowLeft className="h-6 w-6 text-slate-600" />
          </button>
        </header>

        <div className="flex flex-col items-center px-6 py-6">
          <PiggyHeader />

          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">What if BTC price drops?</h2>
            <p className="mb-6 text-slate-500">This helps us set your savings frequency.</p>

            <div className="space-y-3">
              <button
                onClick={() => setRiskPreference("afraid")}
                className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
                  riskPreference === "afraid"
                    ? "border-orange-500 bg-orange-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-2xl">😰</span>
                <span className="ml-3 font-semibold text-slate-700">Afraid</span>
                <p className="mt-1 text-sm text-slate-500">Play it safe, less frequent deposits</p>
              </button>

              <button
                onClick={() => setRiskPreference("neutral")}
                className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
                  riskPreference === "neutral"
                    ? "border-orange-500 bg-orange-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-2xl">😐</span>
                <span className="ml-3 font-semibold text-slate-700">Neutral</span>
                <p className="mt-1 text-sm text-slate-500">Don&apos;t care, weekly DCA is fine</p>
              </button>

              <button
                onClick={() => setRiskPreference("excited")}
                className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
                  riskPreference === "excited"
                    ? "border-orange-500 bg-orange-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-2xl">🤑</span>
                <span className="ml-3 font-semibold text-slate-700">Excited</span>
                <p className="mt-1 text-sm text-slate-500">That&apos;s a discount! Buy more when it dips</p>
              </button>
            </div>
          </div>

          <Button
            onClick={handleNext}
            disabled={riskPreference === null}
            className="mt-6 w-full max-w-md rounded-xl bg-slate-900 py-6 text-lg font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Generate My Plan
          </Button>
        </div>
      </main>
    )
  }

  // Generating state
  if (step === "generating") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-pink-50 to-pink-100">
        <PiggyHeader />
        <div className="animate-pulse text-xl font-semibold text-slate-700">
          Piggy is thinking...
        </div>
      </main>
    )
  }

  // Result state
  if (step === "result" && planResult) {
    const monthlyBTC = planResult.targetBTC / (planResult.durationYears * 12)
    const weeklyBTC = monthlyBTC / 4

    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center px-4">
          <button onClick={() => setStep("idle")} className="p-2">
            <ArrowLeft className="h-6 w-6 text-slate-600" />
          </button>
        </header>

        <div className="flex flex-col items-center px-6 py-6">
          <PiggyHeader />

          <h2 className="mb-6 text-2xl font-bold text-slate-900">Your Personalized Plan</h2>

          <div className="mb-6 w-full max-w-md space-y-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Target Goal</p>
              <p className="text-2xl font-bold text-slate-900">
                {planResult.targetBTC} <span className="text-orange-500">BTC</span>
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">Duration</p>
              <p className="text-2xl font-bold text-slate-900">{planResult.durationYears} Years</p>
              <p className="text-sm text-slate-400">Until your child turns 18</p>
            </div>

            <div className="rounded-2xl bg-orange-500 p-4 text-white">
              <p className="text-sm text-orange-100">
                {planResult.frequency === "weekly" ? "Weekly" : "Monthly"} Deposit
              </p>
              <p className="text-2xl font-bold">
                {planResult.frequency === "weekly" ? weeklyBTC.toFixed(6) : monthlyBTC.toFixed(6)} BTC
              </p>
              <p className="text-sm text-orange-100">
                ≈ ${planResult.frequency === "weekly" ? Math.round(planResult.monthlyAmount / 4) : planResult.monthlyAmount} USD
              </p>
            </div>
          </div>

          <div className="flex w-full max-w-md gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-slate-200 bg-white py-6 text-slate-700 hover:bg-slate-50"
            >
              <Link href="/setgoal/manual">Adjust</Link>
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-slate-900 py-6 text-white hover:bg-slate-800"
              asChild
            >
              <Link href="/creating">Create Piggy</Link>
            </Button>
          </div>
        </div>
      </main>
    )
  }

  // Default: idle state (original page with manual sliders)
  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
      {/* Header */}
      <header className="flex h-16 items-center justify-between px-4">
        <HeaderLogo />
        <button className="p-2">
          <Menu className="h-6 w-6 text-slate-600" />
        </button>
      </header>

      {/* Content */}
      <div className="flex flex-col items-center px-6 py-6">
        <PiggyHeader />

        <p className="mb-2 text-sm tracking-widest text-slate-500">SET YOUR GOAL</p>
        <h1 className="mb-6 text-2xl font-bold text-slate-900">How would you like to start?</h1>

        {/* Action Buttons */}
        <div className="flex w-full max-w-md flex-col gap-3">
          <Button
            onClick={() => setStep("age")}
            className="w-full rounded-xl bg-orange-500 py-6 text-lg font-semibold text-white hover:bg-orange-600"
          >
            🐷 Ask Piggy
          </Button>
          <p className="text-center text-sm text-slate-400">
            Answer 3 simple questions and let Piggy create a plan for you
          </p>

          <div className="my-4 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-300" />
            <span className="text-sm text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-300" />
          </div>

          <Button
            variant="outline"
            className="w-full rounded-xl border-slate-200 bg-white py-6 text-lg font-semibold text-slate-700 hover:bg-slate-50"
            asChild
          >
            <Link href="/setgoal/manual">Set Up Manually</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
