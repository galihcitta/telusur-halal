import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { eventSchema, IntakeInputError, PackInputError, type AgentAction, type CaseView, type Confirmation, type Draft, type EventType, type Ingredient, type Media, type Model, type Observation, type SourceMode } from './contracts.js';
import type { WorkflowAction, WorkflowRunner } from './orchestration.js';
import { checkEvidence, exemption, ingredientIdentity, searchCatalogue } from './rules.js';

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
interface IngredientHistory {
  identity: ReturnType<typeof ingredientIdentity>;
  repacked: boolean;
  conflict: boolean;
  noPack: boolean;
  requests: number;
  offered: string[];
  source_refs: string[];
  evidence: Ingredient['evidence'];
}
interface Entry {
  view: CaseView;
  session: string;
  busy: boolean;
  retry?: () => Promise<void>;
  history: Map<string, IngredientHistory>;
  knownIds: Set<string>;
  photos: Map<string, Media>;
  confirmationKey?: string;
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

const normalize = (value: string | undefined) => value?.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ') || undefined;

function requiresIngredientReview(name: string) {
  const ingredient = normalize(name);
  return ingredient === 'rum' || ingredient === 'minuman rum' || ingredient === 'rum alkohol';
}

function recipeKey(input: Pick<Confirmation, 'product_name' | 'scope' | 'ingredients'>) {
  return JSON.stringify({
    product: normalize(input.product_name), scope: input.scope,
    ingredients: input.ingredients.map(row => JSON.stringify({
      name: normalize(row.declared_name), brand: normalize(row.brand), variant: row.variant === null ? null : normalize(row.variant),
      form: row.form, condition: row.pack_condition, location: normalize(row.purchase_location), no_additives: row.no_additives,
    })).sort(),
  });
}

export class CaseService {
  private cases = new Map<string, Entry>();
  constructor(
    private model: Model,
    private source: SourceMode = 'actual_media',
    private workflowRunner?: WorkflowRunner,
  ) {}

  read(id: string) {
    const entry = this.cases.get(id);
    if (!entry) throw new RequestError(404, 'Case not found.');
    return structuredClone(entry.view);
  }

  create(audio: Media, label: Media) {
    return this.start(() => this.model.intake(audio, label), [mediaRef(audio), mediaRef(label)]);
  }

  createFromDish(photo: Media) {
    return this.start(async () => {
      const suggestions = await this.model.readDish(photo);
      const dish = suggestions?.dish.trim() ?? '';
      const ingredients = new Map<string, string>();
      if (dish && dish.length <= 250) {
        for (const name of suggestions?.visible_ingredients ?? []) {
          const clean = name.trim();
          if (clean && clean.length <= 250) ingredients.set(normalize(clean)!, clean);
        }
      }
      return {
        product_name: dish.length <= 250 ? dish : '',
        scope: 'facilitator_review',
        notes: [],
        transcript: '',
        ingredients: Array.from(ingredients.values()).slice(0, 20)
          .map(declared_name => ({ declared_name, form: 'unknown', pack_condition: 'unknown' })),
      };
    }, [mediaRef(photo)], 'dish_photo');
  }

  private async start(readDraft: () => Promise<Draft>, source_refs: string[], intake_kind?: CaseView['intake_kind']) {
    const view: CaseView = {
      case_id: randomUUID(), revision: 1, phase: 'intake_review', source_mode: this.source, intake_kind,
      product_name: '', scope: 'facilitator_review', confirmed_ingredient_ids: [],
      ingredients: [], proposals: [], events: [],
    };
    const entry: Entry = { view, session: randomBytes(32).toString('hex'), busy: false, history: new Map(), knownIds: new Set(), photos: new Map() };
    await this.run(entry, async () => {
      const draft = await readDraft();
      view.draft = {
        ...draft,
        ingredients: draft.ingredients.map(row => ({ ...row, ingredient_id: randomUUID() })),
      };
      if (intake_kind !== 'dish_photo') view.product_name = draft.product_name;
      view.scope = draft.scope;
      view.phase = 'intake_review';
      append(view, 'intake_parsed', intake_kind === 'dish_photo'
        ? 'Foto masakan dibaca untuk memberi saran resep.' : 'Audio and product label read for seller review.', {
        input_mode: this.source, intake_kind, source_refs,
        ingredient_count: draft.ingredients.length,
      });
    });
    this.cases.set(view.case_id, entry);
    return { case: this.read(view.case_id), session: entry.session };
  }

