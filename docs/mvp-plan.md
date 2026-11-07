# Telusur MVP and demo plan

Date: 7 November 2026. Build order and demo companion to [PRD v8](prd-telusur-en.html), which defines the binding contracts and acceptance gates. This revision incorporates the adversarial review; the original PRD v7 remains in Git history.

## Decisions

- Build fresh in this repository. Galih confirmed that only prepared datasets and rehearsal lessons may transfer; do not copy prototype code, tests, prompts, or UI implementation.
- No supplier contact, supplier simulator, supplier inbox, or WhatsApp integration.
- Seller supplies a Bahasa Indonesia voice note, product-label photo, and requested ingredient-pack photos. Text is a recovery option.
- One snack product category and one convincing end-to-end story before expanding scope.
- Keep Shopee substitute search and seller choice in the core hackathon flow: this is a Shopee hackathon, and the product must visibly connect missing ingredient evidence to a suitable registry-linked recommendation.
- The model selects actions; independently enforced rules decide whether evidence closes a gap. Model prose cannot set a verdict.
- A brand mentioned at intake is a search hint, not certification evidence. Non-exempt goods need pack-derived identity; changing the cited source cannot erase a known repack or mismatch.
- Record where an ingredient is bought separately from its sealed, repacked, loose, or unknown condition. A market purchase is not automatically loose.
- Unknown exemption conditions remain unresolved. A matching ingredient name alone does not prove all conditions of an exemption.
- Deliver an ingredient evidence packet for facilitator review, with a remaining-application checklist. Do not claim certification or external SiHalal submission.

## What the rehearsal establishes

The separate `halal-agent` project is a reference for lessons, not a source to import.
Fresh no-model checks passed: backend typecheck, 93 unit tests, 21 development scenarios,
9 adversarial scenarios, and UI production build. Scripted scenarios had all four hard
gates at zero: wrong approvals, authority breaches, false-ready outcomes, and wasted asks.

These results do not establish current-model accuracy. Saved Claude results predate the
pack-photo design; intake fixtures were used for prompt tuning. The day-of OpenAI build
needs its own model and real audio/photo evidence.

## Build order

| Order | Deliverable | Completion gate |
| --- | --- | --- |
| 1 | Freeze the case/event contracts; implement evidence checks, seller approval gates, and an independent grader against permitted data | Wrong variant, borrowed certificate, source-switch bypass, unknown exemption conditions, and unauthorized approval are rejected; grader catches deliberately invalid traces |
| 2 | Spike the OpenAI agent on one case; connect the guarded tools and action events | The real model encounters a rejected close, chooses another action, waits for seller approval, and produces a packet |
| 3 | In parallel with 1–2, implement voice + label intake and the seller screen against the agreed events | Browser accepts recorded audio and a label photo; extracted ingredients can be reviewed/corrected; case creation does not require a scenario ID |
| 4 | Join the seller screen, pack-photo requests, Shopee search/product cards, substitute decision, trace, and packet export | A person completes the full case from browser inputs, inspects a registry-linked Shopee candidate, approves/rejects it or considers one alternative, and exports the packet with no terminal intervention |
| 5 | Run current-model dev/adversarial evaluations, the actual-image acceptance matrix below, and real audio/photo smoke cases; fix failures | No unsafe acceptance, unauthorized decision, or false evidence-complete outcome in the evaluated cases; record sample sizes, intake coverage, latency, and failures; report unnecessary asks separately |
| 6 | Freeze, record an offline backup, finish writeup and rehearse the six-minute presentation | Demo repeats successfully; submission artifacts and public repo are ready before the deadline |

Begin with steps 1–3, not a landing page or a large dashboard. Get a real OpenAI tool loop
working early enough to discover SDK and model problems before polishing the UI.

## MVP scope

Required:

