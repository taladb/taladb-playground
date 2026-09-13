export function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5">
      <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--color-ios-blue)" />
        <path
          d="M8 23 Q12 9 16 16 Q20 23 24 9"
          stroke="white"
          strokeWidth="2.25"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="8" cy="23" r="2.4" fill="white" />
        <circle cx="16" cy="16" r="2.4" fill="white" />
        <circle cx="24" cy="9" r="2.4" fill="white" />
      </svg>
      <p role="status" aria-live="polite" className="text-sm muted">
        Opening your memory…
      </p>
    </div>
  )
}
