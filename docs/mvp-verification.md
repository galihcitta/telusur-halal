# PRD v8 MVP verification

## Integration release-blocker retest — 7 November 2026

The integration branch was retested through visible browser controls using CUA against the actual local app and configured OpenAI services. Uploaded D01 audio is synthesized Bahasa Indonesia; label and package PNGs are prepared simulated graphics. No oracle observations or scenario IDs were supplied to browser intake. The BPJPH integration uses the saved public-search snapshot, not a fresh official lookup or physical-pack authentication.

Typecheck and the full test suite passed: **33/33 tests**. New regressions cover removal/re-addition of repacked ingredients, whitespace and explicit aliases, restoration of original IDs, genuinely different ingredients (including retained display IDs), and replacement of invalid image input on the same request. API image-error classification is tested separately from transient/configuration errors.

### Corrupt photo recovery and original D01

The browser uploaded a malformed PNG (`not-a-real-image`) to the oil request. It displayed Indonesian replacement guidance and kept the case and pack controls usable. Uploading the valid simulated Sentosa image then verified the oil. The request ID stayed the same and remained attempt 1; the rejected file did not consume another evidence request.

The same browser case continued through the original D01 sequence: Pedas was refused for Original, the corrected Original photo was accepted on request 2, the simulated L-9 chili proposal was approved, and HTML, JSON and trace were downloaded. Independent inspection found one oil request/receipt/read, two seasoning requests/receipts/reads, one proposal and one seller decision, with no duplicate decision or technical-pause event. The existing D01 grader accepted the downloaded trace and packet with no omissions, additions, duplicates or failures.

The packet retained four current ingredients: exempt banana, verified oil and Original seasoning, and unresolved loose chili. L-9 appeared separately as an approved plan with adoption pending; `evidence_complete` remained false.

Local browser evidence (not committed): `/Users/galihcitta/.codex/visualizations/2026/11/07/01a1b433-ac9f-7871-94f1-bdbce3fd2af4/telusur-release/`. D01 artifacts include `corrupt-recoverable.jpg`, `d01-final.jpg`, `d01-packet.json`, `d01-trace.json`, `d01-evidence.html`, and the reconstructed grader input `d01-export.json`.

### Known repack history

The browser reproduced the original extra-space attack: the seller first marked Sentosa oil as repacked, then removed it and added `minyak  goreng` with two internal spaces, brand Sentosa and a sealed condition. The revised case still classified it as repacked and unresolved (`CONFLICT_OR_REPACK`), with no new pack request or typed-evidence form through which to override the history. The downloaded revision-2 JSON had `evidence_complete: false`; its trace recorded the oil with zero requests. Evidence: `repack-packet.json`, `repack-trace.json`, and the accompanying screenshots in the local evidence directory.

### Distinct Palmia ingredient and saved BPJPH match

A final browser retest combined the repack attack with a genuinely different ingredient, `Margarin Palmia Super Cake`. The re-added `minyak  goreng` stayed repacked/unresolved with zero requests, while Palmia remained sealed, received its own request, and verified normally. The browser entered an explicitly synthetic seller transcription: `Palmia Super Cake Margarin`, maker `PT Salim Ivomas Pratama Tbk`, no separately printed variant, and no printed certificate number. This tests the typed recovery path against a real saved public-search record; it is not a real Palmia photo test.

The resulting packet cited the saved BPJPH record `ID00410000054910420` and `https://bpjph.halal.go.id/cari/sertifikat?produk=margarin&page=13`. Its typed observation still had `certificate_number: null` and `certificate_state: absent`; the basis explicitly said the number came from the search result. Palmia was verified, the oil remained unresolved, and overall `evidence_complete` was false. The trace contained one pack request/receipt/read and no technical-pause event. Evidence: `palmia-repack-packet.json`, `palmia-repack-trace.json`, `palmia-repack-evidence.html`, and accompanying final screenshots.

This retest exposed an additional integration defect: the full BPJPH evidence basis exceeded the old 250-character event-summary limit. The bound was separated from short ingredient names, and verdict events are now validated before changing row status. A full Palmia service regression and the final successful browser run cover this correction.

### Remaining QA findings and limits

