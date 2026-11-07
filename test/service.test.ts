import test from 'node:test';
import assert from 'node:assert/strict';
import { IntakeInputError, type Draft, type Media, type Model, type Observation } from '../src/contracts.js';
import type { WorkflowRunner } from '../src/orchestration.js';
import { buildPacket } from '../src/packet.js';
import { CaseService, type PackAnswer } from '../src/service.js';

const draft: Draft = {
  product_name: 'Keripik Pisang Original', scope: 'snack', notes: [], transcript: 'Fixture',
  ingredients: [
    { declared_name: 'pisang kepok', form: 'fresh', pack_condition: 'loose', no_additives: true },
    { declared_name: 'bumbu balado', form: 'processed', pack_condition: 'sealed', variant: 'Original' },
    { declared_name: 'cabai bubuk', form: 'processed', pack_condition: 'loose' },
  ],
};
const correct: Observation = {
  product: 'Bumbu Balado Original', manufacturer: 'CV Rasa Nusantara', variant: 'Original', variant_known: true,
  certificate_number: 'ID-SIM-0202', certificate_state: 'printed', repacked: false, unreadable_fields: [],
};
const wrong = { ...correct, product: 'Bumbu Balado Pedas', variant: 'Pedas', certificate_number: 'ID-SIM-0201' };
const media = (name: string): Media => ({ bytes: Buffer.from(name), mime: 'image/png', name });

async function setup(overrides: Partial<Model> = {}, scope: Draft['scope'] = 'snack', workflow?: WorkflowRunner) {
  const service = new CaseService({
    intake: async () => ({ ...draft, scope }),
    choose: async ({ allowed }) => allowed[0],
    readPack: async ([file]) => file.name === 'wrong' ? wrong : correct,
    ...overrides,
  }, 'fixture', workflow);
  const created = await service.create(media('audio'), media('label'));
  const id = created.case.case_id;
  const session = created.session;
  const read = () => service.read(id);
  const confirm = () => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', ingredients: read().draft!.ingredients, reviewed: true,
  }));
  const answer = (name: string, options: Partial<PackAnswer> = {}) =>
    service.mutate(id, session, read().revision, entry => service.pack(entry, {
      request_id: read().ingredients[1].pending_request!.request_id,
      condition: 'sealed', mode: 'photo', confirmed_current: true, images: [media(name)], ...options,
    }));
  const decide = (proposal_id: string, decision: 'approve' | 'decline', key = session, rev = read().revision) =>
    service.mutate(id, key, rev, entry => service.decide(entry, proposal_id, decision));
  await confirm();
  return { service, id, session, read, confirm, answer, decide };
}

test('wrong pack, confirmed corrected photo, explicit seller approval and separate packet rows', async () => {
  const { read, answer, decide } = await setup();
  assert.equal(read().ingredients[0].status, 'exempt');
  assert.equal(read().ingredients[2].status, 'unresolved');
  assert.equal(read().events.filter(event => event.type === 'pack_requested').length, 1);
  await answer('wrong');
  assert.equal(read().ingredients[1].conflict, true);
  assert.equal(read().ingredients[1].pending_request?.attempt, 2);
  await answer('correct');
  assert.equal(read().ingredients[1].status, 'verified');
  assert.equal(read().ingredients[1].evidence.length, 2);
  const id = read().proposals[0].proposal_id;
  await assert.rejects(decide(id, 'approve', 'foreign'), /Seller session/);
  await assert.rejects(decide(id, 'approve', undefined, 2), /Case changed/);
  assert.equal(read().proposals[0].status, 'pending');
  await decide(id, 'approve');
  await assert.rejects(decide(id, 'approve'), /no longer pending/);
  const packet = buildPacket(read());
  assert.equal(packet.evidence_complete, false);
  assert.equal(packet.current_ingredients[2].ingredient, 'cabai bubuk');
  assert.equal(packet.current_ingredients[2].status, 'unresolved');
  assert.equal(packet.conditional_proposals[0].adoption, 'pending');
  assert.equal(packet.conditional_proposals[0].listing.listing_id, 'L-9');
});

