import { z } from 'zod';
import { eventSchema, type CaseEvent, type SourceMode } from './contracts.js';

export interface GoldIngredient {
  key: string;
  aliases: string[];
  variant?: string | null;
}
interface ExtractedIngredient {
  declared_name: string;
  variant?: string | null;
}

const label = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

export function scoreIntake(gold: readonly GoldIngredient[], actual: readonly ExtractedIngredient[]) {
  const candidates = actual.map(row =>
    gold.filter(item => item.aliases.some(alias => label(alias) === label(row.declared_name))),
  );
  const additions: number[] = [];
  const ambiguous: number[] = [];
  const groups = new Map<string, number[]>();
  candidates.forEach((matches, index) => {
    if (!matches.length) additions.push(index);
    else if (matches.length > 1) ambiguous.push(index);
    else {
      const key = matches[0].key;
      groups.set(key, [...(groups.get(key) ?? []), index]);
    }
  });
  const omissions: string[] = [];
  const duplicates: Record<string, number[]> = {};
  const matches: { key: string; index: number; variant_correct: boolean }[] = [];
  for (const item of gold) {
    const indices = groups.get(item.key) ?? [];
    if (!indices.length) omissions.push(item.key);
    else if (indices.length > 1) duplicates[item.key] = indices;
    else {
      const index = indices[0];
      const expected = item.variant;
      const found = actual[index].variant;
      matches.push({
        key: item.key, index,
        variant_correct: expected === undefined || (typeof expected === 'string' && typeof found === 'string'
          ? label(expected) === label(found) : expected === found),
      });
    }
  }
  return { matches, omissions, additions, duplicates, ambiguous };
}

const authoritySchema = z.object({
  case_id: z.uuid(),
  revision: z.number().int().positive(),
  events: z.array(eventSchema),
});
const packetSchema = z.object({
  case_id: z.uuid(),
  revision: z.number().int().positive(),
  source_mode: z.enum(['actual_media', 'fixture', 'replay']),
  dataset_version: z.string().min(1),
  evidence_complete: z.boolean(),
  current_ingredients: z.array(z.object({
    ingredient_id: z.uuid(), ingredient: z.string(), variant: z.string().nullable().optional(),
    status: z.enum(['open', 'verified', 'unresolved', 'exempt']),
    source_refs: z.array(z.string()),
  })),
  unresolved_items: z.array(z.object({ ingredient_id: z.uuid() })),
  conditional_proposals: z.array(z.object({
    proposal_id: z.uuid(), ingredient_id: z.uuid(), status: z.literal('approved'), adoption: z.literal('pending'),
    listing: z.object({ listing_id: z.string(), price_idr: z.number() }),
    registry: z.object({ record_id: z.string(), certificate_number: z.string() }),
  })),
  facilitator_checklist: z.array(z.string()).min(1),
});

// Frozen D01 expectations are independent of the runtime rules and registry adapter.
const d01: GoldIngredient[] = [
  { key: 'banana', aliases: ['pisang', 'pisang kepok', 'buah pisang', 'buah pisang kepok'] },
  { key: 'oil', aliases: ['minyak goreng', 'minyak goreng sentosa'], variant: null },
  { key: 'seasoning', aliases: ['bumbu balado', 'bumbu balado original'], variant: 'Original' },
  { key: 'chili', aliases: ['cabai bubuk', 'cabe bubuk'] },
];

function sourceRefs(event: CaseEvent) {
  return Array.isArray(event.data.source_refs)
    ? event.data.source_refs.filter((ref): ref is string => typeof ref === 'string')
    : [];
}

function scopedEvents(events: CaseEvent[], currentRevision: number, ingredient_id: string) {
  return events.filter(event => event.revision === currentRevision && event.data.ingredient_id === ingredient_id);
}

