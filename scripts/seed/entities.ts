/** The cast: one household's things, people, places, organizations and projects. */

export interface SeedEntity {
  slug: string
  entityType: 'thing' | 'person' | 'place' | 'organization' | 'project' | 'document'
  name: string
  description: string
  category: string
  icon: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  purchasePrice?: number
  /** ISO date. */
  purchasedAt?: string
  warrantyExpiresAt?: string
  condition?: string
  parentSlug?: string
  attributes?: Record<string, string>
  tags?: string[]
}

// Places first — everything else hangs off them. The hierarchy is what makes
// "where is my drill?" answerable as Home → Garage → Cabinet → Shelf B.
export const PLACES: SeedEntity[] = [
  { slug: 'home', entityType: 'place', name: 'Home', description: 'The house on Marigold Street.', category: 'Residence', icon: '🏠' },
  { slug: 'garage', entityType: 'place', name: 'Garage', description: 'Tools, bikes, and everything that does not belong indoors.', category: 'Room', icon: '🚙', parentSlug: 'home' },
  { slug: 'garage-cabinet', entityType: 'place', name: 'Tool Cabinet', description: 'Grey metal cabinet against the back wall of the garage.', category: 'Storage', icon: '🗄️', parentSlug: 'garage' },
  { slug: 'shelf-a', entityType: 'place', name: 'Shelf A', description: 'Top shelf of the tool cabinet — power tools.', category: 'Shelf', icon: '📚', parentSlug: 'garage-cabinet' },
  { slug: 'shelf-b', entityType: 'place', name: 'Shelf B', description: 'Middle shelf of the tool cabinet — hand tools and drill bits.', category: 'Shelf', icon: '📚', parentSlug: 'garage-cabinet' },
  { slug: 'bedroom', entityType: 'place', name: 'Bedroom', description: 'Main bedroom, second floor.', category: 'Room', icon: '🛏️', parentSlug: 'home' },
  { slug: 'bedroom-safe', entityType: 'place', name: 'Bedroom Safe', description: 'Fireproof safe in the bedroom closet. Documents and valuables.', category: 'Storage', icon: '🔐', parentSlug: 'bedroom' },
  { slug: 'kitchen', entityType: 'place', name: 'Kitchen', description: 'Ground floor kitchen and dining area.', category: 'Room', icon: '🍳', parentSlug: 'home' },
  { slug: 'living-room', entityType: 'place', name: 'Living Room', description: 'Ground floor, facing the street.', category: 'Room', icon: '🛋️', parentSlug: 'home' },
  { slug: 'home-office', entityType: 'place', name: 'Home Office', description: 'Converted spare room upstairs.', category: 'Room', icon: '💼', parentSlug: 'home' },
  { slug: 'storage-unit', entityType: 'place', name: 'Storage Unit 114', description: 'Rented unit at Northgate Self Storage.', category: 'Storage', icon: '📦' },
]

export const ORGS: SeedEntity[] = [
  { slug: 'cyclehouse', entityType: 'organization', name: 'CycleHouse', description: 'Bike shop on Rosario Street. Does the servicing on the Trek.', category: 'Service provider', icon: '🔧', attributes: { phone: '+63 917 555 0142', speciality: 'Bicycle service and parts' } },
  { slug: 'apple-greenbelt', entityType: 'organization', name: 'Apple Store Greenbelt', description: 'Where the MacBook was bought and serviced.', category: 'Retailer', icon: '🍎' },
  { slug: 'coolair-service', entityType: 'organization', name: 'CoolAir Service Co.', description: 'Aircon cleaning and repair. Comes twice a year.', category: 'Service provider', icon: '❄️', attributes: { phone: '+63 928 555 7781' } },
  { slug: 'honda-casa', entityType: 'organization', name: 'Honda Casa Alabang', description: 'Dealer service centre for the Civic.', category: 'Service provider', icon: '🚗' },
  { slug: 'sm-appliance', entityType: 'organization', name: 'SM Appliance Center', description: 'Large appliance purchases.', category: 'Retailer', icon: '🏬' },
  { slug: 'ace-hardware', entityType: 'organization', name: 'Ace Hardware', description: 'Tools, paint and household hardware.', category: 'Retailer', icon: '🛠️' },
  { slug: 'northgate-storage', entityType: 'organization', name: 'Northgate Self Storage', description: 'Monthly storage rental.', category: 'Service provider', icon: '🏢' },
  { slug: 'fixpoint-repairs', entityType: 'organization', name: 'FixPoint Repairs', description: 'Independent electronics repair in the mall annex.', category: 'Service provider', icon: '🔌' },
]

