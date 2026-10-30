'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Light, dark, or whatever the OS says.
 *
 * The class on <html> is set before first paint by `THEME_SCRIPT` (inlined in
 * the root layout), so a dark-mode visitor never sees a white flash. This
 * module is the runtime half: it remembers the choice, and while the choice is
 * "system" it follows the OS live.
 *
 * Storage access can throw (blocked site data, some private windows), so every
 * read and write is wrapped and the app falls back to the OS setting.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'keepsake.theme'

/** Runs inline in <head>, before React. Keep it small and dependency-free. */
export const THEME_SCRIPT = `(function(){var t='system';try{t=localStorage.getItem('${KEY}')||'system'}catch(e){}var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=t})()`

const listeners = new Set<() => void>()

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(choice: ThemeChoice) {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.theme = choice
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Not remembered across reloads, but still applied to this page.
  }
  apply(choice)
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTheme(): ThemeChoice {
  const choice = useSyncExternalStore(subscribe, read, () => 'system' as ThemeChoice)

  // While following the OS, follow it live — a scheduled switch to dark at
  // sunset should not need a reload.
  useEffect(() => {
    if (choice !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  return choice
}
