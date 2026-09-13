'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/things', label: 'Things', icon: '📦' },
  { href: '/recall', label: 'Recall', icon: '🔍' },
  { href: '/timeline', label: 'Timeline', icon: '🕰️' },
  { href: '/insights', label: 'Insights', icon: '📊' },
]

export function Nav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      {/* Desktop: a quiet top bar. */}
      <header className="sticky top-0 z-30 hidden border-b bg-stone-50/85 backdrop-blur md:block dark:bg-stone-950/85">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-3">
          <Link href="/" className="mr-4 flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden>🧠</span>
            Keepsake
          </Link>

          <nav className="flex items-center gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  isActive(link.href)
                    ? 'bg-stone-200 font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-100'
                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/capture" className="btn-primary py-1.5 text-sm">
              Remember something
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900"
            >
              ⚙️
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile: a bottom bar, with capture as the standing action. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-stone-50/95 backdrop-blur md:hidden dark:bg-stone-950/95">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                isActive(link.href)
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {link.icon}
              </span>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <Link
        href="/capture"
        aria-label="Remember something"
        className="fixed bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-2xl text-white shadow-lg md:hidden dark:bg-amber-500 dark:text-stone-950"
      >
        +
      </Link>
    </>
  )
}
