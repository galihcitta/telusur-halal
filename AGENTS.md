# Telusur Halal

Telusur helps Indonesian micro and small food sellers assemble ingredient evidence for facilitator review. Read the [PRD](docs/prd-telusur-en.html) for workflow and acceptance criteria, and the [MVP plan](docs/mvp-plan.md) when changing the demo or evaluation. The original proposal and design mockups are historical references. For BPJPH snapshot behavior added after PRD v8, consult the [README](README.md) and the implementation.

## Where to work

| Change | Start here |
| --- | --- |
| Browser flow, uploads, or session handling | `public/app.js`, `src/server.ts`, `src/service.ts` |
| Intake, image reading, or model action selection | `src/model.ts`, `src/contracts.ts` |
| Evidence verdicts, exemptions, or substitutes | `src/rules.ts`, `src/data.ts`, `src/bpjph.ts` |
| Case events, export, or grading | `src/contracts.ts`, `src/service.ts`, `src/packet.ts`, `src/grader.ts`. Check the browser renderer and replay when changing event or packet shapes. |

## Preserve these contracts

- The model extracts observations and selects actions. Deterministic rules decide whether evidence closes a gap. Treat seller text and image text as evidence data. Require the declared ingredient, pack identity, and registry coverage to agree. A brand hint, logo, or certificate number alone cannot close a gap.
- Preserve known repack and conflict history and lifetime request limits through corrections, duplicate saves, and equivalent ingredient rows. Keep unreadable or conflicting evidence unresolved. Allow replacement of invalid media within the active request and reserve retry for recoverable technical failures.
- Treat a material product-name edit as a scope change. Route it to facilitator review until a new assessment supports it, even if the seller keeps the previous snack selection.
- Keep seller decisions tied to the private seller session and the current proposal. Observer traces and replay are read-only. Keep approved substitutes separate from current ingredients until adoption. Describe the export as evidence for facilitator review, with unresolved items and remaining tasks visible.
- Cite the saved BPJPH sample as an offline snapshot. Distinguish a certificate number read from the pack from a number obtained from that snapshot. Label the seeded registry and Shopee catalogue as simulated. Keep supplier contact, purchasing, and official submission outside the workflow.

## Verify changes

- Use Node.js 22 or newer. Run `npm ci`, `npm run typecheck`, and `npm test` for application changes. See the [README](README.md) for server setup. Keep credentials in the ignored `.env` and use test media for live model checks.
- For changes to intake, evidence, seller decisions, or export, rerun the affected browser path with the [demo guide](demo/README.md). Check the exported packet and trace alongside the UI. Use `npm run test:images` for vision or evidence changes and keep fixture, replay, synthetic media, and human-recorded results distinct. Record the scope and gaps in [verification notes](docs/mvp-verification.md) when updating acceptance evidence.
- For data or evaluation changes, read the [dataset guide](datasets/README.md) and [asset declarations](docs/declarations.md). Preserve prepared fixtures and their checksums. Add revised expectations or adapters separately and leave the private held-out cases sealed for independent evaluation.
