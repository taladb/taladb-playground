/**
 * The handwritten half of the corpus.
 *
 * These are the memories the demo is *judged* on, so they are authored rather
 * than generated, and several exist specifically to separate the two engines:
 *
 *   - `clicking`/`rattle` phrasing that shares no tokens with "derailleur",
 *     so keyword search misses it and vector search does not;
 *   - model codes and serial numbers (`RT38K5930S8`, `C02XK9PLQ6NY`), where
 *     the reverse is true — a vector has nothing useful to say about a SKU;
 *   - a loan with no matching return, so "what have I lent out?" has a real
 *     answer that comes from a structured query rather than from ranking.
 *
 * Routine volume (fuel, refills, recurring service) is generated in
 * `routine.ts` — writing four hundred of those by hand would add nothing.
 */

export interface SeedMemory {
  memoryType:
    | 'note' | 'purchase' | 'maintenance' | 'repair' | 'loan' | 'return'
    | 'movement' | 'decision' | 'expense' | 'observation' | 'conversation'
    | 'appointment' | 'installation' | 'replacement' | 'warranty'
  title: string
  content: string
  /** ISO date. */
  occurredAt: string
  subjectSlug?: string
  actorSlug?: string
  placeSlug?: string
  /** Extra entities mentioned, beyond subject/actor/place. */
  alsoSlugs?: string[]
  amount?: number
  tags?: string[]
  sourceType?: 'user_entered' | 'document_extracted' | 'photo_extracted' | 'imported'
  confidence?: 'confirmed' | 'extracted' | 'inferred'
}

