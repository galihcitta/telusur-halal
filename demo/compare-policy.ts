import { readdir, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { parse } from 'yaml';
import { z } from 'zod';
import type { CaseView, IngredientInput, Media, Model, Observation, Status } from '../src/contracts.js';
import { createModel } from '../src/model.js';
import { buildPacket } from '../src/packet.js';
import { CaseService, type PackAnswer } from '../src/service.js';

const source = 'datasets/pack-photos/repo/evals/scenarios';
const legacyPack = z.object({ product: z.string(), producer: z.string(), cert_no: z.string() });
const prepared = z.object({
  id: z.string(),
  product: z.string(),
  ingredients: z.array(z.object({
    name: z.string(),
    form: z.enum(['fresh', 'processed', 'unknown']).optional(),
    brand: z.string().optional(),
    variant: z.string().optional(),
    supplier: z.object({ name: z.string().optional(), pack: z.unknown().optional() }).optional(),
  })).min(1),
});
type Scenario = z.infer<typeof prepared>;
type Expected = { name: string; status: Status; packBudget: number; registry?: string };
const gold: Partial<Record<string, Expected[]>> = {
  D01: [
    { name: 'pisang kepok', status: 'exempt', packBudget: 0 },
    { name: 'minyak goreng', status: 'verified', packBudget: 1, registry: 'R-101' },
    { name: 'bumbu balado', status: 'verified', packBudget: 2, registry: 'R-202' },
    { name: 'cabai bubuk', status: 'unresolved', packBudget: 0 },
  ],
  D02: [
    { name: 'pisang kepok', status: 'exempt', packBudget: 0 },
    { name: 'minyak goreng', status: 'unresolved', packBudget: 1 },
    { name: 'tepung terigu', status: 'unresolved', packBudget: 1 },
  ],
  D20: [
    { name: 'pisang kepok', status: 'exempt', packBudget: 0 },
    { name: 'minyak goreng', status: 'unresolved', packBudget: 1 },
    { name: 'coklat compound', status: 'verified', packBudget: 1, registry: 'R-403' },
  ],
};
const supported = new Set(['D01', 'D02', 'D20']);
const sentosa: Observation = {
  product: 'Minyak Goreng Sentosa', manufacturer: 'PT Minyak Sentosa', variant: null,
  variant_known: true, certificate_number: 'ID-SIM-0101', certificate_state: 'printed',
  repacked: false, unreadable_fields: [],
};

function sellerRecipe(scenario: Scenario): IngredientInput[] {
  return scenario.ingredients.map(item => ({
    declared_name: item.name, form: item.form ?? 'unknown', brand: item.brand,
    variant: item.variant ?? (item.name === 'minyak goreng' ? null : undefined),
    purchase_location: item.supplier?.name,
    no_additives: supported.has(scenario.id) && item.name === 'pisang kepok' ? true : undefined,
    pack_condition: scenario.id === 'D01' && item.name === 'cabai bubuk' ? 'loose' : 'unknown',
  }));
}

function observations(scenario: Scenario, item: Scenario['ingredients'][number]): Observation[] {
  if (scenario.id === 'D01' && item.name === 'minyak goreng') return [sentosa];
  if (!supported.has(scenario.id)) return [];
  const pack = z.object({
    first: legacyPack.optional(), on_reask: legacyPack.optional(),
  }).optional().parse(item.supplier?.pack);
  return [pack?.first, pack?.on_reask].flatMap(entry => {
    if (!entry) return [];
    // Explicit fixture adapter. The wrong D01 variant belongs to its supplied
    // observation, independently of the Original recipe declaration.
    const variant = scenario.id === 'D01' && entry === pack?.first ? 'Pedas' : item.variant ?? null;
    return [{
      product: entry.product, manufacturer: entry.producer, variant, variant_known: true,
      certificate_number: entry.cert_no, certificate_state: 'printed',
      repacked: false, unreadable_fields: [],
    }];
  });
}

function fixtureBytes(value: string): Media {
  return { name: 'structured-fixture', mime: 'application/octet-stream', bytes: Buffer.from(value) };
}

type Choice = Parameters<Model['choose']>[0];
const scripted: Model['choose'] = async ({ allowed, reason }) => {
  if (allowed.includes('request_pack')) return 'request_pack';
  if (allowed.includes('search_catalogue') && (reason === 'NO_PACK' || !allowed.includes('refer'))) {
    return 'search_catalogue';
  }
  if (allowed.includes('refer')) return 'refer';
  throw new Error('Scripted policy has no permitted action.');
};

function evaluate(scenario: Scenario, view: CaseView) {
  const expected = gold[scenario.id] ?? scenario.ingredients.map(item => ({
    name: item.name, status: 'unresolved' as const, packBudget: 0, registry: undefined,
  }));
  const packet = buildPacket(view);
  const failures: string[] = [];
  let unnecessaryPackRequests = 0;
  let unsafeAcceptances = 0;
  const supportedCase = supported.has(scenario.id);
  if (view.ingredients.length !== expected.length) failures.push('Ingredient count changed.');
  if (view.phase !== 'review_packet') failures.push('Did not reach packet review.');
  if (supportedCase ? view.scope !== 'snack' : view.scope !== 'facilitator_review') failures.push('Wrong scope routing.');
  for (const requirement of expected) {
    const ingredient = view.ingredients.find(row => row.declared_name === requirement.name);
    if (!ingredient) {
      failures.push('Missing ' + requirement.name);
      continue;
    }
    const events = view.events.filter(event => event.data.ingredient_id === ingredient.ingredient_id);
    const checked = events.filter(event => event.type === 'evidence_checked');
    const positive = checked.filter(event => event.data.status === 'verified' || event.data.status === 'exempt');
    const allowedPositive = requirement.status === 'verified' || requirement.status === 'exempt';
    const final = checked.at(-1);
    if (ingredient.status !== requirement.status) failures.push('Wrong verdict for ' + requirement.name);
    if (!supportedCase && final?.data.reason !== 'SCOPE_REVIEW') failures.push('Missing scope reason for ' + requirement.name);
    if (allowedPositive && positive.length !== 1) failures.push('Missing or repeated positive verdict for ' + requirement.name);
    for (const event of positive) {
      const citesExpected = !requirement.registry || Array.isArray(event.data.source_refs) &&
        event.data.source_refs.some(ref => typeof ref === 'string' && ref.endsWith('#' + requirement.registry));
      if (!allowedPositive || event.data.status !== requirement.status || !citesExpected ||
          (requirement.registry && event.seq !== final?.seq)) unsafeAcceptances++;
    }
    const requests = events.filter(event => event.type === 'pack_requested');
    unnecessaryPackRequests += Math.max(0, requests.length - requirement.packBudget);
    if (scenario.id === 'D01' && requirement.name === 'bumbu balado') {
      const refusal = checked.find(event => event.data.reason === 'IDENTITY_MISMATCH' && event.data.status === 'unresolved');
      if (!refusal || requests.length !== 2 || refusal.seq >= requests[1].seq) {
        failures.push('Missing wrong-variant refusal and bounded recovery.');
      }
    }
  }
  // D20 has no current oil-pack response in the snapshot. No in-scope case in
  // this comparison has complete evidence under v8.
  const falseComplete = packet.evidence_complete;
  const approved = packet.conditional_proposals.filter(row => row.status === 'approved');
  const d01Approved = scenario.id === 'D01' && approved.length === 1 &&
    approved[0].listing.listing_id === 'L-9' && approved[0].registry.record_id === 'R-301' &&
    approved[0].listing.price_idr === 18500;
  const needlessSwaps = view.proposals.length - (d01Approved ? 1 : 0);
  if (scenario.id === 'D01' && !d01Approved) failures.push('Expected one separately approved L-9 conditional plan.');
  if (falseComplete) failures.push('False evidence_complete.');
  if (unsafeAcceptances) failures.push('Unsafe positive verdict.');
  if (unnecessaryPackRequests) failures.push('Unnecessary pack requests.');
  if (needlessSwaps) failures.push('Unexpected proposal.');
  const actionEvents = view.events.filter(event => event.type === 'agent_action').length;
  if (!supportedCase && actionEvents) failures.push('Out-of-scope case invoked the agent.');
  return {
    failures, unsafeAcceptances, unnecessaryPackRequests, needlessSwaps, actionEvents, falseComplete,
    approved: approved.length,
    eligibleGaps: new Set(view.events.flatMap(event => event.type === 'catalogue_searched' &&
      Array.isArray(event.data.eligible) && event.data.eligible.length > 0 ? [event.data.ingredient_id] : [])).size,
  };
}

const live = createModel();

async function run(scenario: Scenario, policy: 'model' | 'scripted') {
  const started = performance.now();
  const calls: (Choice & { selected?: string })[] = [];
  const delays: number[] = [];
  const recipe = sellerRecipe(scenario);
  const reads = new Map<string, Observation>();
  const scope = supported.has(scenario.id) ? 'snack' : 'facilitator_review';
  const store = new CaseService({
    intake: async () => ({ product_name: scenario.product, scope, ingredients: recipe, notes: [], transcript: '' }),
    readPack: async ([input]) => {
      const observed = reads.get(input?.bytes.toString() ?? '');
      if (!observed) throw new Error('No declared oracle observation for this input.');
      return observed;
    },
    choose: async input => {
      const call: Choice & { selected?: string } = { ...input };
      calls.push(call);
      const before = performance.now();
      try {
        call.selected = await (policy === 'model' ? live.choose(input) : scripted(input));
        return call.selected as Awaited<ReturnType<Model['choose']>>;
      } finally { delays.push(Math.round(performance.now() - before)); }
    },
  }, 'fixture');
  let technicalFailure = false;
  try {
    const { case: created, session } = await store.create(fixtureBytes('audio'), fixtureBytes('label'));
    const read = () => store.read(created.case_id);
    const mutate = <T>(operation: Parameters<typeof store.mutate<T>>[3]) =>
      store.mutate(created.case_id, session, read().revision, operation);
    await mutate(entry => store.confirm(entry, { product_name: scenario.product, scope, ingredients: recipe, reviewed: true }));
    for (let step = 0; step < 42; step++) {
      const view = read();
      if (view.phase === 'paused') {
        technicalFailure = true;
        break;
      }
      const row = view.ingredients.find(item => item.pending_request);
      if (row?.pending_request) {
        const original = scenario.ingredients.find(item => item.name === row.declared_name);
        const observed = original && observations(scenario, original)[row.pending_request.attempt - 1];
        const answer: PackAnswer = {
          request_id: row.pending_request.request_id,
          mode: observed ? 'photo' : 'no_pack', condition: observed ? 'sealed' : 'unknown',
          confirmed_current: !!observed, images: [],
        };
        if (observed) {
          reads.set(answer.request_id, observed);
          answer.images = [fixtureBytes(answer.request_id)];
        }
        await mutate(entry => store.pack(entry, answer));
        continue;
      }
      const proposal = view.proposals.find(item => item.status === 'pending');
      if (proposal) {
        await mutate(entry => store.decide(entry, proposal.proposal_id, 'approve'));
        continue;
      }
      break;
    }
    const result = evaluate(scenario, read());
    return {
      id: scenario.id, policy, scope, case_type: supported.has(scenario.id) ? 'action_probe' : 'scope_guard',
      duration_ms: Math.round(performance.now() - started),
      calls, action_latency_ms: delays, technicalFailure, ...result,
      pass: !technicalFailure && !result.failures.length,
    };
  } catch (error) {
    return {
      id: scenario.id, policy, scope, case_type: supported.has(scenario.id) ? 'action_probe' : 'scope_guard',
      duration_ms: Math.round(performance.now() - started), calls, action_latency_ms: delays,
      technicalFailure: true, failures: [error instanceof Error ? error.name : 'Unexpected error'],
      unsafeAcceptances: 0, unnecessaryPackRequests: 0, needlessSwaps: 0, actionEvents: 0,
      falseComplete: false, approved: 0, eligibleGaps: 0, pass: false,
    };
  }
}

const expectedIds = new Set([
  ...Array.from({ length: 21 }, (_, index) => 'D' + String(index + 1).padStart(2, '0')),
  ...Array.from({ length: 9 }, (_, index) => 'A' + String(index + 1).padStart(2, '0')),
]);
const loaded = await Promise.all(['dev', 'adv'].map(async group => {
  const folder = source + '/' + group;
  const files = (await readdir(folder)).filter(name => name.endsWith('.yaml'));
  return Promise.all(files.map(async file => {
    try {
      return { scenario: prepared.parse(parse(await readFile(folder + '/' + file, 'utf8'))) };
    } catch {
      return { error: group + '/' + file };
    }
  }));
}));
const entries = loaded.flat();
const scenarios = entries.flatMap(row => row.scenario ? [row.scenario] : []);
const invalid = entries.flatMap(row => row.error ? [row.error] : []);
const seen = new Set(scenarios.map(row => row.id));
const missing = [...expectedIds].filter(id => !seen.has(id));
const duplicateOrExtra = scenarios.length !== seen.size || [...seen].some(id => !expectedIds.has(id));
const actionScenarios = scenarios.filter(scenario => supported.has(scenario.id));
const results = (await Promise.all(actionScenarios.map(async scenario =>
  Promise.all([run(scenario, 'model'), run(scenario, 'scripted')])))).flat();
const comparison = (['model', 'scripted'] as const).map(policy => {
  const rows = results.filter(result => result.policy === policy);
  const sum = (key: 'unsafeAcceptances' | 'unnecessaryPackRequests' | 'needlessSwaps' | 'approved' | 'eligibleGaps') =>
    rows.reduce((total, row) => total + row[key], 0);
  return {
    policy, denominator: supported.size, attempted: rows.length,
    passed: rows.filter(row => row.pass).length,
    technical_failures: rows.filter(row => row.technicalFailure).length + invalid.length,
    action_probes: rows.filter(row => row.case_type === 'action_probe').length,
    scope_guards: rows.filter(row => row.case_type === 'scope_guard').length,
    model_or_script_calls: rows.reduce((total, row) => total + row.calls.length, 0),
    unsafe_acceptances: sum('unsafeAcceptances'), false_complete: rows.filter(row => row.falseComplete).length,
    unnecessary_pack_requests: sum('unnecessaryPackRequests'), needless_swaps: sum('needlessSwaps'),
    approvals: sum('approved'), eligible_gaps: sum('eligibleGaps'),
    workflow_failures: rows.filter(row => !row.pass && !row.technicalFailure).length,
  };
});
console.log(JSON.stringify({
  evaluation: 'v8 structured case fixtures, legacy single-action Responses workflow vs scripted baseline, k=1 per policy',
  model: process.env.OPENAI_AGENT_MODEL || 'gpt-4.1-mini',
  scope: 'Three action probes with explicit expectations per policy. Historical whole-recipe scope guards are excluded.',
  media: 'Oracle observations; no transcription or image perception measured.',
  domain_unvalidated: ['D11 tempe'],
  invalid, missing, duplicateOrExtra, comparison, results,
}, null, 2));
if (invalid.length || missing.length || duplicateOrExtra || results.some(row => !row.pass)) process.exitCode = 1;
