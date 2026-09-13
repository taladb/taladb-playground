'use client'

import { useState } from 'react'
import { useTalaDB } from '@taladb/react'
import { collections } from '@/lib/schema'
import { listEntities } from '@/lib/queries'
import { useAsync } from '@/lib/use-async'
import { ENTITY_LABEL, plural } from '@/lib/format'
import { EntityCard } from '../components/EntityCard'
import { EngineBadge } from '../components/EngineBadge'
import { ENTITY_TYPES, type Entity, type EntityType } from '@/lib/types'

/**
 * The entity browser — the document engine doing ordinary, unglamorous work.
 *
 * Type and category are served by the compound index, and the search box is
 * BM25 over each entity's flattened `searchText`, which is why typing a serial
 * number or a model code finds the right thing. No vector is involved anywhere
 * on this page, and that is the correct choice: browsing is a filter problem.
 */
export default function ThingsPage() {
  const db = useTalaDB()
  const [type, setType] = useState<EntityType | 'all'>('thing')
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const trimmed = query.trim()

  const result = useAsync<{ entities: Entity[]; searched: boolean }>(async () => {
    if (trimmed.length >= 2) {
      const hits = await collections(db).entities.searchText('searchText', trimmed, 40)
      const filtered = hits
        .map((h) => h.document)
        .filter((e) => type === 'all' || e.entityType === type)
      return { entities: filtered, searched: true }
    }

    const entities = await listEntities(db, {
      ...(type === 'all' ? {} : { entityType: type }),
      ...(category ? { category } : {}),
    })
    return { entities, searched: false }
  }, [db, type, category, trimmed])

  const categories = useAsync(async () => {
    if (type === 'all') return []
    const rows = await collections(db).entities.aggregate<{ _id: string }>([
      { $match: { entityType: type } as never },
      { $group: { _id: '$category' } },
      { $sort: { _id: 1 } },
    ])
    return rows.map((r) => r._id).filter(Boolean)
  }, [db, type])

  const entities = result.data?.entities ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Your things</h1>
        <EngineBadge engine={result.data?.searched ? 'keyword' : 'structured'} size="xs" />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, model, serial number or what it is…"
        className="field"
      />

      <div className="flex flex-wrap gap-1.5">
        {(['all', ...ENTITY_TYPES] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setType(t)
              setCategory(null)
            }}
            className={`chip transition-colors ${
              type === t
                ? 'border-stone-900 bg-stone-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-stone-950'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400'
            }`}
          >
            {t === 'all' ? 'Everything' : `${ENTITY_LABEL[t]}s`}
          </button>
        ))}
      </div>

      {!trimmed && !!categories.data?.length && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory(null)}
            className={`chip ${
              category === null
                ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-stone-200 text-stone-500 dark:border-stone-700 dark:text-stone-400'
            }`}
          >
            All categories
          </button>
          {categories.data.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c === category ? null : c)}
              className={`chip ${
                category === c
                  ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-stone-200 text-stone-500 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-500 dark:text-stone-400">
        {result.loading ? 'Searching…' : plural(entities.length, 'result')}
        {!trimmed && category && ` in ${category}`}
      </p>

      {entities.length === 0 && !result.loading ? (
        <p className="card p-6 text-sm text-stone-500 dark:text-stone-400">
          Nothing here yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <EntityCard key={entity._id} entity={entity} />
          ))}
        </div>
      )}
    </div>
  )
}
