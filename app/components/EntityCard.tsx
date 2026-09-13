'use client'

import Link from 'next/link'
import { ENTITY_COLOR, ENTITY_LABEL, money, tint } from '@/lib/format'
import { Icon } from './Icon'
import type { Entity } from '@/lib/types'

/**
 * A thing, person or place.
 *
 * The emoji stays. It is the user's own data — the bike really is 🚲 — and
 * replacing it with a system glyph would be the app overwriting something
 * personal with something generic. So it sits on a soft wash of its *type's*
 * colour instead: the taxonomy gets the system treatment, the content keeps its
 * character.
 */
export function EntityCard({
  entity,
  subtitle,
  index = 0,
}: {
  entity: Entity
  subtitle?: string
  index?: number
}) {
  const color = ENTITY_COLOR[entity.entityType] ?? 'var(--color-ios-gray)'

  return (
    <Link
      href={`/entity/${entity._id}`}
      style={{ '--i': index } as React.CSSProperties}
      className="card rise group flex items-center gap-3 p-3.5 transition-transform duration-150 active:scale-[0.98]"
    >
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-xl"
        style={{ background: tint(color, 16) }}
      >
        {entity.icon}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold">{entity.name}</h3>
        <p className="muted truncate text-[13px]">
          {subtitle ?? entity.category ?? ENTITY_LABEL[entity.entityType]}
        </p>
      </div>

      {entity.purchasePrice !== undefined && (
        <span className="tnum muted shrink-0 text-[13px]">{money(entity.purchasePrice)}</span>
      )}

      <Icon name="chevron" className="muted-more h-4 w-4 shrink-0" strokeWidth={2.5} />
    </Link>
  )
}
