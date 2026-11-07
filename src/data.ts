import type { Listing, RegistryRecord } from './contracts.js';

export const DATASET_VERSION = 'telusur-v8-2026-11-07';
const registrySource = 'datasets/pack-photos/repo/evals/seed/registry.yaml';
const catalogueSource = 'datasets/pack-photos/repo/evals/seed/shopee.yaml';

// Explicit v8 identity snapshot of the prepared registry. Null confirms no variant
// for the synthetic product; it is distinct from a missing seller observation.
const rows: ReadonlyArray<readonly [string, string, string, string, string | null]> = [
  ["R-101", "ID-SIM-0101", "Minyak Goreng Sentosa", "PT Minyak Sentosa", null],
  ["R-201", "ID-SIM-0201", "Bumbu Balado", "CV Rasa Nusantara", "Pedas"],
  ["R-202", "ID-SIM-0202", "Bumbu Balado", "CV Rasa Nusantara", "Original"],
  ["R-301", "ID-SIM-0301", "Cabai Bubuk Halal", "PT Cabai Prima", null],
  ["R-401", "ID-SIM-0401", "Coklat Batang", "PT Coklat Jaya", null],
  ["R-402", "ID-SIM-0402", "Coklat Batang", "CV Kakao Mandiri", null],
  ["R-501", "ID-SIM-0501", "Essence Vanili", "PT Esens Wangi", null],
  ["R-502", "ID-SIM-0501", "Essence Pandan", "PT Esens Wangi", null],
  ["R-601", "ID-SIM-0601", "Bumbu Balado", "PT Bumbu Lain", null],
  ["R-701", "ID-SIM-0701", "Tepung Terigu Makmur", "PT Tepung Makmur", null],
  ["R-102", "ID-SIM-0102", "Margarin Sentosa", "PT Minyak Sentosa", null],
  ["R-103", "ID-SIM-0103", "Minyak Kelapa Murni", "CV Kelapa Hijau", null],
  ["R-302", "ID-SIM-0302", "Cabai Bubuk", "CV Pedas Mantap", null],
  ["R-403", "ID-SIM-0403", "Coklat Compound", "PT Coklat Jaya", "Dark"],
  ["R-404", "ID-SIM-0404", "Coklat Compound", "PT Coklat Jaya", "Milk"],
  ["R-503", "ID-SIM-0503", "Essence Butter", "PT Esens Wangi", null],
  ["R-504", "ID-SIM-0504", "Essence Rum", "PT Esens Wangi", null],
  ["R-511", "ID-SIM-0511", "Essence Butter", "CV Aroma Dapur", null],
  ["R-512", "ID-SIM-0512", "Essence Rum", "CV Aroma Dapur", null],
  ["R-602", "ID-SIM-0602", "Bumbu Balado", "CV Dapur Minang", "Original"],
  ["R-702", "ID-SIM-0702", "Tepung Beras Mawar", "PT Tepung Mawar", null],
  ["R-711", "ID-SIM-0711", "Gula Pasir Manis Jaya", "PT Gula Manis Jaya", null],
  ["R-721", "ID-SIM-0721", "Makaroni Spiral Nusa", "PT Pasta Nusantara", null],
  ["R-801", "ID-SIM-0801", "Tepung Tapioka", "PT Tapioka Jaya", null],
  ["R-911", "ID-SIM-0911", "Kerupuk Mentah", "CV Sri Rejeki", null],
  ["R-912", "ID-SIM-0912", "Kerupuk Mentah", "PT Dua Putri", null],
  ["R-921", "ID-SIM-0921", "Bumbu Seblak Kencur", "CV Seblak Juara", null],
  ["R-922", "ID-SIM-0922", "Bumbu Seblak", "PT Rasa Kencur", null],
  ["R-931", "ID-SIM-0931", "Tempe Kedelai", "PT Tempe Sehat", null],
  ["R-932", "ID-SIM-0932", "Tempe Kedelai", "CV Tempe Murni", null],
  ["R-941", "ID-SIM-0941", "Selai Nanas", "CV Nanas Madu", null],
  ["R-942", "ID-SIM-0942", "Selai Nanas", "PT Selai Sari", null],
  ["R-951", "ID-SIM-0951", "Kulit Lumpia", "CV Lumpia Mas", null],
  ["R-961", "ID-SIM-0961", "Gelatin Sapi", "PT Gelatin Nusantara", null],
  ["R-962", "ID-SIM-0962", "Gelatin Sapi", "CV Halal Gel", null],
  ["R-971", "ID-SIM-0971", "Keju Bubuk", "PT Susu Prima", null],
  ["R-972", "ID-SIM-0972", "Keju Bubuk", "CV Keju Nusantara", null],
  ["R-981", "ID-SIM-0981", "Bawang Goreng", "CV Bawang Renyah", null],
  ["R-982", "ID-SIM-0982", "Bawang Goreng", "UD Bawang Sedap", null],
  ["R-991", "ID-SIM-0991", "Kacang Tanah Kupas", "PT Kelinci Mas Pangan", null],
];

