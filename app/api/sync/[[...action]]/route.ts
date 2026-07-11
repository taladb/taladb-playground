// The complete sync backend: POST /api/sync/push + GET /api/sync/pull.
//
// memorySyncStore keeps everything in process memory — perfect for the local
// demo and a single running instance, but state dies with the process and isn't
// shared across serverless instances. For durable cross-device sync on Vercel,
// implement the 2-method SyncStore over Upstash Redis / Postgres / Turso (LWW by
// changed_at), or run taladbSyncStore(await openDB(...)) on a long-lived Node host.
import { createSyncHandlers, memorySyncStore } from '@taladb/next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { POST, GET } = createSyncHandlers({
  store: memorySyncStore(),
  // Demo auth: any bearer token is accepted and becomes the caller's sync scope,
  // so two browser profiles with different tokens sync independent data sets.
  // Replace with real session verification in production.
  authorize: (req) => {
    const auth = req.headers.get('authorization')
    return auth?.startsWith('Bearer ') ? auth.slice(7) : null
  },
})
