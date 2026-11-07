# D01 media and vision gate

D01 uses a simulated label, spoken audio, and simulated pack images. The app sends the actual media bytes to the configured API. The text and expected observations below are reference data for the demo and evaluation.

| Browser input | File | Provenance |
| --- | --- | --- |
| Audio | [d01-bahasa-synthetic.mp3](d01-bahasa-synthetic.mp3) | Synthetic Indonesian speech rendered locally with macOS Damayanti and encoded to MP3 with FFmpeg. |
| Product label | [L01_D01.sim.png](../datasets/pack-photos/repo/evals/intake/photos/L01_D01.sim.png) | Prepared dataset snapshot. |
| Oil pack | [d01-sentosa.png](d01-sentosa.png) | Day-of graphic drawn with Pillow for simulated record R-101, ID-SIM-0101. |
| First seasoning pack | [D01_pack_pedas.png](../datasets/pack-photos/repo/fixtures/photos/D01_pack_pedas.png) | Prepared dataset snapshot. |
| Corrected seasoning pack | [D01_pack_original.png](../datasets/pack-photos/repo/fixtures/photos/D01_pack_original.png) | Prepared dataset snapshot. |

The audio says: “Halo, saya Bu Sari. Saya jualan keripik pisang original. Bahannya empat. Pisang kepok segar tanpa bahan tambahan, saya beli di pasar. Minyak goreng Sentosa kemasan pabrik tersegel, tidak ada varian. Bumbu balado varian Original, kemasan pabrik tersegel, saya beli di Toko Bumbu Jaya. Lalu cabai bubuk, saya beli curah tanpa merek di pasar. Itu saja, terima kasih.”

The three additional pack graphics were drawn with Pillow for the vision gate: Extra Pedas borrowing ID-SIM-0201, Bumbu Rendang borrowing ID-SIM-0202, and Bumbu Balado Original with a partially covered certificate number. All names and numbers in these graphics refer to the prepared simulation.

Run the actual-image gate from the repo root with the team key configured in the ignored `.env` file:

```sh
node --env-file-if-exists=.env --import tsx demo/check-images.ts
```

Each case submits a PNG to the vision API, checks its observation against fixed expected fields, and sends the observation through the same deterministic evidence rule as the app. The source-switch case then submits a separately identified seller-typed observation against the recorded conflict. The runner reports attempts, latency, technical failures, unsafe accepts, and false refusals. It exits nonzero on a failed case.

The unsupported-scope browser check uses [scope-bahasa-synthetic.mp3](scope-bahasa-synthetic.mp3), another local Damayanti recording, with the Pillow-drawn [scope-sosis-label.png](scope-sosis-label.png). Both sources mention chicken, salt, and garlic. Add omitted ground pepper in the review screen before confirming. The sausage is fermented and smoked, so the case needs facilitator review.

For the unsupported-case smoke test, upload [the sausage recording](scope-bahasa-synthetic.mp3) and [its simulated label](scope-sosis-label.png). The recording was rendered with macOS Damayanti and encoded with FFmpeg. The label was drawn with Pillow. Add `merica bubuk` if the draft omits it, then confirm. The facilitator review should show all four rows without pack requests.

`bash demo/browser-d01.sh` runs the live flow through the browser and writes the downloaded HTML, JSON and saved trace to the ignored `.run/` directory. It requires `agent-browser` and a local server already running.

To exercise direct recording, feed the synthetic Bahasa fixture through Chromium's test microphone. The browser records and plays it back before submitting the captured audio to the live intake service.

```sh
mkdir -p .run
ffmpeg -i demo/d01-bahasa-synthetic.mp3 -ac 1 -ar 48000 .run/mic-d01.wav
TELUSUR_MIC_WAV="$PWD/.run/mic-d01.wav" bash demo/browser-d01.sh
```

## Cooked-dish photo evaluation

Run `npm run eval:dishes -- --validate` to check assets without AI, then `npm run eval:dishes` for the live `readDish` path. See the [photo reference gallery and annotation guide](../datasets/dish-photos/README.md). [Initial baseline](dish-eval-baseline.json): 4/5 passed, with one false acceptance of a product-label image. All annotations are draft pending independent evaluator review; this small development set does not establish general accuracy. The runtime prompt was not tuned during this evaluation.

Photo eval coverage now also includes `npm run eval:dishes:field` for the locally supplied sale-pisang photo, and `npm run eval:corrections` for controlled seller-correction fixtures. See [coverage and collection requirements](../docs/eval-coverage.md). [Field baseline](dish-field-baseline.json) and [repeat](dish-field-repeat.json) retain both incorrect live predictions; [development rerun](dish-coverage-baseline.json) retains the label-image false acceptance. User photo bytes stay in ignored `.run/`.
