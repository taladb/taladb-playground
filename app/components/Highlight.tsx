import { highlight } from '@/lib/highlight'

/** Text with the query's own words marked. See `lib/highlight.ts`. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((seg, i) => (seg.hit ? <mark key={i}>{seg.text}</mark> : seg.text))}
    </>
  )
}
