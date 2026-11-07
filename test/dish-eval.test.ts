import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dishEvalManifest, evaluateDishes, scoreDish } from '../src/dish-eval.js';

const manifestPath = 'datasets/dish-photos/manifest.json';
const manifest = dishEvalManifest.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
const rice = manifest.cases[0];

test('dish evaluator matches reordered aliases and does not require hidden recipe ingredients', () => {
  const sample = { ...rice, recipe_reference: { source: 'seller test recipe', ingredients: ['nasi', 'minyak goreng', 'garam'] } };
  const score = scoreDish(sample, { dish: ' NASI   GORENG ', visible_ingredients: ['telur ceplok', 'ketimun', 'kerupuk', 'nasi'] });
  assert.equal(score.passed, true);
  assert.equal(score.precision, 1);
  assert.equal(score.recall, 1);
  assert.deepEqual(score.missing, []);
});

test('dish evaluator penalizes hallucinations, duplicates, omissions and wrong food names separately', () => {
  const score = scoreDish(rice, { dish: 'mie goreng', visible_ingredients: ['nasi', 'nasi putih', 'minyak goreng', 'ayam'] });
  assert.equal(score.passed, false);
  assert.equal(score.recognized, false);
  assert.deepEqual(score.duplicates, ['nasi putih']);
  assert.deepEqual(score.unsupported, ['minyak goreng', 'ayam']);
  assert.deepEqual(score.forbidden, ['minyak goreng']);
  assert.deepEqual(score.missing, ['egg', 'cucumber', 'cracker']);
  assert.equal(score.precision, 0.25);
  assert.equal(score.recall, 0.25);
});

test('optional visible ingredients neither require recall nor permit duplicate credit', () => {
  const base = ['nasi', 'telur', 'timun', 'kerupuk'];
  assert.equal(scoreDish(rice, { dish: 'nasi goreng', visible_ingredients: [...base, 'bawang goreng'] }).passed, true);
  const repeated = scoreDish(rice, { dish: 'nasi goreng', visible_ingredients: [...base, 'bawang goreng', 'bawang merah goreng'] });
  assert.equal(repeated.passed, false);
  assert.equal(repeated.precision, 5 / 6);
});

test('abstention passes negative images but cannot pass a known food image', () => {
  assert.equal(scoreDish(manifest.cases[3], null).passed, true);
  assert.equal(scoreDish(manifest.cases[3], { dish: 'pisang', visible_ingredients: [] }).passed, false);
  const missing = scoreDish(rice, null);
  assert.equal(missing.passed, false);
  assert.equal(missing.precision, null);
  assert.equal(missing.recall, 0);
});

test('manifest rejects ambiguous aliases, duplicate cases and empty gold', () => {
  const invalid = structuredClone(manifest);
  invalid.cases[0].optional_visible[0].aliases.push('nasi');
  assert.equal(dishEvalManifest.safeParse(invalid).success, false);
  assert.equal(dishEvalManifest.safeParse({ ...manifest, cases: [rice, rice] }).success, false);
  assert.equal(dishEvalManifest.safeParse({ ...manifest, cases: [{ ...rice, required_visible: [] }] }).success, false);
});

test('runner counts API failures and checksum failures in denominator and never sends gold', async () => {
  let calls = 0;
  const report = await evaluateDishes({ ...manifest, cases: [rice, { ...rice, id: 'bad-checksum', sha256: '0'.repeat(64) }] }, manifestPath, async media => {
    calls++;
    assert.deepEqual(Object.keys(media).sort(), ['bytes', 'mime', 'name']);
    assert.equal(media.name, 'dish-evaluation-image');
    throw new Error('Simulated API failure');
  });
  assert.equal(calls, 1);
  assert.equal(report.attempted, 2);
  assert.equal(report.technical_failures, 2);
  assert.equal(report.pass_rate, 0);
  assert.equal(report.recognition_rate, 0);
  assert.deepEqual(report.results.map(row => 'failure_stage' in row && row.failure_stage), ['model', 'asset']);
});

test('ambiguous food accepts safe abstention separately from correct identification', () => {
  const ambiguous = { ...rice, expected: 'ambiguous' as const };
  const abstained = scoreDish(ambiguous, null);
  assert.equal(abstained.passed, true);
  assert.equal(abstained.recognized, false);
  assert.equal(abstained.acceptable_abstention, true);
  assert.equal(abstained.recall, null);
  assert.equal(scoreDish(ambiguous, { dish: 'tempe mendoan', visible_ingredients: [] }).passed, false);
  assert.equal(scoreDish(ambiguous, { dish: 'nasi goreng', visible_ingredients: ['nasi', 'telur', 'timun', 'kerupuk'] }).passed, true);
  assert.equal(scoreDish(ambiguous, { dish: 'nasi goreng', visible_ingredients: ['nasi', 'minyak goreng'] }).passed, false);
});

test('independent evaluation requires explicit invocation and reviewed annotations', async () => {
  const { checkEvalReadiness } = await import('../src/dish-eval.js');
  assert.throws(() => checkEvalReadiness(manifest, { requireReviewed: true }), /human review/);
  assert.throws(() => checkEvalReadiness(manifest, { independent: true }), /Development/);
  const independent = { ...manifest, split: 'independent' as const };
  assert.throws(() => checkEvalReadiness(independent), /explicit/);
  assert.throws(() => checkEvalReadiness(independent, { independent: true }), /declared unseen/);
  const unseen = { ...independent, cases: independent.cases.map(sample => ({ ...sample, prior_exposure: 'unseen' as const })) };
  assert.throws(() => checkEvalReadiness(unseen, { independent: true }), /human review/);
  const reviewed = { ...unseen, cases: unseen.cases.map(sample => ({ ...sample, annotation: { ...sample.annotation, status: 'reviewed' as const } })) };
  assert.doesNotThrow(() => checkEvalReadiness(reviewed, { independent: true }));
});

test('report separates safe ambiguity, unnecessary abstention and false acceptance', async () => {
  const samples = [
    { ...rice, id: 'ambiguous', expected: 'ambiguous' as const },
    { ...rice, id: 'clear' },
    manifest.cases[3],
  ];
  let call = 0;
  const report = await evaluateDishes({ ...manifest, cases: samples }, manifestPath, async () =>
    ++call <= 2 ? null : { dish: 'tempe', visible_ingredients: [] });
  assert.equal(report.attempted, 3);
  assert.equal(report.acceptable_abstentions, 1);
  assert.equal(report.unnecessary_abstentions, 1);
  assert.equal(report.false_acceptances, 1);
  assert.equal(report.recognition_correct, 0);
  assert.equal(report.passed, 1);
  assert.equal(report.reviewed_cases, 0);
});
