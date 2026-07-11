'use client'

import { useEffect, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import type { Collection, TalaDB } from 'taladb'
import { openVault, type PaymentCard } from '@/lib/vault'
import { collections } from '@/lib/db-schema'

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your payment methods live in a <strong>separate, passphrase-encrypted database</strong>{' '}
          (AES-GCM-256 over OPFS). Below that, a live view into the on-device engine.
        </p>
      </header>
      <Vault />
      <Internals />
    </div>
  )
}

function Vault() {
  const [passphrase, setPassphrase] = useState('')
  const [vault, setVault] = useState<TalaDB | null>(null)
  const [cards, setCards] = useState<PaymentCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ label: '', holder: '', last4: '', expiry: '' })

  async function unlock(e: React.FormEvent) {
    e.preventDefault()
    if (passphrase.length < 4) {
      setError('Use at least 4 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const db = await openVault(passphrase)
      const col = db.collection<PaymentCard>('cards')
      setVault(db)
      setCards(await col.find())
    } catch {
      setError('Could not open the vault — wrong passphrase for the existing encrypted store.')
    } finally {
      setBusy(false)
    }
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault()
    if (!vault || !form.last4) return
    const col = vault.collection<PaymentCard>('cards')
    await col.insert({ ...form, createdAt: Date.now() })
    setCards(await col.find())
    setForm({ label: '', holder: '', last4: '', expiry: '' })
  }

  async function remove(id?: string) {
    if (!vault || !id) return
    const col = vault.collection<PaymentCard>('cards')
    await col.deleteOne({ _id: id })
    setCards(await col.find())
  }

  if (!vault) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">🔒 Encrypted vault</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">
          Enter a passphrase to open (or create) your encrypted vault. Remember it — a wrong passphrase
          fails to decrypt, by design.
        </p>
        <form onSubmit={unlock} className="flex gap-2">
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {busy ? 'Opening…' : 'Unlock'}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold">🔓 Vault unlocked · payment methods</h2>
      <ul className="mb-4 flex flex-col gap-2">
        {cards.length === 0 && <li className="text-sm text-slate-400">No cards saved yet.</li>}
        {cards.map((c) => (
          <li key={c._id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div>
              <span className="font-medium">{c.label || 'Card'}</span>{' '}
              <span className="font-mono text-slate-500">•••• {c.last4}</span>
              <div className="text-xs text-slate-400">
                {c.holder} · exp {c.expiry}
              </div>
            </div>
            <button onClick={() => remove(c._id)} className="text-xs text-red-600 hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={addCard} className="grid grid-cols-2 gap-2">
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label (e.g. Personal)" className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        <input value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} placeholder="Cardholder" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        <input value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value.slice(0, 4) })} placeholder="Last 4 digits" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        <input value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} placeholder="MM/YY" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
          Add card
        </button>
      </form>
      <p className="mt-3 text-xs text-slate-400">
        These records are encrypted at rest. Inspect OPFS in DevTools — the <code>vault.db</code> bytes are ciphertext.
      </p>
    </section>
  )
}

function Internals() {
  const db = useTalaDB()
  const [info, setInfo] = useState<Record<string, { count: number; indexes: string }>>({})
  const [sync, setSync] = useState<{ pending: number; dropped: number; failed: number } | null>(null)
  const [compacting, setCompacting] = useState(false)

  async function refresh() {
    const cols = collections(db)
    const entries: Record<string, { count: number; indexes: string }> = {}
    for (const [name, col] of Object.entries(cols) as [string, Collection][]) {
      const idx = await col.listIndexes()
      const parts = [
        ...idx.btree.map((f) => `btree:${f}`),
        ...idx.fts.map((f) => `fts:${f}`),
        ...idx.vector.map((f) => `vector:${f}`),
      ]
      entries[name] = { count: await col.count(), indexes: parts.join(', ') || '—' }
    }
    setInfo(entries)
    try {
      setSync((await db.syncStatus?.()) ?? null)
    } catch {
      setSync(null)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  async function compact() {
    setCompacting(true)
    await db.compact()
    await refresh()
    setCompacting(false)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Database internals</h2>
        <div className="flex gap-2">
          <button onClick={refresh} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            Refresh
          </button>
          <button onClick={compact} disabled={compacting} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {compacting ? 'Compacting…' : 'Compact'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="py-1">Collection</th>
              <th className="py-1">Docs</th>
              <th className="py-1">Indexes</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(info).map(([name, v]) => (
              <tr key={name} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 font-medium">{name}</td>
                <td className="py-1.5">{v.count.toLocaleString()}</td>
                <td className="py-1.5 font-mono text-xs text-slate-500">{v.indexes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sync && (
        <p className="mt-3 text-xs text-slate-500">
          Sync queue — pending: <b>{sync.pending}</b> · dropped: <b>{sync.dropped}</b> · failed: <b>{sync.failed}</b>
        </p>
      )}
    </section>
  )
}
