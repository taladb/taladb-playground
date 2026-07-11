'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSeedStatus } from '@/lib/seed'
import { SyncStatusBadge } from './SyncStatusBadge'

const LINKS = [
  { href: '/', label: 'Explore' },
  { href: '/trips', label: 'Trips' },
  { href: '/admin', label: 'Host' },
  { href: '/account', label: 'Account' },
  { href: '/discover', label: 'Discover', ai: true },
]

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), [])
  return (
    <button
      aria-label="Toggle theme"
      onClick={() => {
        const next = !dark
        setDark(next)
        document.documentElement.classList.toggle('dark', next)
        localStorage.setItem('theme', next ? 'dark' : 'light')
      }}
      className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

function SeedBanner() {
  const { docReady, docLoaded, docTotal, error } = useSeedStatus()
  if (error) {
    return (
      <div className="bg-red-500 px-4 py-1.5 text-center text-xs font-medium text-white">
        Database error: {error}
      </div>
    )
  }
  if (docReady) return null
  const pct = docTotal ? Math.round((docLoaded / docTotal) * 100) : 0
  return (
    <div className="bg-indigo-600 px-4 py-1.5 text-center text-xs font-medium text-white">
      Seeding {docTotal.toLocaleString()} listings into your on-device database…{' '}
      {docTotal ? `${pct}%` : ''}
    </div>
  )
}

export function Nav() {
  const pathname = usePathname()
  return (
    <>
      <SeedBanner />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-white">▲</span>
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">Wanderdeck</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                powered by TalaDB 0.9
              </span>
            </span>
          </Link>
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {LINKS.map((l) => {
              const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                >
                  {l.label}
                  {l.ai && (
                    <span className="rounded bg-gradient-to-r from-fuchsia-500 to-violet-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      AI
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatusBadge />
            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  )
}
