import type { Engine } from '@/lib/retrieval'

/**
 * Which engine produced a result.
 *
 * This is the most important piece of UI in the app. A local-first database
 * that does both document queries and vector search has a specific claim to
 * make — that the exact questions get exact answers and only the fuzzy ones get
 * ranked — and a claim like that is worth nothing if the user cannot see it
 * happening. So every answer, every result row and every search carries its
 * attribution, in three colours that mean the same thing everywhere.
 */

const STYLES: Record<Engine, { label: string; className: string; title: string }> = {
  structured: {
    label: 'Document',
    className: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
    title: 'Answered exactly by an indexed query or aggregation. Computed, not ranked.',
  },
  keyword: {
    label: 'Keyword',
    className: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
    title: 'BM25 full-text ranking over the memory text.',
  },
  vector: {
    label: 'Vector',
    className: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
    title: 'Nearest-neighbour search over on-device embeddings. Finds meaning, not words.',
  },
  hybrid: {
    label: 'Hybrid',
    className: 'border-fuchsia-300 bg-gradient-to-r from-sky-50 to-violet-50 text-fuchsia-800 dark:border-fuchsia-800 dark:from-sky-950/50 dark:to-violet-950/50 dark:text-fuchsia-300',
    title: 'Keyword and vector rankings fused by reciprocal rank fusion, in one query.',
  },
  graph: {
    label: 'Graph',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    title: 'Walked the relations between entities — containment, ownership, service history.',
  },
}

export function EngineBadge({ engine, size = 'sm' }: { engine: Engine; size?: 'sm' | 'xs' }) {
  const style = STYLES[engine]
  return (
    <span
      title={style.title}
      className={`chip ${style.className} ${size === 'xs' ? 'px-2 py-0.5 text-[10px]' : ''}`}
    >
      {style.label}
    </span>
  )
}

/**
 * Per-hit rank attribution.
 *
 * `hybridSearch` reports where each document placed in *each* retriever's list,
 * and null when that retriever never returned it at all. That detail is the
 * proof that fusion is doing something: a row marked "vector #1 · keyword —"
 * is a result keyword search could not have found.
 */
export function RankMarks({
  textRank,
  vectorRank,
}: {
  textRank: number | null
  vectorRank: number | null
}) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] text-stone-500 dark:text-stone-400">
      <span
        className={textRank !== null ? 'text-sky-700 dark:text-sky-400' : 'opacity-40'}
        title={
          textRank !== null
            ? `Keyword search ranked this #${textRank + 1}`
            : 'Keyword search did not return this document'
        }
      >
        kw {textRank !== null ? `#${textRank + 1}` : '—'}
      </span>
      <span
        className={vectorRank !== null ? 'text-violet-700 dark:text-violet-400' : 'opacity-40'}
        title={
          vectorRank !== null
            ? `Vector search ranked this #${vectorRank + 1}`
            : 'Vector search did not return this document'
        }
      >
        vec {vectorRank !== null ? `#${vectorRank + 1}` : '—'}
      </span>
    </span>
  )
}
