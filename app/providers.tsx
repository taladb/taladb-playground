'use client'

import { TalaDBProvider } from '@taladb/react'
import { SyncProvider } from '@taladb/next/client'
import { DB_NAME } from '@/lib/db-schema'
import { getToken } from '@/lib/auth-token'
import { SeedGate } from '@/lib/seed'
import { Splash } from './components/Splash'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TalaDBProvider name={DB_NAME} fallback={<Splash />}>
      <SyncProvider
        endpoint="/api/sync"
        intervalMs={10_000}
        headers={() => ({ Authorization: `Bearer ${getToken()}` })}
        // Only user data crosses the wire — NEVER the 10k listings catalog
        // (each device re-seeds that locally from the static asset).
        options={{ collections: ['bookings', 'favorites', 'reviews'] }}
        onError={(e) => console.warn('sync skipped:', e)}
      >
        <SeedGate>{children}</SeedGate>
      </SyncProvider>
    </TalaDBProvider>
  )
}
