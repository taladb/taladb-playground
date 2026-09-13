import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'

export const metadata: Metadata = {
  title: 'Keepsake — a private memory for your real world',
  description:
    'A local-first personal memory system. Your things, people, places and everything that happened to them — searchable offline, on-device, in TalaDB.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        {/*
          The provider opens the database in an effect, so nothing beneath it is
          server-rendered. That is fine for an app whose entire content is the
          user's own private data — there is nothing here to index.
        */}
        <Providers>
          <Nav />
          <main className="mx-auto max-w-5xl px-5 pb-28 pt-6 md:px-6 md:pb-16">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
