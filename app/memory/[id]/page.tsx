'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTalaDB } from '@taladb/react'
import { collections } from '@/lib/schema'
import { isSampleMemory } from '@/lib/queries'
import { similarMemories } from '@/lib/retrieval'
import { deleteMemory, updateMemory } from '@/lib/mutations'
import { useEmbedderState } from '@/lib/embed'
import { useAsync } from '@/lib/use-async'
import { MEMORY_COLOR, MEMORY_LABEL, fullDate, money, relative } from '@/lib/format'
import { IconTile, Icon } from '@/app/components/Icon'
import { ConfidenceMark } from '@/app/components/ConfidenceMark'
import { EngineBadge } from '@/app/components/EngineBadge'
import { ConfirmDialog } from '@/app/components/Dialog'
import { CardSkeleton, LoadingAnnounce } from '@/app/components/Skeleton'
import { useToast } from '@/app/components/Toast'
import type { MemoryRow } from '@/lib/types'

/**
 * One memory, whole.
 *
 * The timeline shows a memory in a line or three; this is where it can be read
 * in full, corrected, or removed — and where the vector index gets its most
 * honest use: "memories like this one", which has no query text at all, only
 * the stored embedding of the memory itself.
 */
export default function MemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const db = useTalaDB()
  const router = useRouter()
  const toast = useToast()
  const [nonce, setNonce] = useState(0)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const memory = useAsync(async () => {
    const [row] = await collections(db).memories.aggregate<MemoryRow & { hasVector?: boolean }>([
      { $match: { _id: id } as never },
      { $project: { embedding: 0 } },
    ])
    if (!row) return null
    const embedded = (await collections(db).memories.count({ _id: id, embedding: { $exists: true } } as never)) > 0
    return { row, embedded }
  }, [db, id, nonce])

  if (memory.loading && !memory.data) {
    return (
      <div className="space-y-5">
        <LoadingAnnounce>Loading memory…</LoadingAnnounce>
        <CardSkeleton className="h-10 w-2/3" />
        <CardSkeleton className="h-48" />
      </div>
    )
  }

  if (!memory.data) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Icon name="note" className="muted-more h-7 w-7" strokeWidth={1.8} />
        <p className="text-[17px] font-semibold">This memory is not on this device</p>
        <p className="muted max-w-sm text-[14px]">It may have been deleted, or the link came from another browser.</p>
        <Link href="/timeline" className="btn-ghost mt-2">
          Open the timeline
        </Link>
      </div>
    )
  }

  const { row: m, embedded } = memory.data
  const color = MEMORY_COLOR[m.memoryType]
  const sample = isSampleMemory(m)

  async function doDelete() {
    setDeleting(true)
    try {
      await deleteMemory(db, id)
      toast('Memory deleted')
      router.push(m.subjectId ? `/entity/${m.subjectId}` : '/timeline')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="muted inline-flex items-center gap-1.5 text-[14px] font-medium hover:text-[var(--color-label)]">
        <Icon name="back" className="h-4 w-4" strokeWidth={2.2} />
        Back
      </button>

      {editing ? (
        <EditForm
          memory={m}
          embedded={embedded}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            setNonce((n) => n + 1)
            toast('Changes saved')
          }}
        />
      ) : (
        <article className="card overflow-hidden">
          <header className="flex items-start gap-4 p-5 md:p-6">
            <IconTile name={m.memoryType} color={color} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className="font-semibold" style={{ color }}>{MEMORY_LABEL[m.memoryType]}</span>
                <span aria-hidden className="muted-more">·</span>
                <time className="muted" dateTime={new Date(m.occurredAt).toISOString()}>
                  {fullDate(m.occurredAt)} ({relative(m.occurredAt)})
                </time>
                {sample && (
                  <span className="chip py-0.5" style={{ background: 'var(--color-fill)', color: 'var(--color-label-2)' }}>
                    Sample memory
                  </span>
                )}
              </p>
              <h1 className="mt-1.5 text-[26px] md:text-[30px]">
                {m.title} <ConfidenceMark confidence={m.confidence} sourceType={m.sourceType} />
              </h1>
            </div>
          </header>

          <div className="px-5 pb-5 md:px-6 md:pb-6">
            <p className="whitespace-pre-wrap break-words text-[16px] leading-relaxed">{m.content}</p>

            <dl className="mt-6 grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
              {m.amount !== undefined && (
                <Detail label="Amount">
                  <span className="tnum font-semibold">{money(m.amount, m.currency)}</span>
                </Detail>
              )}
              {m.entityIds.length > 0 && (
                <Detail label="About">
                  <span className="flex flex-wrap gap-1.5">
                    {m.entityIds.map((eid, i) => (
                      <Link prefetch={false}
                        key={eid}
                        href={`/entity/${eid}`}
                        className="chip transition-colors hover:text-[var(--color-label)]"
                        style={{ background: 'var(--color-fill)', color: 'var(--color-label-2)' }}
                      >
                        {m.entityNames[i] ?? 'Unknown'}
                      </Link>
                    ))}
                  </span>
                </Detail>
              )}
              <Detail label="Search by meaning">
                {embedded ? 'Has a vector — findable by meaning' : 'No vector yet — keyword search only'}
              </Detail>
              <Detail label="Stored">
                {sample ? 'Sample data, in this browser' : `You saved this ${relative(m.createdAt)}, in this browser`}
              </Detail>
            </dl>
          </div>

          <footer className="flex flex-wrap gap-2 px-5 py-4 md:px-6" style={{ boxShadow: 'inset 0 1px 0 var(--color-border)' }}>
            <button onClick={() => setEditing(true)} className="btn-ghost">
              <Icon name="pencil" className="h-4 w-4" strokeWidth={2} />
              Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-ghost"
              style={{ color: 'var(--color-ios-red)' }}
            >
              <Icon name="trash" className="h-4 w-4" strokeWidth={2} />
              Delete
            </button>
          </footer>
        </article>
      )}

      <Similar id={id} embedded={embedded} nonce={nonce} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this memory?"
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={() => void doDelete()}
        onClose={() => setConfirmDelete(false)}
      >
        <p>
          “{m.title}” will be removed from this device, along with the connections it created.
          This cannot be undone{sample ? ' — though a sample memory comes back if you reset the sample data in Settings' : ''}.
        </p>
        {m.memoryType === 'return' && <p>The loan it closed will show as open again.</p>}
        {m.memoryType === 'movement' && (
          <p>Its location goes back to the previous move on record, if there is one.</p>
        )}
      </ConfirmDialog>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="muted text-[12.5px]">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

