/**
 * Loading placeholders shaped like the thing that is coming.
 *
 * A grey box that pulses tells the user only that something is happening. A
 * placeholder with the row's real proportions also tells them what — and stops
 * the layout jumping when the content lands.
 */
export function MemorySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3.5">
          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
          <div className="card flex-1 space-y-2.5 p-4">
            <div className="skeleton h-4" style={{ width: `${55 + ((i * 13) % 30)}%` }} />
            <div className="skeleton h-3" />
            <div className="skeleton h-3 w-4/5" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ className = 'h-28' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

/**
 * The accessible half of a loading state. Placeholders are `aria-hidden`
 * because a screen reader gains nothing from their shape; this is what it
 * announces instead.
 */
export function LoadingAnnounce({ children }: { children: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {children}
    </span>
  )
}
