import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { eventSchema, IntakeInputError, PackInputError, type AgentAction, type CaseView, type Confirmation, type EventType, type Ingredient, type Media, type Model, type Observation, type SourceMode } from './contracts.js';
import { checkEvidence, exemption, ingredientUse, searchCatalogue } from './rules.js';

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
interface Entry {
  view: CaseView;
  session: string;
  busy: boolean;
  retry?: () => Promise<void>;
  repackHistory: Map<string, { source_refs: string[]; evidence: Ingredient['evidence'] }>;
}
export interface PackAnswer {
  request_id: string;
  condition: Ingredient['pack_condition'];
  mode: 'photo' | 'typed' | 'no_pack';
  confirmed_current: boolean;
  images: Media[];
  observed?: Observation;
}
export function append(view: CaseView, type: EventType, summary: string, data: Record<string, unknown> = {}) {
  view.events.push(eventSchema.parse({
    seq: view.events.length + 1, timestamp: new Date().toISOString(), case_id: view.case_id,
    revision: view.revision, type, data: { ...data, summary },
  }));
}

function mediaRef(media: Media) {
  return 'sha256:' + createHash('sha256').update(media.bytes).digest('hex');
}
function mediaSetRef(images: Media[]) {
  return 'image-set:' + createHash('sha256').update([...new Set(images.map(mediaRef))].sort().join('|')).digest('hex');
}

export class CaseService {
  private cases = new Map<string, Entry>();
  constructor(private model: Model, private source: SourceMode = 'actual_media') {}

  read(id: string) {
    const entry = this.cases.get(id);
    if (!entry) throw new RequestError(404, 'Case not found.');
    return structuredClone(entry.view);
  }

  async create(audio: Media, label: Media) {
    const view: CaseView = {
      case_id: randomUUID(), revision: 1, phase: 'intake_review', source_mode: this.source,
      product_name: '', scope: 'facilitator_review', confirmed_ingredient_ids: [],
      ingredients: [], proposals: [], events: [],
    };
    const entry: Entry = { view, session: randomBytes(32).toString('hex'), busy: false, repackHistory: new Map() };
    await this.run(entry, async () => {
      const draft = await this.model.intake(audio, label);
      view.draft = {
        ...draft,
        ingredients: draft.ingredients.map(row => ({ ...row, ingredient_id: randomUUID() })),
      };
      view.product_name = draft.product_name;
      view.scope = draft.scope;
      view.phase = 'intake_review';
      append(view, 'intake_parsed', 'Audio and product label read for seller review.', {
        input_mode: this.source, source_refs: [mediaRef(audio), mediaRef(label)],
        ingredient_count: draft.ingredients.length,
      });
    });
    this.cases.set(view.case_id, entry);
    return { case: this.read(view.case_id), session: entry.session };
  }