test('a typed answer cannot clear the earlier wrong-photo conflict', async () => {
  const { read, answer } = await setup();
  await answer('wrong');
  await answer('correct', { mode: 'typed', images: [], observed: correct });
  assert.equal(read().ingredients[1].status, 'unresolved');
  assert.equal(read().ingredients[1].conflict, true);
  assert.deepEqual(read().ingredients[1].evidence.map(item => item.source_type), ['photo', 'seller-typed']);
  assert.equal(read().ingredients[1].pending_request, undefined);
});

test('decline allows one different eligible proposal and no third offer', async () => {
  const { read, answer, decide } = await setup();
  await answer('correct');
  await decide(read().proposals[0].proposal_id, 'decline');
  assert.notEqual(read().proposals[0].listing.listing_id, read().proposals[1].listing.listing_id);
  await decide(read().proposals[1].proposal_id, 'decline');
  assert.equal(read().proposals.length, 2);
  assert.equal(read().phase, 'review_packet');
});

test('retry after vision failure preserves the same request and does not duplicate receipt', async () => {
  let attempts = 0;
  const { read, answer, id, service, session } = await setup({
    readPack: async () => { if (++attempts === 1) throw new Error('network'); return correct; },
  });
  const request = read().ingredients[1].pending_request;
  await answer('correct');
  assert.equal(read().phase, 'paused');
  assert.deepEqual(read().ingredients[1].pending_request, request);
  assert.equal(read().ingredients[1].status, 'open');
  await service.mutate(id, session, read().revision, entry => service.retry(entry));
  assert.equal(read().ingredients[1].status, 'verified');
  assert.equal(read().events.filter(event => event.type === 'pack_received').length, 1);
});

test('Pisang goreng Medan checks ingredients independently while referring rum', async () => {
  const { service, id, session, read } = await setup();
  const product_name = 'Pisang goreng Medan';
  await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name, scope: 'snack', reviewed: true,
    ingredients: [draft.ingredients[0], {
      declared_name: 'tepung terigu', variant: null, form: 'processed', pack_condition: 'sealed',
    }, { declared_name: 'rum', form: 'processed', pack_condition: 'sealed' }],
  }));
  const view = read();
  assert.equal(view.scope, 'facilitator_review');
  assert.equal(view.ingredients[0].status, 'exempt');
  assert.ok(view.ingredients[1].pending_request);
  assert.equal(view.ingredients[2].reason, 'SCOPE_REVIEW');
  assert.equal(view.ingredients[2].pending_request, undefined);
  assert.equal(buildPacket(view).evidence_complete, false);
});

test('an unfamiliar product name can retain its intake assessment', async () => {
  const product_name = 'Kue Apem Pasar';
  const { service, read } = await setup({ intake: async () => ({ ...draft, product_name }) });
  // setup confirms the default fixture name, so test a fresh, unedited intake.
  const created = await service.create(media('audio'), media('label'));
  await service.mutate(created.case.case_id, created.session, created.case.revision, entry => service.confirm(entry, {
    product_name, scope: 'snack', reviewed: true, ingredients: draft.ingredients,
  }));
  assert.equal(service.read(created.case.case_id).scope, 'snack');
  assert.equal(read().scope, 'facilitator_review');
});

test('a revised recipe invalidates old verdicts and proposals', async () => {
  const { read, answer, service, id, session, decide } = await setup();
  await answer('correct');
  const proposal = read().proposals[0];
  await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', ingredients: read().draft!.ingredients.map(row => ({ ...row, purchase_location: 'Toko baru' })), reviewed: true,
  }));
  assert.equal(read().revision, 2);
  assert.equal(read().ingredients[1].status, 'open');
  assert.equal(read().proposals.length, 0);
  await assert.rejects(decide(proposal.proposal_id, 'approve', undefined, 1), /Case changed/);
});

