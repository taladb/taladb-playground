export function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
      <div className="spinner h-8 w-8" />
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Opening on-device database…
      </p>
    </div>
  )
}
