# Architecture — DealFlow360 Self-Governing Deal Engine

**Companion to:** [`self-governing-deal-engine.prd.md`](./self-governing-deal-engine.prd.md) (intent)
**Status:** Decided v1 · **Date:** 2026-09-05
**Mode:** Greenfield · **Constraints:** < 24h · 4 parallel builders · local Postgres

> The PRD says **what** and **why**. This document says **how** — the engineering calls the
> PRD deliberately left open. It is a *decision doc*, not a task list; per-ticket
> implementation plans come later from `piv-plan-implementation`.

---

## Problem & goals

Every decision below is judged against one lens, taken from the PRD:

> **The governance rules live in data, not in code.** A judge changes a ceiling live, asks
> "now what happens?", and the answer comes out of the same code path that was already
> running — no redeploy, no restart, no code edit.

Secondary lens, from the team: the code must be **modular, beginner-friendly, and
commented**. That is a real architectural constraint here, not a style note — it rules out
clever abstractions (rule DSLs, generic repository layers, heavy dependency injection) in
favour of plainly-named functions in small files.

---

## Approaches considered

Three ways to make governance rules configurable were weighed:

| # | Approach | Trade-offs |
|---|---|---|
| **A** | **Config tables + a hand-written pure evaluator.** Numeric config in Postgres; a plain JS function reads it and returns a verdict. | Simple, readable, trivially testable. Formula changes need code. |
| **B** | **Stored rule DSL** (JSON-Logic or similar) — rules themselves are rows. | Maximum configurability; a judge could invent new rule *shapes* live. But it's a multi-hour rabbit hole, and the resulting code is opaque to a beginner — directly against the secondary lens. |
| **C** | **A + a strategy enum** — numeric config in tables, plus a stored enum selecting *which* scoring formula runs, each formula a small named function. | Keeps A's readability; makes the formula itself configuration (PRD open question ★2) without inventing a language. Slightly more code than A. |

**Chosen: C.** It satisfies the "rules live in data" thesis at the level the PRD actually
claims (ceilings, thresholds, chain shape, and the scoring strategy are all data) without
paying for a DSL nobody has time to debug at 3am.

A second fork was the order model — one record whose status advances, versus a separate
`Order` created at confirmation. **Chosen: separate `Order`.** It costs ~6 models
and a copy step, but it gives a genuinely immutable downstream truth: once confirmed,
fulfillment and billing read the order, and nothing a rep or customer does to the quotation
can retroactively change what was allocated or invoiced. That is the honest answer to
"what if the quote changes after confirmation?", and it matches how the domain really works.

---

## Recommended approach

A conventional two-process app — **Next.js 16 (App Router, JavaScript) talking over REST to
an Express 5 API on Node 22, backed by local PostgreSQL 18 through Prisma** — with three
architectural ideas doing the real work:

1. **A pure governance engine.** `evaluate(quotation, config)` is a function with no
   database access. Config is read fresh from Postgres on every call and passed in. Because
   nothing is cached and nothing is compiled, the PRD's M2 metric ("config change takes
   effect with no restart") is true *by construction* rather than by discipline.

2. **Snapshots at the line, freeze at the order.** Every `QuotationLine` stores the unit
   price, unit cost and *ceiling in force* at the moment it was written. Confirmation copies
   lines into `OrderLine`. Together these settle three PRD open questions at once —
   margin is stable, the audit trail means something, and a retroactive ceiling change stops
   being a paradox.

3. **A cryptographic portal boundary.** Internal and customer tokens are signed with
   *different secrets*, so a portal token cannot be replayed against an internal route even
   if a middleware check is forgotten. PDF §7 warns judges will probe exactly this.

---

## Key decisions

### Stack & libraries