  async mutate<T>(id: string, session: string, revision: number, operation: (entry: Entry) => Promise<T> | T) {
    const entry = this.cases.get(id);
    if (!entry) throw new RequestError(404, 'Case not found.');
    const expected = Buffer.from(entry.session);
    const supplied = Buffer.from(session);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new RequestError(403, 'Seller session required.');
    }
    if (entry.view.revision !== revision || entry.busy) throw new RequestError(409, 'Case changed or is busy. Refresh and try again.');
    entry.busy = true;
    try { return await operation(entry); } finally { entry.busy = false; }
  }

  private async run(entry: Entry, work: () => Promise<void>, resume?: () => Promise<void>) {
    const retry = resume ?? work;
    entry.view.error = undefined;
    entry.retry = undefined;
    try { await work(); } catch (error) {
      if (error instanceof RequestError) throw error;
      if (error instanceof PackInputError) {
        entry.view.phase = 'awaiting_seller';
        entry.view.error = error.message;
        return;
      }
      if (error instanceof IntakeInputError) throw new RequestError(422, error.message);
      entry.view.phase = 'paused';
      entry.view.error = 'Layanan AI belum menyelesaikan langkah ini. Periksa koneksi dan konfigurasi API, lalu coba lagi.';
      entry.retry = retry;
      append(entry.view, 'case_paused', 'Technical failure. Retry the same step.', { reason: 'TECHNICAL_FAILURE' });
    }
  }

  async retry(entry: Entry) {
    if (entry.view.phase !== 'paused' || !entry.retry) throw new RequestError(409, 'No paused action.');
    await this.run(entry, entry.retry);
  }

  async confirm(entry: Entry, input: Confirmation) {
    const view = entry.view;
    if (!view.draft?.ingredients.length || view.phase === 'paused') {
      throw new RequestError(409, 'Provide readable intake or retry the paused step first.');
    }
    const previous = new Set([...view.draft.ingredients, ...view.ingredients].map(row => row.ingredient_id));
    const ids = input.ingredients.flatMap(row => row.ingredient_id ? [row.ingredient_id] : []);
    if (new Set(ids).size !== ids.length || ids.some(id => !previous.has(id))) throw new RequestError(400, 'Invalid ingredient IDs.');
    if (view.confirmed_ingredient_ids.length) view.revision++;
    const parsedEvent = view.events.find(event => event.type === 'intake_parsed');
    const refs = parsedEvent?.data.source_refs as string[] ?? [];
    view.product_name = input.product_name;
    const bananaSnack = /^(keripik pisang|pisang coklat)(?:\s|$)/iu.test(input.product_name);
    view.scope = view.draft.scope === 'snack' && input.scope === 'snack' && bananaSnack ? 'snack' : 'facilitator_review';
    // Keep removed repacks at case scope: a new display row is not new goods.
    for (const row of view.ingredients) {
      if (row.pack_condition === 'repacked' || row.evidence.some(item => item.observed.repacked)) {
        entry.repackHistory.set(ingredientUse(row.declared_name), {
          source_refs: [...row.source_refs, ...row.evidence.flatMap(item => item.source_refs)],
          evidence: row.evidence,
        });
      }
    }
    view.ingredients = input.ingredients.map(row => {
      const ingredient_id = row.ingredient_id ?? randomUUID();
      const old = view.ingredients.find(item => item.ingredient_id === ingredient_id && ingredientUse(item.declared_name) === ingredientUse(row.declared_name)) ??
        view.ingredients.find(item => ingredientUse(item.declared_name) === ingredientUse(row.declared_name));
      const history = entry.repackHistory.get(ingredientUse(row.declared_name));
      const knownRepack = Boolean(history) || old?.pack_condition === 'repacked' || old?.evidence.some(item => item.observed.repacked);
      return {
        ...row, ingredient_id, pack_condition: knownRepack ? 'repacked' : row.pack_condition,
        source_refs: [...new Set([...(row.ingredient_id ? refs : []), ...(history?.source_refs ?? []), `seller-confirmed:r${view.revision}`])],
        status: 'open', basis: 'Waiting for evidence.', requests: 0, conflict: old?.conflict ?? false,
        evidence: old?.evidence ?? history?.evidence ?? [],
      };
    });
    view.confirmed_ingredient_ids = view.ingredients.map(row => row.ingredient_id);
    view.proposals = [];
    append(view, 'intake_confirmed', 'Seller confirmed the current ingredient list.', {
      ingredient_ids: view.confirmed_ingredient_ids, scope: view.scope,
    });
    await this.run(entry, () => this.advance(view));
  }

  private verdict(view: CaseView, row: Ingredient, verdict: { status: Ingredient['status']; reason: NonNullable<Ingredient['reason']>; basis: string; source_refs: string[] }) {
    append(view, 'evidence_checked', verdict.basis, {
      ingredient_id: row.ingredient_id, status: verdict.status, reason: verdict.reason, source_refs: verdict.source_refs,
    });
    row.status = verdict.status;
    row.reason = verdict.reason;
    row.basis = verdict.basis;
  }

  private async action(view: CaseView, row: Ingredient, allowed: AgentAction[]) {
    const choice = await this.model.choose({ ingredient: row.declared_name, reason: row.reason, allowed });
    if (!allowed.includes(choice)) throw new Error('Agent action violated the guard.');
    append(view, 'agent_action', `Agent selected ${choice.replaceAll('_', ' ')}.`, { ingredient_id: row.ingredient_id, action: choice, previous_reason: row.reason, allowed });
    return choice;
  }

  private async advance(view: CaseView) {
    view.phase = 'checking';
    for (const row of view.ingredients) {
      if (row.status !== 'open' || row.pending_request) continue;
      if (view.scope !== 'snack') {
        this.verdict(view, row, { status: 'unresolved', reason: 'SCOPE_REVIEW', basis: 'Facilitator to review product scope and production process.', source_refs: row.source_refs });
        continue;
      }
      const waived = exemption(row);
      if (waived) {
        this.verdict(view, row, waived);
        continue;
      }
      if (row.pack_condition === 'loose' || row.pack_condition === 'repacked') {
        this.verdict(view, row, {
          status: 'unresolved', reason: row.pack_condition === 'loose' ? 'NO_PACK' : 'CONFLICT_OR_REPACK',
          basis: row.pack_condition === 'loose' ? 'Loose ingredient has no original pack evidence.' : 'Known repack needs facilitator review.',
          source_refs: row.source_refs,
        });
        continue;
      }
      if (row.requests >= 2) {
        row.status = 'unresolved';
        continue;
      }
      const action = await this.action(view, row, row.requests === 0 ? ['request_pack'] : ['request_pack', 'refer']);
      if (action === 'refer') {
        row.status = 'unresolved';
        continue;
      }
      row.pending_request = { request_id: randomUUID(), attempt: ++row.requests };
      append(view, 'pack_requested', row.requests === 1 ? 'Request front and maker/certificate area of the actual pack.' : 'Request one corrected or clearer pack photo.', {
        ingredient_id: row.ingredient_id, ...row.pending_request,
      });
    }

    const waitingForPack = view.ingredients.some(row => row.pending_request);
    if (!waitingForPack && view.scope === 'snack') {
      for (const row of view.ingredients) {
        if (row.status === 'unresolved' && row.reason !== 'EXEMPT_UNKNOWN' && row.reason !== 'SCOPE_REVIEW') await this.recommend(view, row);
      }
    }
    view.phase = waitingForPack || view.proposals.some(proposal => proposal.status === 'pending') ? 'awaiting_seller' : 'review_packet';
  }

  async pack(entry: Entry, input: PackAnswer) {
    const view = entry.view;
    const row = view.ingredients.find(item => item.pending_request?.request_id === input.request_id);
    if (view.phase !== 'awaiting_seller' || !row) throw new RequestError(409, 'This pack request is no longer pending.');
    if (input.mode === 'photo' && !input.images.length || input.mode === 'typed' && !input.observed) {
      throw new RequestError(400, 'Provide the requested pack evidence.');
    }
    if (input.mode !== 'no_pack' && input.condition === 'loose') {
      throw new RequestError(400, 'Use the no-pack answer for loose goods.');
    }
    let recorded = false;
    const work = async () => {
      const source_refs = input.mode === 'photo' ? [...input.images.map(mediaRef), mediaSetRef(input.images)] : [`seller-answer:${input.request_id}`];
      const observed = input.mode === 'photo' ? await this.model.readPack(input.images) : input.observed;
      if (!recorded) {
        append(view, 'pack_received', input.mode === 'no_pack' ? 'Seller reported no pack.' : 'Received evidence for the pending pack request.', {
          ingredient_id: row.ingredient_id, request_id: input.request_id, input_mode: input.mode === 'photo' ? this.source : input.mode, source_refs,
        });
        recorded = true;
      }
      if (row.pack_condition !== 'repacked' && input.condition !== 'unknown') row.pack_condition = input.condition;
      if (observed?.repacked) row.pack_condition = 'repacked';
      if (input.mode === 'no_pack' || !observed) {
        this.verdict(view, row, { status: 'unresolved', reason: 'NO_PACK', basis: 'Seller has no original pack for this ingredient.', source_refs });
      } else {
        const evidence = {
          evidence_id: randomUUID(), case_id: view.case_id, revision: view.revision,
          ingredient_id: row.ingredient_id, request_id: input.request_id, source_refs,
          source_type: input.mode === 'photo' ? 'photo' as const : 'seller-typed' as const,
          observed, confirmed_current: input.confirmed_current, conflicts: [] as NonNullable<Ingredient['reason']>[],
        };
        append(view, 'pack_read', input.mode === 'photo' ? 'Read the uploaded pack image.' : 'Recorded seller transcription of the pack.', {
          ingredient_id: row.ingredient_id, request_id: input.request_id, evidence_id: evidence.evidence_id,
          input_mode: input.mode === 'photo' ? this.source : 'typed', source_refs, observed,
        });
        let verdict = checkEvidence(row, evidence, view.case_id, view.revision);
        const previouslyConflicting = row.evidence.filter(item => item.conflicts.length > 0)
          .flatMap(item => item.source_refs.filter(ref => ref.startsWith('sha256:')));
        const reusedConflictingPhoto = source_refs.some(ref => previouslyConflicting.includes(ref));
        if (verdict.status === 'verified' && row.conflict && (evidence.source_type !== 'photo' || !input.confirmed_current || reusedConflictingPhoto)) {
          verdict = { status: 'unresolved', reason: 'CONFLICT_OR_REPACK', basis: 'A fresh corrected photo confirmed by the seller is required.', source_refs };
        }
        if (verdict.status === 'verified') row.conflict = false;
        if (['IDENTITY_MISMATCH', 'CERTIFICATE_MISMATCH', 'CONFLICT_OR_REPACK'].includes(verdict.reason)) {
          row.conflict = true;
          evidence.conflicts.push(verdict.reason);
        }
        row.evidence.push(evidence);
        this.verdict(view, row, verdict);
        if (row.status === 'unresolved' && row.requests < 2 && row.pack_condition !== 'repacked') row.status = 'open';
      }
      row.pending_request = undefined;
    };
    const resume = async () => {
      if (row.pending_request) await work();
      await this.advance(view);
    };
    await this.run(entry, resume);
  }

  private async recommend(view: CaseView, row: Ingredient) {
    const previous = view.proposals.filter(item => item.ingredient_id === row.ingredient_id);
    if (previous.length >= 2 || previous.some(item => item.status !== 'declined')) return;
    const completed = view.events.some(event => event.revision === view.revision && event.type === 'catalogue_searched' &&
      event.data.ingredient_id === row.ingredient_id && event.data.offer_index === previous.length);
    if (completed) return;
    const options = searchCatalogue(row);
    const choice = await this.action(view, row, ['search_catalogue', 'refer']);
    if (choice === 'refer') {
      append(view, 'catalogue_searched', 'Agent referred the gap for facilitator review.', {
        ingredient_id: row.ingredient_id, offer_index: previous.length, searched: false,
      });
      return;
    }
    const results = options;
    const candidate = results.eligible.find(item => !previous.some(proposal => proposal.listing.listing_id === item.listing.listing_id));
    append(view, 'catalogue_searched', candidate ? 'Searched simulated Shopee and found an eligible candidate.' : 'No different eligible simulated listing found.', {
      ingredient_id: row.ingredient_id, offer_index: previous.length, searched: true,
      eligible: results.eligible.map(item => item.listing.listing_id), excluded: results.excluded,
    });
    if (!candidate) return;
    const proposal = {
      ...structuredClone(candidate), proposal_id: randomUUID(), case_id: view.case_id,
      ingredient_id: row.ingredient_id, revision: view.revision, status: 'pending' as const,
    };
    view.proposals.push(proposal);
    append(view, 'substitute_proposed', 'Waiting for seller decision on the exact simulated listing.', {
      ingredient_id: row.ingredient_id, proposal_id: proposal.proposal_id,
      listing_id: proposal.listing.listing_id, price_idr: proposal.listing.price_idr,
    });
  }

  async decide(entry: Entry, id: string, decision: 'approve' | 'decline') {
    const view = entry.view;
    const proposal = view.proposals.find(item => item.proposal_id === id && item.case_id === view.case_id && item.revision === view.revision && item.status === 'pending');
    if (view.phase !== 'awaiting_seller' || !proposal) throw new RequestError(409, 'This proposal is no longer pending.');
    proposal.status = decision === 'approve' ? 'approved' : 'declined';
    append(view, 'seller_decided', decision === 'approve' ? 'Seller approved a conditional change plan.' : 'Seller declined this proposed replacement.', {
      ingredient_id: proposal.ingredient_id, proposal_id: id, decision, authority: 'seller_session',
    });
    await this.run(entry, () => this.advance(view));
  }
}
