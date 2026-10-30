'use client'

import { Component } from 'react'
import { TalaDBProvider } from '@taladb/react'
import { COLLECTION_OPTIONS, DB_NAME } from '@/lib/schema'
import { SeedGate } from '@/lib/seed'
import { Splash, StartupError } from './components/Splash'
import { ToastProvider } from './components/Toast'
import { PaletteProvider } from './components/CommandPalette'

/**
 * One provider, no network.
 *
 * This used to wrap a replication provider as well — a sync endpoint, an auth
 * token and a poll interval. taladb 0.11.0 removed sync, replication and the
 * conflict-resolution APIs outright, so there is nothing left to configure:
 * the database on this device is the whole system, and the only server this app
 * talks to is the one that served its JavaScript.
 *
 * `collections` registers each collection's options once, so every hook beneath
 * this point — `useFind`, `useAggregate`, `useWrite` — resolves a *configured*
 * handle. Without it the hooks fall back to a bare `db.collection(name)` and a
 * write silently skips both the Zod schema and the `_v` stamp.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OpenErrorBoundary>
      <TalaDBProvider name={DB_NAME} fallback={<Splash />} collections={COLLECTION_OPTIONS}>
        <SeedGate>
          <ToastProvider>
            <PaletteProvider>{children}</PaletteProvider>
          </ToastProvider>
        </SeedGate>
      </TalaDBProvider>
    </OpenErrorBoundary>
  )
}

/**
 * `TalaDBProvider` rethrows an `openDB` failure during render — blocked
 * storage, a browser without the APIs it needs, a file it could not lock.
 * Without a boundary that is a blank page. With one it is an explanation and a
 * retry, and nothing on disk is touched to get there.
 */
class OpenErrorBoundary extends Component<{ children: React.ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    if (this.state.error !== null) {
      const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
      return <StartupError title="Could not open the database" message={message} />
    }
    return this.props.children
  }
}