| Layer | Choice | Why (and what was rejected) |
|---|---|---|
| Frontend | **Next.js 16, App Router, JavaScript, Tailwind 4** | Already scaffolded. **JS not TS**: converting mid-hackathon with 4 people costs hours and the PRD asks for beginner-friendly code. Cost — Prisma's generated types go unused; mitigate with JSDoc on engine functions only. |
| Data fetching | **Client-side only** (`"use client"` + a small `apiClient.js`) | Next as an SPA shell. Server Components + token forwarding is more correct and will cost ~2h of auth debugging you don't have. |
| Backend | **Express 5 on Node 22, ESM** | Already scaffolded; smallest thing that does the job. Nest/Fastify buy nothing here. |
| ORM | **Prisma, pinned to `6.19.3`** | Chosen by the team. ⚠ **Do not run `prisma@latest`** — it currently resolves to `8.0.0-rc.13`, a release candidate whose CLI is reorganized (`prisma orm`, no `validate`). Prisma 7 also moves the datasource URL into `prisma.config.ts` and requires a driver adapter. 6.19.3 keeps `url = env("DATABASE_URL")` and matches every tutorial the team will find. |
| DB | **PostgreSQL 18, local** | `NUMERIC` for money, real enums, `Json` for audit payloads. |
| Auth | **JWT, Bearer header**, `bcryptjs` for hashes | Separate origins (3000/4000) make httpOnly cookies a CORS/SameSite fight. Bearer + `localStorage` is simpler; the XSS trade-off is accepted for a demo and recorded in Open Questions. |
| Validation | **`zod`** at every controller boundary | One dependency, and it turns malformed input into a readable error instead of a Prisma stack trace — which is what a probing judge will actually produce. |
| Money | **Prisma `Decimal` → `NUMERIC(14,2)`**, percentages `NUMERIC(5,2)` | Integer minor units are more "correct" but force conversions at every boundary — bad for beginner-friendly code and a reliable source of demo bugs. **See Spike 1: `Prisma.Decimal` has a real footgun.** |
| Icons/UI | Hand-rolled Tailwind components; `lucide-react` optional | No component library. A shared `components/ui/` shipped in hour 1 keeps four people's screens visually coherent. |

**New backend dependencies:** `@prisma/client`, `prisma` (dev), `bcryptjs`, `jsonwebtoken`, `zod`.

> ⚠️ **Next 16 is not the Next.js in your training data.** `frontend/AGENTS.md` says so
> explicitly. Anyone writing App Router code reads `frontend/node_modules/next/dist/docs/`
> first. This has bitten teams on `params`/`searchParams` being async.

---

### Data model

> **`backend/prisma/schema.prisma` is the source of truth** — 35 models, 21 enums,
> validated and generating on Prisma 6.19.3. This section records the *decisions* behind
> it; it does not restate the field list, so the two cannot drift.

Five clusters. `──<` is one-to-many, `──1` one-to-one.

```
IDENTITY                       CATALOG                          GOVERNANCE (the thesis)
Role ──< User                  ProductCategory ──< Product      GovernanceSetting (singleton)
CustomerTier ──< Customer      Product ──< ProductVariant       CustomerTier.maxDiscountPercent
Quotation ──< PortalToken              ──< SubscriptionPlan     DiscountRule  (tier × category)
                               PriceList ──< PriceListItem      ApprovalPolicy ──< ApprovalPolicyStep
                               CoPurchaseRule (upsell pairs)

DEAL                                                 FULFILLMENT & REVENUE
Quotation ──< QuotationLine                          Order ──< OrderLine
   ├──< QuotationApproval ──< QuotationApprovalStep     │        ├──< FulfillmentAllocation ──> Warehouse
   ├──< Negotiation ──< NegotiationRequest              │        ├──1 Subscription ──< BillingSchedule
   ├──< DealHealthSignal                                │        └──< InvoiceLine
   ├──< AuditLog                                        └──< Invoice ──< Payment
   └──1 Order         (lines COPIED on confirm)                         └──< CreditNote
                                                     Warehouse ──< Inventory
```

#### Governance cluster — where the thesis lives

