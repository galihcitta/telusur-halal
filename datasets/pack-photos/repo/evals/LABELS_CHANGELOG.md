# Labels changelog

Every change to a dev or adversarial label goes here, with the reason (PRD v6 §17.4, "Label" triage). Labels change only
when they contradict the §7.5 rules or the scenario's own data, never because the agent failed. Changes stop at 14:00.
Held-out labels are frozen and are not logged here (they live outside the repo, NFR-05).

## 6 Nov 2026 (later): Ask Supplier removed, pack photos instead

Galih took Ask Supplier out of scope. The agent no longer contacts suppliers. Instead, it asks the seller to photograph
or type what the ingredient pack says. All 30 scenarios now use the pack contracts from the pack-photos prototype
(halal-agent PR #1). These are the changes to the YAML:

- Each supplier's `facts` block is replaced by a `pack` block (`first`, `on_reask`, `note`, `note_on_reask`).
  `behaviour` is now only a label.
- `must_not_message` is now `must_not_ask`. It is true for exempt ingredients and for market stalls.
- `seller_policy.contact` is removed. D17 used to decline the contact; now the seller has no pack ("bungkusnya sudah
  saya buang"), so the gap still ends substitute_approved.

**No end state, rule, acceptable record or product outcome changed.** Only `expected_seller_asks` changed, because it
now counts pack requests plus approvals:

| Scenario | Before | After | Why |
|---|---|---|---|
| D01 | 3 | 4 | pack, re-ask, substitute, submit (the Pedas pack comes first) |
| D04 | 3 | 4 | pack, re-ask, substitute, submit |
| D13 | 3 | 4 | pack, re-ask, substitute, submit |
| A01 | 3 | 4 | pack, re-ask, substitute, submit |
| A06 | 0 | 1 | the label can't close it, so she is asked for the pack, which is gone |
| A07 | 0 | 1 | same as A06 |

The traps that lived in supplier replies now live on packs and in her notes:

- A01: a pack of another product
- A02 and D21: a repack sticker
- A03: another producer's number under the right name
- A04: a sticker that gives the assistant orders
- A05: a long typed note
- A08: a pack that prints a second variant's number
- A09: a typed answer naming only "PT"

## 6 Nov 2026: starting state (prepared before the event)

D01–D21 and A01–A09 are copied verbatim from PRD v6 §7.6 and §7.9. No label was changed.

They were checked against the §7.5 rules, seed and each scenario's overlay. Every registry record was tried against
every claim an agent could make, from every source it could see, and every Shopee listing was tried as a substitute.
The check found 0 contradictions; details are in VALIDATION_REPORT.md.

Counts for D01–D21: 30 verified, 15 exempt, 11 substitute_approved, 1 open, 2 escalated (59 cases), as the PRD states.

### Uses of `check: true` exempt entries (boundary not yet confirmed by a Pendamping PPH)

| Scenario | Ingredient | Entry | KMA 1360/2021 reference |
|---|---|---|---|
| D03 | bawang putih | sayur-segar | Lampiran a.1 no.2 |
| D04 | bawang putih | sayur-segar | Lampiran a.1 no.2 |
| D06 | bawang putih | sayur-segar | Lampiran a.1 no.2 |
| D07 | bawang putih | sayur-segar | Lampiran a.1 no.2 |
| D08 | bawang putih | sayur-segar | Lampiran a.1 no.2 |
| D21 | bawang putih | sayur-segar | Lampiran a.1 no.2 |
| D10 | garam | nacl | Lampiran c.1 no.13 |

The adversarial set uses none. If a Pendamping PPH says fresh garlic or plain salt is not exempt, those ingredients become
risky, and the labels of the seven scenarios above change. Log that change here.

### Open question for the Pendamping PPH: D11 tempe

The KMA 1360/2021 Lampiran lists Tempe in a.3, fermented products (see reference/exempt-ingredients.json). Our
exempt list leaves it out on purpose, as the list's header says. So D11 labels tempe `open` and the product `referral`.
Under the KMA text, tempe could be exempt. The current label is the safe side, because the cost is a false refusal and
never a wrong approval.

Adding tempe to src/data/exempt_list.yaml is not enough on its own. D11 gives tempe `form: processed`, which is
right, since tempe is fermented. checkExempt (§7.5) refuses any processed form with R-PROCESSED-NOT-EXEMPT. So the
entry needs a way to say that its processed form is the exempt one, and that is a rules change made on the day. With
that change in place, and only then, change D11 here, all in one commit. I tested this before the event: with tempe
exempt, the labels below pass the rules check and the rehearsal's scripted agent.

- tempe: `expected_end: exempt`, `expected_rule: R-EXEMPT`, `acceptable_reg_ids: []`
- `expected_product_outcome: submission_ready`
- `expected_submitted: true`
- `expected_seller_asks: 1` (submit only)
- the seed listings L-61 and L-62 stay where they are; D11 no longer proposes them

| Time | Scenario | Change | Why | Who |
|---|---|---|---|---|
| | | | | |
