'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTalaDB } from '@taladb/react'
import { collections } from '@/lib/schema'
import { queryTerms } from '@/lib/highlight'
import { MEMORY_COLOR, MEMORY_LABEL, shortDate } from '@/lib/format'
import { setTheme } from '@/lib/theme'
import { handOff } from '@/lib/handoff'
import { Icon, IconTile, type IconName } from './Icon'
import { Highlight } from './Highlight'
import type { Entity, MemoryRow } from '@/lib/types'

/**
 * The command palette — ⌘K / Ctrl+K from anywhere, or "/".
 *
 * Typing runs two BM25 queries side by side, one over memory text and one over
 * the things' flattened `searchText`, on every keystroke after a short pause.
 * That is cheap enough to do live because it never leaves the device: the
 * timing in the footer is the real round trip to the database worker. Search
 * by meaning lives on the Search page, where its model and its cost are
 * explained; here, the first row always hands the query over to it.
 */

interface PaletteApi {
  open: (initial?: string) => void
}

const PaletteContext = createContext<PaletteApi>({ open: () => {} })

export function usePalette() {
  return useContext(PaletteContext)
}

interface Item {
  id: string
  group: string
  label: string
  /** Rendered with the query's words marked. */
  marked?: boolean
  sub?: string
  icon: React.ReactNode
  run: () => void
}

const PAGES: Array<{ href: string; label: string; icon: IconName; keywords: string }> = [
  { href: '/', label: 'Home', icon: 'home', keywords: 'overview summary start' },
  { href: '/recall', label: 'Search', icon: 'search', keywords: 'recall ask find hybrid semantic keyword' },
  { href: '/things', label: 'Things', icon: 'box', keywords: 'entities people places browse' },
  { href: '/timeline', label: 'Timeline', icon: 'clock', keywords: 'history memories all' },
  { href: '/insights', label: 'Insights', icon: 'chart', keywords: 'spend money totals' },
  { href: '/how-it-works', label: 'How it works', icon: 'book', keywords: 'about privacy taladb local' },
  { href: '/settings', label: 'Settings', icon: 'gear', keywords: 'storage export import model index' },
  { href: '/lab', label: 'Scale Lab', icon: 'layers', keywords: 'benchmark hnsw performance' },
]

const EXAMPLES = ['bike keeps making a clicking noise', 'who has my camera?', 'where is my drill?']

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; initial: string; nonce: number }>({
    open: false,
    initial: '',
    nonce: 0,
  })

  const open = useCallback((initial = '') => {
    setState((s) => ({ open: true, initial, nonce: s.nonce + 1 }))
  }, [])
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setState((s) => (s.open ? { ...s, open: false } : { open: true, initial: '', nonce: s.nonce + 1 }))
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null
        const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
        if (!typing) {
          e.preventDefault()
          open()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const api = useMemo(() => ({ open }), [open])

  return (
    <PaletteContext.Provider value={api}>
      {children}
      {state.open && <Palette key={state.nonce} initial={state.initial} onClose={close} />}
    </PaletteContext.Provider>
  )
}