```prisma
enum ScoreStrategy             { VALUE_WEIGHTED  SUM_OF_POINTS  ABSOLUTE_MARGIN }
enum UnconfiguredCeilingPolicy { DENY  TIER_ONLY  PERMISSIVE }

model GovernanceSetting {          // exactly one row, id = "singleton"
  scoreStrategy             ScoreStrategy             @default(VALUE_WEIGHTED)
  unconfiguredCeilingPolicy UnconfiguredCeilingPolicy @default(DENY)
  stalledAfterDays          Int                       @default(7)
}

model CustomerTier  { maxDiscountPercent Decimal? }   // PDF 4-A3 bullet 1: the TIER ceiling
model DiscountRule  { customerTierId String?          // PDF 4-A3 bullet 2: optional override
                      categoryId     String?          // either side null = "applies to all"
                      maxDiscountPercent Decimal
                      minMarginPercent   Decimal }

model ApprovalPolicyStep {
  roleId              String                      // FK -> Role (a ROW, not an enum)
  stepOrder           Int
  minBlendedScore     Decimal?                    // fires if blendedScore     >= this
  minWorstLineOverage Decimal?                    // OR   if worstLineOverage  >= this
}
```

`ApprovalPolicyStep` is the decision that stops Manager → Finance being hardcoded: an
**ordered ladder of arbitrary length**, each rung carrying its own two triggers. A quote
activates every step whose trigger it crosses, in sequence. Adding a third approver is a
row, not a deploy. **Roles are rows too**, so a new rung can be a role that did not exist at
build time — the cost is that role checks read `role.code`, so it must ride in the JWT.

**Note on "no defaults":** the PRD forbids defaulting *ceilings and thresholds* — and none
are. `CustomerTier.maxDiscountPercent`, `DiscountRule` and `ApprovalPolicyStep` all start
empty or null. `GovernanceSetting`'s defaults are different in kind: they set the engine's
visible *mode*, and the Admin can see and change both.

#### Ceiling resolution (strictest wins, then fall back)

```
1. DiscountRule (tier, category)     — most specific
2. DiscountRule (null, category)     — category-wide
3. DiscountRule (tier, null)         — tier-wide
4. CustomerTier.maxDiscountPercent   — the tier ceiling
5. GovernanceSetting.unconfiguredCeilingPolicy   — DENY => 0%

effectiveCeilingPercent = min(every rule that matched)
```

Snapshotted onto `QuotationLine.effectiveCeilingPercent` at write time. That one field is
why an approval from yesterday still explains itself after an Admin lowers a ceiling today.

#### The scoring rule (PRD open question 2 — settled)

```
ceiling_i  = effectiveCeilingPercent (resolved above, snapshotted on the line)
overage_i  = max(0, discountPercent_i - ceiling_i)      ->  QuotationLine.overagePts

blendedScore     = SUM(overage_i x lineValue_i) / SUM(lineValue_i)   // value-weighted
worstLineOverage = max(overage_i)

An ApprovalPolicyStep fires when   blendedScore     >= step.minBlendedScore
                              OR   worstLineOverage >= step.minWorstLineOverage
```

Two triggers, because the PDF describes two different failures and one number cannot see both:

| Case | blendedScore | worstLineOverage | Routed by |
|---|---|---|---|
| §10 example — laptop ₹1000 @12% (ceiling 15), service ₹200 @18% (ceiling 10) | 1.33 | **8.00** | worstLineOverage |
| Many-small — three equal lines 2 / 3 / 2 points over | **2.33** | 3.00 | blendedScore |
| Clean quote — every line inside its ceiling | 0 | 0 | *nothing fires* ✓ (M4) |

The middle row is PRD metric M3 and its WRONG condition. A worst-single-line score alone
would rank that quote *below* a single 3-point violation — exactly the blindness §10 exists
to describe. **A single score range on the policy cannot express this**, which is why the
thresholds sit on the step rather than on `ApprovalPolicy`.

#### Unconfigured ceilings (PRD open question 1 — settled)

**`DENY`.** A line with nothing configured anywhere in the resolution chain resolves to
**0%** — any discount at all is overage and routes. Fail-safe, consistent with the thesis,
and it makes §9 step 1 a *real* user action: until the Admin configures, nothing flows clean.

