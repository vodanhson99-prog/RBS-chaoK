import type { Metadata } from 'next'
import { Manrope, Press_Start_2P, VT323 } from 'next/font/google'
import '../index.css'

const pixel = Press_Start_2P({
  subsets: ['latin'],
  variable: '--font-pixel',
  weight: '400',
})

const mono = VT323({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: '400',
})

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'RBS Photobooth',
  description: 'Pick a frame, show letter S, scan the QR.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${pixel.variable} ${mono.variable} ${body.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://storage.googleapis.com" />
      </head>
      <body className="pixel-scene">{children}</body>
    </html>
  )
}