test('renaming a supported draft cannot carry its scope over to an unsupported product', async () => {
  const { read, service, id, session } = await setup();
  await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: 'Sosis ayam asap', scope: 'snack', ingredients: read().draft!.ingredients, reviewed: true,
  }));
  assert.equal(read().scope, 'facilitator_review');
  assert.equal(read().ingredients[0].status, 'exempt');
  assert.ok(read().ingredients[1].pending_request);
});

test('unreadable intake asks for replacement input instead of creating a paused case', async () => {
  const store = new CaseService({
    intake: async () => { throw new IntakeInputError('Ambil foto label yang lebih jelas.'); },
    choose: async ({ allowed }) => allowed[0],
    readPack: async () => correct,
  });
  await assert.rejects(store.create(media('audio'), media('label')), {
    status: 422, message: 'Ambil foto label yang lebih jelas.',
  });
});

test('removed repack survives whitespace and alias re-addition, but not a different ingredient', async () => {
  const { service, id, session, read, answer } = await setup({ readPack: async () => ({ ...correct, repacked: true }) });
  await answer('repacked');
  const originalId = read().ingredients[1].ingredient_id;
  const edit = (ingredients: typeof draft.ingredients) => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true, ingredients,
  }));
  const banana = read().ingredients[0];
  await edit([banana]);
  await edit([banana, { declared_name: ' BUMBU  BALADO ', variant: 'Original', form: 'processed', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  assert.equal(read().ingredients[1].status, 'unresolved');
  assert.equal(read().ingredients[1].pending_request, undefined);
  assert.equal(buildPacket(read()).evidence_complete, false);
  await assert.rejects(service.mutate(id, session, read().revision, entry => service.pack(entry, {
    request_id: originalId, condition: 'sealed', mode: 'typed', confirmed_current: true, observed: correct, images: [],
  })), /no longer pending/);
  await edit([banana, { declared_name: 'minyak goreng', brand: 'Sentosa', variant: null, form: 'processed', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'sealed');
  assert.equal(read().ingredients[1].evidence.length, 0);
  assert.equal(read().ingredients[1].pending_request?.attempt, 1);
  // Reusing a known draft ID for a genuinely different ingredient must also
  // avoid inheriting the old ingredient's history.
  await edit([banana, { ingredient_id: originalId, declared_name: 'tepung tapioka', variant: null, form: 'processed', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'sealed');
  assert.equal(read().ingredients[1].evidence.length, 0);
  await edit([banana]);
  await edit([banana, { ingredient_id: originalId, declared_name: 'bumbu balado', variant: 'Original', form: 'processed', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  assert.equal(buildPacket(read()).evidence_complete, false);
});

test('known oil repack survives one-edit alias replacement and subsequent re-addition', async () => {
  const { service, id, session, read } = await setup();
  const banana = read().ingredients[0];
  const edit = (ingredients: typeof draft.ingredients) => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true, ingredients,
  }));
  await edit([banana, { declared_name: 'minyak goreng', brand: 'Sentosa', variant: null, form: 'processed', pack_condition: 'repacked' }]);
  const original = read().ingredients[1];
  await edit([banana, { declared_name: 'Minyak  Goreng Sentosa', variant: null, form: 'processed', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  await edit([banana]);
  // An ID no longer present outside the draft may be rejected; re-add without it
  // must still retain the ingredient's known provenance.
  await edit([banana, { ...original, ingredient_id: undefined, pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].status, 'unresolved');
  assert.equal(buildPacket(read()).evidence_complete, false);
});

test('invalid pack bytes can be replaced on the same request without extra asks or decisions', async () => {
  const { PackInputError } = await import('../src/contracts.js');
  const { read, answer, decide } = await setup({
    readPack: async ([file]) => { if (file.name === 'corrupt') throw new PackInputError('Pilih foto lain.'); return correct; },
  });
  const pending = read().ingredients[1].pending_request;
  await answer('corrupt');
  assert.equal(read().phase, 'awaiting_seller');
  assert.equal(read().error, 'Pilih foto lain.');
  assert.deepEqual(read().ingredients[1].pending_request, pending);
  assert.equal(read().ingredients[1].evidence.length, 0);
  await answer('valid');
  assert.equal(read().error, undefined);
  assert.equal(read().ingredients[1].status, 'verified');
  assert.equal(read().ingredients[1].requests, 1);
  assert.equal(read().events.filter(event => event.type === 'pack_requested').length, 1);
  assert.equal(read().events.filter(event => event.type === 'pack_received').length, 1);
  assert.equal(read().events.filter(event => event.type === 'pack_read').length, 1);
  assert.equal(read().proposals.length, 1);
  await decide(read().proposals[0].proposal_id, 'approve');
  assert.equal(read().events.filter(event => event.type === 'seller_decided').length, 1);
  assert.equal(read().phase, 'review_packet');
  assert.equal(buildPacket(read()).evidence_complete, false);
});

test('Palmia saved BPJPH match records its full basis before reaching the exportable packet', async () => {
  const { service, id, session, read } = await setup();
  await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true,
    ingredients: [read().ingredients[0], {
      declared_name: 'Margarin Palmia Super Cake', brand: 'Palmia', variant: 'Super Cake',
      form: 'processed', pack_condition: 'sealed',
    }],
  }));
  const request = read().ingredients[1].pending_request!;
  await service.mutate(id, session, read().revision, entry => service.pack(entry, {
    request_id: request.request_id, mode: 'typed', images: [], condition: 'sealed', confirmed_current: true,
    observed: {
      product: 'Palmia Super Cake Margarin', manufacturer: 'PT Salim Ivomas Pratama Tbk',
      variant: null, variant_known: true, certificate_number: null, certificate_state: 'absent',
      repacked: false, unreadable_fields: [],
    },
  }));
  assert.equal(read().phase, 'review_packet');
  assert.equal(read().error, undefined);
  const row = read().ingredients[1];
  assert.equal(row.status, 'verified');
  assert.ok(row.basis.length > 250);
  const event = read().events.findLast(event => event.type === 'evidence_checked');
  assert.equal(event?.data.summary, row.basis);
  assert.equal(event?.data.ingredient_id, row.ingredient_id);
  assert.equal(read().events.some(event => event.type === 'case_paused'), false);
  const packet = buildPacket(read());
  assert.equal(packet.evidence_complete, true);
  assert.ok((packet.current_ingredients[1].source_refs as string[]).includes('https://bpjph.halal.go.id/cari/sertifikat?produk=margarin&page=13'));
});

test('unchanged confirmation preserves requests, verdicts and seller decisions', async () => {
  const { service, id, session, read, confirm, answer, decide } = await setup();
  const initial = structuredClone(read());
  await confirm();
  assert.deepEqual(read(), initial);
  await answer('correct');
  await decide(read().proposals[0].proposal_id, 'approve');
  const approved = structuredClone(read());
  await confirm();
  assert.deepEqual(read(), approved);
  await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: read().product_name, scope: read().scope, ingredients: [...read().ingredients].reverse(), reviewed: true,
  }));
  assert.deepEqual(read(), approved);
});

test('wrong-photo provenance survives removal and re-addition without renewing requests', async () => {
  const { service, id, session, read, answer } = await setup();
  await answer('wrong');
  const original = structuredClone(read().ingredients[1]);
  const banana = read().ingredients[0];
  const edit = (ingredients: typeof draft.ingredients) => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true, ingredients,
  }));
  await edit([banana]);
  await edit([banana, { ...original, ingredient_id: undefined, declared_name: 'Bumbu Balado Original' }]);
  const restored = read().ingredients[1];
  assert.equal(restored.conflict, true);
  assert.equal(restored.status, 'unresolved');
  assert.equal(restored.requests, 2);
  assert.equal(restored.pending_request, undefined);
  assert.deepEqual(restored.evidence, original.evidence);
  assert.ok(original.evidence[0].source_refs.every(ref => restored.source_refs.includes(ref)));
  await assert.rejects(service.mutate(id, session, read().revision, entry => service.pack(entry, {
    request_id: original.pending_request!.request_id, condition: 'sealed', mode: 'typed', observed: correct, images: [], confirmed_current: true,
  })), /no longer pending/);
  assert.equal(buildPacket(read()).evidence_complete, false);
  assert.equal(read().events.filter(event => event.type === 'pack_requested').length, 2);
});

