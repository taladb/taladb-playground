export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid h-5 w-5 place-items-center rounded bg-indigo-600 text-xs text-white">▲</span>
            Wanderdeck
          </p>
          <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            This is a demo. There is <strong>no backend database</strong> — the entire catalog of
            10,000 listings, your bookings, saved stays, reviews, and encrypted payment vault all live
            in an <strong>on-device database powered by TalaDB&nbsp;0.9</strong> (a Rust + WebAssembly
            engine running in your browser via OPFS). Document queries, full-text &amp; vector search,
            the aggregation pipeline, encryption at rest, and offline-first sync are all TalaDB features
            demonstrated here.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Built with Next.js 16 · Tailwind v4 ·{' '}
            <span className="font-mono">taladb · @taladb/web · @taladb/react · @taladb/next @ 0.9.3</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
