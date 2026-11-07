# Telusur Halal

A proposed halal evidence assistant for micro and small food businesses in Indonesia.

The agent turns a seller's voice note and product label into a confirmed ingredient list, identifies missing halal evidence, and checks package photos against a saved BPJPH public search sample and a clearly labelled simulated registry.

Shopee substitute discovery is part of the core demo: search the simulated catalogue, show a registry-linked product card with shop and price, and let the seller approve, reject, or consider one alternative. Proposed swaps remain conditional until adopted; approval does not establish a purchase or a change to goods already used.

The agent never contacts suppliers. It prepares an ingredient evidence packet and remaining-application checklist for facilitator review.

## Run the MVP

Use Node.js 22 or newer. Install the pinned dependencies, copy the environment template, and set `OPENAI_API_KEY` in the ignored `.env` file.

```sh
npm ci
cp -n .env.example .env
npm run dev
```

Open [the local seller screen](http://127.0.0.1:4173). The app sends uploaded audio and photos to the configured OpenAI API for transcription and image reading. The case store is in memory. Download the HTML or JSON packet and the read-only trace before closing the case or restarting the server.

For the full D01 flow, use the [demo input guide](demo/README.md). Confirm the draft, upload the Sentosa oil pack, then submit Pedas and Original for the seasoning in that order. Approve the simulated Shopee plan and export the packet. Use **Putar ulang jejak tersimpan** on the start screen to open a downloaded trace locally.

```sh
npm run typecheck
npm test
npm run test:images
npm run compare:policy
# With the server running and agent-browser installed
bash demo/browser-d01.sh
```

See the [verification report](docs/mvp-verification.md) for the browser run, vision cases, and evaluation limits.

## Shared dataset

The app also matches package evidence against the normalized BPJPH public search snapshot from [PR #1](https://github.com/galihcitta/telusur-halal/pull/1), collected on 7 November 2026. The snapshot is an offline keyword sample. Matches cite the BPJPH search and distinguish a certificate number read from the pack from one returned by the snapshot. The simulated registry and Shopee catalogue support the original demo. See [the imported records](datasets/bpjph-demo/products.json).


Start with the [dataset guide](datasets/README.md). The pack-photo dataset includes registry and catalogue seeds, development and adversarial scenarios, pack images, intake transcripts and expected results. See [pre-event asset declarations](docs/declarations.md) for provenance.

## Background

See the [PRD v8](docs/prd-telusur-en.html) for the current hackathon contracts and acceptance gates, and the [MVP plan](docs/mvp-plan.md) for the build order and demo. Version 8 applies the adversarial review and replaces the original v7, which remains in Git history. The local design images under `docs/prd-assets/` are visual references; their sample copy and states are superseded by v8.

See [the hackathon proposal](docs/background.md) for the motivation, planned workflow, evaluation goals, and team background. It records the original proposal; regulatory statements and delivery targets should be verified before implementation.