export const PEOPLE: SeedEntity[] = [
  { slug: 'mark', entityType: 'person', name: 'Mark', description: 'Friend from the cycling group. Borrows the camera often.', category: 'Friend', icon: '🧑', attributes: { phone: '+63 917 555 2210' } },
  { slug: 'alex', entityType: 'person', name: 'Alex', description: 'Neighbour two doors down. Shares tools.', category: 'Neighbour', icon: '🧑‍🦱' },
  { slug: 'nina', entityType: 'person', name: 'Nina', description: 'Sister. Stays over during the holidays.', category: 'Family', icon: '👩' },
  { slug: 'ramon', entityType: 'person', name: 'Ramon Diaz', description: 'Aircon technician from CoolAir. Asks for him by name.', category: 'Technician', icon: '👨‍🔧', attributes: { employer: 'CoolAir Service Co.' } },
  { slug: 'jun', entityType: 'person', name: 'Jun Robles', description: 'Contractor who ran the kitchen renovation.', category: 'Contractor', icon: '👷' },
  { slug: 'ella', entityType: 'person', name: 'Ella', description: 'Colleague. Borrowed the projector for a workshop.', category: 'Colleague', icon: '👩‍💻' },
]

export const PROJECTS: SeedEntity[] = [
  { slug: 'kitchen-reno', entityType: 'project', name: 'Kitchen Renovation', description: 'Replacing counters, cabinets and the range hood. Ran eleven weeks.', category: 'Home improvement', icon: '🏗️', tags: ['home', '2025'] },
  { slug: 'cebu-trip', entityType: 'project', name: 'Cebu Trip', description: 'Ten days in Cebu and Bantayan, April 2026.', category: 'Travel', icon: '🏝️', tags: ['travel', '2026'] },
  { slug: 'pc-build', entityType: 'project', name: 'Gaming PC Build', description: 'Built over three months as parts went on sale.', category: 'Build', icon: '🖥️', tags: ['tech'] },
]