export const registry: readonly RegistryRecord[] = rows.map(
  ([record_id, certificate_number, product, manufacturer, variant]) => ({
    record_id, certificate_number, product, manufacturer, variant,
    dataset_version: DATASET_VERSION,
    source_ref: registrySource + '#' + record_id,
  }),
);

// Offer identity is independently mapped in this v8 fixture. The title and
// shop in the prepared catalogue are never used as proof of coverage.
export const catalogue: readonly Listing[] = [
  {
    listing_id: 'L-10', product: 'Cabai Bubuk Curah', variant: null, manufacturer: '',
    shop: 'Toko Rempah Murah', price_idr: 32000, pack_size: '500 g', record_id: null,
    repacked: true, fit: 'cabai bubuk', source_ref: catalogueSource + '#L-10',
  },
  {
    listing_id: 'L-9', product: 'Cabai Bubuk Halal', variant: null, manufacturer: 'PT Cabai Prima',
    shop: 'Prima Official', price_idr: 18500, pack_size: '100 g', record_id: 'R-301',
    repacked: false, fit: 'cabai bubuk',
    source_ref: catalogueSource + '#L-9 (explicit v8 offer identity mapping)',
  },
  {
    listing_id: 'L-ALT-302', product: 'Cabai Bubuk', variant: null, manufacturer: 'CV Pedas Mantap',
    shop: 'Pedas Mantap Official', price_idr: 19500, pack_size: '100 g', record_id: 'R-302',
    repacked: false, fit: 'cabai bubuk',
    source_ref: 'src/data.ts#L-ALT-302 (synthetic v8 alternative; identity from prepared R-302)',
  },
  {
    listing_id: 'L-21', product: 'Bumbu Balado', variant: 'Original', manufacturer: 'CV Dapur Minang',
    shop: 'Dapur Minang Official', price_idr: 27000, pack_size: '250 g', record_id: 'R-602',
    repacked: false, fit: 'bumbu balado',
    source_ref: catalogueSource + '#L-21 (explicit v8 offer identity mapping)',
  },
  {
    listing_id: 'L-TAPIOCA-801', product: 'Tepung Tapioka', variant: null, manufacturer: 'PT Tapioka Jaya',
    shop: 'Tapioka Jaya Official', price_idr: 14000, pack_size: '500 g', record_id: 'R-801',
    repacked: false, fit: 'tepung tapioka', source_ref: 'src/data.ts#L-TAPIOCA-801 (simulated offer)',
  },
  {
    listing_id: 'L-OIL-101', product: 'Minyak Goreng Sentosa', variant: null, manufacturer: 'PT Minyak Sentosa',
    shop: 'Sentosa Official', price_idr: 22000, pack_size: '1 L', record_id: 'R-101',
    repacked: false, fit: 'minyak goreng', source_ref: 'src/data.ts#L-OIL-101 (simulated offer)',
  },
];
