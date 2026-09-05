# DealFlow360 — Self-Governing Deal Engine

**Type:** Product Requirements (intent) · **Status:** Draft v1 · **Date:** 2026-09-05
**Source:** `DealFlow360.pdf` (Odoo hackathon problem statement, 13pp)
**Constraints:** < 24h build window · 2–3 builders · demo-judged

> This document is **intent**: the problem, the bet, and how we'll know we were wrong.
> It deliberately makes **no engineering decisions** — stack, schema relationships, auth
> boundaries, error handling, test architecture and project structure are handed to
> `plan-architecture`. See [Hand-off](#hand-off) at the end.

---

## 1. Problem Statement

**Who:** B2B sales reps closing multi-line deals, and the sales managers and finance
operators accountable for the margin on those deals.

**The problem:** *Discount discipline is invisible until after it's been lost.*

A rep can keep every single line technically inside its allowed limit and still hand away
more margin than the company ever intended — because nobody is looking at the order as a
whole. Meanwhile the reverse also happens: managers get pulled into reviewing quotes that
never needed a human at all. The controls that are supposed to prevent both live in
people's heads, in a pricing spreadsheet, and in an email thread that starts with "quick
approval?".

The same blindness runs downstream. Stock reality isn't known at quoting time, so promises
slip. One-time hardware and recurring subscriptions on the same deal get reconciled by hand
or split into two orders. And the customer negotiates over email against a static PDF, so
the moment terms change, whatever approval was granted is silently stale.

**Cost of not solving it:** margin leaks in amounts too small to trigger anyone's alarm and
too frequent to catch by audit; managers spend review time on the wrong deals; and by the
time a deal is visibly stuck, it has already lost the momentum that would have closed it.

> *Reframe check:* more than one solution fits this problem — hard blocks, a review queue,
> post-hoc alerting, or scoring-and-routing. We've bet on one (§4), but the problem
> statement doesn't presuppose it.

---

## 2. Evidence

Being honest about provenance: this is a hackathon problem statement, not a research
finding. The evidence is **documentary and structural**, not observational.

| Claim | Evidence | Strength |
|---|---|---|
| Reps discount past intent without any single line looking alarming | PDF §10: *"One line 2 points over, another 3 points over… none of them look alarming alone, but added together the rep has quietly given away a lot of margin."* | **Documented** — the problem author states it as the motivating case |
| Different product categories tolerate different discounts | PDF §10 worked example: Gold customer, hardware ceiling 15%, services ceiling 10%; a 12% laptop is fine, an 18% setup service is 8 points over | **Documented** — concrete, with numbers |
| Managers only discover stalled deals after momentum is lost | PDF §1: *"managers who only find out a deal is stuck after it has already lost momentum"* | **Documented** — asserted, not measured |
| Customers want to negotiate in a portal rather than over email | PDF §1, §4-B8 | **Assumption** — validate via: does any portal counter-offer actually get submitted in a real pilot, vs. the customer emailing the rep anyway? |
| Manual approval routing is a real time cost to managers | PDF §10: *"so managers are not stuck reviewing every single quotation by hand"* | **Assumption** — validate via: measure share of quotes that route to a human, before vs. after |
| Multi-warehouse splitting is a live pain (not just a modeling exercise) | PDF §1 | **Assumption** — validate via: measure how often real orders actually span warehouses |

**What we do not have:** user interviews, support-ticket themes, analytics, or a competitor
teardown. Every "Assumption" row above should be treated as unvalidated in any conversation
about this product beyond the hackathon.

---

## 3. Thesis — why build it, why now

**Why this:** Solving "route quotes for approval" is table stakes; every CRM has an approval
workflow. What isn't table stakes is *governance that is honest about its own rules*. Two
properties make the difference:

1. **Per-line, not per-order.** Every line is checked against **its own** ceiling — the
   stricter of what the customer tier allows and what the product category allows. A Gold
   customer's 15% ceiling doesn't license an 18% discount on a thin-margin service.
2. **Blended, not worst-case.** Routing considers the *whole pattern* across the order, so a
   spread of individually-forgivable violations still surfaces. This is precisely the
   failure the current cope cannot see.

**Why it beats how they cope today:** the cope is a spreadsheet of ceilings plus an email
asking for approval. The spreadsheet can't check itself, and the email arrives after the
number has already been said out loud to the customer. Governance that evaluates at
quote-build time, and routes without the rep asking, is worth switching to — not because
it's automated, but because it's *earlier*.

**Why now (for this build):** the hackathon's Technical Guidelines (§7) explicitly forbid
hardcoding or faking these rules, and Deliverables (§8) demand two full flows demoed live.
That combination rewards exactly the property we care about most.

### The bet that ties this build together

> **The governance rules live in data, not in code.**

Ceilings, category overrides, chain thresholds, stalled-deal windows, proration rules — all
of it is configuration an Admin owns, and one engine reads. Nothing is hardcoded, and
nothing is defaulted behind the Admin's back.

This is what makes the system hard to break in front of a judge: when someone changes a
ceiling live and asks "now what happens?", the answer comes out of the same code path that
was already running. It is also why full CRUD over the configuration area is treated as
**core rather than scaffolding** — the config layer isn't support for the product, it *is*
the product's claim.

---

## 4. Hypothesis

```
We believe that evaluating every quotation line against its own configured ceiling —
and routing on the blended pattern across the whole order rather than one overall limit —
will cause reps to stop unconsciously giving away margin, and cause managers to review
only the deals that genuinely need a human,
resulting in fewer unnecessary approvals AND no silent margin leakage.

We'll know we're RIGHT if, within the build window:
  - A quote where EVERY line sits inside its own ceiling, but which is collectively
    over-discounted, still gets flagged and routed.
  - An unrehearsed person can change a tier ceiling, a category ceiling, or a chain
    threshold through the admin UI, and every subsequent quote routes correctly —
    with no code edit, no redeploy, no restart.
  - A reviewer opening the approval screen can say WHY this quote reached them,
    without asking the rep.

We'll know we're WRONG if any of these is true:
  - Any config change requires touching code to route correctly.
      -> the "rules live in data" thesis is false, and this is just a workflow with a UI.
  - The blended score collapses to "worst single line overage."
      -> we have not solved the §10 problem, only restated it.
  - A reviewer cannot tell from the approval screen why the quote was routed to them.
      -> we moved the opacity instead of removing it; managers will route around us.
  - GUARDRAIL: quotes that need NO approval still get routed to a human.
      -> we made managers' lives worse, not better; half the promise fails.
```

---

## 5. Target User & JTBD

### Primary user — Sales Rep

Builds multi-line quotes under time pressure, mixing hardware, services and subscriptions
for a customer who has a tier. Trigger: the customer asks for a better price.

> **When** I'm putting a discount on a deal to keep it moving,
> **I want to** know immediately whether I've crossed a line and what it will cost,
> **so I can** close at the best price I'm actually allowed to give — without stalling the
> deal on an approval I didn't know I needed.

### Secondary users

| Role | Job to be done |
|---|---|
| **Sales Manager / Approver** | *When* a quote lands in my queue, *I want to* see instantly why it's here and how bad it is, *so I can* decide in seconds instead of reconstructing the rep's math. |
| **Finance / Ops** | *When* a deal carries unusual risk, *I want to* see the blended picture plus its fulfillment and billing consequences, *so I can* approve terms we can actually deliver and bill. |
| **Customer (Portal)** | *When* the price isn't right, *I want to* counter and ask line-level questions in one place, *so I can* settle terms without an email thread and a stack of PDF versions. |
| **Admin** | *When* pricing policy changes, *I want to* retune tiers, ceilings and chains myself, *so I can* change how the business governs deals without waiting on engineering. |

### Non-users (explicitly NOT for)

- **B2C / self-serve checkout.** No anonymous carts; every quote has a named customer and a tier.
- **Single-warehouse, single-line sellers.** If orders never span warehouses or mix billing models, the engine is pure overhead.
- **Organisations with no approval culture.** If nobody is accountable for margin, there is no ceiling to configure and nothing to route.
- **Procurement / buy-side users.** The portal is the customer's *view of our quote*, not a buyer's sourcing tool.
- **(MVP only) Customer self-signup.** Portal access is issued against an existing quote; customers do not register themselves.

---

## 6. MVP — the thinnest line that proves the hypothesis

**The MVP is PDF §9, end to end, running on configuration the Admin created live.**

§9 was chosen as the spine because it is the only place in the problem statement where every
subsystem is chained into one causal line — and because each of its eight steps produces a
*visible, checkable* result. It is the falsification harness, not merely a demo script.

### The spine — §9, all 8 steps must pass

| # | Step | The result that proves it |
|---|---|---|
| 1 | Log in; Admin creates a discount tier, a warehouse, a subscription plan | Config created through the UI, not seeded behind the scenes |
| 2 | Rep creates a quote; adds a line discounted above what's allowed | Line shows as over **its own** ceiling, with the number |
| 3 | Confirm the quote | It routes for approval **automatically** — the rep never clicks "request approval" |
| 4 | Accept one upsell suggestion | Order total **and** margin indicator update immediately |
| 5 | Manager approves | Stock pulls from the right warehouse, splitting across two when one can't cover it |
| 6 | Order carries a one-time product and a recurring subscription | Both bill correctly and **separately** on the same order |
| 7 | Customer counters for a bigger discount in the portal | Quote re-enters approval **automatically** |
| 8 | Confirm order, record a payment | Invoice status updates correctly |

### The configuration layer (§4A) — core, not scaffolding

Full CRUD, because §9 step 1 is a *user action*, and because the thesis in §3 is only true if
the Admin genuinely owns the rules: products & variants, price lists, customer tiers &
discount ceilings, category ceilings, approval chain thresholds, warehouses & stock levels,
subscription plans, upsell pairings.

**No baked-in defaults.** Ceilings and thresholds start empty and are entered by the Admin.
A *demo seed* of example products and stock is fine — a seed is demo data, not a default
rule. (Empty-config behaviour must still be decided explicitly; see Open Questions.)

### Depth bet — where the spare hours go

If the spine lands early, depth goes to **discount governance + approval**: mixed-category
blended scoring, the two-step Manager → Finance chain, and a complete audit trail carrying
user, timestamp and reason on every approve / reject / edit. This is the PDF's own
centerpiece (§10 exists only to explain it) and the hardest part to fake convincingly.

The other three flows stay at §9 depth **by design**: the split happens but doesn't optimise
shipping cost or consolidate backorders; billing separates one-time from recurring but
doesn't prorate mid-cycle; the portal negotiates but has no line-level comment threading.

### Suggested parallel seam (2–3 builders)

The configuration layer and the deal engine share data but almost no logic — the cleanest
split available. One track owns §4A CRUD + seed; another owns the quote → score → route →
fulfil → bill spine; a third (if present) takes the portal and the approval screen.
**The engine must never read a hardcoded rule** — that is the contract between the tracks.

### Stated assumption, and the cut order

Full 4A CRUD inside 24 hours is the aggressive call in this plan. Proceeding with it as
decided — but if it starts to threaten the spine, cut in this order and say so in the demo:
**upsell rule config → price lists → product variants → stock replenishment rules.**
Never cut discount tiers, category ceilings, or approval chains: those three *are* the thesis.

---

## 7. Success Metrics

Framed against the stated win condition: **a judge tries to break the logic and can't.**

| # | Metric | Target | How measured |
|---|---|---|---|
| M1 | **§9 walkthrough completion** — steps finishing with the expected visible result, no manual data fixups, no reload workarounds | **8 / 8** | Timed dry run, twice, on a fresh database |
| M2 | **Config-change correctness** — live config edits (tier ceiling, category ceiling, chain threshold) after which the next quote routes correctly | **100%, with 0 code edits and 0 restarts** | Adversarial script: ≥6 live edits, including lowering a ceiling below an existing quote's discount |
| M3 | **Blended-score integrity** — the "many small violations" case (no single line over, order collectively over) is flagged | **Flagged** | One fixed test quote, run live. This single case falsifies §4 if it passes silently |
| M4 | **No false routing** (guardrail) — clean quotes that reach a human anyway | **0** | 5 fully-compliant quotes confirmed; all must skip approval entirely |
| M5 | **Audit completeness** — approve/reject/edit events carrying user + timestamp + reason | **100%** | Inspect the trail after the demo run |
| M6 | **Portal isolation** — internal routes or screens reachable from a customer session | **0** | Attempt ≥5 internal routes while authenticated as a portal user; all must be refused |
| M7 | **Reviewer comprehension** — reviewer states why a quote routed to them, unaided | **< 10 seconds** | Ask a teammate who didn't build the approval screen |
| M8 | **Demo** — full end-to-end flows shown live | **≥ 2 in ≤ 5 minutes** | Rehearsed run against §8 |

Deliberately **not** metrics: number of screens, number of modules "represented", lines of
code, or visual polish. None of them predict whether the logic survives contact with a judge.

---

## 8. Non-goals

**Explicitly not building:**

- **Payment gateway integration.** Invoice on order confirm, plus a manual "Record Payment" action moving draft → posted → paid. No processor, no cards, no webhooks.
- **Credit notes, partial refunds, cancellation refunds** beyond recording that a trigger condition occurred (PDF §4-A5).
- **Multi-currency and multi-company.** PDF §7 states these are a bonus, not a requirement.
- **Real email / SMS delivery.** Portal links and nudges are generated and shown in-app, not sent.
- **ML or predictive upsell.** Suggestions are rule-based from configured pairings, promotion flags and margin floors (PDF §4-A6), then ranked — not learned.
- **PDF / XLS export** (PDF §4-A7). Reporting reads on screen with filters; export is post-MVP.
- **Mid-cycle proration** and plan-change proration. Recurring lines produce a schedule; recalculating a partial period is post-MVP (the depth bet went elsewhere).
- **Backorder consolidation prompt** on restock (PDF §4-B6). Backorders are recorded, not consolidated.
- **Discount-anomaly detection vs. rep history** and delivery-slippage indicators (PDF §4-B9). The dashboard surfaces stalled deals; anomaly baselines need history we won't have.
- **SSO, password reset, email verification**, or roles beyond the five in PDF §3.
- **Performance, scale, concurrency, i18n, accessibility audit, mobile-native.**
- **Real-time push / websockets.** "Live" margin and stock mean *recomputed on interaction*, not streamed.

**Not decided here, by design:** every engineering choice. See [Hand-off](#hand-off).

---

## 9. Open Questions

Named rather than hidden. Starred (★) items block the build and need answers early.

- [ ] ★ **Empty-config behaviour.** With no ceilings configured yet, is a discount *unrestricted* (permissive) or *blocked* (deny-by-default)? Choosing "no defaults" made this a real decision, and §9 step 2 depends on it.
- [ ] ★ **Blended score: fixed formula, or configurable formula?** The Admin configures ceilings and thresholds — but is the *way* overage combines across lines (sum of points over? weighted by line value? weighted by margin?) also configuration, or is it engine logic? Value-weighting and point-summing give different answers on the same quote.
- [ ] ★ **Retroactive config changes.** An Admin lowers a ceiling after a quote was approved. Does the quote re-route, get flagged, or stay grandfathered? M2's adversarial script will hit this in the first minute.
- [ ] ★ **Who supplies the demo numbers?** With no defaults, someone must enter concrete tiers and thresholds before anything can be demoed. Decide the owner and the values.
- [ ] **Quote lock during negotiation.** While a customer has an open counter-offer in the portal, can the rep still edit the quote? If both edit, whose version is under review?
- [ ] **Portal authentication:** magic link, or email + password? (PDF §4-A1 permits either.)
- [ ] **"Stalled" definition.** The number of days is configurable — but inactivity of *what*: any edit, a customer-visible event, or a stage change?
- [ ] **Partial fulfillment policy.** When one warehouse can cover part of a line, does the available part ship immediately with a backorder behind it, or does the line wait to ship whole?
- [ ] **Partial payments.** Does "Record Payment" require the full invoice amount, or allow partial — making `partially paid` a real state?
- [ ] **Approval chain shape.** Is Manager → Finance a fixed two-step ladder, or an ordered list of arbitrary length the Admin composes?
- [ ] **Margin source.** The live margin indicator needs a cost per product. Is cost an Admin-entered field on the product, or derived from somewhere?
- [ ] **Upsell pairings at hour zero.** Pairings are configured "based on historical co-purchase data" (§4-A6) — with no history, does the Admin simply enter them by hand?

---

## Hand-off

**Everything above is intent.** The following were left open deliberately and belong to the
architecture spec:

- Language, framework, database, and versions. *Note: the repo currently scaffolds an Express (ESM) backend and a Next.js + React + Tailwind frontend — treat that as a starting point to confirm, not a decision this PRD made.*
- Data model and relationships (quote ↔ line ↔ product ↔ tier ↔ ceiling ↔ chain ↔ approval event)
- Where the rule engine lives, and how config is loaded or cached so M2's "no restart" holds
- The security boundary for the customer portal — the mechanism that makes M6 true rather than hoped for
- Audit-trail storage and immutability
- Error handling, validation, and retry behaviour
- Testing approach — in particular, how M3's blended-score case becomes a repeatable test
- Project structure and module seams

**Also carried forward to the spec** (a team request, not a product requirement): the code
must be **modular, beginner-friendly, and commented.** That is a real constraint on structure
and review — but it is a decision about *how* to build, so it is recorded here and decided
there.

**Next step:** run **`plan-architecture`** against this PRD to make those decisions, then
`rules-create-global` to turn the result into the project's global rules.
