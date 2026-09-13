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

const STYLES: Record<Engine, { label: string; color: string; title: string }> = {
  structured: {
    label: 'Document',
    color: 'var(--color-ios-cyan)',
    title: 'Answered exactly by an indexed query or aggregation. Computed, not ranked.',
  },
  keyword: {
    label: 'Keyword',
    color: 'var(--color-ios-cyan)',
    title: 'BM25 full-text ranking over the memory text.',
  },
  vector: {
    label: 'Vector',
    color: 'var(--color-ios-purple)',
    title: 'Nearest-neighbour search over on-device embeddings. Finds meaning, not words.',
  },
  hybrid: {
    label: 'Hybrid',
    color: 'var(--color-ios-pink)',
    title: 'Keyword and vector rankings fused by reciprocal rank fusion, in one query.',
  },
  graph: {
    label: 'Graph',
    color: 'var(--color-ios-green)',
    title: 'Walked the relations between entities — containment, ownership, service history.',
  },
}

export function EngineBadge({ engine, size = 'sm' }: { engine: Engine; size?: 'sm' | 'xs' }) {
  const style = STYLES[engine]
  return (
    <span
      title={style.title}
      className={`chip font-semibold ${size === 'xs' ? 'px-2 py-0.5 text-[11px]' : ''}`}
      style={{
        background: `color-mix(in oklab, ${style.color} 15%, transparent)`,
        color: style.color,
      }}
    >
      <span
        aria-hidden
        className={`${size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2'} rounded-full`}
        style={{ background: style.color }}
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
      <Rank label="kw" rank={textRank} tone="var(--color-ios-cyan)" engine="Keyword search" />
      <span aria-hidden className="muted-more">
        ·
      </span>
      <Rank
        label="vec"
        rank={vectorRank}
        tone="var(--color-ios-purple)"
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
      className={found ? '' : 'muted-more'}
      style={found ? { color: tone } : undefined}
    >
      <span className="opacity-60">{label}</span>{' '}
      <span className={found ? 'font-semibold' : ''}>{found ? rank + 1 : '—'}</span>
    </span>
  )
}
