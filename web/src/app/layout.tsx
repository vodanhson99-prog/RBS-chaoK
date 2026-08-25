import type { Metadata } from 'next'
import { IBM_Plex_Mono, Manrope, Space_Grotesk } from 'next/font/google'
import '../index.css'

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
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
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://storage.googleapis.com" />
      </head>
      <body className="pixel-scene">{children}</body>
    </html>
  )
}
