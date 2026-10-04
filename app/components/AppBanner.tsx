import { Icon } from './Icon'

export const KEPTA_PLAY_URL = 'https://play.google.com/store/apps/details?id=dev.thinkgrid.kepta'

/**
 * Where to go with your own data.
 *
 * Everything here runs on a seeded demo corpus, which is the right way to show
 * the engine and the wrong place to keep a real life: browser storage can be
 * cleared by the browser. Kepta is the same product on Android — same TalaDB,
 * PIN-locked and encrypted on the phone — so the banner points there.
 *
 * Its height is fixed (h-10) because the sticky year headers sit under it;
 * `--chrome-top` in globals.css carries the sum, and must change with it.
 */
export function AppBanner() {
  return (
    <aside aria-label="Kepta for Android" className="h-10 text-white" style={{ background: 'var(--color-ios-blue)' }}>
      <a
        href={KEPTA_PLAY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto flex h-full max-w-5xl items-center gap-2 px-5 text-[13px] md:px-6"
      >
        <Icon name="phone" className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="min-w-0 truncate">
          <span className="hidden sm:inline">This is a demo with sample memories. </span>
          Keep your own on your phone, encrypted —{' '}
          <span className="font-semibold underline underline-offset-2">Kepta for Android</span>
        </span>
        <Icon name="chevron" className="ml-auto h-4 w-4 shrink-0" strokeWidth={2.5} />
      </a>
    </aside>
  )
}
