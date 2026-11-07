import test from 'node:test';
import assert from 'node:assert/strict';
import type { Confirmation, Model } from '../src/contracts.js';
import { buildPacket, packetHtml } from '../src/packet.js';
import { CaseService } from '../src/service.js';

// Controlled service fixtures, not claims about the actual sale-pisang recipe or live-model accuracy.
const correction: Confirmation = {
  product_name: 'Sale Pisang', reviewed: true, scope: 'facilitator_review',
  ingredients: [{ declared_name: 'pisang', form: 'unknown', pack_condition: 'unknown' }],
};
async function setup(abstain = false) {
  let dishReads = 0;
  const model: Model = {
    intake: async () => { throw new Error('Audio is outside this fixture'); },
    readDish: async () => {
      dishReads++;
      return abstain ? null : { dish: 'Tempe mendoan', visible_ingredients: ['tempe', 'kedelai'] };
    },
    readPack: async () => { throw new Error('No package evidence supplied'); },
    choose: async ({ allowed }) => allowed[0],
  };
  const service = new CaseService(model, 'fixture');
  const created = await service.createFromDish({ bytes: Buffer.from('controlled-fixture'), mime: 'image/jpeg', name: 'fixture.jpg' });
  const read = () => service.read(created.case.case_id);
  const confirm = (input: Confirmation, session = created.session) => service.mutate(created.case.case_id, session, read().revision,
    entry => service.confirm(entry, input));
  return { service, created, read, confirm, reads: () => dishReads };
}
function assertCorrected(view: ReturnType<CaseService['read']>) {
  assert.equal(view.product_name, 'Sale Pisang');
  assert.deepEqual(view.ingredients.map(row => row.declared_name), ['pisang']);
  assert.equal(view.scope, 'facilitator_review');
  assert.ok(view.ingredients.every(row => row.status !== 'verified' && row.status !== 'exempt' && row.evidence.length === 0));
  const photoRefs = view.events.find(event => event.type === 'intake_parsed')!.data.source_refs as string[];
  assert.ok(view.ingredients.every(row => !row.source_refs.some(ref => photoRefs.includes(ref))));
  const packet = buildPacket(view);
  assert.equal(packet.evidence_complete, false);
  assert.deepEqual(packet.current_ingredients.map(row => row.ingredient), ['pisang']);
  assert.deepEqual(packet.conditional_proposals, []);
  const html = packetHtml(packet);
  assert.doesNotMatch(html, /tempe|kedelai/i);
  assert.match(html, /Sale Pisang/);
}

test('fixture: seller replaces the mistaken dish and ingredient list before confirmation', async () => {
  const { created, read, confirm, reads } = await setup();
  assert.equal(created.case.draft?.product_name, 'Tempe mendoan');
  assert.deepEqual(created.case.ingredients, []);
  assert.deepEqual(created.case.events.map(event => event.type), ['intake_parsed']);
  await assert.rejects(confirm(correction, 'foreign'), { status: 403 });
  assert.deepEqual(read().ingredients, []);
  await confirm(correction);
  assertCorrected(read());
  assert.equal(reads(), 1, 'Seller editing does not invoke a conversational correction model');
  assert.equal(read().draft?.product_name, 'Tempe mendoan', 'Original draft remains history, not current recipe');
});

test('fixture: later seller correction removes wrong current ingredients and invalidates stale requests', async () => {
  const { service, created, read, confirm } = await setup();
  await confirm({ ...correction, product_name: 'Tempe mendoan', ingredients: created.case.draft!.ingredients });
  const oldRevision = read().revision;
  const oldRequest = read().ingredients.find(row => row.pending_request)?.pending_request;
  assert.ok(oldRequest);
  await confirm(correction);
  assert.equal(read().revision, oldRevision + 1);
  assertCorrected(read());
  const snapshot = read();
  await assert.rejects(service.mutate(created.case.case_id, created.session, read().revision, entry => service.pack(entry, {
    request_id: oldRequest.request_id, condition: 'unknown', mode: 'no_pack', images: [], confirmed_current: false,
  })));
  assert.deepEqual(read(), snapshot);
});

test('fixture: an abstained image can be clarified through the seller editor without inventing hidden ingredients', async () => {
  const { created, read, confirm, reads } = await setup(true);
  assert.equal(created.case.draft?.product_name, '');
  assert.deepEqual(created.case.draft?.ingredients, []);
  await confirm(correction);
  assertCorrected(read());
  assert.equal(reads(), 1);
});
