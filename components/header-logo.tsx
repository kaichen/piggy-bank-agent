import Image from "next/image"
import Link from "next/link"

export function HeaderLogo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Image
        src="/logo.png"
        alt="BitPiggy"
        width={32}
        height={32}
        className="rounded-lg"
      />
      <span className="text-xl font-bold text-slate-900">BitPiggy</span>
    </Link>
  )
}