  private sellerEntry(id: string, session: string) {
    const entry = this.cases.get(id);
    if (!entry) throw new RequestError(404, 'Case not found.');
    const expected = Buffer.from(entry.session);
    const supplied = Buffer.from(session);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new RequestError(403, 'Seller session required.');
    }
    return entry;
  }

  readPhoto(id: string, session: string, source: string) {
    const photo = this.sellerEntry(id, session).photos.get(source);
    if (!photo) throw new RequestError(404, 'Photo not found.');
    return photo;
  }

  async mutate<T>(id: string, session: string, revision: number, operation: (entry: Entry) => Promise<T> | T) {
    const entry = this.sellerEntry(id, session);
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
    if (!view.draft || view.phase === 'paused' || (!view.draft.ingredients.length && view.intake_kind !== 'dish_photo')) {
      throw new RequestError(409, 'Provide readable intake or retry the paused step first.');
    }
    const previous = new Set([...entry.knownIds, ...view.draft.ingredients.map(row => row.ingredient_id)]);
    const ids = input.ingredients.flatMap(row => row.ingredient_id ? [row.ingredient_id] : []);
    if (new Set(ids).size !== ids.length || ids.some(id => !previous.has(id))) throw new RequestError(400, 'Invalid ingredient IDs.');
    const identities = input.ingredients.map(ingredientIdentity);
    const duplicate = identities.some((identity, index) => identities.slice(0, index).some(other =>
      identity.product === other.product &&
      (identity.variant === undefined || other.variant === undefined || identity.variant === other.variant) &&
      (!identity.brand || !other.brand || identity.brand === other.brand)));
    if (duplicate) throw new RequestError(400, 'Review duplicate ingredient rows before confirming.');
    const confirmationKey = recipeKey(input);
    if (view.confirmed_ingredient_ids.length &&
        (confirmationKey === entry.confirmationKey || confirmationKey === recipeKey(view))) return;
    const previousHistory = entry.history;
    entry.history = structuredClone(previousHistory);
    try {
      for (const row of input.ingredients) this.historyFor(entry, row);
    } catch (error) {
      entry.history = previousHistory;
      throw error;
    }
    // Snapshot safety facts before removing any rows. The history belongs to
    // the ingredient, not its current display row or recipe revision.
    for (const row of view.ingredients) {
      const history = entry.history.get(JSON.stringify(ingredientIdentity(row))) ?? this.historyFor(entry, row);
      history.repacked ||= row.pack_condition === 'repacked' || row.evidence.some(item => item.observed.repacked);
      history.conflict = row.conflict;
      history.evidence = row.evidence;
      history.source_refs = [...new Set([...history.source_refs, ...row.source_refs, ...row.evidence.flatMap(item => item.source_refs)])];
    }
    if (view.confirmed_ingredient_ids.length) view.revision++;
    entry.confirmationKey = confirmationKey;
    const parsedEvent = view.events.find(event => event.type === 'intake_parsed');
    // The dish image can explain a suggestion in the trace, but is never an ingredient evidence source.
    const refs = view.intake_kind === 'dish_photo' ? [] : (parsedEvent?.data.source_refs as string[] ?? []);
    view.product_name = input.product_name;
    const product = normalize(input.product_name)!;
    // The intake assessment covers its original product, not new process claims.
    // Without a fresh assessment, material name edits and prior referrals stay referred.
    view.scope = view.scope === 'snack' && view.draft.scope === 'snack' && input.scope === 'snack' &&
      product === normalize(view.draft.product_name) && !input.ingredients.some(row => requiresIngredientReview(row.declared_name)) ? 'snack' : 'facilitator_review';
    view.ingredients = input.ingredients.map(row => {
      const ingredient_id = row.ingredient_id ?? randomUUID();
      entry.knownIds.add(ingredient_id);
      const history = this.historyFor(entry, row);
      history.repacked ||= row.pack_condition === 'repacked';
      return {
        ...row, ingredient_id, pack_condition: history.repacked ? 'repacked' : row.pack_condition,
        source_refs: [...new Set([...(row.ingredient_id ? refs : []), ...history.source_refs, `seller-confirmed:r${view.revision}`])],
        status: 'open', pending_request: undefined, reason: undefined, basis: 'Waiting for evidence.', requests: history.requests, conflict: history.conflict,
        evidence: history.evidence,
      };
    });
    view.confirmed_ingredient_ids = view.ingredients.map(row => row.ingredient_id);
    view.proposals = [];
    append(view, 'intake_confirmed', 'Seller confirmed the current ingredient list.', {
      ingredient_ids: view.confirmed_ingredient_ids, scope: view.scope,
    });
    await this.run(entry, () => this.advance(entry));
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
    this.recordAction(view, row, choice, allowed);
    return choice;
  }

