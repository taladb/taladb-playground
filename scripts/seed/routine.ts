import type { SeedMemory } from './memories'

/**
 * The generated half: recurring, unremarkable events.
 *
 * These exist for two reasons. They give the aggregation pages real numbers to
 * add up — a spend total over four fuel stops is not a demo — and they give the
 * vector index enough neighbours that a semantic hit has to actually beat
 * something. Every one is deterministic, so re-running the seed produces a
 * byte-identical corpus.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(0x5eed)

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Round to a sensible-looking peso amount. */
function money(base: number, spread: number): number {
  return Math.round((base + (rand() - 0.5) * spread) / 10) * 10
}

const out: SeedMemory[] = []

// --- Fuel: every 9-12 days from 2023 to Sept 2026 --------------------------
const STATIONS = ['Shell BGC', 'Petron Alabang', 'Caltex Sucat', 'Shell Daang Hari', 'Petron Molino']
{
  let d = new Date('2023-02-04T00:00:00Z')
  const end = new Date('2026-09-10T00:00:00Z')
  while (d < end) {
    const litres = Math.round(28 + rand() * 14)
    const perLitre = 58 + rand() * 9
    const amount = Math.round(litres * perLitre)
    const station = pick(STATIONS)
    out.push({
      memoryType: 'expense',
      title: `Fuel — ${station}`,
      content: `Filled up at ${station}. ${litres} litres at about ₱${perLitre.toFixed(2)} per litre. Odometer reading noted on the receipt.`,
      occurredAt: d.toISOString().slice(0, 10),
      subjectSlug: 'honda-civic',
      amount,
      tags: ['fuel', 'routine'],
      sourceType: 'document_extracted',
      confidence: 'extracted',
    })
    d = new Date(d.getTime() + (9 + Math.floor(rand() * 4)) * 86400000)
  }
}

// --- Car servicing: every 6 months -----------------------------------------
{
  const services: Array<[string, string, number]> = [
    ['Oil and filter change', 'Engine oil changed to 0W-20 full synthetic, oil filter replaced, and the usual multi-point check. Nothing flagged.', 3800],
    ['Periodic maintenance service', 'Scheduled PMS. Oil, oil filter, air filter and cabin filter replaced. Brake fluid checked and topped up.', 6200],
    ['Oil change and tyre rotation', 'Oil and filter plus a four-wheel rotation and pressure reset. Tread still good all round.', 4400],
  ]
  for (const [year, month] of [[2023, 7], [2024, 1], [2024, 7], [2025, 1], [2025, 7], [2026, 1], [2026, 7]] as const) {
    const [title, content, base] = pick(services)
    out.push({
      memoryType: 'maintenance',
      title,
      content: `${content} Booked in at Honda Casa Alabang.`,
      occurredAt: iso(year, month, 8 + Math.floor(rand() * 12)),
      subjectSlug: 'honda-civic',
      alsoSlugs: ['honda-casa'],
      amount: money(base, 900),
      tags: ['routine', 'service'],
    })
  }
}

// --- Insurance and registration: annual ------------------------------------
{
  for (const year of [2023, 2024, 2025, 2026]) {
    out.push({
      memoryType: 'expense',
      title: 'Car insurance renewed',
      content: 'Comprehensive motor insurance renewed for another year. Acts of nature and Acts of God included; excess unchanged at ₱6,000.',
      occurredAt: iso(year, 1, 24),
      subjectSlug: 'honda-civic',
      amount: money(24000, 3000),
      tags: ['insurance', 'annual'],
    })
    out.push({
      memoryType: 'appointment',
      title: 'LTO registration renewal',
      content: 'Vehicle registration renewed at the LTO district office. Emission test and inspection passed on the first attempt.',
      occurredAt: iso(year, 4, 18),
      subjectSlug: 'honda-civic',
      amount: money(3200, 600),
      tags: ['registration', 'annual'],
    })
  }
}

