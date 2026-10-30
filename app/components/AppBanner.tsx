import { Icon } from './Icon'

export const KEPTA_PLAY_URL = 'https://play.google.com/store/apps/details?id=dev.thinkgrid.kepta'

/**
 * Where to go with your own data.
 *
 * Everything here runs on a seeded demo corpus, which is the right way to show
 * the engine and the wrong place to keep a real life: browser storage can be
 * cleared by the browser. Kepta is the same product on Android — same TalaDB,
 * PIN-locked and encrypted on the phone — so the strip points there.
 *
 * Quiet on purpose: it is on every page, so it must not out-shout the page.
 * Its height is fixed (h-9) because the sticky year headers sit under it;
 * `--chrome-top` in globals.css carries the sum, and must change with it.
 */
export function AppBanner() {
  return (
    <aside
      aria-label="About this demo"
      className="h-9 text-[12.5px]"
      style={{ background: 'var(--color-fill)', boxShadow: 'inset 0 -1px 0 var(--color-border)' }}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center gap-2 px-4 md:px-6">
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'color-mix(in oklab, var(--color-ios-orange) 16%, transparent)', color: 'var(--color-ios-orange)' }}
        >
          Demo
        </span>
        <span className="muted min-w-0 truncate">
          <span className="hidden sm:inline">Sample memories from a fictional household. </span>
          Keep your own, encrypted on your phone:{' '}
          <a
            href={KEPTA_PLAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--color-label)] underline-offset-2 hover:underline"
          >
            Kepta for Android
          </a>
        </span>
        <Icon name="phone" className="muted-more ml-auto hidden h-3.5 w-3.5 shrink-0 sm:block" strokeWidth={2} />
      </div>
    </aside>
  )
}
