'use client'

import Link from 'next/link'
import { ENTITY_LABEL, money } from '@/lib/format'
import type { Entity } from '@/lib/types'

export function EntityCard({
  entity,
  subtitle,
  index = 0,
}: {
  entity: Entity
  subtitle?: string
  index?: number
}) {
  return (
    <Link
      href={`/entity/${entity._id}`}
      style={{ '--i': index } as React.CSSProperties}
      className="card rise group flex items-start gap-3.5 p-4 transition-[box-shadow,border-color,transform]
                 duration-200 hover:-translate-y-0.5 hover:border-amber-300
                 hover:shadow-[var(--shadow-lift)] dark:hover:border-amber-800/70"
    >
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border
                   bg-stone-50 text-xl transition-colors group-hover:border-amber-200
                   group-hover:bg-amber-50 dark:bg-stone-800/60 dark:group-hover:border-amber-900/60
                   dark:group-hover:bg-amber-950/30"
      >
        {entity.icon}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-serif text-[15px] font-medium transition-colors group-hover:text-amber-800 dark:group-hover:text-amber-300">
          {entity.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
          {subtitle ?? entity.category ?? ENTITY_LABEL[entity.entityType]}
        </p>
        {entity.purchasePrice !== undefined && (
          <p className="tnum mt-1.5 text-xs text-stone-400 dark:text-stone-500">
            {money(entity.purchasePrice)}
          </p>
        )}
      </div>

      <span
        aria-hidden
        className="mt-1 shrink-0 text-stone-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-600"
      >
        →
      </span>
    </Link>
  )
}
