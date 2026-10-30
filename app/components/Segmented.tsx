'use client'

import { useRef } from 'react'

/**
 * A segmented control that is a real radio group.
 *
 * One Tab stop for the whole group (roving tabindex), and the arrow keys move
 * and select — the ARIA radio pattern — so a keyboard user does not have to
 * tab through every option to reach the next control.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string
  options: Array<{ value: T; label: React.ReactNode }>
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = Math.max(0, options.findIndex((o) => o.value === value))

  function onKeyDown(e: React.KeyboardEvent) {
    const last = options.length - 1
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? current === last ? 0 : current + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? current === 0 ? last : current - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (next === null) return
    e.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={`segmented ${className}`} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={i === current}
          tabIndex={i === current ? 0 : -1}
          onClick={() => onChange(o.value)}
          className="segment flex items-center gap-1.5"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
