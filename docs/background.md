# Registration form answers (Sea x OpenAI Codex Hackathon)

Due 10 Oct 2026. Idea 16, Halal evidence agent. Terms follow CONTEXT.md.

## Which build direction does your idea align with?

- [x] Direction 1: Autonomous & Adaptive AI
- [ ] Direction 2: AI-Native Products & Operations
- [x] Direction 3: Deep Domain AI

## What do you want to build?

```
1. Stakeholder
Micro and small food and beverage sellers in Indonesia (UMKM) who sell online, for example a home producer selling keripik on Shopee from her kitchen. Also involved are her ingredient suppliers, who hold the information she needs, and the halal facilitators (Pendamping PPH) who verify self-declare applications.

2. Challenge
From 18 October 2026, halal certification is mandatory for UMKM food and beverage products, and BPJPH can now issue warnings, fines and product withdrawals. The free self-declare route requires every ingredient to be either halal-certified or on the official exempt list. The hard part is the evidence. For each risky ingredient, the seller must find out exactly what she bought, who made it, and whether that exact product is certified. That information sits with her suppliers: a distributor who repacks seasoning may know the original producer, while a market stall selling it loose knows nothing. Sellers chase this over WhatsApp for days, accept the wrong document, or give up.

3. Result
The seller sends one voice note in everyday Bahasa and a photo of her label, then gets on with her work. An agent closes every evidence gap on her behalf and only asks her for the decisions that are hers: approving an ingredient swap and approving the submission. Every product ends one of three ways: a submission-ready SiHalal application, a referral to the regular certification route with the reason, or an escalation to the facilitator. Facilitators receive complete, pre-verified cases instead of chasing missing documents.

4. Approach
An autonomous agent on the OpenAI API (Agents SDK, tool calling, vision, speech-to-text). It turns the voice note and label into an ingredient list and skips exempt ingredients. For each remaining ingredient, it decides how to close the gap based on who supplied it:
- certified producer: it searches the halal registry by product and producer;
- distributor: it messages them as the seller's assistant, asks for the original producer and certificate number, then verifies that number in the registry, including that it covers the exact product variant;
- market stall, or a supplier who stalls or can't answer: it finds a certified substitute sold on Shopee and proposes the swap.
It re-plans when a step fails and escalates what it cannot settle. The registry is the only source of truth. A certificate photo only gives the agent the number to look up.
The agent may search, message suppliers and verify on its own. The first message to a new supplier, any recipe change, and the submission need the seller's approval. Every verdict cites the rule behind it.
On the day we will build one product category (snack foods), one end-to-end flow from voice note to outcome, and a registry lookup that mirrors BPJPH's public search. We will test it against about 30 scenarios with simulated suppliers that behave badly (wrong product variant, a certificate number not in the registry, silence, no evidence at all). We will measure the share of evidence gaps closed without human help, verdict accuracy, wrong approvals (target: zero, judged per ingredient), and escalation rate. We will use Codex to encode the regulation into a rules engine, to generate the simulated suppliers and test scenarios, and to build in parallel across our team of three.
```

About 535 words. If the form has a limit, cut in this order: the facilitator sentence in Result, the Codex sentence's last clause, the list of bad supplier behaviours.

## What experience, skills, or perspective would you bring to help your team build a stronger solution?

```
I lead AI platform work at Tada, an Indonesian loyalty and rewards platform, where I've spent six years on the systems that move merchants' money and points: a unified payment gateway across GoPay, DANA, OVO and LinkAja, and Indonesia's first QRIS-based loyalty point redemption, which runs 250K+ transactions a month. That work taught me how Indonesian merchants operate, which matters for an agent that acts on behalf of a small seller.

Over the past year I've built agents that work unattended: coding agents that open merge requests, a text-to-SQL agent over production data with enforced tenant isolation, and a bug-triage agent that carries each report from investigation to a posted reply. The main lesson is that an agent should never grade its own work. At Tada, a harness the agent can't influence decides whether its code passes. The halal agent follows the same rule. The official registry decides whether an ingredient is certified, a certificate photo only gives the agent a number to look up, and any evidence that doesn't cover the exact ingredient counts as a failure.

I also run agent-driven delivery every day: a spec, a goal a machine can check, unattended implementation, then adversarial review. That's how our team will use Codex on the day.
```

## What's something you've built that you're proud of?