  private recordAction(view: CaseView, row: Ingredient, choice: AgentAction, allowed: AgentAction[]) {
    append(view, 'agent_action', `Agent selected ${choice.replaceAll('_', ' ')}.`, { ingredient_id: row.ingredient_id, action: choice, previous_reason: row.reason, allowed });
  }

  private historyFor(entry: Entry, row: Pick<Ingredient, 'declared_name' | 'variant' | 'brand'>) {
    const identity = ingredientIdentity(row);
    const key = JSON.stringify(identity);
    const compatible = [...new Set(entry.history.values())].filter(item =>
      item.identity.product === identity.product &&
      (item.identity.variant === undefined || identity.variant === undefined || item.identity.variant === identity.variant) &&
      (!item.identity.brand || !identity.brand || item.identity.brand === identity.brand));
    // A cached omitted-brand alias is not an identity once multiple known SKUs
    // exist. Require the seller to disambiguate instead of borrowing clean facts.
    if (compatible.length > 1) throw new RequestError(400, 'Specify the ingredient brand and variant to distinguish its existing history.');
    let history = compatible[0];
    if (history) entry.history.set(key, history);
    if (!history) {
      history = { identity, repacked: false, conflict: false, noPack: false, requests: 0, offered: [], source_refs: [], evidence: [] };
      entry.history.set(key, history);
    }
    // Refine missing fields once a seller identifies the SKU. Cached omission
    // aliases still point here, but cannot turn this into another explicit SKU.
    history.identity = {
      product: history.identity.product,
      variant: history.identity.variant === undefined ? identity.variant : history.identity.variant,
      brand: history.identity.brand || identity.brand,
    };
    return history;
  }

  private async advance(entry: Entry) {
    const view = entry.view;
    view.phase = 'checking';
    const packs: Ingredient[] = [];
    for (const row of view.ingredients) {
      if (row.status !== 'open' || row.pending_request) continue;
      if (requiresIngredientReview(row.declared_name)) {
        this.verdict(view, row, { status: 'unresolved', reason: 'SCOPE_REVIEW', basis: 'Fasilitator perlu meninjau penggunaan rum. Esens rum adalah bahan yang berbeda.', source_refs: row.source_refs });
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
      const history = this.historyFor(entry, row);
      if (history.noPack || history.requests >= 2) {
        this.verdict(view, row, { status: 'unresolved', reason: history.noPack ? 'NO_PACK' : 'SOURCE_BOUND',
          basis: history.noPack ? 'Seller has no original pack for this ingredient.' : 'The two pack requests for this ingredient are exhausted. Facilitator review is required.',
          source_refs: row.source_refs });
        continue;
      }
      if (this.workflowRunner) {
        packs.push(row);
      } else {
        const action = await this.action(view, row, this.packActions(row));
        this.applyPackAction(entry, row, action);
      }
    }

    if (this.workflowRunner) {
      await this.advanceWithAgent(entry, packs, this.workflowRunner);
    } else {
      for (const row of this.catalogueRows(entry)) {
        const action = await this.action(view, row, ['search_catalogue', 'refer']);
        this.applyCatalogueAction(entry, row, action);
      }
    }

    const waitingForPack = view.ingredients.some(row => row.pending_request);
    view.phase = waitingForPack || view.proposals.some(proposal => proposal.status === 'pending') ? 'awaiting_seller' : 'review_packet';
    if (this.workflowRunner && view.phase === 'awaiting_seller') {
      const packIngredients = view.ingredients.filter(row => row.pending_request).map(row => row.declared_name);
      const decisions = view.proposals.filter(proposal => proposal.status === 'pending').map(proposal => proposal.listing.product);
      append(view, 'seller_wait', 'Menunggu tindakan penjual.', { pack_ingredients: packIngredients, decisions });
    }
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
    const dishRef = view.intake_kind === 'dish_photo'
      ? (view.events.find(event => event.type === 'intake_parsed')?.data.source_refs as string[] | undefined)?.[0]
      : undefined;
    if (input.mode === 'photo' && dishRef && input.images.some(image => mediaRef(image) === dishRef)) {
      throw new RequestError(422, 'Foto masakan tidak bisa dipakai sebagai bukti kemasan. Unggah foto kemasan bahan yang Anda pakai.');
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
        this.historyFor(entry, row).noPack = true;
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
        if (input.mode === 'photo') {
          for (const image of input.images) entry.photos.set(mediaRef(image), image);
        }
        this.verdict(view, row, verdict);
        if (row.status === 'unresolved' && row.requests < 2 && row.pack_condition !== 'repacked') row.status = 'open';
      }
      row.pending_request = undefined;
    };
    const resume = async () => {
      if (row.pending_request) await work();
      await this.advance(entry);
    };
    await this.run(entry, resume);
  }

