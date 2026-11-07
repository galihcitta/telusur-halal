import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { CaseEvent, EventType } from '../src/contracts.js';
import { gradeD01, scoreIntake } from '../src/grader.js';

test('intake scorer uses identity before variant, independent of order', () => {
  const score = scoreIntake([
    { key: 'banana', aliases: ['Pisang', 'Pisang Kepok'] },
    { key: 'seasoning', aliases: ['Bumbu Balado'], variant: 'Original' },
    { key: 'oil', aliases: ['Minyak Goreng Sentosa'] },
  ], [
    { declared_name: 'bumbu balado', variant: 'Pedas' },
    { declared_name: '  Pisang   Kepok ' },
    { declared_name: 'garam' },
  ]);
  assert.deepEqual(score.matches, [
    { key: 'banana', index: 1, variant_correct: true },
    { key: 'seasoning', index: 0, variant_correct: false },
  ]);
  assert.deepEqual(score.omissions, ['oil']);
  assert.deepEqual(score.additions, [2]);
});

test('intake scorer reports aliases with collisions and duplicates without assigning both rows', () => {
  const score = scoreIntake([
    { key: 'A', aliases: ['foo', 'ambiguous'] },
    { key: 'B', aliases: ['ambiguous'] },
  ], [{ declared_name: 'foo' }, { declared_name: 'foo' }, { declared_name: 'ambiguous' }]);
  assert.deepEqual(score.matches, []);
  assert.deepEqual(score.duplicates, { A: [0, 1] });
  assert.deepEqual(score.ambiguous, [2]);
});

function fixture() {
  const case_id = randomUUID();
  const [banana, oil, seasoning, chili, proposal] = Array.from({ length: 5 }, () => randomUUID());
  const events: CaseEvent[] = [];
  const add = (type: EventType, data: Record<string, unknown> = {}) => events.push({
    seq: events.length + 1, timestamp: new Date().toISOString(), case_id, revision: 1, type,
    data: { summary: type, ...data },
  });
  const verdict = (ingredient_id: string, status: string, reason: string, source_refs: string[]) =>
    add('evidence_checked', { ingredient_id, status, reason, source_refs });
  const ask = (ingredient_id: string, request_id: string, attempt: number) =>
    add('pack_requested', { ingredient_id, request_id, attempt });
  const read = (ingredient_id: string, request_id: string, ref: string) => {
    const data = { ingredient_id, request_id, input_mode: 'fixture', source_refs: [ref] };
    add('pack_received', data);
    add('pack_read', data);
  };
  const oilRefs = ['sha256:oil', 'registry#R-101'];
  const seasoningRefs = ['sha256:original', 'registry#R-202'];
  add('intake_parsed', { input_mode: 'fixture', source_refs: ['sha256:audio', 'sha256:label'] });
  add('intake_confirmed', { ingredient_ids: [banana, oil, seasoning, chili] });
  verdict(banana, 'exempt', 'EXEMPT_CONDITIONS', ['exemption']);
  ask(oil, 'oil1', 1);
  ask(seasoning, 'season1', 1);
  verdict(chili, 'unresolved', 'NO_PACK', ['intake']);
  read(oil, 'oil1', 'sha256:oil');
  verdict(oil, 'verified', 'EXACT_IDENTITY', oilRefs);
  read(seasoning, 'season1', 'sha256:pedas');
  verdict(seasoning, 'unresolved', 'IDENTITY_MISMATCH', ['sha256:pedas']);
  ask(seasoning, 'season2', 2);
  read(seasoning, 'season2', 'sha256:original');
  verdict(seasoning, 'verified', 'EXACT_IDENTITY', seasoningRefs);
  add('catalogue_searched', { ingredient_id: chili, searched: true, excluded: [{ listing_id: 'L-10' }] });
  add('substitute_proposed', { ingredient_id: chili, proposal_id: proposal, listing_id: 'L-9' });
  add('seller_decided', { ingredient_id: chili, proposal_id: proposal, decision: 'approve', authority: 'seller_session' });
  add('packet_exported', { evidence_complete: false });
  const trace = { case_id, revision: 1, events };
  const packet = {
    case_id, revision: 1, source_mode: 'fixture', dataset_version: 'frozen-fixture', evidence_complete: false,
    current_ingredients: [
      { ingredient_id: chili, ingredient: 'Cabai Bubuk', status: 'unresolved', source_refs: ['intake'] },
      { ingredient_id: oil, ingredient: 'Minyak Goreng Sentosa', variant: null, status: 'verified', source_refs: oilRefs },
      { ingredient_id: seasoning, ingredient: 'Bumbu Balado', variant: 'Original', status: 'verified', source_refs: seasoningRefs },
      { ingredient_id: banana, ingredient: 'Pisang Kepok', status: 'exempt', source_refs: ['exemption'] },
    ],
    unresolved_items: [{ ingredient_id: chili }],
    conditional_proposals: [{
      proposal_id: proposal, ingredient_id: chili, status: 'approved', adoption: 'pending',
      listing: { listing_id: 'L-9', price_idr: 18500 },
      registry: { record_id: 'R-301', certificate_number: 'ID-SIM-0301' },
    }],
    facilitator_checklist: ['Review unresolved items.'],
  };
  return { trace, packet, events };
}

test('frozen D01 fixture passes only its explicitly labelled test layer', () => {
  const { trace, packet } = fixture();
  const grade = gradeD01(trace, packet, 'fixture');
  assert.deepEqual(grade.failures, []);
  assert.equal(grade.passed, true);
  assert.equal(gradeD01(trace, packet).passed, false);
});

test('grader catches duplicate approvals, false evidence completion and replaced current ingredients', () => {
  const { trace, packet, events } = fixture();
  packet.evidence_complete = true;
  packet.current_ingredients[0].ingredient = 'Cabai Bubuk Halal';
  const decision = events.find(event => event.type === 'seller_decided')!;
  events.splice(-1, 0, { ...decision, seq: events.length });
  events.at(-1)!.seq = events.length;
  const grade = gradeD01(trace, packet, 'fixture');
  assert.equal(grade.passed, false);
  assert(grade.failures.some(message => message.includes('duplicate decision')));
  assert(grade.failures.some(message => message.includes('False evidence_complete')));
  assert(grade.failures.some(message => message.includes('four confirmed D01 ingredients')));
});

test('grader catches missing pack provenance and non-seller approval', () => {
  const { trace, packet, events } = fixture();
  events.find(event => event.type === 'seller_decided')!.data.authority = 'model';
  events.find(event => event.type === 'pack_read')!.data.input_mode = 'typed';
  const grade = gradeD01(trace, packet, 'fixture');
  assert.equal(grade.passed, false);
  assert(grade.failures.some(message => message.includes('unauthorized')));
  assert(grade.failures.some(message => message.includes('Oil requires a current pack read')));
});
