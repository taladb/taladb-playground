'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'

const LINKS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/things', label: 'Things', icon: 'box' },
  { href: '/recall', label: 'Recall', icon: 'search' },
  { href: '/timeline', label: 'Timeline', icon: 'clock' },
  { href: '/insights', label: 'Insights', icon: 'chart' },
]

export function Nav() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <>
      {/* Desktop: a translucent bar that the content scrolls under. */}
      <header
        className="sticky top-0 z-30 hidden backdrop-blur-xl md:block"
        style={{
          background: 'color-mix(in oklab, var(--color-group) 82%, transparent)',
          boxShadow: 'inset 0 -0.5px 0 var(--color-separator)',
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-2.5">
          <Link href="/" className="mr-5 flex items-center gap-2.5 text-[17px] font-bold tracking-tight">
            <Mark />
            Keepsake
          </Link>

          <nav aria-label="Main" className="flex items-center gap-0.5">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className="rounded-[10px] px-3 py-1.5 text-[14px] font-medium transition-colors"
                style={
                  isActive(link.href)
                    ? { background: 'var(--color-card)', color: 'var(--color-ios-blue)' }
                    : { color: 'var(--color-label-2)' }
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/capture" className="btn-primary px-4 py-2 text-[15px]">
              <Icon name="plus" className="h-4 w-4" strokeWidth={2.5} />
              Remember
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={isActive('/settings') ? 'page' : undefined}
              className="rounded-[10px] p-2 transition-colors"
              style={
                isActive('/settings')
                  ? { background: 'var(--color-card)', color: 'var(--color-ios-blue)' }
                  : { color: 'var(--color-label-2)' }
              }
            >
              <Icon name="gear" className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile: a real iOS tab bar. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 backdrop-blur-xl md:hidden"
        style={{
          background: 'color-mix(in oklab, var(--color-group) 80%, transparent)',
          boxShadow: 'inset 0 0.5px 0 var(--color-separator)',
        }}
      >
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {LINKS.map((link) => (
            <Tab key={link.href} {...link} active={isActive(link.href)} />
          ))}
          <Tab href="/settings" label="Settings" icon="gear" active={isActive('/settings')} />
        </div>
      </nav>

      <Link
        href="/capture"
        aria-label="Remember something"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full
 text-white shadow-lg transition-transform duration-150 active:scale-95 md:hidden"
        style={{ background: 'var(--color-ios-blue)' }}
      >
        <Icon name="plus" className="h-7 w-7" strokeWidth={2.5} />
      </Link>
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
      className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium"
      style={{ color: active ? 'var(--color-ios-blue)' : 'var(--color-label-2)' }}
    >
      <Icon name={icon} className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} />
      {label}
    </Link>
  )
}

/** The thread running through three moments — the timeline, abstracted. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-ios-blue)" />
      <path
        d="M8 23 Q12 9 16 16 Q20 23 24 9"
        stroke="white"
        strokeWidth="2.25"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="8" cy="23" r="2.4" fill="white" />
      <circle cx="16" cy="16" r="2.4" fill="white" />
      <circle cx="24" cy="9" r="2.4" fill="white" />
    </svg>
  )
}
