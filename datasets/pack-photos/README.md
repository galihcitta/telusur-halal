# Telusur dataset, pack-photo version (prepared before the event)

This is the data Telusur needs for the Sea x OpenAI Codex Hackathon on 7 Nov 2026. Ask Supplier is out of scope,
so the dataset uses the pack-photo contracts tested in the pack-photos prototype (halal-agent PR #1): the agent asks
the seller to photograph or type what is printed on the pack, and never contacts anyone else.

**This folder replaces `telusur-dataset/`.** That folder holds the earlier Ask Supplier version. Nothing in it was
overwritten, and you can delete it once you're happy with this one.

The folder holds only data: YAML, JSON, JSONL, Markdown, PNG and text. There is no code, because pre-built code
can't be submitted.

**Everything is simulated.** Sellers, shops, producers, brands, packs and notes are made up. Every certificate number
has the form ID-SIM-dddd (NFR-06), and no real-format number appears anywhere. Every YAML file starts with a SIMULATED
header. Every pack photo is stamped "SIMULASI · BUKAN KEMASAN ASLI", and every certificate number on a photo is an
ID-SIM number.

The checks and their results are in VALIDATION_REPORT.md.

## What's here

| Path | What it is |
|---|---|
| repo/evals/seed/registry.yaml, shopee.yaml | mock halal registry (40 records) and Shopee catalog (19 listings); unchanged |
| repo/src/data/exempt_list.yaml | exempt ingredients, KMA 1360/2021 (8 entries); unchanged |
| repo/evals/scenarios/dev/D01–D21.yaml | 21 dev scenarios, pack contracts, per-ingredient gold labels |
| repo/evals/scenarios/adv/A01–A09.yaml | 9 adversarial scenarios, with the traps now on packs and in the seller's notes |
| repo/evals/LABELS_CHANGELOG.md | what changed for pack photos, `check: true` uses, the D11 tempe question |
| repo/fixtures/photos/*.png | 19 simulated pack photos the scenarios refer to (`pack.first.file`, `pack.on_reask.file`) |
| repo/evals/tests/traces/G01–G13.jsonl, expected.yaml | 13 grader test cases with the new events (`pack_requested`, `pack_received`), including the wasted_ask gate |
| repo/fixtures/traces/D01_golden.jsonl, D01_golden.application.json | the D01 golden run, plus its SiHalal table |
| repo/tests/data/D01.yaml, D02.yaml, registry_test.yaml | test copies; D01 and D02 in the pack contracts |
| repo/evals/intake/… | intake gold, transcripts and simulated labels for the 15 voice notes; unchanged |
| recording-kit/ | what the team records and photographs tonight; unchanged |
| reference/exempt-ingredients.json | the team's encoding of KMA 1360/2021 and Kepkaban 301/2026 |
| Held-out evaluation | Not included in this public repository. Alba keeps the private archive separately (NFR-05). |
| SHA256SUMS | hashes of every file here |

## Tomorrow, first hour

1. Copy everything under `repo/` into the new repo. If the repo follows the prototype's layout (halal-agent PR #1),
   four paths differ, so copy these as shown:

   | From this folder | To the repo |
   |---|---|
   | `repo/fixtures/photos/*.png` | `evals/fixtures/photos/` |
   | `repo/fixtures/traces/*` | `evals/fixtures/traces/` |
   | `repo/src/data/exempt_list.yaml` | `src/domain/data/exempt_list.yaml` (same entries as the prototype's) |
   | `repo/tests/data/registry_test.yaml` | don't copy over the repo's own. The prototype's adds R-801, a real-format number that two of its tests need. |

   Everything else goes in at the same path. The prototype's intake eval reads a different layout
   (`evals/intake/<scenario>.transcript.txt` and `<scenario>_label.png`) and has no audio input. To score the 15
   recordings, the intake eval built at the event needs to read `evals/intake/gold/` with the audio, as
   RECORDING_GUIDE.md describes.
2. Add tonight's recordings and photos:
   - `evals/intake/audio/R01_D01.m4a` … `R15_D19.m4a`
   - `evals/intake/photos/L01_D01.jpg` … `L10_D19.jpg`
3. This public copy is declared as "Dataset prepared before the event (simulated data, no code)" in
   docs/declarations.md (K1).
4. Alba keeps the held-out zip outside the repo and checks its hash before the run.

## What the team still has to make tonight

The voice notes and label photos are unchanged by the pack switch:

- 15 voice notes
- 10 label photos

recording-kit/RECORDING_GUIDE.md has the scripts, who records which, and the gold answers. The pack photos the
scenarios need are already rendered, so nobody has to photograph packs.
