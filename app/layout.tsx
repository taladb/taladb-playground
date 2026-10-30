import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { THEME_SCRIPT } from '@/lib/theme'

/*
 * The interface is meant to look native on Apple hardware, where the system
 * font *is* SF — so the stack in `globals.css` reaches for `-apple-system`
 * first and only falls through to Inter elsewhere. `next/font` self-hosts that
 * fallback and emits a size-adjusted metric match, so there is no request to
 * Google at runtime and no shift when the face swaps in.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

/** Engine internals — index names, latencies, distance counts. */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-jb',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Keepsake — your memories, on your device',
  description:
    'A private memory for your real world, powered by TalaDB. Your things, people, places and everything that happened to them — searchable by keyword and by meaning, entirely in your browser.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f7' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable}`}
    >
      <head>
        {/* Before first paint: pick light or dark so nothing flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {/* First tab stop on every page: skip the nav, land on the content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50
 focus:rounded-xl focus:bg-[var(--color-label)] focus:px-4 focus:py-2 focus:text-sm
                     focus:font-semibold focus:text-[var(--color-card)]"
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
          <main id="main" className="mx-auto max-w-5xl px-4 pb-32 pt-8 md:px-6 md:pt-10 lg:pb-16">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
