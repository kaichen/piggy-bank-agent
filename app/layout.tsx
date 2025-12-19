import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Web3Provider } from "@/components/web3-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "Web3 DApp - Arbitrum",
  description: "基于 wagmi 的 Web3 DApp，连接 Arbitrum 网络并查看 ETH 余额",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className={`font-sans antialiased`}>
        <Web3Provider>{children}</Web3Provider>
        <Analytics />
      </body>
    </html>
  )
}
