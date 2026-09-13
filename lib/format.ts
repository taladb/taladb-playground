import type { MemoryType } from './types'

export function money(n: number | undefined, currency = 'PHP'): string {
  if (n === undefined) return ''
  const symbol = currency === 'PHP' ? '₱' : currency === 'USD' ? '$' : ''
  return `${symbol}${Math.round(n).toLocaleString()}`
}

export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fullDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function yearOf(ts: number): number {
  return new Date(ts).getFullYear()
}

/** "3 days ago", "in 2 months" — relative where it reads better than a date. */
export function relative(ts: number): string {
  const diff = ts - Date.now()
  const days = Math.round(diff / 86_400_000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (Math.abs(days) < 31) return rtf.format(days, 'day')
  if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month')
  return rtf.format(Math.round(days / 365), 'year')
}

/** Each memory type gets one glyph, used consistently across every timeline. */
export const MEMORY_ICON: Record<MemoryType, string> = {
  note: '📝',
  purchase: '🧾',
  maintenance: '🔧',
  repair: '🛠️',
  loan: '📤',
  return: '📥',
  movement: '📍',
  decision: '⚖️',
  expense: '💸',
  observation: '👀',
  conversation: '💬',
  appointment: '📅',
  installation: '🔩',
  replacement: '♻️',
  warranty: '🛡️',
}

export const MEMORY_LABEL: Record<MemoryType, string> = {
  note: 'Note',
  purchase: 'Purchase',
  maintenance: 'Maintenance',
  repair: 'Repair',
  loan: 'Loan',
  return: 'Return',
  movement: 'Moved',
  decision: 'Decision',
  expense: 'Expense',
  observation: 'Observation',
  conversation: 'Conversation',
  appointment: 'Appointment',
  installation: 'Installation',
  replacement: 'Replacement',
  warranty: 'Warranty',
}

export const ENTITY_LABEL: Record<string, string> = {
  thing: 'Thing',
  person: 'Person',
  place: 'Place',
  organization: 'Organization',
  project: 'Project',
  document: 'Document',
}

/** Plural helper that reads naturally in sentences. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/**
 * A colour per memory type, from the iOS system palette.
 *
 * This is the single biggest reason the Health app is readable: a mixed list
 * sorts itself by colour before you read a word. Related types deliberately
 * share a hue — repair/maintenance/replacement are all warm, purchase/expense
 * are the money pair, loan/return are the pair that cancel each other — so the
 * grouping survives even though fifteen distinct colours would not.
 *
 * The engine colours (sky, violet, emerald) are reserved for engine
 * attribution and never appear here.
 */
export const MEMORY_COLOR: Record<MemoryType, string> = {
  note: 'var(--color-ios-gray)',
  observation: 'var(--color-ios-yellow)',
  purchase: 'var(--color-ios-green)',
  expense: 'var(--color-ios-pink)',
  maintenance: 'var(--color-ios-orange)',
  replacement: 'var(--color-ios-mint)',
  repair: 'var(--color-ios-red)',
  installation: 'var(--color-ios-brown)',
  loan: 'var(--color-ios-blue)',
  return: 'var(--color-ios-teal)',
  movement: 'var(--color-ios-indigo)',
  decision: 'var(--color-ios-purple)',
  conversation: 'var(--color-ios-cyan)',
  appointment: 'var(--color-ios-cyan)',
  warranty: 'var(--color-ios-blue)',
}

export const ENTITY_COLOR: Record<string, string> = {
  thing: 'var(--color-ios-blue)',
  person: 'var(--color-ios-orange)',
  place: 'var(--color-ios-green)',
  organization: 'var(--color-ios-purple)',
  project: 'var(--color-ios-indigo)',
  document: 'var(--color-ios-gray)',
}

/** A 15% wash of a category colour, for tinted backgrounds behind emoji. */
export function tint(color: string, pct = 15): string {
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`
}
