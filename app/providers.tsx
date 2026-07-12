'use client'

import { TalaDBProvider, ReplicationProvider } from '@taladb/react'
import { DB_NAME } from '@/lib/db-schema'
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
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TalaDBProvider name={DB_NAME} fallback={<Splash />}>
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