function EditForm({
  memory: m,
  embedded,
  onCancel,
  onSaved,
}: {
  memory: MemoryRow
  embedded: boolean
  onCancel: () => void
  onSaved: () => void
}) {
  const db = useTalaDB()
  const embedder = useEmbedderState()
  const [title, setTitle] = useState(m.title)
  const [content, setContent] = useState(m.content)
  const [date, setDate] = useState(() => {
    const d = new Date(m.occurredAt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [amount, setAmount] = useState(m.amount !== undefined ? String(m.amount) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const textChanged = title.trim() !== m.title || content.trim() !== m.content
  const amountValue = amount.trim() === '' ? null : Number(amount.replace(/,/g, ''))
  const amountInvalid = amountValue !== null && (!Number.isFinite(amountValue) || amountValue < 0)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (amountInvalid || !title.trim()) return
    setSaving(true)
    setError(null)
    try {
      // Keep the time of day the memory already had; only the date is edited.
      const was = new Date(m.occurredAt)
      const [y, mo, d] = date.split('-').map(Number)
      const occurredAt = new Date(y, mo - 1, d, was.getHours(), was.getMinutes(), was.getSeconds()).getTime()
      await updateMemory(db, m._id!, { title, content, occurredAt, amount: amountValue })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-5 md:p-6" aria-label="Edit memory">
      <div className="flex items-center gap-3">
        <IconTile name={m.memoryType} color={MEMORY_COLOR[m.memoryType]} />
        <h1 className="text-[20px] md:text-[22px]">Edit {MEMORY_LABEL[m.memoryType].toLowerCase()}</h1>
      </div>

      <div>
        <label htmlFor="e-title" className="text-[13px] font-medium">Title</label>
        <input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="field mt-1.5" />
      </div>
      <div>
        <label htmlFor="e-content" className="text-[13px] font-medium">What happened</label>
        <textarea
          id="e-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="field mt-1.5 resize-y leading-relaxed"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="e-date" className="text-[13px] font-medium">Date</label>
          <input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="field mt-1.5" />
        </div>
        <div>
          <label htmlFor="e-amount" className="text-[13px] font-medium">Amount ($)</label>
          <input
            id="e-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="None"
            aria-invalid={amountInvalid}
            className="field tnum mt-1.5"
          />
          {amountInvalid && <p className="mt-1 text-[12px]" style={{ color: 'var(--color-ios-red)' }}>Enter a number, or leave it empty.</p>}
        </div>
      </div>

      {textChanged && embedded && (
        <p className="muted rounded-[10px] px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: 'var(--color-fill)' }}>
          {embedder.status === 'ready'
            ? 'The text changed, so this memory will be embedded again on save.'
            : 'The text changed. Its old vector would describe words it no longer has, so it is removed on save — keyword search still finds it, and Settings can embed it again once the model is on.'}
        </p>
      )}
      {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-ios-red)' }}>{error}</p>}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost">Cancel</button>
        <button type="submit" disabled={saving || amountInvalid || !title.trim()} className="btn-primary">
          {saving ? <span className="spinner h-4 w-4" /> : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

/**
 * Nearest neighbours of this memory's own stored vector. Needs no model — the
 * query vector is already on disk — so it works before semantic search is on.
 */
function Similar({ id, embedded, nonce }: { id: string; embedded: boolean; nonce: number }) {
  const db = useTalaDB()
  const similar = useAsync(async () => {
    const started = performance.now()
    const rows = embedded ? await similarMemories(db, id, 4) : []
    return { rows, ms: performance.now() - started }
  }, [db, id, embedded, nonce])

  if (!embedded) return null

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px]">Similar memories</h2>
        <span className="flex items-center gap-2">
          {similar.data && <span className="muted tnum text-[12px]">{similar.data.ms.toFixed(1)} ms</span>}
          <EngineBadge engine="vector" size="xs" />
        </span>
      </div>
      {similar.loading && !similar.data ? (
        <CardSkeleton className="h-24" />
      ) : similar.data?.rows.length ? (
        <ul className="card divide-y overflow-hidden">
          {similar.data.rows.map(({ memory: s, score }) => (
            <li key={s._id}>
              <Link prefetch={false} href={`/memory/${s._id}`} className="list-row">
                <IconTile name={s.memoryType} color={MEMORY_COLOR[s.memoryType]} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{s.title}</span>
                  <span className="muted block truncate text-[12.5px]">{fullDate(s.occurredAt)} · {s.content}</span>
                </span>
                <span className="muted tnum shrink-0 font-mono text-[11.5px]" title="Cosine similarity of the two stored vectors">
                  {score.toFixed(3)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-[14px]">Nothing else on this device is close.</p>
      )}
      <p className="muted-more text-[12px]">
        Ranked by cosine similarity between stored vectors. No model is needed for this — the query is
        this memory’s own embedding.
      </p>
    </section>
  )
}
