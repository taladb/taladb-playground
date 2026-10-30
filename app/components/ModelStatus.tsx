'use client'

import { loadEmbedder, useEmbedderState, type EmbedderState } from '@/lib/embed'
import { Icon } from './Icon'

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

/** One line describing the model, for status lists. */
export function modelStatusLabel(state: EmbedderState): string {
  switch (state.status) {
    case 'ready':
      return 'Loaded, running on this device'
    case 'loading':
      return state.totalBytes > 0 && state.loadedBytes >= state.totalBytes
        ? 'Starting up'
        : state.totalBytes > 0
          ? `Loading — ${mb(state.loadedBytes)} of ${mb(state.totalBytes)}`
          : 'Loading'
    case 'error':
      return 'Failed to load'
    default:
      return 'Not loaded (optional)'
  }
}

/**
 * The semantic tier, switched on or off.
 *
 * The model is optional and the copy says so: exact answers, keyword search,
 * timelines and aggregation all work with nothing downloaded. Progress is the
 * real byte count from the worker — summed over the model files seen so far,
 * so it never runs backwards — and there is no percentage, because the total
 * is not known until the last file has started.
 */
export function ModelCard({
  compact = false,
  reason,
}: {
  compact?: boolean
  /** Why this page wants the model, in one sentence. */
  reason?: string
}) {
  const state = useEmbedderState()

  if (state.status === 'ready') {
    return (
      <div
        className="flex items-center gap-2.5 rounded-[12px] px-3.5 py-2.5 text-[13px]"
        style={{
          background: 'color-mix(in oklab, var(--color-ios-purple) 10%, transparent)',
          color: 'var(--color-ios-purple)',
        }}
      >
        <Icon name="check" className="h-4 w-4 shrink-0" strokeWidth={2.4} />
        <span>
          Semantic search is on. Your queries are turned into vectors by a model running in this
          browser.
        </span>
      </div>
    )
  }

  if (state.status === 'loading') {
    const known = state.totalBytes > 0
    const initialising = known && state.loadedBytes >= state.totalBytes
    const fraction = known ? state.loadedBytes / state.totalBytes : 0
    return (
      <div className="card p-4" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="spinner h-4 w-4 shrink-0" style={{ color: 'var(--color-ios-purple)' }} />
          <p className="text-[14px] font-medium">
            {initialising
              ? 'Starting the runtime…'
              : known
                ? `Loading the embedding model — ${mb(state.loadedBytes)} of ${mb(state.totalBytes)}`
                : 'Loading the embedding model…'}
          </p>
        </div>
        {known && !initialising && (
          <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: 'var(--color-fill)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${Math.round(fraction * 100)}%`, background: 'var(--color-ios-purple)' }}
            />
          </div>
        )}
        <p className="muted mt-2 text-[12px] leading-relaxed">
          The byte count covers the model files; the 22 MB WebAssembly runtime loads after them.
          Both are served by this site and cached by your browser, so later visits load it from disk. It
          runs in a background worker. Your memories and queries are not sent anywhere.
        </p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: 'color-mix(in oklab, var(--color-ios-purple) 14%, transparent)', color: 'var(--color-ios-purple)' }}
          >
            <Icon name="sparkle" className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">
              {state.status === 'error' ? 'The embedding model did not load' : 'Search by meaning is off'}
            </p>
            {!compact && (
              <p className="muted mt-0.5 text-[13px] leading-relaxed">
                {reason ??
                  'Turning it on loads an embedding model (all-MiniLM-L6-v2, 23 MB) and its WebAssembly runtime (22 MB), then runs them in this browser.'}{' '}
                Everything else works without it.
              </p>
            )}
            {state.status === 'error' && (
              <p className="mt-1 text-[12px]" style={{ color: 'var(--color-ios-red)' }}>
                {state.message}. Your data is unaffected — try again, or keep using keyword search.
              </p>
            )}
          </div>
        </div>
        <button onClick={() => void loadEmbedder().catch(() => {})} className="btn-ghost shrink-0 text-[14px]">
          {state.status === 'error' ? 'Try again' : 'Turn on semantic search'}
        </button>
      </div>
    </div>
  )
}
