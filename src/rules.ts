import type { Evidence, Ingredient, Listing, Reason, RegistryRecord } from './contracts.js';
import { catalogue, registry } from './data.js';
import { bpjphRecords } from './bpjph.js';

export { DATASET_VERSION } from './data.js';

interface Verdict<S extends 'verified' | 'exempt' | 'unresolved'> {
  status: S;
  reason: Reason;
  basis: string;
  source_refs: string[];
}

const exemptionSource =
  'datasets/pack-photos/reference/exempt-ingredients.json#KMA_1360_2021/a1_tumbuhan';
const bananaNames = new Set(['pisang kepok', 'pisang', 'buah pisang', 'buah pisang kepok']);

function normalize(value: string) {
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function manufacturerName(value: string) {
  return normalize(value).replace(/^(pt|cv|ud)\.\s+/, '$1 ').replace(/ tbk\.$/, ' tbk');
}

function sameVariant(actual: string | null | undefined, expected: string | null) {
  if (actual === undefined) return false;
  if (actual === null || expected === null) return actual === expected;
  return normalize(actual) === normalize(expected);
}

const useAliases: Readonly<Record<string, string>> = {
  'minyak goreng sentosa': 'minyak goreng',
  'cabai bubuk halal': 'cabai bubuk',
  'cabe bubuk': 'cabai bubuk',
  'gelatin sapi': 'gelatin',
  'makaroni spiral nusa': 'makaroni spiral',
  'tepung beras mawar': 'tepung beras',
  'tepung terigu makmur': 'tepung terigu',
  'gula pasir manis jaya': 'gula pasir',
};

const brandAliases: Readonly<Record<string, readonly string[]>> = {
  'R-101': ['sentosa'],
  'R-201': ['rasa nusantara'],
  'R-202': ['rasa nusantara'],
  'R-301': ['cabai prima'],
  'R-302': ['pedas mantap'],
  'R-602': ['dapur minang'],
};

export function ingredientUse(declaredName: string) {
  const name = normalize(declaredName);
  return useAliases[name] ?? name;
}

export function ingredientIdentity(row: Pick<Ingredient, 'declared_name' | 'variant' | 'brand'>) {
  const name = normalize(row.declared_name);
  if (bananaNames.has(name)) return { product: 'pisang kepok', variant: null, brand: undefined };
  const named = registry.filter(record => exactProductName(name, record));
  const fullVariant = named.find(record => record.variant && name === normalize(record.product + ' ' + record.variant));
  // Keep safety history under the named variant even if the separate field contradicts it.
  const variant = fullVariant?.variant ? normalize(fullVariant.variant)
    : row.variant == null ? row.variant : normalize(row.variant);
  const product = ingredientUse(fullVariant?.product ?? named[0]?.product ?? name);
  const possible = registry.filter(record => ingredientUse(record.product) === product && (variant === undefined || sameVariant(variant, record.variant)));
  const suppliedBrand = row.brand && normalize(row.brand);
  const branded = possible.find(record => suppliedBrand &&
    (brandAliases[record.record_id]?.includes(suppliedBrand) || manufacturerName(suppliedBrand) === manufacturerName(record.manufacturer)));
  const exactMaker = (fullVariant || ingredientUse(name) !== name) && named.length && new Set(named.map(record => record.manufacturer)).size === 1
    ? named[0].manufacturer : undefined;
  const brand = exactMaker ? manufacturerName(exactMaker) : branded ? manufacturerName(branded.manufacturer) : suppliedBrand;
  const publicName = publicProductName(row.declared_name, row.variant ?? null);
  const publicRecords = bpjphRecords.filter(record => normalize(record.product_name) === publicName);
  if (publicRecords.length && !branded && !named.length) {
    const maker = publicRecords[0].producer_name;
    const publicBrand = !suppliedBrand ? undefined
      : containsName(publicName, suppliedBrand) || manufacturerName(suppliedBrand) === manufacturerName(maker)
        ? manufacturerName(maker) : suppliedBrand;
    return { product: publicName, variant: null, brand: publicBrand };
  }
  return { product, variant, brand: brand || undefined };
}

function exactProductName(value: string, record: RegistryRecord) {
  const product = normalize(record.product);
  const observed = normalize(value);
  return observed === product ||
    (record.variant !== null && observed === product + ' ' + normalize(record.variant));
}

function declarationMatches(ingredient: Ingredient, record: RegistryRecord) {
  const name = normalize(ingredient.declared_name);
  const use = ingredientUse(name);
  const exact = exactProductName(name, record);
  const generic = name === use || !registry.some(candidate => exactProductName(name, candidate));
  // Generic category agreement alone does not identify a branded SKU when no
  // brand was confirmed. Keep such cases open until the seller names the SKU.
  const brand = ingredient.brand && normalize(ingredient.brand);
  const brandMatches = !brand || brandAliases[record.record_id]?.includes(brand) === true ||
    manufacturerName(brand) === manufacturerName(record.manufacturer);
  return sameVariant(ingredient.variant, record.variant) && brandMatches &&
    (exact || (generic && !!brand && use === ingredientUse(record.product)));
}

// This word order appears on the original Palmia box.
const publicProductAliases: ReadonlyMap<string, string> = new Map([
  ['palmia super cake margarin', 'margarin palmia super cake'],
]);

const publicTitleVariants: ReadonlyMap<string, string> = new Map([
  ['margarin palmia super cake', 'super cake'],
]);

function publicProductName(product: string, variant: string | null) {
  const name = normalize(product);
  const variantName = variant && normalize(variant);
  const withVariant = variantName && !containsName(name, variantName) ? name + ' ' + variantName : name;
  return publicProductAliases.get(withVariant) ?? withVariant;
}

function containsName(product: string, name: string) {
  return (' ' + product + ' ').includes(' ' + name + ' ');
}

function checkPublicEvidence(
  ingredient: Ingredient, evidence: Evidence, product: string, manufacturer: string,
): Verdict<'verified' | 'unresolved'> {
  const observed = evidence.observed;
  const productName = publicProductName(product, observed.variant);
  const declaredName = publicProductName(ingredient.declared_name, ingredient.variant ?? null);
  const brandMatches = !ingredient.brand || containsName(productName, normalize(ingredient.brand)) ||
    manufacturerName(ingredient.brand) === manufacturerName(manufacturer);
  const titleVariant = publicTitleVariants.get(productName);
  const variantsMatch = titleVariant
    ? sameVariant(ingredient.variant, titleVariant) && (observed.variant === null || sameVariant(observed.variant, titleVariant))
    : sameVariant(ingredient.variant, observed.variant);
  const candidates = bpjphRecords.filter(record => normalize(record.product_name) === productName &&
    manufacturerName(record.producer_name) === manufacturerName(manufacturer));
  if (declaredName !== productName || !brandMatches || !variantsMatch || !candidates.length) {
    return { status: 'unresolved', reason: 'IDENTITY_MISMATCH', source_refs: evidence.source_refs,
      basis: 'Nama produk atau produsen tidak cocok dengan deklarasi dan data registri yang tersedia.' };
  }
  const matches = candidates.filter(record => observed.certificate_state === 'absent' ||
    record.certificate_number === observed.certificate_number);
  if (matches.length !== 1) {
    return {
      status: 'unresolved', reason: matches.length ? 'REGISTRY_NO_UNIQUE_MATCH' : 'CERTIFICATE_MISMATCH',
      source_refs: evidence.source_refs,
      basis: matches.length ? 'Sampel BPJPH memuat lebih dari satu nomor untuk identitas ini.'
        : 'Nomor tercetak tidak cocok dengan produk dan produsen di sampel BPJPH.',
    };
  }
  const [record] = matches;
  const observedFrom = evidence.source_type === 'photo' ? 'Foto kemasan' : 'Salinan kemasan dari penjual';
  const numberBasis = observed.certificate_state === 'printed' ? 'Nomor tercetak cocok.'
    : 'Nomor berasal dari hasil pencarian. Nomor tidak terlihat pada bukti kemasan.';
  return {
    status: 'verified', reason: 'EXACT_IDENTITY',
    basis: `${observedFrom} cocok dengan hasil pencarian BPJPH tersimpan untuk ${record.product_name} · ${record.producer_name} · ${record.certificate_number}. ${numberBasis} Diambil ${record.retrieved_at.slice(0, 10)}.`,
    source_refs: [...evidence.source_refs, record.source_url],
  };
}

export function exemption(ingredient: Ingredient): Verdict<'exempt' | 'unresolved'> | undefined {
  const name = normalize(ingredient.declared_name);
  if (name === 'tempe' || name === 'tempe kedelai') {
    return {
      status: 'unresolved', reason: 'SCOPE_REVIEW',
      basis: 'Kondisi pengecualian tempe perlu ditinjau fasilitator.',
      source_refs: ['datasets/pack-photos/reference/exempt-ingredients.json#KMA_1360_2021/a3_fermentasi_mikroba'],
    };
  }
  if (!bananaNames.has(name)) return undefined;
  const source_refs = [...ingredient.source_refs, exemptionSource];
  if (ingredient.pack_condition === 'repacked' || ingredient.conflict) {
    return {
      status: 'unresolved', reason: 'CONFLICT_OR_REPACK',
      basis: 'Konfirmasi kondisi dan asal pisang bersama fasilitator.',
      source_refs,
    };
  }
  if (ingredient.form !== 'fresh' || ingredient.no_additives !== true) {
    return {
      status: 'unresolved', reason: 'EXEMPT_UNKNOWN',
      basis: 'Pengecualian memerlukan pisang segar tanpa tambahan atau bahan penolong.',
      source_refs,
    };
  }
  return {
    status: 'exempt', reason: 'EXEMPT_CONDITIONS',
    basis: 'Penjual mengonfirmasi pisang segar tanpa tambahan atau bahan penolong. Dasar: kutipan KMA 1360/2021, buah segar.',
    source_refs,
  };
}

export function checkEvidence(
  ingredient: Ingredient, evidence: Evidence, case_id: string, revision: number,
): Verdict<'verified' | 'unresolved'> {
  const refuse = (reason: Reason, basis: string, source_refs = evidence.source_refs) =>
    ({ status: 'unresolved' as const, reason, basis, source_refs });
  if (evidence.case_id !== case_id || evidence.revision !== revision ||
      evidence.ingredient_id !== ingredient.ingredient_id ||
      evidence.request_id !== ingredient.pending_request?.request_id || !evidence.source_refs.length ||
      (evidence.source_type !== 'photo' && evidence.source_type !== 'seller-typed')) {
    return refuse('SOURCE_BOUND', 'Bukti harus berasal dari permintaan aktif untuk bahan ini.', []);
  }
  const observed = evidence.observed;
  const knownRepack = ingredient.evidence.some((entry) =>
    entry.case_id === case_id && entry.revision === revision &&
    entry.ingredient_id === ingredient.ingredient_id && entry.observed.repacked);
  if (ingredient.pack_condition === 'repacked' || observed.repacked || knownRepack ||
      (ingredient.conflict && evidence.source_type !== 'photo')) {
    return refuse('CONFLICT_OR_REPACK', 'Kemasan ulang atau konflik yang tercatat memerlukan peninjauan.');
  }
  if (!evidence.confirmed_current || ingredient.pack_condition !== 'sealed') {
    return refuse('SOURCE_BOUND', 'Konfirmasi bahwa kemasan tersegel ini adalah bahan yang digunakan.');
  }
  const { product, manufacturer, certificate_number, certificate_state } = observed;
  if (!product || !manufacturer || !observed.variant_known || ingredient.variant === undefined ||
      observed.unreadable_fields.length || certificate_state === 'unreadable' ||
      (certificate_state === 'printed' && !certificate_number) ||
      (certificate_state === 'absent' && certificate_number !== null)) {
    return refuse('UNREADABLE', 'Identitas, varian, produsen, atau nomor pada kemasan belum jelas.');
  }
  const identities = registry.filter((record) =>
    exactProductName(product, record) && sameVariant(observed.variant, record.variant) &&
    manufacturerName(manufacturer) === manufacturerName(record.manufacturer) &&
    declarationMatches(ingredient, record));
  if (!identities.length) {
    if (certificate_number?.startsWith('ID-SIM-')) {
      return refuse('IDENTITY_MISMATCH', 'Produk, varian, atau produsen pada kemasan tidak cocok dengan deklarasi dan registri simulasi.');
    }
    return checkPublicEvidence(ingredient, evidence, product, manufacturer);
  }
  const matches = identities.filter((record) =>
    certificate_state === 'absent' || certificate_number === record.certificate_number);
  if (!matches.length) {
    return refuse('CERTIFICATE_MISMATCH', 'Nomor tercetak tidak cocok dengan produk, varian, dan produsen di registri simulasi.');
  }
  if (matches.length !== 1) {
    return refuse('REGISTRY_NO_UNIQUE_MATCH', 'Registri simulasi tidak memberikan satu kecocokan identitas.');
  }
  const [record] = matches;
  const sourceLabel = evidence.source_type === 'photo' ? 'Foto kemasan' : 'Salinan kemasan dari penjual';
  const lookup = certificate_state === 'absent' ? 'Pencarian identitas tanpa nomor tercetak.' : 'Nomor tercetak cocok.';
  return {
    status: 'verified', reason: 'EXACT_IDENTITY',
    basis: sourceLabel + ' cocok dengan registri simulasi ' + record.record_id + ' (' +
      record.certificate_number + '). ' + lookup,
    source_refs: [...evidence.source_refs, record.source_ref],
  };
}

export function searchCatalogue(ingredient: Ingredient): {
  eligible: { listing: Listing; registry: RegistryRecord }[];
  excluded: { listing_id: string; reason: string }[];
} {
  const eligible: { listing: Listing; registry: RegistryRecord }[] = [];
  const excluded: { listing_id: string; reason: string }[] = [];
  const declaredUse = ingredientUse(ingredient.declared_name);
  const use = declaredUse === 'minyak nabati' ? 'minyak goreng' : declaredUse;
  for (const listing of catalogue) {
    const record = registry.find((row) => row.record_id === listing.record_id);
    const compatibleVariant = ingredient.variant === undefined ?
      listing.variant === null : sameVariant(ingredient.variant, listing.variant);
    const sameUse = use === listing.fit ||
      (ingredient.variant != null && use === listing.fit + ' ' + normalize(ingredient.variant));
    let reason: string | undefined;
    if (listing.repacked) reason = 'Penawaran curah atau dikemas ulang.';
    else if (!sameUse || !compatibleVariant) reason = 'Kegunaan atau varian tidak sesuai.';
    else if (!listing.shop.trim() || listing.price_idr <= 0 || !listing.manufacturer.trim() ||
      !record || normalize(listing.product) !== normalize(record.product) ||
      manufacturerName(listing.manufacturer) !== manufacturerName(record.manufacturer) ||
      !sameVariant(listing.variant, record.variant)) reason = 'Identitas penawaran tidak terhubung ke registri simulasi.';
    if (reason) excluded.push({ listing_id: listing.listing_id, reason });
    else if (record) eligible.push({ listing, registry: record });
  }
  return { eligible, excluded };
}