test('full-name repack identity survives split variant but isolates distinct variants and brands', async () => {
  const { service, id, session, read } = await setup();
  const banana = read().ingredients[0];
  const edit = (rows: typeof draft.ingredients) => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true, ingredients: [banana, ...rows],
  }));
  const base = { declared_name: 'Bumbu Balado Original', form: 'processed' as const, pack_condition: 'repacked' as const };
  await edit([base]);
  await edit([]);
  await edit([{ ...base, declared_name: 'Bumbu Balado', variant: 'Original', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  await edit([{ ...base, declared_name: 'Bumbu Balado', variant: 'Pedas', brand: 'Rasa Nusantara', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'sealed');
  assert.equal(read().ingredients[1].requests, 1);
  await edit([{ ...base, brand: 'Rasa Nusantara' }]);
  await edit([{ ...base, brand: 'Dapur Minang', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'sealed');
  assert.equal(read().ingredients[1].requests, 1);
  await edit([{ ...base, declared_name: 'Bumbu Balado', variant: 'Original', brand: 'Rasa Nusantara', pack_condition: 'sealed' },
    { ...base, declared_name: 'Bumbu Balado', variant: 'Pedas', brand: 'Rasa Nusantara', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  assert.equal(read().ingredients[2].pack_condition, 'sealed');
});

test('real recipe edits retain lifetime request and proposal bounds and invalidate approvals', async () => {
  const { service, id, session, read, decide, answer } = await setup();
  const originalRequest = read().ingredients[1].pending_request!.request_id;
  const edit = (purchase_location: string) => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true, ingredients: read().ingredients.map(row => ({ ...row, purchase_location })),
  }));
  await edit('Toko kedua');
  assert.equal(read().revision, 2);
  assert.equal(read().ingredients[1].pending_request?.attempt, 2);
  await assert.rejects(service.mutate(id, session, read().revision, entry => service.pack(entry, {
    request_id: originalRequest, condition: 'sealed', mode: 'typed', observed: correct, images: [], confirmed_current: true,
  })), /no longer pending/);
  await answer('correct');
  const originalProposal = read().proposals[0].proposal_id;
  await edit('Toko ketiga');
  await assert.rejects(decide(originalProposal, 'approve'), /no longer pending/);
  await edit('Toko keempat');
  assert.equal(read().ingredients[1].pending_request, undefined);
  assert.equal(read().ingredients[1].requests, 2);
  assert.equal(read().events.filter(event => event.type === 'pack_requested').length, 2);
  const offers = read().events.filter(event => event.type === 'substitute_proposed' && event.data.ingredient_id === read().ingredients[2].ingredient_id);
  assert.equal(offers.length, 2);
});

test('explicit no-pack remains terminal after a recipe edit', async () => {
  const { service, id, session, read, answer } = await setup();
  await answer('correct', { mode: 'no_pack', images: [] });
  const count = read().events.filter(event => event.type === 'pack_requested').length;
  await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true, ingredients: read().ingredients.map(row => ({ ...row, purchase_location: 'Toko baru' })),
  }));
  assert.equal(read().ingredients[1].reason, 'NO_PACK');
  assert.equal(read().ingredients[1].pending_request, undefined);
  assert.equal(read().events.filter(event => event.type === 'pack_requested').length, count);
});

test('cached omitted-brand alias cannot bypass another known repack SKU', async () => {
  const { service, id, session, read } = await setup();
  const banana = read().ingredients[0];
  const edit = (brand: string | undefined, pack_condition: 'loose' | 'sealed' | 'repacked') => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true,
    ingredients: [banana, { declared_name: 'Bumbu Balado', variant: 'Original', brand, form: 'processed', pack_condition }],
  }));
  await edit('Rasa Nusantara', 'loose');
  await edit(undefined, 'loose');
  await edit('Dapur Minang', 'repacked');
  const before = structuredClone(read());
  await assert.rejects(edit(undefined, 'sealed'), /Specify.*brand and variant/);
  assert.deepEqual(read(), before);
  await assert.rejects(service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true,
    ingredients: [banana,
      { declared_name: 'Coklat Batang', variant: null, brand: 'PT Coklat Jaya', form: 'processed', pack_condition: 'repacked' },
      { declared_name: 'Bumbu Balado', variant: 'Original', form: 'processed', pack_condition: 'sealed' }],
  })), /Specify.*brand and variant/);
  // The first row of the rejected edit must not leave invisible history.
  for (const brand of ['CV Kakao Mandiri', undefined]) {
    await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
      product_name: draft.product_name, scope: 'snack', reviewed: true,
      ingredients: [banana, { declared_name: 'Coklat Batang', variant: null, brand, form: 'processed', pack_condition: 'sealed' }],
    }));
    assert.equal(read().ingredients[1].pack_condition, 'sealed');
  }
  await edit('Dapur Minang', 'sealed');
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  await edit('Rasa Nusantara', 'sealed');
  assert.equal(read().ingredients[1].pack_condition, 'sealed');
});

