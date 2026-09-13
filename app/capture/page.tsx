'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTalaDB } from '@taladb/react'
import { extractMemory, type MemoryProposal } from '@/lib/extract'
import { saveMemory } from '@/lib/mutations'
import { collections } from '@/lib/schema'
import { MEMORY_ICON, MEMORY_LABEL } from '@/lib/format'
import { MEMORY_TYPES, type Entity, type MemoryType } from '@/lib/types'

/**
 * Capture.
 *
 * The user writes a sentence; the app proposes a structured memory; the user
 * confirms it. The middle step is deterministic — a verb table, a date parser,
 * a currency parser and BM25 entity resolution — so it runs instantly, offline,
 * on any device, and can explain every field it filled.
 *
 * Nothing is written until save. That is the rule the whole provenance model
 * rests on: an extraction is a proposal, and only a person makes it confirmed.
 */
export default function CapturePage() {
  return (
    <Suspense fallback={<div className="card h-40 animate-pulse " />}>
      <Capture />
    </Suspense>
  )
}

function Capture() {
  const db = useTalaDB()
  const router = useRouter()
  const params = useSearchParams()

  const [text, setText] = useState(params.get('text') ?? '')
  const [proposal, setProposal] = useState<MemoryProposal | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Overrides the user made on the confirm screen. Kept separate from the
  // proposal so the extractor's own reasoning stays visible next to them.
  const [type, setType] = useState<MemoryType | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')

  async function extract(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return

    setExtracting(true)
    setError(null)
    try {
      const next = await extractMemory(db, trimmed)
      setProposal(next)
      setType(next.memoryType.value)
      setTitle(next.title)
      setDate(new Date(next.occurredAt.value).toISOString().slice(0, 10))
      setAmount(next.amount ? String(next.amount.value) : '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExtracting(false)
    }
  }

  // Text arriving from the home screen goes straight to extraction — the user
  // already pressed a button once and should not have to press another.
  useEffect(() => {
    const initial = params.get('text')
    if (initial) void extract(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!proposal || !type) return

    setSaving(true)
    setError(null)
    try {
      const id = await saveMemory(db, {
        memoryType: type,
        title: title.trim() || proposal.title,
        content: proposal.content,
        occurredAt: new Date(`${date}T09:00:00`).getTime(),
        subject: proposal.subject?.value ?? null,
        actor: proposal.actor?.value ?? null,
        place: proposal.place?.value ?? null,
        mentioned: proposal.mentioned,
        ...(amount.trim() ? { amount: Number(amount) } : {}),
        sourceType: proposal.sourceType,
      })

      const target = proposal.subject?.value._id
      router.push(target ? `/entity/${target}` : '/timeline')
      void id
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight md:text-4xl">Remember Something</h1>
        <p className="mt-2 max-w-2xl text-sm muted">
          Write it the way you would say it out loud.
        </p>
      </div>

      <div className="card p-4">
        <label htmlFor="capture-text" className="sr-only">
          What do you want to remember?
        </label>
        <textarea
          id="capture-text"
          name="memory"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Changed the bicycle chain today at CycleHouse for ₱1,200…"
          className="w-full resize-none bg-transparent text-[17px] leading-relaxed outline-none
 placeholder:text-[17px]"
        />
        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs muted">
            Nothing is saved until you confirm.
          </p>
          <button
            onClick={() => void extract(text)}
            disabled={extracting || !text.trim()}
            className="btn-primary text-sm"
          >
            {extracting ? <span className="spinner h-4 w-4" /> : proposal ? 'Re-read' : 'Continue'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-[var(--color-ios-red)]">
          {error}
        </div>
      )}

      {proposal && type && (
        <section className="card overflow-hidden">
          <header className="px-5 py-3.5" style={{ boxShadow: 'inset 0 -0.5px 0 var(--color-separator)' }}>
            <h2 className="text-sm font-semibold">What this looks like</h2>
            <p className="mt-0.5 text-xs muted">
              Change anything that is wrong. Each field says why it was filled in.
            </p>
          </header>

          <div className="divide-y">
            <Row label="Kind" htmlFor="m-kind" reason={proposal.memoryType.reason} confidence={proposal.memoryType.confidence}>
              <select
                id="m-kind"
                name="memoryType"
                value={type}
                onChange={(e) => setType(e.target.value as MemoryType)}
                className="field"
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MEMORY_ICON[t]} {MEMORY_LABEL[t]}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Title" htmlFor="m-title">
              <input
                id="m-title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="field"
              />
            </Row>

            <Row label="When" htmlFor="m-date" reason={proposal.occurredAt.reason} confidence={proposal.occurredAt.confidence}>
              <input
                id="m-date"
                name="occurredAt"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field"
              />
            </Row>

            {proposal.subject && (
              <Row
                label="What it happened to"
                reason={proposal.subject.reason}
                confidence={proposal.subject.confidence}
              >
                <EntityPill entity={proposal.subject.value} />
              </Row>
            )}

            {proposal.actor && (
              <Row label="Who with" reason={proposal.actor.reason} confidence={proposal.actor.confidence}>
                <EntityPill entity={proposal.actor.value} />
              </Row>
            )}

            {proposal.place && (
              <Row label="Where" reason={proposal.place.reason} confidence={proposal.place.confidence}>
                <EntityPill entity={proposal.place.value} />
              </Row>
            )}

            <Row
              label="Amount"
              htmlFor="m-amount"
              reason={proposal.amount?.reason ?? 'no amount found in the text'}
              confidence={proposal.amount?.confidence}
            >
              <input
                id="m-amount"
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="—"
                className="field tnum"
              />
            </Row>

            {!!proposal.mentioned.length && (
              <Row label="Also mentioned">
                <div className="flex flex-wrap gap-1.5">
                  {proposal.mentioned.map((e) => (
                    <EntityPill key={e._id} entity={e} />
                  ))}
                </div>
              </Row>
            )}
          </div>

          <footer
            className="flex items-center justify-between gap-3 px-5 py-3.5"
            style={{ boxShadow: 'inset 0 0.5px 0 var(--color-separator)' }}
          >
            <p className="text-xs muted">
              Saving marks this confirmed by you.
            </p>
            <button onClick={() => void save()} disabled={saving} className="btn-primary text-sm">
              {saving ? <span className="spinner h-4 w-4" /> : 'Save memory'}
            </button>
          </footer>
        </section>
      )}

      {proposal && !proposal.subject && (
        <NoSubjectHint />
      )}
    </div>
  )
}

function Row({
  label,
  htmlFor,
  reason,
  confidence,
  children,
}: {
  label: string
  /** Binds the visible label to its control. Without it these read as
   *  free-floating text and the control is announced unlabelled. */
  htmlFor?: string
  reason?: string
  confidence?: number
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2 px-5 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium">{label}</p>
        )}
        {reason && (
          <p className="mt-0.5 text-[11px] leading-snug muted">
            {confidence !== undefined && (
              <span
                className={
                  confidence >= 0.8
                    ? 'text-[var(--color-ios-green)]'
                    : confidence >= 0.5
                      ? 'text-[var(--color-ios-orange)]'
                      : 'muted-more'
                }
              >
                {confidence >= 0.8 ? '◐' : confidence >= 0.5 ? '◐' : '◇'}{' '}
              </span>
            )}
            {reason}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function EntityPill({ entity }: { entity: Entity }) {
  return (
    <span className="chip" style={{ background: 'color-mix(in oklab, var(--color-ios-gray) 14%, transparent)' }}>
      <span aria-hidden>{entity.icon}</span>
      {entity.name}
    </span>
  )
}

function NoSubjectHint() {
  const db = useTalaDB()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    void collections(db).entities.count().then(setCount)
  }, [db])

  return (
    <p className="text-xs muted">
      No thing matched this text{count !== null && ` out of the ${count} on this device`}. The
      memory will still be saved and fully searchable — it just will not appear on any timeline
      until it names something.
    </p>
  )
}
