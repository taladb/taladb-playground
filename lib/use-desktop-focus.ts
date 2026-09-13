'use client'

import { useEffect, useRef } from 'react'

/**
 * Focus an input on mount — but only where that is welcome.
 *
 * `autoFocus` on a touch device throws the keyboard up over the content before
 * the user has decided they want it, and on a page they may only be reading it
 * is actively hostile. On a desktop search page it is exactly right. The
 * `pointer: fine` query is the closest honest proxy for "has a keyboard
 * already", so the attribute is applied there and nowhere else.
 */
export function useDesktopFocus<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!enabled) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    ref.current?.focus()
  }, [enabled])

  return ref
}
