# DealFlow360

**A self-governing B2B sales operations platform.** The system decides what needs approval — not the rep.

Pricing, discount ceilings, approval routing, warehouse splitting and subscription billing are implemented as **pure functions** the API calls. Every verdict is stored with the inputs that produced it, so an approval from last week still explains itself after an admin changes a ceiling today.

| | |
|---|---|
| **Stack** | Next.js 16 · React 19 · Express 5 · Prisma 6 · PostgreSQL |
| **Models** | 36 Prisma models, 21 enums |
| **API** | 22 route modules, 22 controllers |
| **Rules** | 14 pure rule functions (zero I/O) |
| **UI** | 28 pages, 13 shared components |
| **Validation** | Zod on every write · JWT (internal) + separate portal JWT |

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Architecture](#2-architecture)
3. [Data model](#3-data-model)
4. [End-to-end workflow](#4-end-to-end-workflow)
5. [User flows by role](#5-user-flows-by-role)
6. [Engine reference](#6-engine-reference) — the logic of every engine
7. [API surface](#7-api-surface)
8. [Security model](#8-security-model)
9. [Frontend architecture](#9-frontend-architecture)
10. [Testing](#10-testing)
11. [Scaling](#11-scaling)
12. [Known gaps](#12-known-gaps)

---

## 1. Quick start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+

### Setup

```bash
# ── Backend ───────────────────────────────────────────
cd backend
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, PORTAL_JWT_SECRET
npm install
npm run db:migrate            # creates schema
npm run db:seed               # demo catalogue, tiers, warehouses, quotations
npm run dev                   # → http://localhost:4000

# ── Frontend ──────────────────────────────────────────
cd ../frontend
npm install
npm run dev                   # → http://localhost:3000
```

### Demo accounts

All seeded users share the password `Password123!`.

| Email | Role | Sees |
|---|---|---|
| `admin@dealflow360.com` | ADMIN | Everything, including backend configuration |
| `manager@dealflow360.com` | SALES_MANAGER | Approvals queue, deal health, tiers, ladder |
| `finance@dealflow360.com` | FINANCE | Second-level approvals, invoicing, credit notes |
| `rep@dealflow360.com` | SALES_REP | Only their own quotations |

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs internal access tokens |
| `REFRESH_TOKEN_SECRET` | Signs refresh tokens. Optional — falls back to `${JWT_SECRET}_refresh` |
| `PORTAL_JWT_SECRET` | Signs **customer portal** tokens — must differ from `JWT_SECRET` |
| `PORT` | API port (default `4000`) |
| `NEXT_PUBLIC_API_URL` | Frontend → API base (default `http://localhost:4000/api`) |

---

## 2. Architecture

### The layer contract

The single constraint that keeps the system honest:

> **Business rules never touch Prisma. Controllers never re-implement a rule.**

A verdict has exactly one source. If two code paths could reach different answers, one of them is a bug waiting to happen.

```
HTTP request
    │
    ▼
routes/            Mount paths. Attach authenticate + requireRole. No logic.
    │
    ▼
controllers/       Zod validation, load records, shape response. Orchestration only.
    │
    ▼
services/          Multi-step transactions that must not diverge.
    │              · quotationPricing.service.js  — recalculate totals + margins
    │              · approvalRouting.service.js   — score, then route or auto-approve
    ▼
rules/             Pure decisions. Deterministic. No I/O. Testable in isolation.
    │              · resolveCeiling · scoreQuotation · riskEngine
    │              · selectApprovalPolicySteps
    │              · fulfillment/*  · subscriptions/*  · orders/*
    ▼
lib/prisma.js      36-model schema. Snapshot columns freeze the rules that applied.
```

### Why the rules are pure

Every function in `backend/rules/` takes plain objects and returns plain objects. This buys three things:

1. **Testable without a database.** `npm run test:rules` runs four fixtures through the full scoring and routing chain in milliseconds.
2. **Replayable.** Given the stored `findings` JSON on an approval cycle, you can re-run the decision and get the same answer.
3. **Reusable.** The rep's submit, the explicit approval request, and the customer counter-offer all call one `routeQuotationForApproval` — so a negotiated deal can never be judged by looser rules than the original.

### The snapshot principle

`QuotationLine` stores `effectiveCeilingPercent`, `unitCost` and `minMarginPercent` **as columns**, written once when the line is priced.

This is deliberate. An admin lowering the Gold tier ceiling from 15% to 10% must not retroactively make last week's approved quotes look non-compliant. The approval screen can answer *"why is this on my desk?"* from the record itself, without recomputing against today's configuration.

Same principle on `QuotationApproval.findings` — the per-line explanation is stored, not derived.

---

## 3. Data model

### The four-entity spine

```
Customer ──raises──▶ Quotation ──confirms──▶ Order ──billed by──▶ Invoice
  1:N                  (governed)    1:1              1:N
```

The spine is deliberately narrow. A `Quotation` becomes exactly **one** `Order` — that 1:1 is where the governed decision stops being negotiable.

### Ownership

| Spine entity | Owns | Notes |
|---|---|---|
| **Customer** | `PortalToken` | Tier is a **snapshot** on the quotation, not a live lookup |
| **Quotation** | `QuotationLine`, `QuotationApproval`, `Negotiation` | Approvals are numbered *cycles*, never overwritten |
| **Order** | `OrderLine`, `FulfillmentAllocation`, `Subscription` | `OrderLine` is 1:1 back to its `QuotationLine` |
| **Invoice** | `InvoiceLine`, `Payment`, `CreditNote` | `amountPaid` kept in sync with `sum(payments)` |

### All 36 models by track

| Track | Models |
|---|---|
| **Identity & access** | `Role` `User` `Customer` `PortalToken` |
| **Governance** | `GovernanceSetting` `CustomerTier` `DiscountRule` `ApprovalPolicy` `ApprovalPolicyStep` |
| **Catalogue** | `ProductCategory` `Product` `ProductVariant` `PriceList` `PriceListItem` `SubscriptionPlan` `CoPurchaseRule` |
| **Inventory** | `Warehouse` `WarehouseShippingWeight` `Inventory` |
| **Quote & approval** | `Quotation` `QuotationLine` `QuotationApproval` `QuotationApprovalStep` `Negotiation` `NegotiationRequest` |
| **Execution & billing** | `Order` `OrderLine` `FulfillmentAllocation` `Subscription` `BillingSchedule` `Invoice` `InvoiceLine` `Payment` `CreditNote` |
| **Observability** | `DealHealthSignal` `AuditLog` |

### Key enums

- `QuotationStatus` — `DRAFT · PENDING_APPROVAL · APPROVED · REJECTED · SENT · UNDER_NEGOTIATION · CONFIRMED · CANCELLED · EXPIRED`
- `OrderStatus` — `PENDING_FULFILLMENT · ALLOCATED · BACKORDERED · PARTIALLY_SHIPPED · SHIPPED · COMPLETED · CANCELLED`
- `SignalType` — `STALLED_DEAL · DISCOUNT_ANOMALY · DELIVERY_SLIPPAGE · MARGIN_FLOOR_BREACH · APPROVAL_OVERDUE`
- `ScoreStrategy` — `VALUE_WEIGHTED · SUM_OF_POINTS · ABSOLUTE_MARGIN`

`BACKORDERED` is distinct from `ALLOCATED` on purpose: an order with units nobody can ship yet is not the same as one fully reserved and ready to go.

---

## 4. End-to-end workflow

```
1. Rep builds quotation          POST /quotations, POST /quotations/:id/lines
        │                        → each line write re-prices the whole quote
        ▼
2. Upsell panel suggests         GET /quotations/:id/suggestions
        │                        → margin delta shown before accepting
        ▼
3. Rep confirms                  POST /quotations/:id/submit
        │                        → THE SYSTEM decides: auto-approve or route
        ├──── compliant ────────▶ status = APPROVED, audit APPROVAL_AUTO_GRANTED
        │
        └──── over ceiling ─────▶ status = PENDING_APPROVAL, cycle N opened
                │                 with exactly the rungs the policy requires
                ▼
4. Manager approves              POST /approvals/steps/:id/approve
        │                        (or /reject, or /return for revision)
        ▼
5. Portal negotiation            POST /portal/negotiate  (customer)
        │                        POST /negotiations/requests/:id/respond  (rep)
        │                        → re-prices, then re-routes as cycle N+1
        ▼
6. Customer confirms             POST /portal/accept
        │                        → confirmQuotationToOrder()
        ▼
7. Warehouse split               GET  /fulfillment/orders/:id/plan
        │                        POST /fulfillment/orders/:id/allocate
        │                        POST /fulfillment/orders/:id/override
        ▼
8. Billing                       POST /invoices  ·  POST /invoices/:id/payments
                                 recurring lines → BillingSchedule → Invoice
```

Throughout, **Deal Health** observes and never mutates: `GET /quotations/deal-health`.

---

## 5. User flows by role

### Sales Rep

1. Log in → workspace dashboard
2. **Quotations Pipeline** — Kanban board by stage, or list view with B-Tree search
3. **New Quotation** — pick customer, add product lines, apply discounts
4. Live margin indicator updates on every line change
5. **Upsell panel** shows ranked suggestions with margin delta; accept → totals update immediately
6. Confirm → the system routes it. The rep never asks for approval manually.
7. Track status; respond to customer counter-offers

A rep sees **only their own quotations** — enforced in `getQuotations` at the query level, not by hiding UI.

### Sales Manager

1. **Approvals Queue** — pending cycles with blended score and per-line findings
2. Search / filter / group-by, multi-select for **batch approve**
3. Approve · Reject · **Return for revision** — reason recorded on every action
4. **Stalled Deals** tab — inactive beyond the configured threshold
5. **Deal Health Dashboard** — all five signal types, with discount-vs-baseline chips
6. **Nudge / Escalate** from an alert → writes a real audit entry with a 12h cooldown
7. Configure tiers and approval chains

### Finance

Second-level approvals on high-risk deals, invoicing, payment recording, credit notes.

### Customer (portal)

1. Magic link or portal login — **cryptographically separate** from staff auth
2. View quotation, line by line
3. Comment on a line, request a change, or counter a discount
4. **Confirm** — if terms changed beyond thresholds during negotiation, the quote re-enters approval automatically

### Admin

Products, variants, price lists, discount tiers, approval ladder, warehouses, subscription plans, upsell rules, governance settings.

---

## 6. Engine reference

### 6.1 Ceiling Engine — `rules/resolveCeiling.js`

**What it does.** Resolves the strictest discount ceiling that applies to one line, and catches reps who bypass the discount field.

**Precedence — strictest wins:**

```
1. DiscountRule (tier, category)   ← most specific
2. DiscountRule (null, category)   ← category-wide
3. DiscountRule (tier, null)       ← tier-wide
4. CustomerTier.maxDiscountPercent
5. GovernanceSetting.unconfiguredCeilingPolicy
```

`effectiveCeilingPercent = MIN(all matching limits)`. Not the most specific match — the **minimum**, so adding a rule can never loosen a ceiling.

**Anti-bypass.** A rep can discount two ways: type `20` in the discount field, or quietly type a lower unit price. The engine computes both and takes the max:

```js
calculatedPriceDiscount = ((referencePrice - unitPrice) / referencePrice) * 100
effectiveDiscountPercent = MAX(enteredDiscount, calculatedPriceDiscount)
isBypassed = calculatedPriceDiscount > enteredDiscount + 0.05
```

The `0.05` tolerance stops floating-point noise from flagging honest lines.

**Unconfigured fallback.** When nothing matches, `unconfiguredCeilingPolicy` decides: `DENY` → 0%, `TIER_ONLY` → tier ceiling, `PERMISSIVE` → 100%. Default is `DENY` — an unconfigured category should block, not wave everything through.

---

### 6.2 Scoring Engine — `rules/scoreQuotation.js`

**What it does.** Turns per-line overages into the two numbers approval routing keys on.

```
overage_i        = max(0, effectiveDiscount_i - effectiveCeiling_i)
worstLineOverage = max(overage_i)
blendedScore     = Σ(overage_i × lineValue_i) / Σ(lineValue_i)     [VALUE_WEIGHTED]
```

**Why blended matters.** The spec's own example: one line 2 points over, another 3, another 2 — none alarming alone, but the rep has quietly given away real margin across the order. The blended score sees the pattern; `worstLineOverage` catches the single egregious line. Both route independently.

**Three strategies** (`GovernanceSetting.scoreStrategy`):

| Strategy | Formula | Use when |
|---|---|---|
| `VALUE_WEIGHTED` | `Σ(overage × value) / Σ value` | Default. A big line's overage matters more. |
| `SUM_OF_POINTS` | `Σ overage` | Every violation counts equally. |
| `ABSOLUTE_MARGIN` | `Σ(overage/100 × value)` | Score in currency, not points. |

**Missing cost is not zero cost.** If `unitCost` is null, margin is marked *unknown* rather than assumed 100%. If a margin floor applies, unknown cost trips the gate — the safe direction.

---

### 6.3 Risk Engine — `rules/riskEngine.js`

**What it does.** Produces an explainable 0–100 score across five weighted factors, with a human-readable reason for each contribution.

| Factor | Max | Logic |
|---|---|---|
| Discount excess | 40 | Scales with overage past ceiling |
| Margin breach | 40 | 20 base + 2 per point of deficit; missing cost = 30 |
| Deal value exposure | 15 | ≥₹10L → 15 · ≥₹5L → 10 · ≥₹1L → 5 |
| Multiple violations | 10 | 3+ lines → 10 · 2 lines → 6 · 1 line → 3 |
| Tier behaviour | 15 | Bronze 12 · Silver 6 · Gold 2 |

**Bands:** `≥71 CRITICAL` · `≥41 or margin breached → HIGH` · `≥21 or any overage → MEDIUM` · else `LOW`.

Every factor pushes a sentence onto `explanation[]`, so the approval screen shows *why* — not just a number.

---

### 6.4 Approval Routing — `rules/selectApprovalPolicySteps.js` + `services/approvalRouting.service.js`

**A step fires when any of these is true:**

```
blendedScore     >= step.minBlendedScore
worstLineOverage >= step.minWorstLineOverage
riskBand is HIGH or CRITICAL      → escalates to include Finance
marginFloorBreached
```

**The service** (`routeQuotationForApproval`) is the only place routing happens. It:

1. Scores against **current** configuration — nothing cached, so a ceiling changed a second ago is already in force
2. **Compliant** → `status = APPROVED`, audit `APPROVAL_AUTO_GRANTED`. Managers only see deals that genuinely need them.
3. **Non-compliant** → opens cycle `N+1` in a transaction, creates exactly the required steps, stores `findings`, sets `PENDING_APPROVAL`

**Cycles are numbered, never overwritten.** The review that happened *before* a customer counter-offer stays readable afterwards. This is what makes re-entry auditable instead of destructive.

Three callers share it — rep submit, explicit request, customer negotiation — so all three are judged identically.

---

### 6.5 Warehouse Split — `rules/fulfillment/selectWarehouses.js` + `allocateStock.js`

**Selection order** (deterministic, tie-broken by code so the same inputs always give the same plan):

```
1. Warehouses that can fulfil the whole line alone   ← minimise shipment count
2. Strongest stock position first
3. Lower shippingWeight                              ← minimise cost
4. Warehouse code, alphabetically                    ← determinism
```

**Sellable quantity** is `max(0, availableQty - reservedQty)` — reserved stock is never double-promised.

**Allocation** walks the sorted list taking what each can give until the requirement is met. Anything left becomes **backorder**, and the order goes `BACKORDERED` rather than pretending to be allocated.

**Consolidation.** When stock arrives mid-fulfillment, `GET /fulfillment/orders/:id/consolidation-status` reports what can now be merged, and `POST .../consolidate-backorder` collapses it into fewer shipments.

**Manual override** — `POST /fulfillment/orders/:id/override` — lets ops reject the suggested split, validated by `validateAllocation.js`.

---

### 6.6 Subscriptions & Hybrid Billing — `rules/subscriptions/*`

One order can mix one-time hardware with recurring lines. They bill separately on the same order.

- **`calculateProration`** — day-based factor over the billing period. Mid-cycle quantity or plan changes bill only the remaining fraction.
- **`generateBillingSchedule`** — expands a plan into dated `BillingSchedule` rows.
- **`calculateBillingPeriod`** — period boundaries for monthly / quarterly / yearly.
- **`calculateCancellationRefund`** — `paidAmount × refundPercent / 100`, rounded to 2dp, which triggers a `CreditNote`.

All four validate their inputs and throw rather than silently returning `NaN`.

---

### 6.7 Upsell Engine — `controllers/quotationLine.controller.js`

Three layers, highest score wins; a product already on the quote is never suggested.

| Layer | Source | Score |
|---|---|---|
| 1. Seeded pairings | `HARDCODED_PRODUCT_UPSELLS` by SKU | 180, decreasing |
| 2. Co-purchase rules | `CoPurchaseRule` table | `coPurchaseCount × weight × promotedBoost` |
| 3. Dynamic catalogue | Complementary / high-margin fallback | Only if fewer than 4 suggestions |

**Margin protection.** Layer 2 skips anything below the rule's `minMarginPercent`; layer 3 enforces a 10% floor. Promoted products get a `1.25×` boost (`Product.isPromoted`).

Each suggestion returns `marginDelta` and `revenueDelta`, so the rep sees the margin impact *before* accepting. Accepting re-prices the quote immediately.

> ⚠️ **Layer 1 is hardcoded** and outranks the data-driven rules. It guarantees a good demo, but the spec asks for pairings derived from co-purchase history. See [Known gaps](#12-known-gaps).

---

### 6.8 Deal Health — `controllers/quotation.controller.js`

Five signals, evaluated over active quotations only.

| Signal | Fires when |
|---|---|
| `STALLED_DEAL` | `lastActivityAt` older than `stalledAfterDays` (default 7) |
| `MARGIN_FLOOR_BREACH` | Margin below 15% or `marginFloorBreached` |
| `DISCOUNT_ANOMALY` | See below |
| `APPROVAL_OVERDUE` | `PENDING_APPROVAL` for over 48h |
| `DELIVERY_SLIPPAGE` | Promised delivery within 3 days, or passed, while unconfirmed |

**The discount anomaly baseline.** The spec defines an anomaly as *"a discount well above a rep's historical average"* — so the comparison is against that rep's own settled deals, not a policy ceiling (the ceiling is already enforced by routing; re-reporting it says nothing new).

```js
effectiveDiscount = discountTotal / subtotal * 100      // subtotal is gross
baseline          = mean(effectiveDiscount of that rep's SETTLED quotations)
anomaly           = effectiveDiscount - baseline >= anomalyDeviationPoints
```

- **Settled** = `CONFIRMED · REJECTED · CANCELLED · EXPIRED`. In-flight quotes are excluded so a rep cannot move their own baseline by drafting more quotes.
- **Fallback ladder:** under 3 settled deals → team average; under 3 team-wide → **no signal at all**. Calling two quotes an average manufactures false anomalies.
- **Severity:** `CRITICAL` at ≥2× threshold, else `HIGH`.
- **Safety net:** an outright ceiling breach (≥8 pts) still raises the signal. A rep who over-discounts on *every* deal has a high personal baseline, so the deviation test alone would quietly clear their worst quotes.

`anomalyDeviationPoints` is admin-configurable and genuinely drives detection.

**Nudge / escalation.** `POST /quotations/:id/nudge` writes a real `DEAL_NUDGE_SENT` or `DEAL_ESCALATED` row to the audit ledger with actor, target rep and days-inactive.

It **deliberately does not touch `lastActivityAt`** — a nudge is the manager acting, not the rep. Bumping it would clear the stalled signal and make a deal look healthy precisely because nobody worked it. A 12-hour cooldown returns `429` unless `force: true`.

---

### 6.9 Reporting — `controllers/reports.controller.js`

Four filters, all applied **in the Prisma query** rather than in response shaping, so KPIs, breakdowns and exported rows always describe the same slice.

| Filter | Parameter |
|---|---|
| Period | `period=today\|week\|month\|quarter\|year` or `from` / `to` |
| Sales Team / Rep | `salesRepId` |
| Approval Status | `approvalStatus=PENDING\|APPROVED\|REJECTED` |
| Product / Category | `productId` / `categoryId` |

`APPROVED` spans `APPROVED` **and** `CONFIRMED` — a quote the customer then confirmed is still an approved quote for reporting.

A category filter also **scopes the line rollup**, otherwise filtering to "Hardware" would still report the Services lines that merely shared a quotation.

**Exports** share one `{key, label, formatter}` column contract across CSV, XLS (SheetJS, multi-sheet) and PDF (jsPDF + autotable) — a table defines columns once and all three agree.

---

### 6.10 B-Tree Search Index — `frontend/lib/btree.js`

A real B-Tree (minimum degree `t=3`, max `2t-1 = 5` keys per node) built client-side over the loaded rows, giving `O(log N)` prefix lookups instead of a linear scan per keystroke.

Text fields are tokenised on `[\s,._\-/]+`, so `QT-2026-0010` is findable by `2026` or `0010`. The index is rebuilt in a `useMemo` keyed on the row array — it only recomputes when data actually changes.

Used by the Quotations, Orders and Approvals lists.

---

## 7. API surface

| Mount | Purpose |
|---|---|
| `/api/auth` | Login, signup, refresh |
| `/api/customers` · `/api/customer-tiers` | Customers and tier ceilings |
| `/api/quotations` | CRUD, lines, submit, suggestions, **deal-health**, **nudge** |
| `/api/approvals` | Policies, steps, approve / reject / return, history |
| `/api/governance` | Settings, discount rules, evaluate |
| `/api/orders` · `/api/fulfillment` | Confirmation, plan, allocate, override, consolidate |
| `/api/subscriptions` | Recurring contracts, proration, cancellation |
| `/api/invoices` | Invoices, payments, credit notes |
| `/api/reports` | `/filters`, `/sales` |
| `/api/audit-logs` | Read-only append-only ledger |
| `/api/portal` | **Customer-facing**, separate auth |
| `/api/negotiations` | Counter-offers and rep responses |

**Response envelope** — every route returns the same shape:

```json
{ "statusCode": 200, "data": { }, "message": "…", "success": true }
```

---

## 8. Security model

### Two cryptographically separate realms

Internal staff tokens are signed with `JWT_SECRET`; customer portal tokens with `PORTAL_JWT_SECRET`.

> A staff token fails signature verification on every portal route, and a portal token fails on every internal route. **The boundary is cryptographic, not a flag.**

This satisfies the spec's requirement that the customer view be *"a real, separate, restricted view, not just another internal screen with a different label"*.

- Access token: **15m** · Refresh token: **7d**
- Passwords: bcrypt, 10 rounds
- Portal sessions: magic-link (`PortalToken`, backed by a DB row that can be revoked) or portal credentials

### Authorisation

`requireRole(...)` gates writes. Role scoping is enforced **in the query**, not by hiding UI — a `SALES_REP` calling `GET /quotations` gets a `where` clause pinned to their own id, so passing someone else's `salesRepId` cannot widen the result.

### Audit

`AuditLog` is append-only by convention: `lib/audit.js` exposes `recordAuditLog()` and nothing else — no update, no delete. `userId` is nullable and `actorType` distinguishes `USER · CUSTOMER · SYSTEM`, because §9 step 3's whole point is that the **system** routed the quotation, not the rep.

---

## 9. Frontend architecture

```
frontend/
├── app/                    Next.js App Router — 28 pages
│   ├── quotations/         Kanban + list, builder, detail
│   ├── approvals/          3 tabs: queue · stalled · deal health
│   ├── orders/             List, detail, fulfillment split
│   ├── invoicing/          Invoices and payments
│   ├── reports/            Filters, KPIs, PDF/XLS/CSV export
│   ├── admin/              13 configuration screens
│   └── portal/             Customer-facing, separate auth
├── components/ui/          13 shared components
├── context/                AuthContext, SidebarContext
└── lib/                    apiClient · btree · exportCsv · exportReport
```

**Design system.** Odoo-inspired: `#714B67` brand, `#F8F9FA` ground, semantic success/warning/danger. Shared `Button` / `Card` / `Badge` / `Table` keep it consistent.

**`OdooControlPanel`** provides one search + filter + group-by bar reused across list pages.

**Selection scoping.** Every multi-select list derives `visibleSelectedIds` from the filtered set:

```js
const visibleSelectedIds = useMemo(
  () => new Set(filtered.filter(x => selectedIds.has(x.id)).map(x => x.id)),
  [filtered, selectedIds]
);
```

Batch actions and counts use this, never the raw selection — otherwise selecting 10, filtering to 2, and hitting "Batch Approve (2)" would approve all 10 including the 8 you can't see.

---

## 10. Testing

```bash
cd backend
npm run test:rules        # 4 fixtures through scoring + routing (no DB needed)
npm run test:portal       # portal auth boundary
npm run test:negotiation  # counter-offer → re-approval
npm run test:invoicing    # invoice + payment lifecycle

npm run verify            # §9 eight-step walkthrough, end to end over HTTP
                          # (server must already be running)
```

The rule fixtures assert the full chain — ceiling resolution, blended scoring, risk banding, triggered roles — including the §2.5 anti-bypass case where a rep lowers the unit price instead of entering a discount. They need no database, so they run in milliseconds.

**`npm run verify`** is the one to run in front of a judge: it drives the spec's own eight-step walkthrough (login → discounted quote → auto-routed approval → upsell → warehouse split → hybrid billing → portal counter-offer → payment) over real HTTP and asserts the *visible, correct result* at each step, not just that the screens render.

### Database helpers

```bash
npm run db:studio   # Prisma Studio
npm run db:reset    # drop, re-migrate, re-seed
npm run db:generate # regenerate Prisma client
```

---

## 11. Scaling

### Database

**Indexes already in place** on the hot paths:

```prisma
@@index([status, lastActivityAt])   // stalled-deal + pipeline queries
@@index([status, salesRepId])       // rep-scoped lists
@@index([quotationId, createdAt])   // audit trail per deal
@@index([signalType, severity])     // deal health filtering
```

**What breaks first, and the fix:**

| Bottleneck | Symptom | Fix |
|---|---|---|
| `getDealHealth` loads all active quotations with lines | Slows past ~5k open deals | Paginate; move signal evaluation to a scheduled job writing `DealHealthSignal` rows, and read those |
| Discount baselines query all settled deals per request | Grows without bound | Materialise a `rep_discount_baseline` table refreshed nightly |
| Client-side B-Tree indexes the full result set | Memory cost past ~10k rows | Move to server-side search — PostgreSQL `pg_trgm` or full-text |
| Reports aggregate in JS after `findMany` | Slows on large windows | Push to SQL `GROUP BY`, or a read replica |
| Batch approve loops `await` per quotation | Linear latency | Queue the batch; return a job id |

### Application

- **Stateless API.** JWT auth with no server session, so the API scales horizontally behind a load balancer today.
- **Prisma pooling.** `globalForPrisma` prevents client exhaustion in dev; use PgBouncer in production.
- **Pure rules parallelise.** Nothing in `rules/` touches shared state, so scoring can move to a worker pool unchanged.
- **Read replicas.** Reporting and deal health are read-only and are the natural first candidates.

### Caching

Deliberately **no caching on the governance path** — `routeQuotationForApproval` re-reads configuration every time, so a ceiling an admin changed a second ago is already in force. Correctness beats latency here. The catalogue and tier tables are the safe places to cache.

### Frontend

- Export libraries (`jspdf`, `xlsx`) are **dynamically imported** — out of the initial bundle and out of SSR.
- Next.js App Router gives per-route code splitting by default.
- Poll-based dashboards are the next thing to replace; see below.

---

## 12. Known gaps

Honest list, ranked by how visible each is to someone using the product.

1. **Nudges are recorded, not delivered.** The audit entry is real, but the rep only sees it if they open the dashboard. Needs a notification model plus an in-app inbox — the 12h cooldown already exists as the send policy.
2. **Upsell layer 1 is hardcoded.** `HARDCODED_PRODUCT_UPSELLS` outranks the `CoPurchaseRule` table. The data-driven path works; the seeded layer should become a fallback, not the top rank.
3. **Discount baselines are not per-category.** A rep selling thin-margin services has a legitimately higher baseline than one selling hardware.
4. **Multi-currency is nominal.** `PriceList.currency` exists and defaults to `INR`, but totals sum as if single-currency. Needs an FX table and a currency snapshot on the quotation. *(The spec calls this a bonus, not a requirement.)*
5. **Product variants are modelled but shallow.** `QuotationLine.productVariantId` is wired, but the builder and allocator reason at product level.
6. **Nothing runs on push.** The coverage exists — rule fixtures plus `npm run verify`, which drives the whole §9 walkthrough over HTTP — but there is no CI workflow invoking any of it, so a regression is only caught if someone remembers to run it.
7. **Dashboards poll.** Deal health and the approvals queue refetch on an interval; server-sent events keyed on approval-step changes would be the fix.
8. **Error middleware stamps `INTERNAL_SERVER_ERROR`** as the `code` on every error body regardless of status. HTTP statuses are correct; the body field is misleading.

---

## Architecture diagram

A one-page visual — module flow, data model spine, and the ranked next-steps note — lives at [`docs/architecture.html`](docs/architecture.html).

---

**Built by SyntaxSquad.**