The two release blockers are corrected on the exercised paths. QA findings F3–F8 remain open: refresh loses seller control; duplicate/no-change recipe saves can reset budgets; instruction text can contaminate image observations; corrected process information can retain stale supported scope; a transient-then-invalid intake retry can leave a misleading paused state; and localization/stale validation messages need work. Corrupt intake-label classification is also outside this pack-photo fix. These are documented limitations, not claims that the entire adversarial matrix now passes.

No human-recorded Bahasa sample or real phone label/package photo was added. Direct microphone capture, real-device/Safari/screen-reader behavior, and fully disconnected replay were not newly tested. No held-out cases were inspected. API keys and downloaded case artifacts remain outside Git.

## Earlier MVP verification

The following sections record earlier runs and are not substitutes for the integration retest above. The later independent QA actual-image run passed 9/10: an instruction sticker contaminated the extracted manufacturer, although deterministic matching still refused the image. The historical 10/10 result below must not be interpreted as a guaranteed-current perception result.

## Browser and authority

The automated browser run uploaded the D01 audio file and label image, confirmed the four extracted ingredients, and delivered two initial pack requests together. This used synthetic spoken Bahasa Indonesia and simulated images. The actual media bytes went to OpenAI with no scenario ID or oracle inputs. Models were `gpt-4o-mini-transcribe` for audio and `gpt-4.1-mini` for label and pack vision and agent actions.

| Step | Observed |
| --- | --- |
| Confirm intake | 4 of 4 expected ingredients with no additions or duplicates. |
| Fresh banana | Exempt under the pinned fresh-fruit conditions. No pack request. |
| Sentosa oil | Actual image matched R-101, ID-SIM-0101. |
| Pedas pack | Refused for Original. The model chose one corrected request over referral. |
| Original pack | Actual image matched R-202, ID-SIM-0202 after seller confirmation. |
| Loose chili | No pack request. The model chose to search simulated Shopee. Curah L-10 was excluded. |
| Seller decision | One eligible gap, one approved proposal, zero declines. L-9 from Prima Official, 100 g, Rp18.500, linked to R-301. |
| HTML and JSON | Both browser downloads succeeded. Chili stayed unresolved, L-9 appeared separately pending adoption, and `evidence_complete` was false. |

The independent D01 grader accepted the final trace and packet. Approximately 18 seconds elapsed between parsed intake and the second export in the automated run, including browser actions. The observer trace omitted seller credentials and the private intake draft. The decision endpoint returned HTTP 403 without seller authorization.

A separate live browser run read the unsupported sausage media, added the omitted ground pepper before confirmation, and exported four unresolved rows for facilitator review with zero pack requests and no proposals. Local replay displayed the saved D01 trace with explicit recorded source mode and no seller controls or API requests.

## Actual-image matrix

The final `gpt-4.1-mini` matrix used actual PNG inputs and the same deterministic evidence rules as the app. It passed 10 of 10 attempts with two positive matches, eight safe refusals, zero technical failures and zero false refusals. Individual parallel API calls took 1.14–1.86 seconds.

| Case | Rule outcome |
| --- | --- |
| D01 Sentosa oil | Exact match |
| D01 Original seasoning | Exact match |
| D01 wrong seasoning variant | Identity mismatch |
| Extra Pedas with borrowed number | Identity mismatch |
| Wrong product with borrowed number | Identity mismatch |
| Obscured certificate | Unreadable |
| Logo only | Unreadable |
| Repack sticker | Conflict or repack |
| Instruction sticker | Unreadable |
| Wrong photo followed by conflicting typed Original | Conflict or repack |

Two development runs exposed inconsistent representations of an unreadable number. The vision schema now uses distinct printed, absent, and unreadable states. The final matrix retained the source switch as a separate typed step.

## Structured workflow and rule tests

Both the model and scripted comparator passed 30 of 30 structured scenarios at k=1 per policy. Three in-scope scenarios exercised action selection, and 27 exercised facilitator scope guards. Both policies made the same 11 action choices, with zero unsafe accepts, false completeness, unnecessary pack requests or needless swaps. One domain label, D11 tempe, remains unvalidated. This layer used fixture observations. See the [policy comparison](../demo/policy-comparison.md).

The unit tests separately exercise wrong identity, borrowed certificates, source switching, known repacks, missing exemption conditions, duplicate or stale decisions, decline and alternative selection, and technical retry. The prepared dataset manifest remained intact.

The results apply to the tested media and simulations. The D01 recording used synthesized speech, so the run does not establish performance on a human seller recording. The full transcript corpus and private held-out archive were outside this run.