- Voice recording/upload and label upload with visible extraction and a correction step.
- Seller confirmation before checking evidence. A correction invalidates affected evidence and approvals; stable ingredient IDs are independent of display order.
- Ingredient evidence cards distinguish current evidence, proposed replacement awaiting approval, approved replacement pending adoption, and unresolved items.
- Pack photo request, actual vision reading, and source-linked verification of product, producer, certificate, and exact variant.
- Require agreement between declared ingredient, pack identity/variant, and registry coverage. Fuzzy matching retrieves candidates; it does not establish exact coverage. Keep conflicting evidence in case state.
- Treat seller text and pack text as evidence data, never instructions. Photos alone cannot establish registry certification.
- At most two pack requests per ingredient; do not ask for packs for confirmed exempt or explicitly loose ingredients. A branded ingredient can still require identity clarification.
- Shopee substitute search is P0, using the curated simulated catalogue. Each product card shows the exact product/variant, manufacturer, shop, price, pack size when supplied, and the registry linkage with its provenance. The listing ID and seed-to-registry mapping are declared simulated associations, not independently verified live listings. Offer seller approval/rejection and at most one suitable alternative after a decline.
- Use a real listing URL only when its exact product/manufacturer/variant linkage has actually been verified and declared; never fabricate a Shopee URL, checkout link, availability, or purchase. The required demo works with clearly labelled simulated cards.
- Record seller consent to the proposed change. Approval does not prove purchase or adoption. Export proposed ingredients separately and mark revised-recipe evidence as conditional on adoption.
- Bind approvals to the seller session or a private capability and the current proposal; an observer of the trace cannot approve. A login system is unnecessary for this single-case demo.
- Clear facilitator-review or route-assessment outcomes when evidence cannot be resolved. A network failure must show retry/pause, not imply regulatory ineligibility.
- Ingredient table export plus certificate/exemption basis, evidence provenance, unresolved items, and remaining application tasks.
- Concise action trace showing what was checked, rejected, and tried next. No raw private model reasoning.
- Visible data mode: simulated registry/catalogue for the hackathon. Never present fixtures or oracle readings as actual image perception or live official verification.

Deferred until after the core hackathon flow works: a separate phone/QR camera page, pantry
memory, additional product cases/categories, facilitator queue/dashboard, automated eligibility
assessment, production-process or Manual SJPH drafting, presentation animation, model-based
grading, and extensive repeated evaluations. Main-screen uploads and packet export remain required.
If memory is later added, scope it to the seller and exact product, confirm current use, and
recheck registry evidence; the shop and ingredient name alone are not a safe reuse key.

Out of scope: supplier messaging, purchases/payments, actual SiHalal submission, automated
certification, official registry/catalogue integration, a complete regulatory eligibility
determination, and unsupported claims that all documents are ready to submit.

## Demo story

Use D01's banana snack: banana, cooking oil, Original seasoning, and loose chili. Use real
voice and image input even when the registry and catalogue are labelled simulations.

1. Seller describes the snack in Bahasa and uploads the label; ingredients appear for confirmation.
2. Banana closes only after the relevant exemption conditions are confirmed. Batch the oil and seasoning pack request; brand-only oil intake no longer closes a gap.
3. Read the oil and seasoning photos with the real vision reader. The first seasoning photo is a different variant; the check rejects it with a visible reason.
4. A corrected Original seasoning pack closes that gap. For the explicitly loose chili, search the simulated Shopee catalogue and show a card with product/variant, manufacturer, shop, pack size when supplied, price, and simulated registry linkage. Wait for seller approval of the proposed change; after a decline, show one suitable alternative or leave it unresolved.
5. The evidence packet appears, including sources, unresolved items, and what the seller/facilitator still needs to do. Keep current ingredients separate from the approved replacement pending adoption; the export does not imply that a purchase or actual swap occurred.
6. If time permits, the judge supplies another pack or declines the swap; the outcome changes honestly.

Suggested presentation allocation: 40 seconds problem; 3 minutes working flow; 50 seconds
adversarial/evaluation evidence; 45 seconds Codex build evidence; 45 seconds value and limits.
The PRD records six minutes plus two minutes Q&A, English, and a 16:30 form
deadline with a 16:00 team submission target. Confirm any organizer updates on-site.

## Data and evaluation

