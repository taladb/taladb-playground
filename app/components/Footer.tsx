export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl px-5 pb-24 pt-4 text-[12px] muted-more md:px-6 md:pb-10">
      <p>
        Everything on this page was read from a database inside your browser. No account, no
        server, no network — close the tab and it is still yours.
      </p>
      <p className="mt-1">
        Built on{' '}
        <a
          href="https://github.com/taladb/taladb"
          style={{ color: "var(--color-ios-blue)" }}
        >
          TalaDB
        </a>{' '}
        0.11 — documents, full-text and vector search in one embedded engine.
      </p>
    </footer>
  )
}
