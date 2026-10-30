/** Title block shared by every top-level page, so they read as one app. */
export function PageHeader({
  title,
  eyebrow,
  description,
  aside,
}: {
  title: React.ReactNode
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned on wide screens: an engine badge or an action. */
  aside?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted mt-2.5 text-[15px] leading-relaxed">{description}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  )
}
