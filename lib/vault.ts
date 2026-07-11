import type { TalaDB, Document } from 'taladb'

export interface PaymentCard extends Document {
  label: string
  last4: string
  holder: string
  expiry: string
  createdAt: number
}

const VAULT_DB = 'vault.db'

/**
 * Opens a SEPARATE, passphrase-encrypted database (AES-GCM-256 over OPFS,
 * fails-closed). This is independent of the main app database, so sensitive
 * data (payment cards, travel documents) is encrypted at rest and a wrong
 * passphrase simply fails to open. Single-tab per the 0.9.0 browser encryption.
 */
export async function openVault(passphrase: string): Promise<TalaDB> {
  const { openDB } = await import('taladb')
  const db = await openDB(VAULT_DB, { passphrase })
  return db
}
