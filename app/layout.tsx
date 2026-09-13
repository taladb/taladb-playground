import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'

/*
 * Loaded through `next/font`, which self-hosts the files and emits a matched
 * size-adjusted fallback — so there is no request to Google at runtime and no
 * layout shift when the face swaps in. The previous version named these
 * families in CSS without ever loading them, and rendered in system fallbacks.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

/** The editorial voice: headings, and the words the user actually wrote. */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'opsz'],
})

/** Engine internals — index names, latencies, distance counts. */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-jb',
  display: 'swap',
})

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh">
        {/* First tab stop on every page: skip the nav, land on the content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50
                     focus:rounded-xl focus:bg-stone-900 focus:px-4 focus:py-2 focus:text-sm
                     focus:font-medium focus:text-white dark:focus:bg-amber-400 dark:focus:text-stone-950"
        >
          Skip to content
        </a>

        {/*
          The provider opens the database in an effect, so nothing beneath it is
          server-rendered. Correct for an app whose entire content is the user's
          own private data — there is nothing here to index.
        */}
        <Providers>
          <Nav />
          <main id="main" className="mx-auto max-w-5xl px-5 pb-28 pt-8 md:px-6 md:pb-16">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
