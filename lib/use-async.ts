'use client'

import { useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Run a one-shot async read and track its state.
 *
 * Used for the parts of the app that are genuinely imperative — a multi-step
 * graph walk, a retrieval pipeline, an aggregation that has to be assembled
 * from several queries. Anything that is a single live query should use
 * `useFind` / `useAggregate` instead and re-render on writes for free.
 *
 * The cancelled flag is what keeps a slow query from overwriting a newer one's
 * result when the deps change mid-flight.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    fn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
