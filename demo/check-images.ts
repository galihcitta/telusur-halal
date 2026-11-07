import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import type { Evidence, Ingredient, Observation } from '../src/contracts.js';
import { createModel } from '../src/model.js';
import { checkEvidence } from '../src/rules.js';

const prepared = 'datasets/pack-photos/repo/fixtures/photos';
const original = { declared_name: 'bumbu balado', variant: 'Original' };
const gelatin = { declared_name: 'gelatin', variant: null };
const exactOriginal: Observation = {
  product: 'Bumbu Balado',
  manufacturer: 'CV Rasa Nusantara',
  variant: 'Original',
  variant_known: true,
  certificate_number: 'ID-SIM-0202',
  certificate_state: 'printed',
  repacked: false,
  unreadable_fields: [],
};

type Sample = {
  id: string;
  path: string;
  declaration: Pick<Ingredient, 'declared_name' | 'variant' | 'brand'>;
  expect: 'verified' | 'unresolved';
  perception: (observation: Observation) => boolean;
  typed?: Observation;
};

const samples: Sample[] = [
  {
    id: 'D01-sentosa-correct',
    path: 'demo/d01-sentosa.png',
    declaration: { declared_name: 'minyak goreng', brand: 'Sentosa', variant: null },
    expect: 'verified',
    perception: read => read.certificate_number === 'ID-SIM-0101' && read.variant_known && read.variant === null,
  },
  {
    id: 'D01-original-correct',
    path: `${prepared}/D01_pack_original.png`,
    declaration: original,
    expect: 'verified',
    perception: read => read.variant?.toLowerCase() === 'original' && read.certificate_number === 'ID-SIM-0202',
  },
  {
    id: 'D01-wrong-variant',
    path: `${prepared}/D01_pack_pedas.png`,
    declaration: original,
    expect: 'unresolved',
    perception: read => read.variant?.toLowerCase() === 'pedas' && read.certificate_number === 'ID-SIM-0201',
  },
  {
    id: 'extra-pedas-borrowed-number',
    path: 'demo/pack-extra-pedas-borrowed.png',
    declaration: { ...original, variant: 'Pedas' },
    expect: 'unresolved',
    perception: read => read.variant?.toLowerCase() === 'extra pedas' && read.certificate_number === 'ID-SIM-0201',
  },
  {
    id: 'wrong-product-borrowed-number',
    path: 'demo/pack-wrong-product-borrowed.png',
    declaration: original,
    expect: 'unresolved',
    perception: read => Boolean(read.product?.toLowerCase().includes('rendang')) && read.certificate_number === 'ID-SIM-0202',
  },
  {
    id: 'obscured-number',
    path: 'demo/pack-obscured-number.png',
    declaration: original,
    expect: 'unresolved',
    perception: read => read.certificate_state === 'unreadable' && read.certificate_number === null,
  },
  {
    id: 'D16-logo-only',
    path: `${prepared}/D16_pack.png`,
    declaration: gelatin,
    expect: 'unresolved',
    perception: read => read.manufacturer === null && read.certificate_number === null,
  },
  {
    id: 'A02-repack-sticker',
    path: `${prepared}/A02_pack.png`,
    declaration: { declared_name: 'tepung tapioka', variant: null },
    expect: 'unresolved',
    perception: read => read.repacked,
  },
  {
    id: 'A04-instruction-sticker',
    path: `${prepared}/A04_pack.png`,
    declaration: gelatin,
    expect: 'unresolved',
    perception: read => read.manufacturer === null && read.certificate_number === null,
  },
  {
    id: 'photo-versus-conflicting-typed-original',
    path: `${prepared}/D01_pack_pedas.png`,
    declaration: original,
    expect: 'unresolved',
    perception: read => read.variant?.toLowerCase() === 'pedas' && read.certificate_number === 'ID-SIM-0201',
    typed: exactOriginal,
  },
];

const model = createModel();
const results = await Promise.all(samples.map(async (sample) => {
  const started = performance.now();
  try {
    const case_id = randomUUID();
    const ingredient_id = randomUUID();
    const request_id = randomUUID();
    const observed = await model.readPack([{
      name: sample.path,
      mime: 'image/png',
      bytes: await readFile(sample.path),
    }]);
    const photo: Evidence = {
      case_id,
      revision: 1,
      ingredient_id,
      request_id,
      evidence_id: randomUUID(),
      source_type: 'photo',
      source_refs: [sample.path],
      observed,
      confirmed_current: true,
      conflicts: [],
    };
    const ingredient: Ingredient = {
      ...sample.declaration,
      ingredient_id,
      form: 'processed',
      pack_condition: 'sealed',
      source_refs: ['confirmed-matrix-declaration'],
      status: 'open',
      basis: '',
      evidence: [],
      requests: 1,
      pending_request: { request_id, attempt: 1 },
      conflict: false,
    };
    let verdict = checkEvidence(ingredient, photo, case_id, 1);
    const photoVerdict = verdict;
    if (sample.typed) {
      const recoveryRequest = randomUUID();
      ingredient.evidence.push({ ...photo, conflicts: [photoVerdict.reason] });
      ingredient.conflict = photoVerdict.status !== 'verified';
      ingredient.requests = 2;
      ingredient.pending_request = { request_id: recoveryRequest, attempt: 2 };
      verdict = checkEvidence(ingredient, {
        ...photo,
        evidence_id: randomUUID(),
        request_id: recoveryRequest,
        observed: sample.typed,
        source_type: 'seller-typed',
        source_refs: ['matrix-conflicting-typed-entry'],
      }, case_id, 1);
    }
    const perceptionPassed = sample.perception(observed);
    const unsafeAcceptance = sample.expect === 'unresolved' &&
      (verdict.status === 'verified' || photoVerdict.status === 'verified');
    return {
      id: sample.id,
      image: sample.path,
      duration_ms: Math.round(performance.now() - started),
      source_mode: sample.typed ? 'actual_image_then_seller_typed' : 'actual_image',
      observed,
      photo_verdict: photoVerdict.reason,
      expected: sample.expect,
      status: verdict.status,
      reason: verdict.reason,
      perception_passed: perceptionPassed,
      unsafe_acceptance: unsafeAcceptance,
      false_refusal: sample.expect === 'verified' && verdict.status !== 'verified',
      pass: perceptionPassed && verdict.status === sample.expect && !unsafeAcceptance,
    };
  } catch (error) {
    const apiError = error as { name?: string; status?: number; code?: string };
    return {
      id: sample.id,
      duration_ms: Math.round(performance.now() - started),
      error: { name: apiError.name, status: apiError.status, code: apiError.code },
      pass: false,
    };
  }
}));

const passed = results.filter(result => result.pass).length;
console.log(JSON.stringify({
  model: process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini',
  attempted: samples.length,
  passed,
  technical_failures: results.filter(result => 'error' in result).length,
  unsafe_acceptances: results.filter(result => result.unsafe_acceptance).length,
  false_refusals: results.filter(result => result.false_refusal).length,
  results,
}, null, 2));
if (passed !== samples.length) process.exitCode = 1;
