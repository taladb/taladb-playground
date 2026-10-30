import Link from 'next/link'
import { KEPTA_PLAY_URL } from './AppBanner'
import { Icon } from './Icon'

export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl px-4 pb-32 pt-6 text-[12.5px] md:px-6 lg:pb-12">
      <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between" style={{ boxShadow: 'inset 0 1px 0 var(--color-border)' }}>
        <p className="muted flex max-w-md items-start gap-2 leading-relaxed">
          <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          <span>
            Everything on this page was read from a database inside your browser. No account and
            no server holding your data. Close the tab and it is still here.
          </span>
        </p>
        <nav aria-label="Footer" className="muted flex flex-wrap gap-x-4 gap-y-1.5">
          <Link href="/how-it-works" className="hover:text-[var(--color-label)]">How it works</Link>
          <Link href="/lab" className="hover:text-[var(--color-label)]">Scale Lab</Link>
          <a href="https://github.com/taladb/taladb" className="hover:text-[var(--color-label)]">
            TalaDB {process.env.NEXT_PUBLIC_TALADB_VERSION}
          </a>
          <a href={KEPTA_PLAY_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-label)]">
            Kepta for Android
          </a>
        </nav>
      </div>
    </footer>
  )
}
