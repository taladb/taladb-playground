export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl px-5 pb-24 pt-4 text-xs text-stone-400 md:px-6 md:pb-10 dark:text-stone-600">
      <p>
        Everything on this page was read from a database inside your browser. No account, no
        server, no network — close the tab and it is still yours.
      </p>
      <p className="mt-1">
        Built on{' '}
        <a
          href="https://github.com/taladb/taladb"
          className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-500"
        >
          TalaDB
        </a>{' '}
        0.11 — documents, full-text and vector search in one embedded engine.
      </p>
    </footer>
  )
}