> **Consequence the seed script must honour:** a half-seeded database routes *everything*.
> Seed data must cover every (tier × category) pair the demo touches, or the demo looks broken.

#### Retroactive config changes (PRD open question 3 — settled)

- Approved quotes are **grandfathered** — an Admin lowering a ceiling does not retro-route them.
- **Any** mutation (line edit, discount change, negotiation outcome) re-runs the engine
  against *current* config and can open a new `QuotationApproval` cycle. This is the
  mechanism behind §9 step 7, and `approvalCycle` is what keeps cycle 1 readable afterwards
  instead of being overwritten.
- The dashboard raises a `DealHealthSignal` for approved-but-now-non-compliant deals rather
  than silently reopening them.

#### Fulfillment — backorder is a quantity, not a table

`FulfillmentAllocation` holds one row per (order line, warehouse) carrying `allocatedQty`,
`fulfilledQty` and `backorderQty`. `warehouseId` is **nullable** so a line no warehouse can
serve still has somewhere to record its backorder. The shipment count on the §4-B6 screen is
`count(distinct warehouseId)` for the order — no separate `Shipment` table.

**Split algorithm:** greedy — fewest warehouses first, ties broken by lowest
`Warehouse.shippingWeight`; any remainder becomes backorder quantity. See Spike 2.

#### Hybrid billing falls out of the schema

§9 step 6 needs no branching logic: one-time `OrderLine`s produce `InvoiceLine`s on an
`Invoice(ONE_TIME)`; recurring lines produce a `Subscription` whose `BillingSchedule` rows
each bill onto their own `Invoice(RECURRING)` (one-to-one via `billingScheduleId`). Same
order, two invoice streams. **Partial payments are supported** (`PARTIALLY_PAID`,
`amountPaid`) — the first thing a probing judge tries after "record a payment".

#### Audit trail

`AuditLog` is append-only **by convention**: the audit module exposes `record()` and nothing
else — no update, no delete. `userId` is nullable and `actorType` carries `USER | CUSTOMER |
SYSTEM`, because §9 step 3's whole point is that *the system* routed the quotation, and
portal actions come from a customer who has no `User` row. A required `userId` could record
neither honestly.

`QuotationApproval.findings` (Json) stores the per-line explanation *at request time*. That
is what makes PRD metric M7 (a reviewer says why in under 10 seconds) achievable — the
approval screen renders a stored explanation instead of recomputing one.

### Boundaries & contracts

#### The portal boundary (PRD metric M6 — zero internal routes reachable)

Two secrets, not one role check:

| | Internal | Portal |
|---|---|---|
| Signed with | `JWT_SECRET` | `PORTAL_JWT_SECRET` |
| Claims | `{ typ:'internal', userId, role }` | `{ typ:'portal', quotationId, customerId }` |
| Middleware | `requireInternal` → rejects `typ !== 'internal'` | `requirePortal` → rejects `typ !== 'portal'` |
| API namespace | `/api/*` | `/api/portal/*` |
| Next routes | `app/(internal)/…` | `app/portal/[token]/…` |

Because the secrets differ, a portal token presented to an internal route fails *signature
verification* — a forgotten middleware check cannot open the door. Every portal endpoint is
additionally scoped to the `quotationId` inside its own token, so a customer cannot read
another customer's quote even with a valid portal token.

**Portal auth = magic link.** The `PortalToken.token` is the URL segment; there is no
customer password and no customer signup (the PRD lists self-signup as a non-user).

#### Secrets & environment

`.env` in each folder, both already gitignored. Backend needs `DATABASE_URL`, `JWT_SECRET`,
`PORTAL_JWT_SECRET`, `PORT`. Frontend needs `NEXT_PUBLIC_API_URL`. Commit `.env.example`
files — with four people cloning, a missing var is the most likely first-hour blocker.

#### External services

**None.** No payment gateway, no mail provider, no object storage. Portal links and nudges
are generated and displayed in-app. This is deliberate (see PRD non-goals) and it means
the whole system runs offline on a laptop at demo time — worth having, given hackathon wifi.

