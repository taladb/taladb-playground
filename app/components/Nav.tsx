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
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <>
      {/* Desktop: a quiet top bar that blurs the page under it. */}
      <header className="sticky top-0 z-30 hidden border-b bg-stone-50/70 backdrop-blur-md md:block dark:bg-stone-950/70">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-3">
          <Link
            href="/"
            className="mr-5 flex items-center gap-2.5 font-serif text-[17px] font-semibold tracking-tight"
          >
            <Mark />
            Keepsake
          </Link>

          <nav aria-label="Main" className="flex items-center gap-0.5">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 ${
                  isActive(link.href)
                    ? 'font-medium text-stone-900 dark:text-stone-100'
                    : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
                }`}
              >
                {link.label}
                {isActive(link.href) && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-amber-500"
                  />
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/capture" className="btn-primary py-1.5 text-sm">
              <span aria-hidden>✏️</span>
              Remember Something
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={isActive('/settings') ? 'page' : undefined}
              className={`rounded-lg p-2 transition-colors duration-150 ${
                isActive('/settings')
                  ? 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100'
                  : 'text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 dark:hover:bg-stone-800'
              }`}
            >
              <Gear />
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile: a bottom bar, because that is where thumbs are. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-stone-50/90 backdrop-blur-md md:hidden dark:bg-stone-950/90"
      >
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                isActive(link.href)
                  ? 'font-medium text-amber-700 dark:text-amber-400'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {isActive(link.href) && (
                <span
                  aria-hidden
                  className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-amber-500"
                />
              )}
              <span className="text-lg leading-none" aria-hidden>
                {link.icon}
              </span>
              {link.label}
            </Link>
          ))}
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={isActive('/settings') ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] ${
              isActive('/settings')
                ? 'font-medium text-amber-700 dark:text-amber-400'
                : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            <span className="leading-none" aria-hidden>
              <Gear />
            </span>
            Settings
          </Link>
        </div>
      </nav>

      <Link
        href="/capture"
        aria-label="Remember something"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full
                   bg-stone-900 text-white shadow-[var(--shadow-lift)] transition-transform
                   duration-150 active:scale-95 md:hidden dark:bg-amber-400 dark:text-stone-950"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </Link>
    </>
  )
}

/** The thread running through three moments — the timeline, abstracted. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-amber-400" />
      <path
        d="M8 23 Q12 9 16 16 Q20 23 24 9"
        className="stroke-stone-900"
        strokeWidth="2.25"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="8" cy="23" r="2.4" className="fill-stone-900" />
      <circle cx="16" cy="16" r="2.4" className="fill-stone-900" />
      <circle cx="24" cy="9" r="2.4" className="fill-stone-900" />
    </svg>
  )
}

function Gear() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
