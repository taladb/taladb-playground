export function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="text-4xl" aria-hidden>
        🧠
      </div>
      <div className="spinner h-6 w-6" role="status" aria-label="Opening your memory" />
      <p className="text-sm text-stone-500 dark:text-stone-400">Opening your memory…</p>
    </div>
  )
}