test('contradictory declaration edits cannot reuse a verified verdict as unchanged', async () => {
  const { service, id, session, read, answer } = await setup();
  await answer('correct');
  assert.equal(read().ingredients[1].status, 'verified');
  await service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true,
    ingredients: read().ingredients.map((row, index) => index === 1 ? { ...row, declared_name: 'Bumbu Balado Pedas' } : row),
  }));
  assert.equal(read().revision, 2);
  assert.notEqual(read().ingredients[1].status, 'verified');
});


test('unknown variant cannot split a known oil brand alias from its full product name', async () => {
  const { service, id, session, read } = await setup();
  const banana = read().ingredients[0];
  const edit = (ingredients: typeof draft.ingredients) => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true, ingredients: [banana, ...ingredients],
  }));
  await edit([{ declared_name: 'minyak goreng', form: 'processed', pack_condition: 'repacked' }]);
  await edit([{ declared_name: 'minyak goreng', brand: 'Sentosa', form: 'processed', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  await edit([]);
  await edit([{ declared_name: 'Minyak Goreng Sentosa', variant: null, form: 'processed', pack_condition: 'sealed' }]);
  assert.equal(read().ingredients[1].pack_condition, 'repacked');
  assert.equal(read().ingredients[1].pending_request, undefined);
  assert.equal(read().ingredients[1].status, 'unresolved');
  assert.equal(buildPacket(read()).evidence_complete, false);
});


test('unknown-to-known identity matrix preserves repack across supported names and brand omission', async () => {
  for (const [generic, full, brand] of [
    ['minyak goreng', 'Minyak Goreng Sentosa', 'Sentosa'],
    ['cabai bubuk', 'Cabai Bubuk Halal', 'Cabai Prima'],
  ]) {
    for (const variant of [undefined, null]) {
      const { service, id, session, read } = await setup();
      const banana = read().ingredients[0];
      const edit = (declared_name: string, brand: string | undefined, variant: null | undefined, pack_condition: 'repacked' | 'sealed') =>
        service.mutate(id, session, read().revision, entry => service.confirm(entry, {
          product_name: draft.product_name, scope: 'snack', reviewed: true,
          ingredients: [banana, { declared_name, brand, variant, form: 'processed', pack_condition }],
        }));
      await edit(generic, undefined, variant, 'repacked');
      await edit(generic, brand, undefined, 'sealed');
      assert.equal(read().ingredients[1].pack_condition, 'repacked');
      await edit(full, undefined, null, 'sealed');
      assert.equal(read().ingredients[1].pack_condition, 'repacked');
      await edit(generic, undefined, undefined, 'sealed');
      assert.equal(read().ingredients[1].pack_condition, 'repacked');
    }
  }
});

test('duplicate aliases cannot multiply ingredient history or request budgets', async () => {
  const { service, id, session, read } = await setup();
  const before = structuredClone(read());
  await assert.rejects(service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name: draft.product_name, scope: 'snack', reviewed: true,
    ingredients: [...read().ingredients, { declared_name: 'Bumbu Balado Original', brand: 'Rasa Nusantara', form: 'processed', pack_condition: 'sealed' }],
  })), /duplicate ingredient rows/);
  assert.deepEqual(read(), before);
});

