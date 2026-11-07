import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { Model } from './contracts.js';

const text = z.string().trim().min(1);
const ingredient = z.object({ key: text, aliases: z.array(text).min(1) });
const normalize = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
export const dishEvalManifest = z.object({
  version: text,
  split: z.literal('development'),
  cases: z.array(z.object({
    id: text,
    image: text,
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    provenance: z.object({
      kind: z.enum(['team_photo', 'public_photo', 'synthetic']),
      source: text, attribution: text, license: text,
    }),
    annotation: z.object({ status: z.enum(['draft', 'reviewed']), reviewer: text, basis: text }),
    expected: z.enum(['dish', 'reject']),
    dish_aliases: z.array(text),
    required_visible: z.array(ingredient),
    optional_visible: z.array(ingredient),
    must_not_infer: z.array(ingredient),
    // Context for evaluators only. Never sent to vision or scored as visible gold.
    recipe_reference: z.object({ source: text, ingredients: z.array(text).min(1) }).nullable(),
  })).min(1),
}).superRefine((manifest, ctx) => {
  const ids = new Set<string>();
  manifest.cases.forEach((sample, index) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', path: ['cases', index], message });
    if (ids.has(sample.id)) fail('Duplicate case ID');
    ids.add(sample.id);
    if (sample.expected === 'dish' && (!sample.dish_aliases.length || !sample.required_visible.length)) fail('Dish cases need dish aliases and visible gold');
    if (sample.expected === 'reject' && (sample.dish_aliases.length || sample.required_visible.length || sample.optional_visible.length)) fail('Rejection cases cannot have positive gold');
    const keys = new Set<string>();
    const aliases = new Set<string>();
    for (const item of [...sample.required_visible, ...sample.optional_visible, ...sample.must_not_infer]) {
      if (keys.has(item.key)) fail('Duplicate ingredient key: ' + item.key);
      keys.add(item.key);
      for (const alias of item.aliases) {
        const key = normalize(alias);
        if (aliases.has(key)) fail('Ambiguous or duplicate alias: ' + alias);
        aliases.add(key);
      }
    }
  });
});
export type DishEvalCase = z.infer<typeof dishEvalManifest>['cases'][number];
export type DishPrediction = Awaited<ReturnType<Model['readDish']>>;

export function scoreDish(sample: DishEvalCase, prediction: DishPrediction) {
  const actual = prediction?.visible_ingredients ?? [];
  const allowed = [...sample.required_visible, ...sample.optional_visible];
  const seen = new Set<string>();
  const matched: string[] = [];
  const unsupported: string[] = [];
  const duplicates: string[] = [];
  const forbidden: string[] = [];
  for (const name of actual) {
    const value = normalize(name);
    const item = allowed.find(row => row.aliases.some(alias => normalize(alias) === value));
    const identity = item?.key ?? value;
    if (seen.has(identity)) duplicates.push(name);
    else if (item) matched.push(item.key);
    else unsupported.push(name);
    seen.add(identity);
    if (sample.must_not_infer.some(row => row.aliases.some(alias => normalize(alias) === value))) forbidden.push(name);
  }
  const missing = sample.required_visible.filter(row => !matched.includes(row.key)).map(row => row.key);
  const recognized = sample.expected === 'reject' ? prediction === null :
    prediction !== null && sample.dish_aliases.some(alias => normalize(alias) === normalize(prediction.dish));
  const correctRequired = sample.required_visible.length - missing.length;
  return {
    passed: recognized && missing.length === 0 && unsupported.length === 0 && duplicates.length === 0,
    recognized, matched, missing, unsupported, duplicates, forbidden,
    // Empty predictions must not earn perfect ingredient precision.
    precision: actual.length ? matched.length / actual.length : null,
    recall: sample.required_visible.length ? correctRequired / sample.required_visible.length : null,
  };
}

export async function loadDishAsset(sample: DishEvalCase, manifestPath: string) {
  const bytes = await readFile(resolve(dirname(manifestPath), sample.image));
  if (createHash('sha256').update(bytes).digest('hex') !== sample.sha256) throw new Error('Asset checksum mismatch');
  return { bytes, mime: sample.mime, name: 'dish-evaluation-image' };
}

export async function evaluateDishes(manifest: z.infer<typeof dishEvalManifest>, manifestPath: string, readDish: Model['readDish']) {
  type ResultBase = { id: string; provenance: DishEvalCase['provenance']['kind']; duration_ms: number };
  const results: Array<ResultBase & (
    (ReturnType<typeof scoreDish> & { prediction: DishPrediction }) |
    { passed: false; failure_stage: 'asset' | 'model' }
  )> = [];
  for (const sample of manifest.cases) {
    const started = performance.now();
    let stage: 'asset' | 'model' = 'asset';
    try {
      const media = await loadDishAsset(sample, manifestPath);
      stage = 'model';
      // Only image bytes and MIME are supplied. Gold, dish names and recipes stay outside the model input.
      const prediction = await readDish(media);
      results.push({ id: sample.id, provenance: sample.provenance.kind, prediction,
        ...scoreDish(sample, prediction), duration_ms: Math.round(performance.now() - started) });
    } catch {
      results.push({ id: sample.id, provenance: sample.provenance.kind, passed: false,
        failure_stage: stage, duration_ms: Math.round(performance.now() - started) });
    }
  }
  return {
    attempted: manifest.cases.length,
    annotations_pending_review: manifest.cases.filter(sample => sample.annotation.status === 'draft').length,
    recognition_correct: results.filter(result => 'recognized' in result && result.recognized).length,
    recognition_rate: results.filter(result => 'recognized' in result && result.recognized).length / manifest.cases.length,
    completed: results.filter(result => !('failure_stage' in result)).length,
    technical_failures: results.filter(result => 'failure_stage' in result).length,
    passed: results.filter(result => result.passed).length,
    pass_rate: results.filter(result => result.passed).length / manifest.cases.length,
    // Keep synthetic and real media denominators separate.
    by_provenance: Object.fromEntries(['synthetic', 'team_photo', 'public_photo'].map(kind => {
      const rows = results.filter(row => row.provenance === kind);
      return [kind, { attempted: rows.length, passed: rows.filter(row => row.passed).length }];
    })),
    results,
  };
}