  private packActions(row: Ingredient): AgentAction[] {
    return row.requests === 0 ? ['request_pack'] : ['request_pack', 'refer'];
  }

  private applyPackAction(entry: Entry, row: Ingredient, action: AgentAction) {
    if (action === 'refer') {
      row.status = 'unresolved';
      return;
    }
    const history = this.historyFor(entry, row);
    row.pending_request = { request_id: randomUUID(), attempt: ++history.requests };
    row.requests = history.requests;
    append(entry.view, 'pack_requested', row.requests === 1 ? 'Request front and maker/certificate area of the actual pack.' : 'Request one corrected or clearer pack photo.', {
      ingredient_id: row.ingredient_id, ...row.pending_request,
    });
  }

  private catalogueRows(entry: Entry) {
    const view = entry.view;
    if (view.ingredients.some(row => row.pending_request || row.status === 'open')) return [];
    return view.ingredients.filter(row => {
      if (row.status !== 'unresolved' || row.reason === 'EXEMPT_UNKNOWN' || row.reason === 'SCOPE_REVIEW') return false;
      const history = this.historyFor(entry, row);
      const previous = view.proposals.filter(item => item.ingredient_id === row.ingredient_id);
      return history.offered.length < 2 && previous.every(item => item.status === 'declined') &&
        !view.events.some(event => event.revision === view.revision && event.type === 'catalogue_searched' &&
          event.data.ingredient_id === row.ingredient_id && event.data.offer_index === previous.length);
    });
  }

  private async advanceWithAgent(entry: Entry, packs: Ingredient[], run: WorkflowRunner) {
    const choices = () => [
      ...packs.filter(row => row.status === 'open' && !row.pending_request)
        .map(row => ({ row, allowed: this.packActions(row), stage: 'pack' as const })),
      ...this.catalogueRows(entry)
        .map(row => ({
          row,
          allowed: (row.reason === 'NO_PACK' ? ['search_catalogue'] : ['search_catalogue', 'refer']) as AgentAction[],
          stage: 'catalogue' as const,
        })),
    ];
    const actions = (): WorkflowAction[] => choices().flatMap(({ row, allowed, stage }) => allowed.map(action => ({
      ingredient_id: row.ingredient_id, ingredient: row.declared_name, reason: row.reason, action, stage,
    })));
    if (!actions().length) return;

    append(entry.view, 'agent_run_started', 'OpenAI Agents SDK memulai pemeriksaan.');
    await run({
      actions,
      recordToolResult: (tool, input, result) => {
        const row = entry.view.ingredients.find(item => item.ingredient_id === input.ingredient_id);
        append(entry.view, 'agent_tool_result', result.applied ? 'Tindakan diterapkan.' : 'Tindakan ditolak.', {
          ingredient_id: row?.ingredient_id, tool, input, result,
        });
      },
      execute: (ingredientId, action, requestedStage) => {
        const choice = choices().find(item =>
          item.stage === requestedStage && item.row.ingredient_id === ingredientId && item.allowed.includes(action));
        if (!choice) return false;
        const { row, allowed, stage } = choice;
        this.recordAction(entry.view, row, action, allowed);
        if (stage === 'pack') this.applyPackAction(entry, row, action);
        else this.applyCatalogueAction(entry, row, action);
        return true;
      },
      maxTurns: entry.view.ingredients.length * 2 + 2,
    });
    if (actions().length) throw new Error('Agent stopped before completing the available case actions.');
  }

  private applyCatalogueAction(entry: Entry, row: Ingredient, choice: AgentAction) {
    const view = entry.view;
    const history = this.historyFor(entry, row);
    const previous = view.proposals.filter(item => item.ingredient_id === row.ingredient_id);
    if (choice === 'refer') {
      append(view, 'catalogue_searched', 'Agent referred the gap for facilitator review.', {
        ingredient_id: row.ingredient_id, offer_index: previous.length, searched: false,
      });
      return;
    }
    const results = searchCatalogue(row);
    const candidate = results.eligible.find(item => !history.offered.includes(item.listing.listing_id));
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
    history.offered.push(proposal.listing.listing_id);
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
    await this.run(entry, () => this.advance(entry));
  }
}