test('material process edits refer the same banana product and cannot restore stale scope', async () => {
  const { service, id, session, read } = await setup({ intake: async () => ({ ...draft, ingredients: [draft.ingredients[0]] }) });
  assert.equal(buildPacket(read()).evidence_complete, true);
  const edit = (product_name: string, scope: Draft['scope'] = 'snack') => service.mutate(id, session, read().revision, entry => service.confirm(entry, {
    product_name, scope, reviewed: true, ingredients: read().ingredients,
  }));
  const before = read();
  await edit('  KERIPIK  PISANG Original  ');
  assert.deepEqual(read(), before, 'safe display edits remain a no-op');
  await edit('Keripik Pisang fermentasi dan diasap');
  assert.equal(read().revision, 2);
  assert.equal(read().scope, 'facilitator_review');
  assert.equal(read().ingredients[0].status, 'exempt');
  assert.equal(buildPacket(read()).evidence_complete, false);
  const referred = read();
  await edit('Keripik Pisang fermentasi dan diasap');
  assert.deepEqual(read(), referred, 'unchanged submitted scope is also a no-op');
  await edit(draft.product_name);
  assert.equal(read().scope, 'facilitator_review');
  assert.equal(buildPacket(read()).evidence_complete, false);
  assert.ok(!read().events.some(event => ['pack_requested', 'catalogue_searched', 'substitute_proposed'].includes(event.type)));
});