#### API conventions

REST, plural nouns, JSON envelopes: `{ data }` on success, `{ error: { message, code } }` on
failure, via one `errorHandler` middleware. `zod` parses every request body; a `ZodError`
becomes a 400 with field-level messages. Agreed at hour 0 and not renegotiated — four people
inventing four response shapes is a merge conflict with extra steps.

---

### Other decisions

#### Backend structure — modular by domain

```
backend/
  prisma/  schema.prisma · seed.js · migrations/
  src/
    config/      env.js · prisma.js
    lib/         money.js · apiError.js · asyncHandler.js
    middleware/  auth.js · portalAuth.js · errorHandler.js
    modules/
      auth/  customers/  catalog/  quotations/  approvals/
      fulfillment/  billing/  invoicing/  portal/  dashboard/
      governance/
        governance.routes.js · governance.controller.js · governance.service.js
        rules/
          resolveCeiling.js       ← pure, no imports from prisma
          scoreQuotation.js       ← pure
          selectApprovalPolicySteps.js  ← pure
    app.js
  index.js
```

Every module is the same three files — `*.routes.js` → `*.controller.js` → `*.service.js` —
so a teammate opening an unfamiliar module already knows where things are. The `rules/`
directory is the exception and the point: **pure functions that import nothing from Prisma.**
That's the testability contract, and it's what lets the M2/M3/M4 checks run as a plain script.

#### Frontend structure

```
frontend/app/
  (internal)/ layout.js (nav + auth guard) · login/ · quotations/[id]/ · approvals/
              fulfillment/ · dashboard/ · admin/{products,tiers,ceilings,approvals,warehouses,plans,upsell}/
  portal/[token]/page.js        ← no internal nav, no shared layout
frontend/lib/         apiClient.js · auth.js · money.js
frontend/components/  ui/ (Button Table Card Field Badge) · quote/
```

The portal deliberately sits **outside** the `(internal)` route group so it cannot
accidentally inherit the internal layout, nav, or auth context. That's the structural half
of the §7 "must be a real separate view" requirement; the crypto is the other half.

---

## The four parallel tracks

Cut by **§9 step pairs**, as decided. Two rules make that cut safe:

> **Rule 1 — Config follows consumption.** Each track owns the §4A admin CRUD for the
> entities it consumes. Nobody owns a config screen for a module they don't use.
>
> **Rule 2 — One writer per field group.** Three tracks touch `QuotationLine`. That's fine
> as long as they write *different fields*, enforced by which service module the write lives in.

### T1 · §9 steps 1–2 — Identity, Catalog & Quote Foundation

Auth (signup/login, JWT, roles, middleware) · `User`, `Customer`, `CustomerTier` CRUD ·
catalog CRUD (`ProductCategory`, `Product`, `ProductVariant`, `PriceList`) · `Quotation` +
`QuotationLine` CRUD with snapshot capture, line math and live margin · quotation list /
pipeline · quotation builder screen · **the seed script**.

**Ships in hour 1, before anything else:** `components/ui/`, `lib/apiClient.js`, auth
context, `errorHandler`, `.env.example`. Three people are blocked until this lands — it is
the critical path, not a nice-to-have.

### T2 · §9 steps 3–4 — Governance, Approvals & Upsell  ← *the thesis*

`DiscountRule`, `ApprovalPolicy`/`ApprovalPolicyStep`, `GovernanceSetting`, `CoPurchaseRule`
CRUD + admin screens · the pure `rules/` engine · `QuotationApproval`/`QuotationApprovalStep` lifecycle
(approve / reject / return) · `AuditLog` module · approval screen with the score breakdown
· upsell panel with live margin delta.

This track owns the PRD's depth bet. If T2 finishes early, depth goes here — not elsewhere.

### T3 · §9 steps 5–6 — Fulfillment & Subscription Billing

`Warehouse`, `Inventory`, `SubscriptionPlan` CRUD + admin screens ·
**`confirmQuotationToOrder()`** — the quotation → `Order` copy · the greedy allocation
split · backorders · `Subscription` + `BillingSchedule` generation · fulfillment screen ·
subscription & billing screen.

