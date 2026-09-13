import type { EntityType, MemoryType } from '@/lib/types'

/**
 * Monochrome glyphs for the coloured tiles.
 *
 * iOS puts a white SF Symbol on a filled rounded square — Settings and Health
 * both read at a glance because of it. Emoji cannot do that job: they carry
 * their own colour, so on a coloured tile they fight it, and at 16px they are
 * mush. These are deliberately plain geometry, drawn on a 24-grid with a single
 * stroke weight so fifteen of them in a column look like one family.
 */

const P: Record<string, string> = {
  note: 'M5 4h9l5 5v11H5z M14 4v5h5',
  observation: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z M12 15a3 3 0 100-6 3 3 0 000 6z',
  purchase: 'M6 4h12l1.5 16H4.5z M9 8a3 3 0 006 0',
  expense: 'M12 2v20 M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2.2 2.8 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3',
  maintenance: 'M14.7 6.3a4 4 0 01-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 015.4-5.4l-2.5 2.5-1.4-1.4z',
  replacement: 'M4 12a8 8 0 0113.7-5.7L20 8 M20 4v4h-4 M20 12a8 8 0 01-13.7 5.7L4 16 M4 20v-4h4',
  repair: 'M9 3L5 7l2 2 2-2 3 3-7 7v3h3l7-7 3 3-2 2 2 2 4-4z',
  installation: 'M12 2l9 5v10l-9 5-9-5V7z M12 12l9-5 M12 12v10 M12 12L3 7',
  loan: 'M12 16V4 M8 8l4-4 4 4 M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
  return: 'M12 4v12 M8 12l4 4 4-4 M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3',
  movement: 'M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  decision: 'M12 3v18 M3 8h18 M6 8l-3 6h6zM18 8l-3 6h6z',
  conversation: 'M20 12a7 7 0 01-9.9 6.4L4 20l1.6-6.1A7 7 0 1120 12z',
  appointment: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  warranty: 'M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z M9 12l2 2 4-4',

  thing: 'M12 2l9 5v10l-9 5-9-5V7z M12 12l9-5 M12 12v10 M12 12L3 7',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 21a8 8 0 0116 0',
  place: 'M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  organization: 'M3 21h18 M5 21V5l7-3 7 3v16 M10 9h4 M10 13h4 M10 17h4',
  project: 'M3 7h6l2 2h10v10H3z',
  document: 'M5 4h9l5 5v11H5z M14 4v5h5 M8 13h8 M8 17h5',

  home: 'M3 11l9-7 9 7 M5 10v10h14V10',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.3-4.3',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 7v5l3.5 2',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  plus: 'M12 5v14 M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  box: 'M3 7h18v13H3z M3 7l2-4h14l2 4 M12 7v13',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
}

export type IconName = keyof typeof P | MemoryType | EntityType

export function Icon({
  name,
  className = 'h-4 w-4',
  strokeWidth = 2,
}: {
  name: IconName
  className?: string
  strokeWidth?: number
}) {
  const d = P[name] ?? P.note
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}

/**
 * The coloured rounded square itself. Health's category rows are recognisable
 * from across a room because of this one element, so it is a component rather
 * than a class — the size/radius pairing has to stay consistent.
 */
export function IconTile({
  name,
  color,
  size = 'md',
}: {
  name: IconName
  /** A `--color-ios-*` value. */
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'h-10 w-10 rounded-[10px]' : size === 'sm' ? 'h-6 w-6 rounded-[7px]' : 'h-8 w-8 rounded-[8px]'
  const glyph = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center text-white`}
      style={{ background: color }}
    >
      <Icon name={name} className={glyph} strokeWidth={2.2} />
    </span>
  )
}