test('material product edits before first confirmation do not inherit the intake assessment', async () => {
  const service = new CaseService({ intake: async () => draft, choose: async ({ allowed }) => allowed[0], readPack: async () => correct });
  const created = await service.create(media('audio'), media('label'));
  await service.mutate(created.case.case_id, created.session, 1, entry => service.confirm(entry, {
    product_name: 'Keripik Pisang fermentasi dan diasap', scope: 'snack', ingredients: draft.ingredients, reviewed: true,
  }));
  const view = service.read(created.case.case_id);
  assert.equal(view.scope, 'facilitator_review');
  assert.equal(view.ingredients[0].status, 'exempt');
  assert.ok(view.ingredients[1].pending_request);
  assert.equal(buildPacket(view).evidence_complete, false);
});


test('case agent uses live eligibility across a wrong pack, seller decline, and seller approval', async () => {
  const runs: string[][] = [];
  const workflow: WorkflowRunner = async ({ actions, execute }) => {
    const run: string[] = [];
    runs.push(run);
    assert.equal(execute('unknown-ingredient', 'request_pack', 'pack'), false);
    while (actions().length) {
      const [next] = actions();
      if (next.action === 'request_pack') {
        assert.equal(execute(next.ingredient_id, 'search_catalogue', next.stage), false);
      }
      assert.equal(execute(next.ingredient_id, next.action, next.stage), true);
      assert.equal(execute(next.ingredient_id, next.action, next.stage), false);
      run.push(next.action);
    }
  };
  const { read, answer, decide } = await setup({
    choose: async () => assert.fail('The case agent must choose the action'),
  }, 'snack', workflow);

  await answer('wrong');
  assert.equal(read().ingredients[1].reason, 'IDENTITY_MISMATCH');
  assert.equal(read().ingredients[1].pending_request?.attempt, 2);
  await answer('correct');
  const first = read().proposals[0];
  await assert.rejects(decide(first.proposal_id, 'approve', 'foreign'), /Seller session/);
  await decide(first.proposal_id, 'decline');
  const alternative = read().proposals[1];
  assert.notEqual(first.listing.listing_id, alternative.listing.listing_id);
  await decide(alternative.proposal_id, 'approve');

  assert.deepEqual(runs, [['request_pack'], ['request_pack'], ['search_catalogue'], ['search_catalogue']]);
  assert.equal(read().phase, 'review_packet');
  assert.equal(buildPacket(read()).evidence_complete, false);
  assert.equal(buildPacket(read()).conditional_proposals[0].adoption, 'pending');
  assert.equal(read().events.filter(event => event.type === 'agent_action').length, 4);
});

