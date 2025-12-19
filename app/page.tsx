import Image from "next/image"
import Link from "next/link"
import { Menu, ArrowRight } from "lucide-react"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
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
      <div className="flex flex-col items-center px-6 py-8">
        {/* Hero Image */}
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg">
          <Image
            src="/piggy/dotted.svg"
            alt="Piggy bank"
            width={280}
            height={280}
          />
        </div>

        {/* Headline */}
        <h1 className="mb-4 text-center text-4xl font-bold leading-tight text-slate-900">
          Save the first{" "}
          <span className="text-orange-500">Bitcoin</span>
          <br />
          for your child
        </h1>

        {/* Subtext */}
        <p className="mb-8 max-w-sm text-center text-lg text-slate-500">
          Secure their future with the world&apos;s best digital asset. Fun, safe, and easy.
        </p>

        {/* CTA Button */}
        <Link
          href="/setgoal"
          className="mb-6 flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-slate-900 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Start Saving Now
          <ArrowRight className="h-5 w-5" />
        </Link>

        {/* Login Link */}
        <p className="text-slate-500">
          Already have a piggy?{" "}
          <Link href="#" className="font-medium text-orange-500 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  )
}
