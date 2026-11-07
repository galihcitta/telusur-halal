import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Evidence, Ingredient, Observation } from '../src/contracts.js';
import { checkEvidence, exemption, searchCatalogue } from '../src/rules.js';

const base: Ingredient = {
  ingredient_id: 'seasoning',
  declared_name: 'Bumbu Balado',
  variant: 'Original',
  form: 'processed',
  pack_condition: 'sealed',
  source_refs: ['confirmed intake'],
  status: 'open',
  basis: '',
  evidence: [],
  requests: 1,
  conflict: false,
  pending_request: { request_id: 'first', attempt: 1 },
};

const original: Observation = {
  product: 'Bumbu Balado Original',
  manufacturer: 'CV Rasa Nusantara',
  variant: 'Original',
  variant_known: true,
  certificate_number: 'ID-SIM-0202',
  certificate_state: 'printed',
  repacked: false,
  unreadable_fields: [],
};

function fromPack(observed: Partial<Observation> = {}): Evidence {
  return {
    evidence_id: 'photo',
    case_id: 'case',
    revision: 1,
    ingredient_id: base.ingredient_id,
    request_id: 'first',
    source_type: 'photo',
    source_refs: ['photo sha256:original'],
    observed: { ...original, ...observed },
    confirmed_current: true,
    conflicts: [],
  };
}

test('D01 seasoning matches exact identity and cites the actual photo and simulation record', () => {
  const result = checkEvidence(base, fromPack(), 'case', 1);
  assert.equal(result.status, 'verified');
  assert.equal(result.reason, 'EXACT_IDENTITY');
  assert.deepEqual(result.source_refs, [
    'photo sha256:original', 'datasets/pack-photos/repo/evals/seed/registry.yaml#R-202',
  ]);
});

test('wrong variants and a full borrowed certificate stay unresolved', () => {
  assert.equal(checkEvidence(base, fromPack({
    product: 'Bumbu Balado Pedas', variant: 'Pedas', certificate_number: 'ID-SIM-0201',
  }), 'case', 1).reason, 'IDENTITY_MISMATCH');

  assert.equal(checkEvidence({ ...base, variant: 'Pedas' }, fromPack({
    product: 'Bumbu Balado Extra Pedas', variant: 'Pedas', certificate_number: 'ID-SIM-0201',
  }), 'case', 1).reason, 'IDENTITY_MISMATCH');

  assert.equal(checkEvidence(base, fromPack({
    certificate_number: 'ID-SIM-0602',
  }), 'case', 1).reason, 'CERTIFICATE_MISMATCH');
});

test('wrong maker, wrong ingredient, logo-only and unreadable numbers are refused', () => {
  assert.equal(checkEvidence(base, fromPack({
    manufacturer: 'CV Dapur Minang',
  }), 'case', 1).status, 'unresolved');

  assert.equal(checkEvidence({ ...base, declared_name: 'gelatin' }, fromPack(), 'case', 1).status, 'unresolved');

  assert.equal(checkEvidence(base, fromPack({
    product: null, manufacturer: null, certificate_number: null, certificate_state: 'absent',
  }), 'case', 1).reason, 'UNREADABLE');

  assert.equal(checkEvidence(base, fromPack({
    certificate_number: null, certificate_state: 'unreadable',
  }), 'case', 1).reason, 'UNREADABLE');
});

test('certificate may cover several products; number alone cannot identify the ingredient', () => {
  const evidence = fromPack({
    product: 'Essence Pandan', manufacturer: 'PT Esens Wangi', variant: null, certificate_number: 'ID-SIM-0501',
  });
  const essence = { ...base, declared_name: 'Essence Vanili', variant: null };
  assert.equal(checkEvidence(essence, evidence, 'case', 1).reason, 'IDENTITY_MISMATCH');
  assert.equal(checkEvidence({ ...essence, declared_name: 'Essence Pandan' }, evidence, 'case', 1).status, 'verified');
});

test('explicitly absent number differs from unreadable; unknown variant cannot close a gap', () => {
  const evidence = fromPack({
    product: 'Minyak Goreng Sentosa', manufacturer: 'PT Minyak Sentosa', variant: null,
    certificate_number: null, certificate_state: 'absent',
  });
  const oil = { ...base, declared_name: 'Minyak Goreng', brand: 'Sentosa', variant: null };
  assert.equal(checkEvidence(oil, evidence, 'case', 1).status, 'verified');
  assert.equal(checkEvidence({ ...oil, brand: undefined }, evidence, 'case', 1).status, 'unresolved');
  assert.equal(checkEvidence({ ...oil, variant: undefined }, evidence, 'case', 1).reason, 'UNREADABLE');
  assert.equal(checkEvidence(oil, {
    ...evidence, observed: { ...evidence.observed, variant_known: false },
  }, 'case', 1).reason, 'UNREADABLE');
});

