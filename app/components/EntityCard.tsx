'use client'

import Link from 'next/link'
import { ENTITY_LABEL, money } from '@/lib/format'
import type { Entity } from '@/lib/types'

export function EntityCard({ entity, subtitle }: { entity: Entity; subtitle?: string }) {
  return (
    <Link
      href={`/entity/${entity._id}`}
      className="card group flex items-start gap-3 p-4 transition-colors hover:border-amber-400 dark:hover:border-amber-600"
    >
      <span className="text-2xl leading-none" aria-hidden>
        {entity.icon}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium group-hover:text-amber-700 dark:group-hover:text-amber-400">
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
    </Link>
  )
}