### T4 · §9 steps 7–8 — Portal, Negotiation & Revenue

Portal JWT + `/api/portal/*` + `app/portal/[token]/` · `PortalToken` issuance ·
`NegotiationRequest` (counter-discount, line comments) and the re-evaluation trigger ·
`Invoice` / `InvoiceLine` / `Payment` with the status machine · deal-health dashboard
(stalled deals) + reporting filters.

### Cross-track contracts — agreed at hour 0, stubbed immediately

Four function signatures are the entire integration surface. Each is committed as a **stub
returning fixture data** before anyone starts, so no track ever waits on another:

| Contract | Owner | Called by |
|---|---|---|
| `evaluateQuotation(quotationId) → { blendedScore, worstLineOverage, findings[], requiredSteps[] }` | T2 | T1 (on line write), T4 (after negotiation) |
| `requestApproval(quotationId, evaluation) → QuotationApproval` | T2 | T1, T4 |
| `confirmQuotationToOrder(quotationId) → Order` | T3 | T4 |
| `generateInvoicesForOrder(orderId) → Invoice[]` | T4 | T3 |

### Who writes what (Rule 2, made concrete)

| Table | T1 writes | T2 writes | T3 writes | T4 writes |
|---|---|---|---|---|
| `QuotationLine` | inputs + snapshots + `lineTotal`/`lineMarginPercent` | `overagePts` | — (reads, copies) | — |
| `Quotation` | totals, `lastActivityAt` | `blendedScore`, `worstLineOverage`, `marginFloorBreached`, `status → PENDING_APPROVAL/APPROVED/REJECTED` | `status → CONFIRMED` | `status → UNDER_NEGOTIATION` |
| `AuditLog` | via `record()` | **owns the module** | via `record()` | via `record()` |
| Everything else | own cluster | own cluster | own cluster | own cluster |

### The one-way door: the schema

`prisma/schema.prisma` is the single artifact all four tracks depend on. **Write it once,
together, in hour 0 — then freeze it.** Migrations after the freeze require a two-minute
huddle, not a solo `prisma migrate dev`. With this split that is not process overhead; it is
the thing that makes the split work at all. T1 is the schema steward; anyone may propose,
T1 merges.

---

## Missing pieces

Things this approach needs that don't exist yet — often the real work:

- **A seed dataset engineered to force the demo.** Not filler: two warehouses where *neither
  alone* covers a line (proving §9 step 5), products across three categories with real
  `unitCost` values (so margin is non-trivial), full tier × category ceiling coverage (or
  `DENY` routes everything), one subscription plan, one customer per tier, and an
  `ApprovalPolicy` with a Manager rung and a Finance rung.
- **The shared UI shell + `apiClient`** (T1, hour 1). Four people building screens without
  this produces four visual languages.
- **`.env.example` in both folders**, plus a one-command DB bootstrap
  (`createdb` → `prisma migrate dev` → `prisma db seed`).
- **`scripts/verify.js`** — the PRD's M2 / M3 / M4 metrics as an *executable* script:
  run the many-small-violations fixture, run five clean quotes, mutate six config values and
  re-assert routing. "Judges can't break the logic" is only a real claim if you can run it
  on demand. This is the highest-value artifact after the engine itself.
- **A money helper** (`lib/money.js`) — see Spike 1.
- **The demo script** — §9's eight steps as a literal click-path, rehearsed twice.

---

## Spikes & experiments

### Spike 1 — `Prisma.Decimal` arithmetic *(highest risk, do this first)*

**Question:** Prisma returns `Decimal` columns as `Prisma.Decimal` objects, not numbers.
`a + b` on two of them **silently string-concatenates** — `"100.00" + "50.00" → "100.0050.00"`
— with no error, producing plausible-looking wrong totals. This is a beginner trap and it
sits on the critical path of every number in the demo.

