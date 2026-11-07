import { readFileSync } from 'node:fs';

interface PublicRecord {
  product_name: string;
  producer_name: string;
  certificate_number: string;
  source_url: string;
  retrieved_at: string;
}

export const BPJPH_DATASET_VERSION = 'bpjph-public-search-2026-11-07';

export const bpjphRecords: readonly PublicRecord[] = JSON.parse(readFileSync(
  new URL('../datasets/bpjph-demo/products.json', import.meta.url), 'utf8',
));
