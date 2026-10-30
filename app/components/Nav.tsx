'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'
import { AppBanner } from './AppBanner'
import { Wordmark } from './Logo'
import { StatusPill } from './StatusPanel'
import { ThemeButton } from './ThemeToggle'
import { usePalette } from './CommandPalette'

const LINKS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/recall', label: 'Search', icon: 'search' },
  { href: '/things', label: 'Things', icon: 'box' },
  { href: '/timeline', label: 'Timeline', icon: 'clock' },
  { href: '/insights', label: 'Insights', icon: 'chart' },
]

/**
 * The shell.
 *
 * One top bar at every width — mark, privacy status, search — so the claim
 * "stored on this device" is always one tap from its evidence. From `lg` the
 * sections sit in that bar; below it they move to a bottom tab bar, where a
 * thumb can reach them, and "Remember" becomes a floating button.
 */
export function Nav() {
  const pathname = usePathname()
  const palette = usePalette()
  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname.startsWith(href) || (href === '/timeline' && pathname.startsWith('/memory'))

  return (
    <>
      {/* One sticky block, so the strip and the bar stay stacked. Its height is
          `--chrome-top` in globals.css. */}
      <div className="sticky top-0 z-30">
        <AppBanner />

        <header
          className="backdrop-blur-xl"
          style={{
            background: 'color-mix(in oklab, var(--color-group) 84%, transparent)',
            boxShadow: 'inset 0 -1px 0 var(--color-border)',
          }}
        >
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 md:px-6">
            <Link href="/" aria-label="Keepsake home" className="mr-3 shrink-0 rounded-[10px]">
              <Wordmark />
            </Link>

            <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className="whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[14px] font-medium transition-colors hover:text-[var(--color-label)]"
                  style={
                    isActive(link.href)
                      ? { background: 'var(--color-fill)', color: 'var(--color-label)' }
                      : { color: 'var(--color-label-2)' }
                  }
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/how-it-works"
                aria-current={isActive('/how-it-works') ? 'page' : undefined}
                className="hidden whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[14px] font-medium transition-colors hover:text-[var(--color-label)] xl:block"
                style={
                  isActive('/how-it-works')
                    ? { background: 'var(--color-fill)', color: 'var(--color-label)' }
                    : { color: 'var(--color-label-2)' }
                }
              >
                How it works
              </Link>
            </nav>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => palette.open()}
                className="hidden h-9 items-center gap-2 rounded-[10px] pl-3 pr-1.5 text-[13px] transition-colors hover:bg-[var(--color-fill)] md:flex"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-label-2)' }}
                aria-label="Search (Control K)"
                aria-keyshortcuts="Control+K Meta+K"
              >
                <Icon name="search" className="h-4 w-4" strokeWidth={2.2} />
                <span className="hidden text-left xl:inline xl:w-20">Search…</span>
                <kbd className="kbd">
                  <ModKey />K
                </kbd>
              </button>
              <button onClick={() => palette.open()} className="btn-icon md:hidden" aria-label="Search">
                <Icon name="search" className="h-5 w-5" strokeWidth={2} />
              </button>

              <StatusPill />

              <span className="hidden xl:block">
                <ThemeButton />
              </span>
              <Link
                href="/settings"
                aria-label="Settings"
                aria-current={isActive('/settings') ? 'page' : undefined}
                className="btn-icon"
                style={isActive('/settings') ? { color: 'var(--color-label)', background: 'var(--color-fill)' } : undefined}
              >
                <Icon name="gear" className="h-[18px] w-[18px]" strokeWidth={1.9} />
              </Link>
              <Link href="/capture" className="btn-primary ml-1 hidden h-9 min-h-0 px-3.5 text-[14px] lg:inline-flex">
                <Icon name="plus" className="h-4 w-4" strokeWidth={2.5} />
                Remember
              </Link>
            </div>
          </div>
        </header>
      </div>

      {/* Below lg: a tab bar a thumb can reach. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 backdrop-blur-xl lg:hidden"
        style={{
          background: 'color-mix(in oklab, var(--color-card) 86%, transparent)',
          boxShadow: 'inset 0 1px 0 var(--color-border)',
        }}
      >
        <div className="mx-auto flex max-w-xl items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {LINKS.map((link) => (
            <Tab key={link.href} {...link} active={isActive(link.href)} />
          ))}
        </div>
      </nav>

      {pathname !== '/capture' && (
        <Link
          href="/capture"
          aria-label="Remember something"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform duration-150 active:scale-95 lg:hidden"
          style={{ background: 'var(--color-label)', color: 'var(--color-card)' }}
        >
          <Icon name="plus" className="h-6 w-6" strokeWidth={2.5} />
        </Link>
      )}
    </>
  )
}

function Tab({
  href,
  label,
  icon,
  active,
}: {
  href: string
  label: string
  icon: IconName
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium"
      style={{ color: active ? 'var(--color-ios-blue)' : 'var(--color-label-2)' }}
    >
      <Icon name={icon} className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.8} />
      {label}
    </Link>
  )
}

/** ⌘ on Apple platforms, Ctrl elsewhere. */
export function ModKey() {
  const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return <>{apple ? '⌘' : 'Ctrl '}</>
}