**Spike:** 15 minutes. Write `lib/money.js` with `add / sub / mul / pct / round2`, and one
fixture asserting a two-line quote's total.

**Decision rule:** if the helper is clean and readable → keep `Decimal` end to end. If the
ergonomics fight the beginner-friendly constraint → **keep `Decimal` in the database columns
but convert to plain JS numbers at the service boundary**, rounding to 2 decimals on write.
Do not leave this undecided; it is the single likeliest source of a wrong number on stage.

### Spike 2 — Warehouse split algorithm

**Question:** is greedy good enough, or does minimizing shipments need real bin-packing?

**Spike:** 30 minutes. Implement greedy (fewest warehouses first, ties by lowest
`shippingCostWeight`) against a three-line / two-warehouse fixture where a naive
line-by-line pass would produce three shipments.

**Decision rule:** if greedy yields the minimum shipment count on that fixture → ship it and
stop. If not → keep greedy anyway and *say so in the demo* ("recommended split, manually
overridable" — which §4-B6 already provides for). Do not spend hackathon hours on optimal
packing; it is not what is being judged.

### Spike 3 — Fixtures before the engine (test-first, for the one thing that can't be wrong)

Not a question — a sequencing decision. T2 writes **three fixture quotes before writing
`scoreQuotation.js`**: the §10 example, the many-small case, and a clean quote. The engine is
done when it flags the first two and leaves the third alone. This is PRD metric M3, and
writing it after the fact is how it quietly gets skipped at hour 20.

### Not spiked (decided, cheap to reverse)

Bearer-vs-cookie auth, Tailwind component shapes, route naming, `cuid` vs `uuid`. Reversible
in minutes; not worth the deliberation.

---

## Open questions

Deliberately deferred. Each names what would settle it.

- [ ] **Quote lock during negotiation.** While a customer has an open counter-offer, can the
      rep still edit? *Settled by:* picking one — recommend locking to `UNDER_NEGOTIATION`
      and refusing rep edits, since "whose version is under review?" has no good answer otherwise.
- [ ] **"Stalled" measured from what?** `lastActivityAt` exists; the question is what updates
      it. *Settled by:* deciding whether a rep's own edit counts as activity, or only
      customer-visible events. Recommend customer-visible only — a rep polishing a dead quote
      isn't momentum.
- [ ] **Partial fulfillment policy.** Ship the available part immediately with a backorder
      behind it, or wait to ship the line whole? *Settled by:* T3's first allocation test.
      Recommend ship-what's-available — §9 step 5 says "splitting across two warehouses if
      needed", which implies partials are expected.
- [ ] **Bearer token in `localStorage`** is XSS-exposed. Accepted for the demo; *settled for
      production by* moving to httpOnly cookies with a CORS allowlist.
- [ ] **Upsell pairings at hour zero.** `CoPurchaseRule.weight` is meant to come from co-purchase
      history that won't exist. Admin enters pairings by hand for the demo — *settled by*
      accepting that, and saying so if a judge asks where the ranking comes from.
- [ ] **Who supplies the concrete demo numbers** (tier ceilings, category ceilings, step
      thresholds)? Still unowned from the PRD. *Settled by:* T2 picking them while seeding,
      before hour 4 — they gate every other track's ability to test.
- [ ] **Multi-currency.** `currency` fields exist on `PriceList` and `Quotation` but nothing
      converts. Bonus-only per PDF §7; leaving the columns in place makes it a later feature
      rather than a later migration.

---

## Next steps

- **Slice it into tickets** — feed this doc plus the PRD to `/piv-slice-epic` to produce
  PIV-sized tickets and create them as issues, four lanes matching the tracks above.
- **Or plan one track directly** — `piv-plan-implementation` on a single track if you'd
  rather start building than slice.
- **Or spike now** — Spike 1 (`Prisma.Decimal`) is 15 minutes and de-risks every number in
  the demo. It is the highest-value first action in this document.
- Durable conventions from this doc (module shape, API envelope, one-writer-per-field-group,
  the schema freeze) → `rules-create-global` to turn them into the project's CLAUDE.md.