```
Tada's agent-driven delivery workflow, and the Cloud Agent Platform I built on top of it.

What it does: An engineer writes a spec and a goal a machine can check. An agent implements it unattended and opens a reviewable GitLab merge request, and review gates decide whether it's ready to merge.

How it works: The agent writes the code, and a delivery harness it can't influence decides whether the code passes, using exit-code checks, a fail-closed diff judge, capped rounds of CI repair, and validation evidence recorded outside the agent. Phase 1 has produced verified draft merge requests end to end on our production API gateway repository.

What I contributed: I designed the workflow and wrote the platform (34 of its 36 commits, plus 22 architecture decision records). I also turned our engineering standards into 35+ agent skills and 4 review subagents that run as automated gates.

Who uses it: The workflow is now the default delivery path across 19 repositories, used daily by the roughly 50 engineers who ship code at Tada. The platform itself is in pilot with my team of six.
```

---

# Alba (Yusuf Albasia, Lead Data at Tada)

Placeholders filled with assumptions on 2026-10-04 (see chat); Alba should still sanity-check. Sources: company-os commits by m.amirullah@usetada.com (Sept 2026), skills/brand-review/SKILL.md, company-os README.

## What experience, skills, or perspective would you bring to help your team build a stronger solution?

```
I lead data at Tada, where my job is turning merchant transaction data into answers brands can act on: loyalty, rewards, egift sales and target achievement, for clients such as Castrol and Exxon.

I keep agents honest with data. My Brand Review agent only computes from metrics already defined in our Tableau datasources, guided by the data dictionaries I wrote, so it can't invent a number. It also confirms the merchant against our merchant registry before it analyses anything. For the halal agent, that means every verdict traces back to the halal registry or the exempt list.

On our team I'll own the evaluation: the 30 scenarios with ground-truth verdicts, the simulated suppliers, and the metrics (closure rate, verdict accuracy, wrong approvals, escalation rate).
```

## What's something you've built that you're proud of?

```
Tada's Brand Review pipeline, an agent that produces a client's brand review from live data.

What it does: Someone on our sales ops team asks for something like "run a brand review for Castrol, Q3". The agent confirms the merchant and the period, asks which programmes to cover (loyalty, rewards, egift sales orders, target achievement), computes the insights, and delivers them as a PowerPoint deck on Tada's template, a Gamma deck, a dashboard, or a map.

How it works: It's a pipeline of ten skills run by our company's self-hosted agent. A router skill asks each question once, so the insights, the deck and the dashboard always cover the same merchant and period. Each insight skill reads its Tableau datasource and computes only from the measures defined there, with a data dictionary for each source. It writes an action and a chart recommendation for each section. The agent always runs live and never answers from old review files.

What I contributed: I built the pipeline and brought it into our Company OS: the router, the data dictionaries, the insight skills, and the deck, dashboard and map outputs.

Who uses it: Tada's sales ops team, who I trained on it in September 2026, to prepare the quarterly brand reviews we present to clients such as Castrol and Exxon Connect Bengkel.
```

---

# Ardiyan B. Santoso (Engineering Manager at Tada)

Placeholders filled with assumptions on 2026-10-04 (see chat); Ardiyan should still sanity-check. Sources: git history across Tada repos (ardiyan.santoso@usetada.com, first commit April 2018, about 10,000 commits across 25 repos); audience/README.md.

## What experience, skills, or perspective would you bring to help your team build a stronger solution?

```
I've been an engineer at Tada since 2018 and now manage engineering there. In eight years I've worked across most of the platform: the loyalty engine, the Bridge API that routes card transactions, order and inventory services, the workers that extract large data sets, and the dashboard our merchants and corporate clients use.

I've built much of the merchant dashboard, so I'll own the demo: the seller's chat, the agent's step-by-step trace, and the facilitator's view, built so judges can see what the agent did and why. As a manager, my job is shipping on a deadline. I'll keep our 13 hours scoped to one product category and one end-to-end flow, and make sure we have a working run by 14:00 that we then improve.
```

## What's something you've built that you're proud of?

```
Tada's reporting pipeline, which turns live transaction events into the insights merchants see on their dashboard.

What it does: Every card transaction, e-voucher, order redemption, dine-in or delivery order, and membership change on Tada becomes reporting data that merchants can query in their dashboard.

How it works: A message broker receives events from Tada's services and passes each type to its own subscriber service, which transforms the event and writes it to Elasticsearch. Each subscriber is small and independent, so a new event type means adding one service without touching the others. The dashboard reads from Elasticsearch, which keeps reporting queries off the transaction databases.

What I contributed: I wrote the largest share of it (178 of its 736 commits, from February 2022), alongside three teammates.

Who uses it: Merchants and corporate clients, who see these insights in the Tada dashboard.
```