// --- Bicycle routine care --------------------------------------------------
{
  const chores: Array<[string, string, number]> = [
    ['Chain cleaned and lubed', 'Degreased the chain and cassette, dried them and ran fresh wet lube through. Shifting noticeably crisper afterwards.', 0],
    ['Tyres pumped and checked', 'Both tyres back up to 70 psi and the tread checked for embedded glass. Pulled one small shard from the rear.', 0],
    ['Bolts checked over', 'Ran the torque wrench over the stem, seatpost and rack bolts. The rear rack bolts had worked slightly loose again.', 0],
    ['Bike washed', 'Full wash and dry after a wet week of commuting. Chain re-lubed afterwards.', 0],
  ]
  let d = new Date('2024-11-20T00:00:00Z')
  const end = new Date('2026-09-10T00:00:00Z')
  while (d < end) {
    const [title, content] = pick(chores)
    out.push({
      memoryType: 'maintenance',
      title,
      content,
      occurredAt: d.toISOString().slice(0, 10),
      subjectSlug: 'trek-fx3',
      tags: ['routine'],
    })
    d = new Date(d.getTime() + (18 + Math.floor(rand() * 14)) * 86400000)
  }
}

// --- Coffee beans: the small recurring expense ------------------------------
{
  const ROASTERS = ['Kalsada', 'Yardstick', 'Curve', 'Habitual', 'Single Origin PH']
  const ORIGINS = ['Benguet washed', 'Ethiopian natural', 'Colombian washed', 'Sagada peaberry', 'Guatemalan honey']
  let d = new Date('2025-01-16T00:00:00Z')
  const end = new Date('2026-09-10T00:00:00Z')
  while (d < end) {
    const roaster = pick(ROASTERS)
    const origin = pick(ORIGINS)
    out.push({
      memoryType: 'expense',
      title: `Coffee beans — ${roaster}`,
      content: `250 g of ${origin} from ${roaster}. Dialled in at about 18 g in, 36 g out, 28 seconds.`,
      occurredAt: d.toISOString().slice(0, 10),
      subjectSlug: 'espresso-machine',
      amount: money(720, 280),
      tags: ['coffee', 'routine'],
    })
    d = new Date(d.getTime() + (12 + Math.floor(rand() * 8)) * 86400000)
  }
}

// --- Storage unit rent: monthly --------------------------------------------
{
  for (const year of [2025, 2026]) {
    for (let m = 1; m <= 12; m++) {
      if (year === 2026 && m > 9) break
      const rate = year === 2026 && m >= 7 ? 2200 : 1950
      out.push({
        memoryType: 'expense',
        title: 'Storage unit rent',
        content: `Monthly rent for unit 114 at Northgate Self Storage. ₱${rate.toLocaleString()}.`,
        occurredAt: iso(year, m, 3),
        subjectSlug: 'storage-unit',
        alsoSlugs: ['northgate-storage'],
        amount: rate,
        tags: ['rent', 'routine'],
      })
    }
  }
}

// --- Aircon filter washes: quarterly, both units ---------------------------
{
  for (const year of [2024, 2025, 2026]) {
    for (const m of [2, 5, 8, 11]) {
      if (year === 2026 && m > 8) break
      out.push({
        memoryType: 'maintenance',
        title: 'Washed the aircon filters',
        content: 'Pulled the filters out of both units, rinsed them under the tap, dried them in the shade and refitted. Takes about twenty minutes for the pair.',
        occurredAt: iso(year, m, 6 + Math.floor(rand() * 8)),
        subjectSlug: 'bedroom-aircon',
        alsoSlugs: ['living-aircon'],
        tags: ['routine'],
      })
    }
  }
}

// --- Laptop and PC housekeeping --------------------------------------------
{
  const notes: Array<[string, string]> = [
    ['Time Machine backup verified', 'Checked that the Time Machine backup to the external drive is current. Last successful backup was this morning.'],
    ['macOS updated', 'Installed the latest macOS point release. No issues with the work VPN afterwards.'],
    ['Cleared disk space', 'Cleared out old Xcode simulators and downloads. Recovered about 40 GB.'],
  ]
  let d = new Date('2025-03-05T00:00:00Z')
  const end = new Date('2026-09-10T00:00:00Z')
  while (d < end) {
    const [title, content] = pick(notes)
    out.push({
      memoryType: 'note',
      title,
      content,
      occurredAt: d.toISOString().slice(0, 10),
      subjectSlug: 'macbook-pro',
      tags: ['routine'],
    })
    d = new Date(d.getTime() + (26 + Math.floor(rand() * 20)) * 86400000)
  }
}

/** Chronologically sorted so the seeded corpus reads naturally in insertion order. */
export const ROUTINE: SeedMemory[] = out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
