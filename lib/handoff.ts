'use client'

/**
 * Text handed from one page to the next, inside this tab.
 *
 * Putting what someone typed into a URL — `/recall?q=…`, `/capture?text=…` —
 * makes the App Router fetch that URL's server payload during navigation, so
 * the words travel to the server as part of a request line and land in its
 * logs. For an app whose claim is that your memories and searches stay on the
 * device, that is the wrong place for them. A client navigation keeps this
 * module alive, so the next page simply takes the text from here.
 *
 * Links whose text is fixed by the app (the example queries) still use the
 * query string; they carry nothing the visitor wrote.
 */

const pending = new Map<string, string>()

export function handOff(key: 'q' | 'text', value: string): void {
  pending.set(key, value)
}

/**
 * Read without consuming — safe in a state initialiser, which React may call
 * twice. The page calls `clearHandoff` from an effect once it has the text.
 */
export function peekHandoff(key: 'q' | 'text'): string | null {
  return pending.get(key) ?? null
}

export function clearHandoff(key: 'q' | 'text'): void {
  pending.delete(key)
}
