import type { Confidence, SourceType } from '@/lib/types'

/**
 * Provenance, shown inline.
 *
 * The spec is firm that an extracted or inferred fact must never be
 * indistinguishable from one the user confirmed, and must never silently
 * overwrite one. Three marks, and they never change meaning:
 *
 *   ✓ confirmed — the user typed it or approved it
 *   ◐ extracted — read off a receipt, document or photo
 *   ◇ inferred  — derived from something else
 */

const MARKS: Record<Confidence, { glyph: string; label: string; className: string }> = {
  confirmed: {
    glyph: '✓',
    label: 'Confirmed by you',
    className: 'text-[var(--color-ios-green)]',
  },
  extracted: {
    glyph: '◐',
    label: 'Extracted from evidence',
    className: 'text-[var(--color-ios-orange)]',
  },
  inferred: {
    glyph: '◇',
    label: 'Inferred from related information',
    className: 'muted',
  },
}

const SOURCE_LABEL: Record<SourceType, string> = {
  user_entered: 'you entered this',
  document_extracted: 'read from a document',
  photo_extracted: 'read from a photo',
  imported: 'imported',
  system_inferred: 'derived automatically',
}

export function ConfidenceMark({
  confidence,
  sourceType,
}: {
  confidence: Confidence
  sourceType?: SourceType
}) {
  const mark = MARKS[confidence]
  const title = sourceType ? `${mark.label} — ${SOURCE_LABEL[sourceType]}` : mark.label

  return (
    <span title={title} className={`text-xs ${mark.className}`}>
      {mark.glyph}
    </span>
  )
}