function Palette({ initial, onClose }: { initial: string; onClose: () => void }) {
  const db = useTalaDB()
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const listId = useId()
  const [query, setQuery] = useState(initial)
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<{ memories: MemoryRow[]; things: Entity[]; ms: number } | null>(null)
  const ticket = useRef(0)

  useEffect(() => {
    const d = dialog.current
    if (d && !d.open) d.showModal()
  }, [])

  // Live keyword search, debounced. A slower answer for an older query is
  // dropped rather than painted over the newer one.
  useEffect(() => {
    const q = query.trim()
    const mine = ++ticket.current
    if (!q) {
      setHits(null)
      return
    }
    const t = setTimeout(async () => {
      const started = performance.now()
      const { memories, entities } = collections(db)
      try {
        const [m, e] = await Promise.all([
          // Hits carry their vectors (the JS client has no projection on
          // searchText); six of them is a small price, and they are dropped
          // here rather than held in state.
          memories.searchText('content', q, 6).then((r) =>
            r.map((h) => {
              const { embedding: _vector, ...row } = h.document
              return row as MemoryRow
            }),
          ),
          entities.searchText('searchText', q, 5),
        ])
        if (mine !== ticket.current) return
        setHits({ memories: m, things: e.map((h) => h.document), ms: performance.now() - started })
        setActive(0)
      } catch {
        if (mine === ticket.current) setHits({ memories: [], things: [], ms: performance.now() - started })
      }
    }, 120)
    return () => clearTimeout(t)
  }, [db, query])

  const go = useCallback(
    (href: string) => {
      dialog.current?.close()
      router.push(href)
    },
    [router],
  )

  const items = useMemo<Item[]>(() => {
    const q = query.trim()
    const lower = q.toLowerCase()
    const out: Item[] = []

    if (q) {
      out.push({
        id: 'ask',
        group: 'Search',
        label: `Search memories for “${q}”`,
        sub: 'Exact answers, keyword, semantic and hybrid ranking',
        icon: <Icon name="search" className="h-4 w-4" strokeWidth={2.2} />,
        // Typed text goes by hand-off, never in the URL — see lib/handoff.ts.
        run: () => {
          handOff('q', q)
          go('/recall')
        },
      })
      for (const m of hits?.memories ?? []) {
        out.push({
          id: `m-${m._id}`,
          group: 'Memories',
          label: m.title,
          marked: true,
          sub: `${MEMORY_LABEL[m.memoryType]} · ${shortDate(m.occurredAt)}${m.entityNames[0] ? ` · ${m.entityNames[0]}` : ''}`,
          icon: <IconTile name={m.memoryType} color={MEMORY_COLOR[m.memoryType]} size="sm" />,
          run: () => go(`/memory/${m._id}`),
        })
      }
      for (const e of hits?.things ?? []) {
        out.push({
          id: `e-${e._id}`,
          group: 'Things',
          label: e.name,
          marked: true,
          sub: [e.category, e.manufacturer, e.model].filter(Boolean).join(' · '),
          icon: <span className="text-[16px] leading-none">{e.icon}</span>,
          run: () => go(`/entity/${e._id}`),
        })
      }
    } else {
      for (const ex of EXAMPLES) {
        out.push({
          id: `x-${ex}`,
          group: 'Try asking',
          label: ex,
          icon: <Icon name="sparkle" className="h-4 w-4" strokeWidth={2.2} />,
          run: () => go(`/recall?q=${encodeURIComponent(ex)}`),
        })
      }
      out.push({
        id: 'remember',
        group: 'Actions',
        label: 'Remember something',
        sub: 'Write a memory in plain words',
        icon: <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />,
        run: () => go('/capture'),
      })
      for (const [choice, label, icon] of [
        ['light', 'Use light appearance', 'sun'],
        ['dark', 'Use dark appearance', 'moon'],
        ['system', 'Match system appearance', 'monitor'],
      ] as const) {
        out.push({
          id: `theme-${choice}`,
          group: 'Actions',
          label,
          icon: <Icon name={icon} className="h-4 w-4" strokeWidth={2.2} />,
          run: () => {
            setTheme(choice)
            dialog.current?.close()
          },
        })
      }
    }

    for (const p of PAGES) {
      if (q && !`${p.label} ${p.keywords}`.toLowerCase().includes(lower)) continue
      out.push({
        id: `p-${p.href}`,
        group: 'Go to',
        label: p.label,
        icon: <Icon name={p.icon} className="h-4 w-4" strokeWidth={2.2} />,
        run: () => go(p.href),
      })
    }
    return out
  }, [query, hits, go])

  const terms = useMemo(() => queryTerms(query), [query])
  const current = Math.min(active, Math.max(0, items.length - 1))

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [current, listId])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(1, items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % Math.max(1, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[current]?.run()
    }
  }

  let lastGroup = ''

  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label="Search and commands"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close()
      }}
    >
      <div className="flex items-center gap-3 px-4" style={{ boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>
        <Icon name="search" className="muted h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search memories and things, or jump to a page…"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items.length ? `${listId}-${current}` : undefined}
          aria-autocomplete="list"
          spellCheck={false}
          autoComplete="off"
          className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        />
        <kbd className="kbd hidden sm:inline-flex">esc</kbd>
      </div>

      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
        {items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null
          lastGroup = item.group
          return (
            <li key={item.id} role="presentation">
              {header && (
                <p className="eyebrow px-2.5 pb-1.5 pt-3 first:pt-1" role="presentation">
                  {header}
                  {header === 'Memories' && <span className="ml-1.5 normal-case tracking-normal muted-more">keyword</span>}
                </p>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={item.run}
                className="flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2"
                style={i === current ? { background: 'var(--color-fill)' } : undefined}
              >
                <span className="muted flex h-6 w-6 shrink-0 items-center justify-center">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {item.marked ? <Highlight text={item.label} terms={terms} /> : item.label}
                  </span>
                  {item.sub && <span className="muted block truncate text-[12px]">{item.sub}</span>}
                </span>
                {i === current && <Icon name="arrow" className="muted h-4 w-4 shrink-0" strokeWidth={2.2} />}
              </div>
            </li>
          )
        })}
        {query.trim() && hits && !hits.memories.length && !hits.things.length && (
          <li className="muted px-2.5 py-3 text-[13px]" role="presentation">
            No memory or thing contains those words. Search by meaning may still find it — press
            Enter on the first row.
          </li>
        )}
      </ul>

      <div
        className="muted flex items-center justify-between gap-3 px-4 py-2.5 text-[12px]"
        style={{ boxShadow: 'inset 0 1px 0 var(--color-border)' }}
      >
        <span className="hidden items-center gap-1.5 sm:flex">
          <kbd className="kbd">↑</kbd>
          <kbd className="kbd">↓</kbd> to move <kbd className="kbd ml-1">↵</kbd> to open
        </span>
        <span className="tnum ml-auto">
          {hits ? `Searched on this device in ${hits.ms.toFixed(1)} ms` : 'Runs entirely on this device'}
        </span>
      </div>
    </dialog>
  )
}
