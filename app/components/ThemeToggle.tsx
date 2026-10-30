'use client'

import { setTheme, useTheme, type ThemeChoice } from '@/lib/theme'
import { Icon } from './Icon'
import { Segmented } from './Segmented'

const OPTIONS: Array<{ value: ThemeChoice; label: string; icon: 'sun' | 'moon' | 'monitor' }> = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
]

/** One button that cycles light → dark → system. For tight headers. */
export function ThemeButton() {
  const choice = useTheme()
  const index = OPTIONS.findIndex((o) => o.value === choice)
  const current = OPTIONS[index]
  const next = OPTIONS[(index + 1) % OPTIONS.length]
  return (
    <button
      onClick={() => setTheme(next.value)}
      className="btn-icon"
      aria-label={`Appearance: ${current.label}. Switch to ${next.label.toLowerCase()}.`}
      title={`Appearance: ${current.label}`}
    >
      <Icon name={current.icon} className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </button>
  )
}

/** All three choices at once, as a radio group. For Settings. */
export function ThemeSegmented() {
  const choice = useTheme()
  return (
    <Segmented
      label="Appearance"
      value={choice}
      onChange={setTheme}
      options={OPTIONS.map((o) => ({
        value: o.value,
        label: (
          <>
            <Icon name={o.icon} className="h-3.5 w-3.5" strokeWidth={2.2} />
            {o.label}
          </>
        ),
      }))}
    />
  )
}