test('retry after a partial case-agent run preserves the existing pack request', async () => {
  const workflow: WorkflowRunner = async ({ actions, execute }) => {
    const [next] = actions();
    assert.equal(execute(next.ingredient_id, next.action, next.stage), true);
  };
  const { service, read, id, session } = await setup({
    intake: async () => ({
      ...draft,
      ingredients: [...draft.ingredients, {
        declared_name: 'minyak goreng', form: 'processed', pack_condition: 'sealed', brand: 'Sentosa', variant: null,
      }],
    }),
  }, 'snack', workflow);
  assert.equal(read().phase, 'paused');
  const first = read().ingredients[1].pending_request;
  assert.equal(first?.attempt, 1);
  assert.equal(read().ingredients[3].pending_request, undefined);
  await service.mutate(id, session, read().revision, entry => service.retry(entry));
  assert.equal(read().phase, 'awaiting_seller');
  assert.deepEqual(read().ingredients[1].pending_request, first);
  assert.equal(read().ingredients[3].pending_request?.attempt, 1);
  assert.equal(read().events.filter(event => event.type === 'pack_requested').length, 2);
});

test('a repeated pack referral cannot consume the catalogue decision for that ingredient', async () => {
  const workflow: WorkflowRunner = async ({ actions, execute }) => {
    const referral = actions().find(action => action.action === 'refer' && action.stage === 'pack');
    if (referral) {
      assert.equal(execute(referral.ingredient_id, 'refer', 'pack'), true);
      assert.equal(execute(referral.ingredient_id, 'refer', 'pack'), false);
      assert.ok(actions().some(action => action.ingredient_id === referral.ingredient_id &&
        action.action === 'search_catalogue' && action.stage === 'catalogue'));
    }
    while (actions().length) {
      const [next] = actions();
      assert.equal(execute(next.ingredient_id, next.action, next.stage), true);
    }
  };
  const { answer, read } = await setup({}, 'snack', workflow);
  await answer('wrong');
  const view = read();
  const seasoning = view.ingredients[1];
  assert.equal(view.phase, 'awaiting_seller');
  assert.ok(view.events.some(event => event.type === 'catalogue_searched' &&
    event.data.ingredient_id === seasoning.ingredient_id && event.data.searched === true));
  assert.equal(view.events.filter(event => event.type === 'agent_action' &&
    event.data.ingredient_id === seasoning.ingredient_id && event.data.action === 'refer').length, 1);
});