export const THINGS: SeedEntity[] = [
  {
    slug: 'trek-fx3', entityType: 'thing', name: 'Trek FX 3', description: 'Hybrid commuter bike, matte blue. Daily ride to the office.',
    category: 'Bicycle', icon: '🚲', manufacturer: 'Trek', model: 'FX 3 Disc', serialNumber: 'WTU241K0392H',
    purchasePrice: 42000, purchasedAt: '2024-11-04', condition: 'Good', parentSlug: 'garage',
    attributes: { 'Frame size': '54 cm', 'Chain': 'Shimano CN-HG54', 'Tyre size': '700x35c', 'Cassette': 'Shimano HG31 11-34' },
    tags: ['daily', 'maintained'],
  },
  {
    slug: 'macbook-pro', entityType: 'thing', name: 'MacBook Pro 14"', description: 'Work laptop. M3 Pro, 18 GB, 512 GB.',
    category: 'Laptop', icon: '💻', manufacturer: 'Apple', model: 'MacBook Pro 14 M3 Pro', serialNumber: 'C02XK9PLQ6NY',
    purchasePrice: 134900, purchasedAt: '2024-02-18', warrantyExpiresAt: '2027-02-18', condition: 'Good', parentSlug: 'home-office',
    attributes: { 'AppleCare+': 'Yes, until Feb 2027', 'Charger': '96W USB-C' },
    tags: ['work', 'insured'],
  },
  {
    slug: 'sony-a6400', entityType: 'thing', name: 'Sony A6400', description: 'Mirrorless camera with the 18-105mm kit lens.',
    category: 'Camera', icon: '📷', manufacturer: 'Sony', model: 'ILCE-6400', serialNumber: 'SN4471902',
    purchasePrice: 58000, purchasedAt: '2023-08-12', condition: 'Good', parentSlug: 'home-office',
    attributes: { 'Lens': 'E PZ 18-105mm F4 G OSS', 'Battery': 'NP-FW50', 'Card': 'SanDisk 128GB V30' },
    tags: ['loanable', 'travel'],
  },
  {
    slug: 'honda-civic', entityType: 'thing', name: 'Honda Civic', description: '2021 Civic RS Turbo, pearl white.',
    category: 'Vehicle', icon: '🚗', manufacturer: 'Honda', model: 'Civic RS Turbo 2021', serialNumber: 'PADFC1640MV012877',
    purchasePrice: 1650000, purchasedAt: '2023-01-20', condition: 'Good', parentSlug: 'garage',
    attributes: { 'Plate': 'NCK 4472', 'Battery': 'Motolite Gold 55B24L', 'Oil': '0W-20 full synthetic', 'Tyres': '235/40 R18' },
    tags: ['vehicle', 'insured'],
  },
  {
    slug: 'bedroom-aircon', entityType: 'thing', name: 'Bedroom Aircon', description: 'Split-type inverter unit above the bed.',
    category: 'Appliance', icon: '❄️', manufacturer: 'Daikin', model: 'FTKC35TVM', serialNumber: 'DK35TVM2209841',
    purchasePrice: 38500, purchasedAt: '2023-03-30', warrantyExpiresAt: '2028-03-30', condition: 'Good', parentSlug: 'bedroom',
    attributes: { 'Capacity': '1.5 HP', 'Filter': 'Washable, every 3 months' },
    tags: ['appliance', 'serviced'],
  },
  {
    slug: 'living-aircon', entityType: 'thing', name: 'Living Room Aircon', description: 'Older window-type unit. Noisy but working.',
    category: 'Appliance', icon: '🌬️', manufacturer: 'Carrier', model: 'WCARJ012EE', purchasePrice: 21000,
    purchasedAt: '2021-05-14', condition: 'Fair', parentSlug: 'living-room', tags: ['appliance'],
  },
  {
    slug: 'refrigerator', entityType: 'thing', name: 'Samsung Refrigerator', description: 'Two-door inverter, 380 L. Chosen over the LG for the bigger freezer.',
    category: 'Appliance', icon: '🧊', manufacturer: 'Samsung', model: 'RT38K5930S8', serialNumber: 'ABC123X9920',
    purchasePrice: 42000, purchasedAt: '2026-04-11', warrantyExpiresAt: '2027-04-11', condition: 'New', parentSlug: 'kitchen',
    attributes: { 'Capacity': '380 L', 'Energy': 'Inverter, 5-star' },
    tags: ['appliance', 'warranty'],
  },
  {
    slug: 'power-drill', entityType: 'thing', name: 'Power Drill', description: 'Cordless 18V drill-driver with two batteries.',
    category: 'Tool', icon: '🧰', manufacturer: 'Makita', model: 'DF487D', purchasePrice: 6800,
    purchasedAt: '2024-06-02', condition: 'Good', parentSlug: 'shelf-a',
    attributes: { 'Battery': '18V LXT 3.0Ah ×2', 'Chuck': '13 mm keyless' },
    tags: ['tool', 'loanable'],
  },
  {
    slug: 'espresso-machine', entityType: 'thing', name: 'Espresso Machine', description: 'Dual-boiler machine on the kitchen counter.',
    category: 'Appliance', icon: '☕', manufacturer: 'Breville', model: 'BES920XL', purchasePrice: 48000,
    purchasedAt: '2025-01-09', warrantyExpiresAt: '2027-01-09', condition: 'Good', parentSlug: 'kitchen',
    attributes: { 'Descale': 'Every 3 months', 'Gasket': '58 mm group seal' },
    tags: ['appliance', 'kitchen'],
  },
  {
    slug: 'washing-machine', entityType: 'thing', name: 'Washing Machine', description: 'Front-load 8.5 kg inverter.',
    category: 'Appliance', icon: '🧺', manufacturer: 'LG', model: 'FV1285S4W', serialNumber: 'LG285S4W77120',
    purchasePrice: 36000, purchasedAt: '2024-09-21', warrantyExpiresAt: '2026-09-21', condition: 'Good', parentSlug: 'kitchen',
    tags: ['appliance', 'warranty'],
  },
  {
    slug: 'acoustic-guitar', entityType: 'thing', name: 'Yamaha Acoustic Guitar', description: 'Solid-top dreadnought. Lives on a stand in the office.',
    category: 'Instrument', icon: '🎸', manufacturer: 'Yamaha', model: 'FG830', purchasePrice: 14500,
    purchasedAt: '2023-11-25', condition: 'Good', parentSlug: 'home-office',
    attributes: { 'Strings': 'Elixir Nanoweb 12-53' }, tags: ['music'],
  },
  {
    slug: 'projector', entityType: 'thing', name: 'Portable Projector', description: '1080p LED projector for films in the living room.',
    category: 'Electronics', icon: '📽️', manufacturer: 'Anker', model: 'Nebula Mars II Pro', purchasePrice: 29000,
    purchasedAt: '2025-06-18', condition: 'Good', parentSlug: 'living-room', tags: ['loanable'],
  },
  {
    slug: 'passport', entityType: 'thing', name: 'Passport', description: 'Philippine passport. Renewed in 2024.',
    category: 'Document', icon: '📘', serialNumber: 'P8842197A', warrantyExpiresAt: '2034-07-15',
    parentSlug: 'bedroom-safe', attributes: { 'Expires': '15 July 2034' }, tags: ['important', 'document'],
  },
  {
    slug: 'router', entityType: 'thing', name: 'Wi-Fi Router', description: 'Mesh router, main node in the living room.',
    category: 'Electronics', icon: '📶', manufacturer: 'TP-Link', model: 'Deco X55', purchasePrice: 9800,
    purchasedAt: '2025-02-14', condition: 'Good', parentSlug: 'living-room',
    attributes: { 'Admin': 'deco app', 'Nodes': '3' },
  },
  {
    slug: 'lawn-mower', entityType: 'thing', name: 'Lawn Mower', description: 'Petrol push mower for the back garden.',
    category: 'Tool', icon: '🌿', manufacturer: 'Honda', model: 'HRU19M1', purchasePrice: 32000,
    purchasedAt: '2023-05-06', condition: 'Fair', parentSlug: 'garage',
    attributes: { 'Oil': 'SAE 10W-30', 'Spark plug': 'NGK BPR6ES' }, tags: ['garden'],
  },
  {
    slug: 'storage-box-3', entityType: 'thing', name: 'Storage Box 3', description: 'Blue lidded crate. Christmas decorations and spare cables.',
    category: 'Container', icon: '📦', parentSlug: 'storage-unit',
    attributes: { 'Contents': 'Christmas lights, extension cords, spare HDMI, gift wrap' }, tags: ['storage'],
  },
  {
    slug: 'storage-box-7', entityType: 'thing', name: 'Storage Box 7', description: 'Clear crate. Camping and outdoor gear.',
    category: 'Container', icon: '📦', parentSlug: 'storage-unit',
    attributes: { 'Contents': 'Tent, sleeping bags, camp stove, headlamps, tarp' }, tags: ['storage', 'camping'],
  },
  {
    slug: 'office-chair', entityType: 'thing', name: 'Office Chair', description: 'Mesh task chair with adjustable lumbar.',
    category: 'Furniture', icon: '🪑', manufacturer: 'Ergodynamic', model: 'MX-90', purchasePrice: 12500,
    purchasedAt: '2024-03-11', warrantyExpiresAt: '2026-03-11', condition: 'Good', parentSlug: 'home-office',
  },
  {
    slug: 'gaming-pc', entityType: 'thing', name: 'Gaming PC', description: 'Self-built desktop. Ryzen 7, RTX 4070, 32 GB.',
    category: 'Computer', icon: '🖥️', purchasePrice: 98000, purchasedAt: '2025-09-30', condition: 'Good',
    parentSlug: 'home-office',
    attributes: { 'CPU': 'Ryzen 7 7800X3D', 'GPU': 'RTX 4070 Super', 'RAM': '32 GB DDR5-6000', 'PSU': 'Corsair RM750e' },
    tags: ['tech', 'build'],
  },
  {
    slug: 'water-heater', entityType: 'thing', name: 'Water Heater', description: 'Instant electric heater in the upstairs bathroom.',
    category: 'Appliance', icon: '🚿', manufacturer: 'Panasonic', model: 'DH-3RL2', purchasePrice: 7200,
    purchasedAt: '2024-08-03', condition: 'Good', parentSlug: 'bedroom', tags: ['appliance'],
  },
]

export const ALL_ENTITIES: SeedEntity[] = [...PLACES, ...ORGS, ...PEOPLE, ...PROJECTS, ...THINGS]