Cooked-dish entry now also has a separate [photo development evaluation](../datasets/dish-photos/README.md), run with `npm run eval:dishes`. Freeze dish aliases and visible ingredient annotations before model runs; keep full recipe references separate. Track recognition, visible precision/recall, unsupported additions, duplicates, negative-image false acceptances, and technical failures. Keep public/team photos and synthetic images separate in reports. Initial labels need independent evaluator review. This supplements the original pack/audio evaluation below without altering prepared or held-out data.

- Use the pack-photo dataset, not the older supplier-message pack. Its manifest was checked across 127 files with no checksum mismatches.
- Preserve that prepared snapshot. Implement and declare day-of adapters and revised expectations separately; old `submission_ready`/`submitted` outcomes, brand-only oil verification, and exact ask counts are legacy contracts, not v8 requirements. Add and declare a coherent simulated oil pack asset for the revised D01 story; never quietly substitute an oracle reading for a photo.
- Available: 21 dev + 9 adversarial scenarios, registry/catalogue seeds, exemption reference, 19 pack photos, and 15 intake transcripts with gold lists.
- Real voice recordings and phone label photos are absent from the inspected dataset pack. Record and test them early.
- Preserve the held-out archive for Alba's independent evaluation; do not inspect it or tune on it.
- Scripted tests validate rules and infrastructure. Model runs validate action selection. Audio/photo runs validate perception. Report them separately.
- The actual-image acceptance gate uses the real vision reader with oracle mode disabled on at least eight representative cases: a correct pack; the wrong variant; an extra-token variant such as Extra Pedas versus Pedas; another product carrying a borrowed valid number; an obscured/unreadable identity or number; a logo-only pack with missing identity; a repack/instruction sticker; and conflicting typed text next to a photo. Unreadable or conflicting evidence must remain unresolved or trigger bounded clarification. Record each result and any unsafe acceptance; do not claim statistical safety from this small matrix.
- Run at least one actual recorded-audio/product-label intake through confirmation and packet export. Report typed recovery, simulated evidence, and replay use explicitly.
- Match extracted ingredients to gold independently of order and record the mapping; reordered lists, missing ingredients, extras, and duplicates must be scored explicitly.
- Count failed intake attempts in the evaluation denominator and exit nonzero when a gate fails; the rehearsal runner did neither reliably.
- Distinguish unsafe evidence acceptance from an unnecessary but valid substitute. The prepared labels can conflate these; document or correct the grading definition before presenting a safety metric.
- Report needless swaps, workflow deviations, and unnecessary asks separately from safety failures. Compare the model with the scripted workflow under the same evidence inputs when reporting its added value; a deliberately limited form-filler baseline alone is insufficient.
- Report approved Shopee recommendations divided by eligible unresolved ingredient gaps, plus declines, recommended product prices, and remaining adoption tasks. These are recommendation outcomes, not purchases, conversion, or actual sales. A pending or rejected proposal cannot improve the evidence-complete count for the current recipe.
- Resolve uncertain domain labels (including D11 tempe) with a facilitator, or explicitly mark them unresolved in the evaluation.
- Report observed counts, not a blanket safety claim. Zero wrong approvals in a small synthetic suite is a result within that suite.
- Do not mix simulated catalogue certificate IDs with a live registry. Use a coherent labelled simulation for the hackathon; genuine registry/listing integration belongs to later work.

## Corrections to carry into the pitch

`background.md` is the historical registration proposal. Its supplier messaging and complete
submission-ready wording are superseded by the decisions above.

The original October 2026 UMK deadline claim is also outdated: BPJPH's explanation of PP
40/2026 says UMK food/drink and related listed categories have a transition period through
17 October 2028. Frame the problem around the difficulty of assembling exact evidence,
rather than claiming this seller is already overdue.

Source: [BPJPH explanation of PP 40/2026](https://bpjph.halal.go.id/main/read/penyesuaian-penahapan-kewajiban-sertifikasi-halal-diatur-dalam-pp-40-tahun-2026-begini-rinciannya).

## Immediate next milestone

A newly implemented OpenAI-backed case that rejects the wrong seasoning variant, accepts
only evidence checked by the rules, pauses for a real seller decision, and exports a cited
ingredient packet. Build the voice/photo entry in parallel against the same contracts.