export const MEMORIES: SeedMemory[] = [
  // --- Bicycle: the flagship timeline -------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the Trek FX 3', occurredAt: '2024-11-04',
    subjectSlug: 'trek-fx3', placeSlug: 'garage', amount: 42000,
    content: 'Picked up the Trek FX 3 Disc in matte blue from CycleHouse. Paid ₱42,000 including a rack and lights. Frame size 54 cm. Kept the receipt and the warranty card.',
    alsoSlugs: ['cyclehouse'], sourceType: 'document_extracted', confidence: 'confirmed',
  },
  {
    memoryType: 'maintenance', title: 'First free tune-up', occurredAt: '2025-01-12',
    subjectSlug: 'trek-fx3', alsoSlugs: ['cyclehouse'],
    content: 'Took the bike in for the free 30-day tune-up that came with the purchase. They trued the rear wheel, tightened the headset and adjusted both brakes. No charge.',
  },
  {
    memoryType: 'replacement', title: 'Front tyre replaced', occurredAt: '2025-01-17',
    subjectSlug: 'trek-fx3', alsoSlugs: ['cyclehouse'], amount: 1450,
    content: 'Sidewall on the front tyre had a cut deep enough to see the casing. Replaced with a Schwalbe Marathon 700x35c. ₱1,450 fitted.',
  },
  {
    memoryType: 'observation', title: 'Rattle from the back when climbing', occurredAt: '2025-04-28',
    subjectSlug: 'trek-fx3',
    content: 'Something at the back of the bike starts making a sharp repetitive tapping sound whenever I stand up and push hard on the pedals going uphill. It goes away in the smaller gears. Sounds metallic, almost like a loose link tapping as it comes round.',
    tags: ['symptom'],
  },
  {
    memoryType: 'repair', title: 'Rear derailleur hanger straightened', occurredAt: '2025-05-03',
    subjectSlug: 'trek-fx3', alsoSlugs: ['cyclehouse'], amount: 800,
    content: 'CycleHouse found the derailleur hanger was bent — probably from when the bike fell over in the garage. They straightened it on an alignment gauge and reindexed the gears. The noise under load is gone. ₱800.',
    tags: ['symptom-resolved'],
  },
  {
    memoryType: 'replacement', title: 'Chain replaced', occurredAt: '2026-05-14',
    subjectSlug: 'trek-fx3', alsoSlugs: ['cyclehouse'], amount: 1200,
    content: 'Chain measured past 0.75 on the wear gauge so CycleHouse swapped it for a new Shimano CN-HG54. Cassette still within tolerance and was left alone. ₱1,200 including labour and a degrease.',
    sourceType: 'document_extracted', confidence: 'confirmed',
  },
  {
    memoryType: 'loan', title: 'Lent the bike to Alex', occurredAt: '2026-07-22',
    subjectSlug: 'trek-fx3', actorSlug: 'alex',
    content: 'Alex borrowed the Trek for the weekend ride out to Tagaytay. Lent the spare helmet and the frame pump with it.',
  },
  {
    memoryType: 'return', title: 'Alex returned the bike', occurredAt: '2026-07-27',
    subjectSlug: 'trek-fx3', actorSlug: 'alex',
    content: 'Bike came back clean and with the pump. Alex mentioned the rear brake felt soft on the descents.',
  },
  {
    memoryType: 'maintenance', title: 'Brake pads replaced', occurredAt: '2026-09-07',
    subjectSlug: 'trek-fx3', alsoSlugs: ['cyclehouse'], amount: 950,
    content: 'Rear pads were down to the wear line, which explains what Alex felt. Both sets replaced with Shimano resin pads and the rotors cleaned. ₱950.',
  },

  // --- Laptop --------------------------------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the MacBook Pro', occurredAt: '2024-02-18',
    subjectSlug: 'macbook-pro', alsoSlugs: ['apple-greenbelt'], amount: 134900,
    content: 'MacBook Pro 14-inch, M3 Pro, 18 GB memory, 512 GB SSD from Apple Store Greenbelt. Serial number C02XK9PLQ6NY. Added AppleCare+ which runs to February 2027. Total ₱134,900.',
    sourceType: 'document_extracted', confidence: 'confirmed', tags: ['work'],
  },
  {
    memoryType: 'repair', title: 'Battery service under AppleCare', occurredAt: '2025-11-19',
    subjectSlug: 'macbook-pro', alsoSlugs: ['apple-greenbelt'],
    content: 'Battery health had dropped to 79% and the machine was shutting down unexpectedly at around 30%. Apple replaced the battery under AppleCare+ at no cost. Took four days. Kept the service invoice.',
  },
  {
    memoryType: 'observation', title: 'Fans spin up on video calls', occurredAt: '2026-02-02',
    subjectSlug: 'macbook-pro',
    content: 'The laptop gets noticeably warm and the fans get loud during long video meetings, especially with an external display plugged in. Not throttling as far as I can tell, just noisy.',
  },
  {
    memoryType: 'maintenance', title: 'Cleaned the vents', occurredAt: '2026-02-08',
    subjectSlug: 'macbook-pro', amount: 0,
    content: 'Blew out the rear vents with compressed air and cleaned the mesh. Running quieter on calls since. Worth doing again in six months.',
  },
  {
    memoryType: 'note', title: 'AppleCare+ coverage ends Feb 2027', occurredAt: '2026-02-18',
    subjectSlug: 'macbook-pro',
    content: 'Two years into the three-year AppleCare+ term. Coverage expires 18 February 2027. Decide before then whether to sell or keep it out of warranty.',
    tags: ['warranty'],
  },

  // --- Camera: the open loan ----------------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the Sony A6400', occurredAt: '2023-08-12',
    subjectSlug: 'sony-a6400', amount: 58000,
    content: 'Sony A6400 body with the 18-105mm f/4 G kit lens. ₱58,000. Serial SN4471902. Came with one NP-FW50 battery; bought a second the same week.',
    sourceType: 'document_extracted', confidence: 'confirmed',
  },
  {
    memoryType: 'purchase', title: 'Spare battery and memory card', occurredAt: '2023-08-19',
    subjectSlug: 'sony-a6400', amount: 4200,
    content: 'Second NP-FW50 battery and a SanDisk Extreme 128 GB V30 card. ₱4,200 for both.',
  },
  {
    memoryType: 'loan', title: 'Lent the camera to Mark', occurredAt: '2026-09-07',
    subjectSlug: 'sony-a6400', actorSlug: 'mark',
    content: 'Mark borrowed the A6400 with the kit lens and both batteries for his sister\'s wedding on the 13th. Said he would return it the week after. Not back yet.',
    tags: ['open-loan'],
  },
  {
    memoryType: 'observation', title: 'Kit lens zoom is stiff', occurredAt: '2026-06-14',
    subjectSlug: 'sony-a6400',
    content: 'The zoom ring on the 18-105 has become gritty through the middle of its range. Feels like dust rather than damage. Worth asking about a clean before the next trip.',
  },

  // --- Car -----------------------------------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the Civic', occurredAt: '2023-01-20',
    subjectSlug: 'honda-civic', amount: 1650000,
    content: 'Honda Civic RS Turbo, 2021, pearl white, 31,000 km on the clock. ₱1,650,000. Plate NCK 4472. VIN PADFC1640MV012877.',
    sourceType: 'document_extracted', confidence: 'confirmed',
  },
  {
    memoryType: 'replacement', title: 'Car battery replaced', occurredAt: '2025-03-22',
    subjectSlug: 'honda-civic', alsoSlugs: ['honda-casa'], amount: 6800,
    content: 'Car would not crank after sitting three days. Honda Casa tested it and replaced the battery with a Motolite Gold 55B24L. ₱6,800 with the trade-in. Two-year warranty on the battery.',
    tags: ['battery'],
  },
  {
    memoryType: 'observation', title: 'Shudder when braking from speed', occurredAt: '2026-01-14',
    subjectSlug: 'honda-civic',
    content: 'Steering wheel shakes when slowing down from highway speed. Only under firm braking, not gentle stops. Feels like it comes through the front.',
    tags: ['symptom'],
  },
  {
    memoryType: 'repair', title: 'Front rotors resurfaced', occurredAt: '2026-01-21',
    subjectSlug: 'honda-civic', alsoSlugs: ['honda-casa'], amount: 4500,
    content: 'Front discs were warped. Honda Casa skimmed both and fitted new front pads. The vibration under braking is gone. ₱4,500.',
    tags: ['symptom-resolved'],
  },
  {
    memoryType: 'replacement', title: 'All four tyres replaced', occurredAt: '2026-06-02',
    subjectSlug: 'honda-civic', amount: 32000,
    content: 'Replaced all four with Michelin Primacy 4, 235/40 R18. ₱32,000 fitted and aligned. The old set had done 48,000 km.',
  },

  // --- Aircon: the recurring-service story --------------------------------
  {
    memoryType: 'purchase', title: 'Bought the bedroom aircon', occurredAt: '2023-03-30',
    subjectSlug: 'bedroom-aircon', alsoSlugs: ['sm-appliance'], amount: 38500,
    content: 'Daikin FTKC35TVM 1.5 HP inverter split type from SM Appliance. ₱38,500 including installation. Five-year compressor warranty to March 2028.',
    sourceType: 'document_extracted', confidence: 'confirmed',
  },
  {
    memoryType: 'observation', title: 'Bedroom aircon not cooling properly', occurredAt: '2025-04-18',
    subjectSlug: 'bedroom-aircon',
    content: 'Room is not getting cold even on 16 degrees overnight. Air coming out is only slightly cool and the airflow feels weaker than it used to. No strange noises.',
    tags: ['symptom'],
  },
  {
    memoryType: 'maintenance', title: 'Deep clean and refrigerant top-up', occurredAt: '2025-04-24',
    subjectSlug: 'bedroom-aircon', actorSlug: 'ramon', alsoSlugs: ['coolair-service'], amount: 2800,
    content: 'Ramon from CoolAir found the evaporator coil packed with dust and the refrigerant slightly low. Chemical clean of the indoor and outdoor units plus a top-up of R-32. Cooling back to normal within the hour. ₱2,800.',
    tags: ['symptom-resolved'],
  },
  {
    memoryType: 'observation', title: 'Weak cooling again', occurredAt: '2026-03-11',
    subjectSlug: 'bedroom-aircon',
    content: 'Same pattern as last year — takes far longer to bring the room down and the air from the vents is barely cold. Filters look clean this time.',
    tags: ['symptom'],
  },
  {
    memoryType: 'repair', title: 'Slow refrigerant leak found and sealed', occurredAt: '2026-03-19',
    subjectSlug: 'bedroom-aircon', actorSlug: 'ramon', alsoSlugs: ['coolair-service'], amount: 4600,
    content: 'Ramon pressure-tested the line and found a slow leak at the flare joint on the outdoor unit — which explains why last year\'s top-up only lasted a season. Reflared the connection, vacuumed and recharged. ₱4,600. He said if it drops again the coil itself is suspect and it is still under compressor warranty until 2028.',
    tags: ['symptom-resolved', 'warranty'],
  },
  {
    memoryType: 'maintenance', title: 'Routine aircon cleaning — both units', occurredAt: '2026-08-15',
    subjectSlug: 'bedroom-aircon', actorSlug: 'ramon', alsoSlugs: ['coolair-service', 'living-aircon'], amount: 2400,
    content: 'Six-monthly clean for the bedroom and living room units. ₱1,200 each. Ramon says the living room window unit is near the end of its life — the compressor is loud on startup and the housing is corroding.',
  },

  // --- Refrigerator: the decision -----------------------------------------
  {
    memoryType: 'decision', title: 'Chose the Samsung RT38 over the LG', occurredAt: '2026-04-09',
    subjectSlug: 'refrigerator',
    content: 'Decided on the Samsung RT38K5930S8 instead of the LG GN-B392 and the Panasonic NR-BL immediately below it. Reasons, in the order they mattered: the freezer is 28 L bigger which is the whole reason we are replacing the old one; the warranty is 2 years on parts against LG\'s 1; and the measured energy consumption is about 8% lower over a year. The LG was ₱3,000 cheaper and had the nicer interior finish, but the freezer was the deciding factor.',
    tags: ['decision'], confidence: 'confirmed',
  },
  {
    memoryType: 'purchase', title: 'Bought the Samsung refrigerator', occurredAt: '2026-04-11',
    subjectSlug: 'refrigerator', alsoSlugs: ['sm-appliance'], amount: 42000,
    content: 'Samsung RT38K5930S8 two-door inverter, 380 L, from SM Appliance Center. ₱42,000 delivered. Serial ABC123X9920. One-year full warranty, ten years on the inverter compressor.',
    sourceType: 'document_extracted', confidence: 'confirmed', tags: ['warranty'],
  },
  {
    memoryType: 'installation', title: 'Refrigerator delivered and installed', occurredAt: '2026-04-14',
    subjectSlug: 'refrigerator', placeSlug: 'kitchen',
    content: 'Delivered and levelled in the kitchen. They took the old unit away. Left it standing 4 hours before switching on, as instructed.',
  },

  // --- Drill: the location question ---------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the cordless drill', occurredAt: '2024-06-02',
    subjectSlug: 'power-drill', alsoSlugs: ['ace-hardware'], amount: 6800,
    content: 'Makita DF487D 18V brushless drill-driver with two 3.0Ah batteries and a charger from Ace Hardware. ₱6,800.',
  },
  {
    memoryType: 'loan', title: 'Lent the drill to Alex', occurredAt: '2026-02-26',
    subjectSlug: 'power-drill', actorSlug: 'alex',
    content: 'Alex borrowed the drill to hang shelves. Took one battery and the bit set.',
  },
  {
    memoryType: 'return', title: 'Alex returned the drill', occurredAt: '2026-03-04',
    subjectSlug: 'power-drill', actorSlug: 'alex',
    content: 'Drill came back with both the battery and the full bit set. Nothing missing.',
  },
  {
    memoryType: 'movement', title: 'Moved the drill to Shelf B', occurredAt: '2026-08-30',
    subjectSlug: 'power-drill', placeSlug: 'shelf-b',
    content: 'Reorganised the tool cabinet. The drill and its charger are now on Shelf B with the hand tools and drill bits, not on the top shelf where they used to live.',
    tags: ['location'],
  },

  // --- Passport: the other location question ------------------------------
  {
    memoryType: 'note', title: 'Passport renewed', occurredAt: '2024-07-16',
    subjectSlug: 'passport', amount: 1200,
    content: 'New passport collected. Number P8842197A, valid to 15 July 2034. The old one was cancelled and returned.',
    tags: ['document', 'important'],
  },
  {
    memoryType: 'movement', title: 'Passport moved to the bedroom safe', occurredAt: '2026-09-04',
    subjectSlug: 'passport', placeSlug: 'bedroom-safe',
    content: 'Moved the passport out of the office desk drawer and into the fireproof safe in the bedroom closet, together with the birth certificate and the car registration.',
    tags: ['location', 'important'],
  },

  // --- Espresso machine ----------------------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the espresso machine', occurredAt: '2025-01-09',
    subjectSlug: 'espresso-machine', amount: 48000,
    content: 'Breville BES920XL dual boiler. ₱48,000. Two-year warranty to January 2027.',
    sourceType: 'document_extracted', confidence: 'confirmed',
  },
  {
    memoryType: 'observation', title: 'Water pooling under the machine', occurredAt: '2026-05-22',
    subjectSlug: 'espresso-machine',
    content: 'Small puddle on the counter under the front of the machine most mornings. Drip tray is not overflowing, so it is coming from somewhere higher up.',
    tags: ['symptom'],
  },
  {
    memoryType: 'repair', title: 'Group head gasket replaced', occurredAt: '2026-05-29',
    subjectSlug: 'espresso-machine', alsoSlugs: ['fixpoint-repairs'], amount: 1800,
    content: 'The 58 mm group seal had hardened and was letting water past during the shot. FixPoint replaced the gasket and the dispersion screen and descaled both boilers. ₱1,800. No more puddle.',
    tags: ['symptom-resolved'],
  },
  {
    memoryType: 'maintenance', title: 'Descaled the machine', occurredAt: '2026-08-24',
    subjectSlug: 'espresso-machine', amount: 450,
    content: 'Quarterly descale with the Breville solution. Took about 40 minutes end to end.',
  },

  // --- Washing machine: warranty edge --------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the washing machine', occurredAt: '2024-09-21',
    subjectSlug: 'washing-machine', alsoSlugs: ['sm-appliance'], amount: 36000,
    content: 'LG FV1285S4W 8.5 kg front-load inverter. ₱36,000 with installation. Serial LG285S4W77120. Two-year warranty, so it runs out on 21 September 2026.',
    sourceType: 'document_extracted', confidence: 'confirmed', tags: ['warranty'],
  },
  {
    memoryType: 'observation', title: 'Drum knocking on the spin cycle', occurredAt: '2026-08-28',
    subjectSlug: 'washing-machine',
    content: 'Loud thumping from the machine when it reaches the fast part of the spin, even with a balanced load. It walks slightly across the floor. Started this month.',
    tags: ['symptom'],
  },
  {
    memoryType: 'note', title: 'Washing machine warranty expires this month', occurredAt: '2026-09-01',
    subjectSlug: 'washing-machine',
    content: 'The two-year warranty ends on 21 September 2026. If the spin noise is a bearing or a shock absorber, it has to be reported before then. Call LG service this week.',
    tags: ['warranty', 'urgent'],
  },

  // --- Projector: second open loan ----------------------------------------
  {
    memoryType: 'purchase', title: 'Bought the projector', occurredAt: '2025-06-18',
    subjectSlug: 'projector', amount: 29000,
    content: 'Anker Nebula Mars II Pro, 1080p, built-in battery. ₱29,000.',
  },
  {
    memoryType: 'loan', title: 'Lent the projector to Ella', occurredAt: '2026-08-19',
    subjectSlug: 'projector', actorSlug: 'ella',
    content: 'Ella borrowed the projector for a two-day workshop at the office. Took the HDMI cable and the carrying case as well.',
    tags: ['open-loan'],
  },

  // --- Kitchen renovation project -----------------------------------------
  {
    memoryType: 'note', title: 'Kitchen renovation started', occurredAt: '2025-07-07',
    subjectSlug: 'kitchen-reno', actorSlug: 'jun', placeSlug: 'kitchen',
    content: 'Jun Robles started on the kitchen. Scope is counters, cabinet doors, the range hood and re-tiling the splashback. Quoted eleven weeks and ₱285,000 all in.',
  },
  {
    memoryType: 'decision', title: 'Quartz counters over granite', occurredAt: '2025-07-14',
    subjectSlug: 'kitchen-reno',
    content: 'Went with engineered quartz rather than granite. Granite was ₱18,000 cheaper for the run we needed, but it has to be resealed every year or two and we have already had one stain problem with the old counter. Quartz is non-porous and the colour is consistent across slabs, which matters because the run has a join.',
    tags: ['decision'],
  },
  {
    memoryType: 'expense', title: 'Renovation progress payment 1', occurredAt: '2025-07-21',
    subjectSlug: 'kitchen-reno', actorSlug: 'jun', amount: 95000,
    content: 'First of three progress payments to Jun. ₱95,000 on demolition and cabinet carcasses.',
  },
  {
    memoryType: 'expense', title: 'Renovation progress payment 2', occurredAt: '2025-08-25',
    subjectSlug: 'kitchen-reno', actorSlug: 'jun', amount: 95000,
    content: 'Second payment. Counters templated and cut, splashback tiled.',
  },
  {
    memoryType: 'conversation', title: 'Jun on the range hood ducting', occurredAt: '2025-09-02',
    subjectSlug: 'kitchen-reno', actorSlug: 'jun',
    content: 'Jun raised that the existing duct run to the exterior wall is 150 mm and the new hood wants 180 mm. Options were to reduce at the hood — which costs extractor performance and gets noisy — or to open the wall and enlarge the run for about ₱12,000 extra. Agreed to enlarge it.',
  },
  {
    memoryType: 'expense', title: 'Renovation final payment', occurredAt: '2025-09-22',
    subjectSlug: 'kitchen-reno', actorSlug: 'jun', amount: 107000,
    content: 'Final payment including the ₱12,000 ducting variation. ₱107,000. Snag list was three items, all fixed the same week.',
  },
  {
    memoryType: 'note', title: 'Kitchen renovation finished', occurredAt: '2025-09-26',
    subjectSlug: 'kitchen-reno', placeSlug: 'kitchen',
    content: 'Eleven weeks almost to the day. Total spend ₱297,000 against the ₱285,000 quote, the difference being the duct enlargement. Jun was worth using again.',
  },

  // --- Cebu trip -----------------------------------------------------------
  {
    memoryType: 'note', title: 'Cebu trip booked', occurredAt: '2026-02-10',
    subjectSlug: 'cebu-trip', amount: 34000,
    content: 'Flights and the first three nights booked for the Cebu trip, 4–14 April. ₱34,000 for two.',
  },
  {
    memoryType: 'note', title: 'Packed the camera for Cebu', occurredAt: '2026-04-03',
    subjectSlug: 'cebu-trip', alsoSlugs: ['sony-a6400'],
    content: 'Packed the A6400, both batteries, the 128 GB card and the charger. Left the tripod behind to save weight.',
  },
  {
    memoryType: 'expense', title: 'Bantayan accommodation', occurredAt: '2026-04-08',
    subjectSlug: 'cebu-trip', amount: 18500,
    content: 'Four nights on Bantayan Island. ₱18,500.',
  },
  {
    memoryType: 'observation', title: 'Salt air got into the camera bag', occurredAt: '2026-04-13',
    subjectSlug: 'cebu-trip', alsoSlugs: ['sony-a6400'],
    content: 'Camera bag was damp for most of the island days. Wiped everything down with a dry cloth each night and kept silica packs in the bag. Worth remembering that the zoom ring started feeling gritty not long after this trip.',
  },

  // --- PC build ------------------------------------------------------------
  {
    memoryType: 'decision', title: 'Chose the 7800X3D over the 7700X', occurredAt: '2025-08-02',
    subjectSlug: 'pc-build',
    content: 'Went with the Ryzen 7 7800X3D rather than the cheaper 7700X. It is ₱9,000 more, but the extra cache makes a large difference in the simulation games I actually play, and it draws noticeably less power under load so the cooler can be quieter. The 7700X would have been the better choice for compiling, which I do not do on this machine.',
    tags: ['decision'],
  },
  {
    memoryType: 'purchase', title: 'GPU bought on sale', occurredAt: '2025-09-14',
    subjectSlug: 'pc-build', alsoSlugs: ['gaming-pc'], amount: 38000,
    content: 'RTX 4070 Super at ₱38,000, down from ₱44,000. The last major part.',
  },
  {
    memoryType: 'installation', title: 'PC build finished', occurredAt: '2025-09-30',
    subjectSlug: 'gaming-pc', alsoSlugs: ['pc-build'], placeSlug: 'home-office',
    content: 'Assembled and posted first try. Ryzen 7 7800X3D, RTX 4070 Super, 32 GB DDR5-6000, Corsair RM750e. Total across three months of parts: ₱98,000.',
  },
  {
    memoryType: 'observation', title: 'Coil whine under load', occurredAt: '2026-01-08',
    subjectSlug: 'gaming-pc',
    content: 'A high-pitched electrical squeal comes from somewhere near the graphics card whenever frame rates go very high — menus especially. Capping frames at 120 makes it almost disappear.',
  },

  // --- Storage and containers ---------------------------------------------
  {
    memoryType: 'movement', title: 'Christmas decorations into Box 3', occurredAt: '2026-01-11',
    subjectSlug: 'storage-box-3', placeSlug: 'storage-unit',
    content: 'Packed the Christmas lights, the two extension cords, the spare HDMI cable and the leftover gift wrap into Box 3 and took it to the storage unit.',
    tags: ['storage'],
  },
  {
    memoryType: 'note', title: 'What is in Box 7', occurredAt: '2026-03-02',
    subjectSlug: 'storage-box-7', placeSlug: 'storage-unit',
    content: 'Box 7 holds the four-person tent, two sleeping bags, the camp stove with one spare gas canister, three headlamps and the blue tarp. The tent pegs are in a side pouch inside the tent bag.',
    tags: ['storage', 'camping'],
  },

  // --- Misc household ------------------------------------------------------
  {
    memoryType: 'repair', title: 'Water heater element replaced', occurredAt: '2026-06-27',
    subjectSlug: 'water-heater', alsoSlugs: ['fixpoint-repairs'], amount: 2100,
    content: 'Shower ran cold after about two minutes. The heating element had scaled over. Replaced and the inlet filter cleaned. ₱2,100.',
  },
  {
    memoryType: 'maintenance', title: 'Mower serviced before the rains', occurredAt: '2026-05-08',
    subjectSlug: 'lawn-mower', amount: 1500,
    content: 'Oil changed to 10W-30, new NGK BPR6ES spark plug, air filter cleaned and the blade sharpened. Starts on the second pull again. ₱1,500.',
  },
  {
    memoryType: 'observation', title: 'Guitar action feels high', occurredAt: '2026-07-03',
    subjectSlug: 'acoustic-guitar',
    content: 'Strings are sitting further from the fretboard than they used to above the seventh fret and barre chords are hard work. Probably the neck moving with the humidity rather than anything wrong.',
  },
  {
    memoryType: 'maintenance', title: 'Guitar set up and restrung', occurredAt: '2026-07-19',
    subjectSlug: 'acoustic-guitar', amount: 900,
    content: 'Truss rod adjusted, saddle lowered slightly and new Elixir Nanoweb 12-53 strings. Plays properly again. ₱900.',
  },
  {
    memoryType: 'installation', title: 'Mesh router set up', occurredAt: '2025-02-14',
    subjectSlug: 'router', placeSlug: 'living-room', amount: 9800,
    content: 'TP-Link Deco X55 three-pack. Main node in the living room wired to the modem, second upstairs in the office, third in the bedroom. Dead spot at the back of the garage is gone.',
  },
  {
    memoryType: 'note', title: 'Storage unit rent increase', occurredAt: '2026-07-01',
    subjectSlug: 'storage-unit', alsoSlugs: ['northgate-storage'], amount: 2200,
    content: 'Northgate put the monthly rate up from ₱1,950 to ₱2,200 from July. Worth reviewing whether both boxes still need to be there.',
  },
]
