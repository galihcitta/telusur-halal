import { z } from 'zod';

const name = z.string().trim().min(1).max(250);
export const variant = z.union([name, z.null()]); // null = confirmed no variant; empty in seller form becomes undefined
export const ingredientInput = z.object({
  ingredient_id: z.string().uuid().optional(),
  declared_name: name,
  brand: name.optional(),
  variant: variant.optional(),
  form: z.enum(['fresh', 'processed', 'unknown']),
  pack_condition: z.enum(['sealed', 'repacked', 'loose', 'unknown']),
  purchase_location: name.optional(),
  no_additives: z.boolean().optional(),
});
export const confirmation = z.object({
  product_name: name,
  scope: z.enum(['snack', 'facilitator_review']),
  reviewed: z.literal(true),
  ingredients: z.array(ingredientInput).min(1).max(20),
});
export const observation = z.object({
  product: name.nullable(),
  manufacturer: name.nullable(),
  variant: variant,
  variant_known: z.boolean(),
  certificate_number: name.nullable(),
  certificate_state: z.enum(['printed', 'absent', 'unreadable']),
  repacked: z.boolean(),
  unreadable_fields: z.array(name).max(10),
});
export type Observation = z.infer<typeof observation>;
export type IngredientInput = z.infer<typeof ingredientInput>;
export type Confirmation = z.infer<typeof confirmation>;
export type Phase = 'intake_review' | 'checking' | 'awaiting_seller' | 'paused' | 'review_packet';
export type SourceMode = 'actual_media' | 'fixture' | 'replay';
export type Status = 'open' | 'exempt' | 'verified' | 'unresolved';
export type Reason =
  | 'EXEMPT_CONDITIONS' | 'EXEMPT_UNKNOWN' | 'EXACT_IDENTITY' | 'IDENTITY_MISMATCH'
  | 'UNREADABLE' | 'CERTIFICATE_MISMATCH' | 'REGISTRY_NO_UNIQUE_MATCH'
  | 'CONFLICT_OR_REPACK' | 'SOURCE_BOUND' | 'NO_PACK' | 'SCOPE_REVIEW' | 'TECHNICAL_FAILURE';
export interface Evidence {
  evidence_id: string;
  case_id: string;
  revision: number;
  ingredient_id: string;
  request_id: string;
  source_type: 'photo' | 'seller-typed';
  source_refs: string[];
  observed: Observation;
  confirmed_current: boolean;
  conflicts: Reason[];
}
export interface Ingredient extends Omit<IngredientInput, 'ingredient_id'> {
  ingredient_id: string;
  source_refs: string[];
  status: Status;
  reason?: Reason;
  basis: string;
  evidence: Evidence[];
  requests: number;
  conflict: boolean;
  pending_request?: { request_id: string; attempt: number };
}
export interface RegistryRecord {
  record_id: string;
  certificate_number: string;
  product: string;
  manufacturer: string;
  variant: string | null;
  dataset_version: string;
  source_ref: string;
}
export interface Listing {
  listing_id: string;
  product: string;
  variant: string | null;
  manufacturer: string;
  shop: string;
  price_idr: number;
  pack_size?: string;
  record_id: string | null;
  repacked: boolean;
  source_ref: string;
  fit: string;
}
export interface Proposal {
  proposal_id: string;
  case_id: string;
  revision: number;
  ingredient_id: string;
  listing: Listing;
  registry: RegistryRecord;
  status: 'pending' | 'declined' | 'approved';
}
export const eventTypes = [
  'intake_parsed', 'intake_confirmed', 'pack_requested', 'pack_received', 'pack_read',
  'evidence_checked', 'catalogue_searched', 'substitute_proposed', 'seller_decided',
  'case_paused', 'packet_exported', 'agent_action',
] as const;
export const eventSchema = z.object({
  seq: z.number().int().positive(),
  timestamp: z.iso.datetime(),
  case_id: z.string().uuid(),
  revision: z.number().int().positive(),
  type: z.enum(eventTypes),
  data: z.object({ summary: z.string().trim().min(1).max(2000), ingredient_id: z.string().uuid().optional() }).catchall(z.unknown()),
});
export type CaseEvent = z.infer<typeof eventSchema>;
export type EventType = CaseEvent['type'];
export interface Draft {
  product_name: string;
  scope: Confirmation['scope'];
  ingredients: IngredientInput[];
  notes: string[];
  transcript: string;
}
export interface CaseView {
  case_id: string;
  revision: number;
  phase: Phase;
  source_mode: SourceMode;
  product_name: string;
  scope: Confirmation['scope'];
  draft?: Draft;
  confirmed_ingredient_ids: string[];
  ingredients: Ingredient[];
  proposals: Proposal[];
  events: CaseEvent[];
  error?: string;
}
export interface Media { bytes: Buffer; mime: string; name: string }
export type AgentAction = 'request_pack' | 'search_catalogue' | 'refer';
export interface Model {
  intake(audio: Media, label: Media): Promise<Draft>;
  readPack(images: Media[]): Promise<Observation>;
  choose(input: { ingredient: string; reason?: Reason; allowed: AgentAction[] }): Promise<AgentAction>;
}

export class IntakeInputError extends Error {}

export class PackInputError extends Error {}
