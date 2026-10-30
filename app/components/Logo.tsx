/** The thread running through three moments — the timeline, abstracted. */
export function Mark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-label)" />
      <path
        d="M8 23 Q12 9 16 16 Q20 23 24 9"
        stroke="var(--color-card)"
        strokeWidth="2.25"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="8" cy="23" r="2.4" fill="var(--color-card)" />
      <circle cx="16" cy="16" r="2.4" fill="var(--color-ios-blue)" />
      <circle cx="24" cy="9" r="2.4" fill="var(--color-card)" />
    </svg>
  )
}

/** Mark + wordmark + the engine credit, which is half of what this app is for. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Mark />
      <span className="flex flex-col leading-none">
        <span className="text-[16px] font-bold tracking-[-0.02em]">Keepsake</span>
        <span className="muted mt-[3px] text-[10.5px] font-medium tracking-[0.01em]">powered by TalaDB</span>
      </span>
    </span>
  )
}