test('foreign, stale, unrequested and unconfirmed observations cannot verify current goods', () => {
  for (const override of [{ case_id: 'other' }, { revision: 2 }, { request_id: 'other' }, { ingredient_id: 'other' },
    { confirmed_current: false }, { source_refs: [] }]) {
    assert.equal(checkEvidence(base, { ...fromPack(), ...override }, 'case', 1).reason, 'SOURCE_BOUND');
  }
});

test('typed recovery cites the seller and cannot replace a conflicted photo or known repack', () => {
  const typed = { ...fromPack(), source_type: 'seller-typed' as const, source_refs: ['seller note'] };
  assert.match(checkEvidence(base, typed, 'case', 1).basis, /dari penjual/);
  assert.equal(checkEvidence({ ...base, conflict: true }, typed, 'case', 1).reason, 'CONFLICT_OR_REPACK');
  const repack = fromPack({ repacked: true });
  assert.equal(checkEvidence(base, repack, 'case', 1).reason, 'CONFLICT_OR_REPACK');
  assert.equal(checkEvidence({ ...base, evidence: [repack] }, typed, 'case', 1).reason, 'CONFLICT_OR_REPACK');
  assert.equal(checkEvidence({ ...base, evidence: [repack] }, fromPack(), 'case', 1).reason, 'CONFLICT_OR_REPACK');
});

test('fresh banana exemption requires an affirmative no-additives confirmation; tempe remains open', () => {
  const banana = { ...base, declared_name: 'pisang kepok', form: 'fresh' as const };
  assert.equal(exemption(banana)?.reason, 'EXEMPT_UNKNOWN');
  assert.equal(exemption({ ...banana, no_additives: false })?.status, 'unresolved');
  assert.equal(exemption({ ...banana, no_additives: true })?.status, 'exempt');
  assert.equal(exemption({ ...banana, no_additives: true, form: 'processed' })?.reason, 'EXEMPT_UNKNOWN');
  assert.equal(exemption({ ...banana, declared_name: 'Tempe', no_additives: true })?.reason, 'SCOPE_REVIEW');
});

test('catalogue excludes the curah offer, preserves a distinct alternative, and respects use and variant', () => {
  const loose = { ...base, declared_name: 'cabai bubuk', variant: null, pack_condition: 'loose' as const };
  const result = searchCatalogue(loose);
  assert.deepEqual(result.eligible.map((offer) => [offer.listing.listing_id, offer.registry.record_id]), [
    ['L-9', 'R-301'], ['L-ALT-302', 'R-302'],
  ]);
  assert.match(result.excluded.find((offer) => offer.listing_id === 'L-10')?.reason ?? '', /curah/);
  assert.deepEqual(searchCatalogue({ ...loose, variant: 'Extra Pedas' }).eligible, []);
  assert.deepEqual(searchCatalogue({ ...loose, declared_name: 'cokelat' }).eligible, []);
});

test('BPJPH match uses full product and manufacturer and keeps registry number separate from pack evidence', () => {
  const palmia = { ...base, declared_name: 'Margarin Palmia Super Cake', brand: 'Palmia', variant: 'Super Cake' };
  const evidence = {
    product: 'Palmia Super Cake Margarin', manufacturer: 'PT Salim Ivomas Pratama Tbk',
    variant: null, certificate_number: null, certificate_state: 'absent' as const,
  };
  const match = checkEvidence(palmia, fromPack(evidence), 'case', 1);
  assert.equal(match.status, 'verified');
  assert.match(match.basis, /ID00410000054910420.*Nomor tidak terlihat/);
  assert.ok(match.source_refs.includes('https://bpjph.halal.go.id/cari/sertifikat?produk=margarin&page=13'));
  assert.equal(checkEvidence(palmia, fromPack({ ...evidence, manufacturer: 'PT Lain' }), 'case', 1).status, 'unresolved');
  assert.equal(checkEvidence(palmia, fromPack({ ...evidence, product: 'Margarin Palmia Prime' }), 'case', 1).status, 'unresolved');
  assert.equal(checkEvidence(palmia, fromPack({
    ...evidence, certificate_number: 'ID36210084939791126', certificate_state: 'printed',
  }), 'case', 1).reason, 'CERTIFICATE_MISMATCH');
});
