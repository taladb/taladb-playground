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
        <h1 className="text-[28px] font-semibold tracking-tight md:text-4xl">Your Things</h1>
        <EngineBadge engine={result.data?.searched ? 'keyword' : 'structured'} size="xs" />
      </div>

      <label htmlFor="thing-search" className="sr-only">
        Search your things
      </label>
      <input
        id="thing-search"
        name="q"
        type="search"
        autoComplete="off"
        spellCheck={false}
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
            className="chip shrink-0 font-semibold"
            style={
              type === t
                ? { background: 'var(--color-ios-blue)', color: '#fff' }
                : { background: 'var(--color-card)', color: 'var(--color-label-2)' }
            }
          >
            {t === 'all' ? 'Everything' : `${ENTITY_LABEL[t]}s`}
          </button>
        ))}
      </div>

      {!trimmed && !!categories.data?.length && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory(null)}
            className="chip font-medium"
            style={
              category === null
                ? { background: 'color-mix(in oklab, var(--color-ios-blue) 14%, transparent)', color: 'var(--color-ios-blue)' }
                : { background: 'var(--color-card)', color: 'var(--color-label-2)' }
            }
          >
            All categories
          </button>
          {categories.data.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c === category ? null : c)}
              className="chip font-medium"
              style={
                category === c
                  ? { background: 'color-mix(in oklab, var(--color-ios-blue) 14%, transparent)', color: 'var(--color-ios-blue)' }
                  : { background: 'var(--color-card)', color: 'var(--color-label-2)' }
              }
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs muted">
        {result.loading ? 'Searching…' : plural(entities.length, 'result')}
        {!trimmed && category && ` in ${category}`}
      </p>

      {entities.length === 0 && !result.loading ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="text-3xl" aria-hidden>
            📦
          </span>
          <p className="text-[17px] font-semibold">Nothing matched</p>
          <p className="max-w-sm text-sm muted">
            Try a different search, or another type of thing.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity, i) => (
            <EntityCard key={entity._id} entity={entity} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
