'use client'

import { TalaDBProvider, ReplicationProvider } from '@taladb/react'
import { COLLECTION_OPTIONS, DB_NAME } from '@/lib/db-schema'
import { getToken } from '@/lib/auth-token'
import { SeedGate } from '@/lib/seed'
import { Splash } from './components/Splash'

/**
 * `ReplicationProvider` replaces the old `SyncProvider` (`db.sync()` on a 10s
 * timer over the whole database). Same transport and same LWW merge — but the
 * slice, the cadence and the trigger are now declared per-component by
 * `useQuery`/`useMutation` instead of one global loop.
 *
 * `prefetch` + `prefetchMode="once"` is the piece that matters for a local-first
 * feel: the user's slices are warmed in the background at browser-idle on first
 * run, and a returning device SKIPS the warm entirely — the data is already on
 * disk, so `useQuery` reads local and renders with no network in the path.
 *
 * The 10k-listing catalog is deliberately NOT here: it is local-only, seeded
 * once from a static asset, and never crosses the wire.
 *
 * `collections` registers each synced collection's schema ONCE, so every hook
 * below — including `useMutation` — writes through a *configured* handle: the
 * Zod schema hard-fails a bad local write and the engine stamps `_v`. (Before
 * taladb 0.9.3 the hooks resolved an unconfigured `db.collection(name)`, so this
 * app had to re-validate by hand in a `lib/mutations.ts` wrapper.)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TalaDBProvider name={DB_NAME} fallback={<Splash />} collections={COLLECTION_OPTIONS}>
      <ReplicationProvider
        endpoint="/api/sync"
        getAuth={() => ({ Authorization: `Bearer ${getToken()}` })}
        pollMs={10_000}
        prefetch={['bookings', 'favorites', 'reviews']}
        prefetchMode="once"
      >
        <SeedGate>{children}</SeedGate>
      </ReplicationProvider>
    </TalaDBProvider>
  )
}