export function gradeD01(trace: unknown, exported: unknown, mode: SourceMode = 'actual_media') {
  const authority = authoritySchema.safeParse(trace);
  const packet = packetSchema.safeParse(exported);
  if (!authority.success || !packet.success) return { passed: false, failures: [
    ...(!authority.success ? ['Invalid event stream contract.'] : []),
    ...(!packet.success ? ['Invalid packet contract.'] : []),
  ] };

  const { case_id, revision, events } = authority.data;
  const data = packet.data;
  const failures: string[] = [];
  const require = (condition: boolean, detail: string) => { if (!condition) failures.push(detail); };
  require(case_id === data.case_id && revision === data.revision, 'Packet belongs to a different case or revision.');
  require(data.source_mode === mode, 'Packet source mode differs from the test layer.');
  require(!data.evidence_complete, 'False evidence_complete with the current loose chili gap.');

  let priorRevision = 0;
  const pendingPacks = new Map<unknown, { ingredient: unknown; revision: number; received: boolean }>();
  const pendingProposals = new Map<unknown, { ingredient: unknown; revision: number }>();
  const consumedPacks = new Set<unknown>();
  const issuedProposals = new Set<unknown>();
  const packCounts = new Map<string, number>();
  const proposalCounts = new Map<string, number>();
  let activeConfirmation = -1;
  let confirmedIds = new Set<unknown>();
  events.forEach((event, index) => {
    const where = 'Event ' + (index + 1);
    const payload = event.data;
    const key = event.revision + ':' + payload.ingredient_id;
    require(event.seq === index + 1 && event.case_id === case_id &&
      event.revision >= priorRevision && event.revision <= revision, where + ' has invalid sequence, case or revision.');
    priorRevision = event.revision;
    if (event.type === 'intake_confirmed') {
      activeConfirmation = event.revision;
      const ids = Array.isArray(payload.ingredient_ids) ? payload.ingredient_ids : [];
      confirmedIds = new Set(ids);
      require(ids.length > 0 && confirmedIds.size === ids.length, where + ' confirms no ingredients or duplicate IDs.');
    }
    if (['pack_requested', 'pack_request_carried', 'pack_received', 'pack_read', 'evidence_checked', 'catalogue_searched',
      'substitute_proposed', 'seller_decided', 'agent_action'].includes(event.type)) {
      require(activeConfirmation === event.revision && confirmedIds.has(payload.ingredient_id),
        where + ' has no confirmed ingredient context.');
    }
    if (event.type === 'pack_requested') {
      const count = (packCounts.get(key) ?? 0) + 1;
      packCounts.set(key, count);
      require(count <= 2 && payload.attempt === count, where + ' exceeds or misstates the pack budget.');
      require(typeof payload.request_id === 'string' && !pendingPacks.has(payload.request_id) &&
        !consumedPacks.has(payload.request_id), where + ' reuses a pack request.');
      pendingPacks.set(payload.request_id, { ingredient: payload.ingredient_id, revision: event.revision, received: false });
    }
    if (event.type === 'pack_request_carried') {
      const request = pendingPacks.get(payload.request_id);
      const count = packCounts.get((event.revision - 1) + ':' + payload.ingredient_id);
      const valid = request && request.revision === event.revision - 1 &&
        request.ingredient === payload.ingredient_id && !request.received &&
        count !== undefined && payload.attempt === count && !packCounts.has(key);
      require(Boolean(valid), where + ' carries a foreign or closed pack request.');
      if (valid) {
        request.revision = event.revision;
        packCounts.set(key, count);
      }
    }
    if (event.type === 'pack_received' || event.type === 'pack_read') {
      const request = pendingPacks.get(payload.request_id);
      const received = event.type === 'pack_received';
      const valid = request?.revision === event.revision && request.ingredient === payload.ingredient_id &&
        request.received !== received;
      require(valid, where + ' reads or answers a foreign, stale, duplicate, or unreceived pack request.');
      if (request && valid) {
        if (!received || payload.input_mode === 'no_pack') {
          pendingPacks.delete(payload.request_id);
          consumedPacks.add(payload.request_id);
        } else request.received = true;
      }
    }
    if (event.type === 'substitute_proposed') {
      const count = (proposalCounts.get(key) ?? 0) + 1;
      proposalCounts.set(key, count);
      require(count <= 2 && typeof payload.proposal_id === 'string' && !issuedProposals.has(payload.proposal_id),
        where + ' exceeds the proposal budget or reuses a proposal.');
      issuedProposals.add(payload.proposal_id);
      pendingProposals.set(payload.proposal_id, { ingredient: payload.ingredient_id, revision: event.revision });
    }
    if (event.type === 'seller_decided') {
      const pending = pendingProposals.get(payload.proposal_id);
      require(pending?.revision === event.revision && pending.ingredient === payload.ingredient_id &&
        payload.authority === 'seller_session' && ['approve', 'decline'].includes(String(payload.decision)),
      where + ' makes an unauthorized, stale or duplicate decision.');
      pendingProposals.delete(payload.proposal_id);
    }
  });

  const actual = data.current_ingredients.map(row => ({ ...row, declared_name: row.ingredient }));
  const score = scoreIntake(d01, actual);
  require(score.matches.length === d01.length && actual.length === d01.length &&
    score.matches.every(match => match.variant_correct), 'Export must keep the four confirmed D01 ingredients and variants.');
  require(new Set(actual.map(row => row.ingredient_id)).size === actual.length, 'Export duplicates a current ingredient ID.');
  const rows = new Map(score.matches.map(match => [match.key, actual[match.index]]));
  const banana = rows.get('banana');
  const oil = rows.get('oil');
  const seasoning = rows.get('seasoning');
  const chili = rows.get('chili');
  const finalEvents = events.filter(event => event.revision === revision);
  const context = (row: typeof banana) => row ? scopedEvents(events, revision, row.ingredient_id) : [];
  const lastVerdict = (row: typeof banana) => context(row).findLast(event => event.type === 'evidence_checked');
  const packReads = (row: typeof banana) => context(row).filter(event =>
    event.type === 'pack_read' && event.data.input_mode === mode && sourceRefs(event).some(ref => ref.startsWith('sha256:')));
  const proposals = data.conditional_proposals;
  require(events.some(event => event.type === 'intake_parsed' && event.data.input_mode === mode &&
    sourceRefs(event).filter(ref => ref.startsWith('sha256:')).length === 2), 'Missing audio-plus-label intake proof.');
  require(events.at(-1)?.type === 'packet_exported' && events.at(-1)?.revision === revision &&
    events.at(-1)?.data.evidence_complete === data.evidence_complete, 'Missing or inconsistent final packet export event.');
  require(finalEvents.some(event => event.type === 'intake_confirmed') && confirmedIds.size === actual.length &&
    actual.every(row => confirmedIds.has(row.ingredient_id)), 'Packet rows differ from the confirmed ingredient IDs.');
  require(banana?.status === 'exempt' && lastVerdict(banana)?.data.reason === 'EXEMPT_CONDITIONS' &&
    !context(banana).some(event => event.type === 'pack_requested'), 'Banana must close under confirmed exemption conditions without a pack ask.');
  const citesRead = (row: typeof banana, read: CaseEvent, record: string) => {
    const verdict = lastVerdict(row);
    return !!verdict && verdict.seq > read.seq && verdict.data.status === 'verified' &&
      verdict.data.reason === 'EXACT_IDENTITY' &&
      [sourceRefs(verdict), row?.source_refs ?? []].every(refs => refs.some(ref => ref.endsWith('#' + record)) &&
        sourceRefs(read).some(ref => ref.startsWith('sha256:') && refs.includes(ref)));
  };
  const oilReads = packReads(oil);
  require(oil?.status === 'verified' && oilReads.length === 1 && citesRead(oil, oilReads[0], 'R-101'),
    'Oil requires a current pack read linked to R-101.');
  const firstOilAsk = context(oil).find(event => event.type === 'pack_requested');
  const firstSeasoningAsk = context(seasoning).find(event => event.type === 'pack_requested');
  const firstReceipt = finalEvents.find(event => event.type === 'pack_received');
  require(!!firstOilAsk && !!firstSeasoningAsk && !!firstReceipt &&
    Math.max(firstOilAsk.seq, firstSeasoningAsk.seq) < firstReceipt.seq,
  'Oil and seasoning requests must be available as a batch before receipt.');
  const seasoningReads = packReads(seasoning);
  const wrong = context(seasoning).find(event => event.type === 'evidence_checked' &&
    event.data.reason === 'IDENTITY_MISMATCH' && event.data.status === 'unresolved');
  const corrected = lastVerdict(seasoning);
  const accepted = finalEvents.filter(event =>
    event.type === 'evidence_checked' && ['exempt', 'verified'].includes(String(event.data.status)));
  const supportedVerdictSequences = [lastVerdict(banana)?.seq, lastVerdict(oil)?.seq, corrected?.seq];
  require(accepted.length === supportedVerdictSequences.length &&
    accepted.every(event => supportedVerdictSequences.includes(event.seq)),
  'Unexpected or intermediate positive verdict in the D01 revision.');
  require(seasoning?.status === 'verified' && seasoningReads.length === 2 && !!wrong && !!corrected &&
    seasoningReads[0].seq < wrong.seq && wrong.seq < seasoningReads[1].seq && seasoningReads[1].seq < corrected.seq &&
    sourceRefs(seasoningReads[1]).some(ref => ref.startsWith('sha256:') && !sourceRefs(seasoningReads[0]).includes(ref)) &&
    citesRead(seasoning, seasoningReads[1], 'R-202'),
  'Seasoning must reject the first photo and verify the corrected one against R-202.');
  require(chili?.status === 'unresolved' && lastVerdict(chili)?.data.reason === 'NO_PACK' &&
    !context(chili).some(event => event.type === 'pack_requested') &&
    data.unresolved_items.length === 1 && data.unresolved_items[0]?.ingredient_id === chili.ingredient_id,
  'Current loose chili must stay unresolved without a pack request.');

  const offer = proposals[0];
  const search = context(chili).find(event => event.type === 'catalogue_searched' && event.data.searched === true);
  const rejectedCurah = Array.isArray(search?.data.excluded) && search.data.excluded.some(
    item => typeof item === 'object' && item !== null && 'listing_id' in item && item.listing_id === 'L-10');
  const offered = context(chili).find(event =>
    event.type === 'substitute_proposed' && event.data.proposal_id === offer?.proposal_id && event.data.listing_id === 'L-9');
  const approved = context(chili).find(event =>
    event.type === 'seller_decided' && event.data.proposal_id === offer?.proposal_id && event.data.decision === 'approve');
  require(proposals.length === 1 && offer.ingredient_id === chili?.ingredient_id && offer.listing.listing_id === 'L-9' &&
    offer.listing.price_idr === 18500 && offer.registry.record_id === 'R-301' && offer.registry.certificate_number === 'ID-SIM-0301' &&
    !!search && rejectedCurah && !!offered && !!approved && search.seq < offered.seq && offered.seq < approved.seq &&
    (corrected?.seq ?? Infinity) < search.seq,
  'Require ordered Shopee exclusion, exact L-9 offer and seller approval, exported separately pending adoption.');

  return { passed: !failures.length, failures, score };
}
