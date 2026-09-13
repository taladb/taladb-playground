import type { Engine } from '@/lib/retrieval'

/**
 * Which engine produced a result.
 *
 * This is the most important piece of UI in the app. A local-first database
 * that does both document queries and vector search has a specific claim to
 * make — that exact questions get exact answers and only fuzzy ones get ranked
 * — and a claim like that is worth nothing if the user cannot see it happening.
 * So every answer, every result row and every search carries its attribution,
 * in three colours that mean the same thing everywhere.
 *
 * The dot carries the colour and the text stays near-neutral: a row of
 * fully-tinted pills turns a page into a fruit salad, and these appear
 * everywhere.
 */

const STYLES: Record<Engine, { label: string; dot: string; ring: string; title: string }> = {
  structured: {
    label: 'Document',
    dot: 'bg-sky-500',
    ring: 'border-sky-200 bg-sky-50/70 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
    title: 'Answered exactly by an indexed query or aggregation. Computed, not ranked.',
  },
  keyword: {
    label: 'Keyword',
    dot: 'bg-sky-400',
    ring: 'border-sky-200 bg-sky-50/70 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
    title: 'BM25 full-text ranking over the memory text.',
  },
  vector: {
    label: 'Vector',
    dot: 'bg-violet-500',
    ring: 'border-violet-200 bg-violet-50/70 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200',
    title: 'Nearest-neighbour search over on-device embeddings. Finds meaning, not words.',
  },
  hybrid: {
    label: 'Hybrid',
    dot: 'bg-gradient-to-br from-sky-400 to-violet-500',
    ring: 'border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-900 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/40 dark:text-fuchsia-200',
    title: 'Keyword and vector rankings fused by reciprocal rank fusion, in one query.',
  },
  graph: {
    label: 'Graph',
    dot: 'bg-emerald-500',
    ring: 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
    title: 'Walked the relations between entities — containment, ownership, service history.',
  },
}

export function EngineBadge({ engine, size = 'sm' }: { engine: Engine; size?: 'sm' | 'xs' }) {
  const style = STYLES[engine]
  return (
    <span
      title={style.title}
      className={`chip ${style.ring} ${size === 'xs' ? 'px-2 py-0.5 text-[10px]' : ''}`}
    >
      <span
        aria-hidden
        className={`${style.dot} ${size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2'} rounded-full`}
      />
      {style.label}
    </span>
  )
}

/**
 * Per-hit rank attribution.
 *
 * `hybridSearch` reports where each document placed in *each* retriever's list,
 * and null when that retriever never returned it at all. That detail is the
 * proof that fusion is doing something: a row reading `kw — · vec 1` is a
 * result keyword search could not have found, and the dash is the whole point,
 * so it is drawn as a real absence rather than hidden.
 */
export function RankMarks({
  textRank,
  vectorRank,
}: {
  textRank: number | null
  vectorRank: number | null
}) {
  return (
    <span className="tnum inline-flex items-center gap-3 font-mono text-[10px]">
      <Rank label="kw" rank={textRank} tone="text-sky-700 dark:text-sky-400" engine="Keyword search" />
      <span aria-hidden className="text-stone-300 dark:text-stone-700">
        ·
      </span>
      <Rank
        label="vec"
        rank={vectorRank}
        tone="text-violet-700 dark:text-violet-400"
        engine="Vector search"
      />
    </span>
  )
}

function Rank({
  label,
  rank,
  tone,
  engine,
}: {
  label: string
  rank: number | null
  tone: string
  engine: string
}) {
  const found = rank !== null
  return (
    <span
      title={found ? `${engine} ranked this #${rank + 1}` : `${engine} did not return this document`}
      className={found ? tone : 'text-stone-400 dark:text-stone-600'}
    >
      <span className="opacity-60">{label}</span>{' '}
      <span className={found ? 'font-semibold' : ''}>{found ? rank + 1 : '—'}</span>
    </span>
  )
}
