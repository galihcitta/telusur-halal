import type { CaseView } from './contracts.js';
import { BPJPH_DATASET_VERSION } from './bpjph.js';
import { DATASET_VERSION } from './rules.js';

const checklist = [
  'Review the seller account and NIB.',
  'Confirm the halal supervisor and cleaning agents.',
  'Review packaging, product details and product photos.',
  'Review the production process and Manual SJPH where applicable.',
];
export function buildPacket(view: CaseView) {
  const events = view.events.filter(event => event.revision === view.revision);
  const current = view.ingredients.map(row => {
    const verdict = events.findLast(event => event.type === 'evidence_checked' && event.data.ingredient_id === row.ingredient_id);
    return {
      ingredient_id: row.ingredient_id, ingredient: row.declared_name, brand: row.brand, variant: row.variant,
      status: row.status, basis: row.basis, reason: row.reason, source_refs: verdict?.data.source_refs ?? row.source_refs,
      evidence: row.evidence.filter(evidence => evidence.revision === view.revision),
      next_action: row.status === 'open' || row.status === 'unresolved'
        ? 'Facilitator to review this gap and confirm the ingredient actually used.' : undefined,
    };
  });
  return {
    case_id: view.case_id, revision: view.revision, product_name: view.product_name, scope: view.scope,
    source_mode: view.source_mode, dataset_version: DATASET_VERSION,
    bpjph_dataset_version: BPJPH_DATASET_VERSION,
    evidence_complete: view.scope === 'snack' && current.length > 0 &&
      view.ingredients.every(row => !row.conflict && (row.status === 'verified' || row.status === 'exempt')),
    current_ingredients: current,
    unresolved_items: current.filter(row => row.next_action),
    conditional_proposals: view.proposals.filter(proposal => proposal.status === 'approved').map(proposal => ({
      ...proposal, adoption: 'pending', next_action: 'If you choose to adopt this change, obtain the exact product and confirm the pack actually used.',
    })),
    facilitator_checklist: checklist,
    simulation_notice: 'BPJPH matches refer to saved public search results. Demo registry entries and Shopee offers use simulated data. Ingredient evidence for facilitator review.',
  };
}
function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function packetHtml(packet: ReturnType<typeof buildPacket>) {
  const cells = (values: unknown[]) => values.map(value => `<td>${escape(value)}</td>`).join('');
  const rows = packet.current_ingredients.map(row => `<tr>${cells([
    [row.ingredient, row.brand, row.variant].filter(Boolean).join(' · '), row.status, row.basis,
    Array.isArray(row.source_refs) ? row.source_refs.join('\n') : '', row.next_action,
  ])}</tr>`).join('');
  const proposals = packet.conditional_proposals.map(({ listing, registry, next_action }) =>
    `<li><strong>${escape([listing.product, listing.variant, listing.pack_size].filter(Boolean).join(' · '))}</strong>
    <p>${escape(listing.manufacturer)} · ${escape(listing.shop)} · Rp${listing.price_idr.toLocaleString('id-ID')}</p>
    <p>${escape(registry.record_id)} · ${escape(registry.certificate_number)} · ${escape(listing.source_ref)}</p>
    <p>${escape(next_action)}</p></li>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Telusur Halal evidence packet</title>
  <style>body{font:16px/1.55 system-ui;max-width:76rem;margin:3rem auto;padding:0 1.5rem;color:#16342d}table{border-collapse:collapse;width:100%}th,td{border:1px solid #b3c3bd;padding:.6rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}td:nth-child(4){white-space:pre-line;font-size:.8rem}h2{margin-top:2rem}@media print{body{margin:0;padding:0}}</style>
  <h1>${escape(packet.product_name)} · Evidence packet</h1>
  <p>${escape(packet.simulation_notice)}</p><p>Revision ${packet.revision} · ${escape(packet.source_mode)} · ${escape(packet.dataset_version)} · ${escape(packet.bpjph_dataset_version)}</p>
  <h2>Current ingredients</h2><p>${packet.evidence_complete ? 'Ingredient evidence complete for this revision.' : 'Open evidence gaps remain.'}</p>
  <table><thead><tr><th>Ingredient</th><th>Status</th><th>Basis</th><th>Sources</th><th>Next action</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>Approved replacements pending adoption</h2>${proposals ? `<ul>${proposals}</ul>` : '<p>None.</p>'}
  <h2>Seller and facilitator checklist</h2><ul>${checklist.map(task => `<li>${escape(task)}</li>`).join('')}</ul></html>`;
}
