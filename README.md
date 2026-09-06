# DealFlow360

**A Self-Governing B2B Sales Operations & Fulfillment Platform**  
*The system decides what needs approval, optimizes multi-warehouse fulfillment, and automates hybrid billing — not the rep.*

---

| Metric / Dimension | Specification |
|---|---|
| **Technology Stack** | Next.js 16 (App Router) · React 19 · Express 5 · Prisma 6 · PostgreSQL 14+ |
| **Data Architecture** | 36 Relational Models · 21 Enums · Immutable Snapshot Auditing |
| **Engine Contract** | 14 Pure Deterministic Rule Functions (Zero I/O, 100% Isolation Testable) |
| **Fulfillment Engine** | Greedy Multi-Warehouse Split · Cost/Weight Optimization · Dynamic Backorder Consolidation |
| **Financial Subsystem** | Hybrid One-Time & Recurring Invoicing · Day-Accurate Proration · Double-Entry Integrity |
| **Security Architecture** | Asymmetric Dual-Realm Cryptography (Internal JWT vs. Isolated Customer Portal JWT) |
| **Search & Indexing** | In-Memory Client-Side B-Tree (`t=3`, $O(\log N)$ tokenized prefix lookup) |

---

## Table of Contents

1. [System Architecture & Core Principles](#1-system-architecture--core-principles)
2. [End-to-End Website & Platform Workflow](#2-end-to-end-website--platform-workflow)
3. [Deep Dive: Warehouse Architecture & Inventory Management](#3-deep-dive-warehouse-architecture--inventory-management)
4. [Deep Dive: Fulfillment Engine & Split Allocation Algorithm](#4-deep-dive-fulfillment-engine--split-allocation-algorithm)
5. [Deep Dive: Post-Fulfillment, Order Lifecycle & Hybrid Billing](#5-deep-dive-post-fulfillment-order-lifecycle--hybrid-billing)
6. [Deep Dive: Subscriptions, Proration & Financial Reconciliation](#6-deep-dive-subscriptions-proration--financial-reconciliation)
7. [Deep Dive: Deal Governance, Risk Engine & Multi-Cycle Approvals](#7-deep-dive-deal-governance-risk-engine--multi-cycle-approvals)
8. [Deep Dive: Customer Portal & Asymmetric Negotiation Protocol](#8-deep-dive-customer-portal--asymmetric-negotiation-protocol)
9. [Observability: Deal Health Signals & Append-Only Audit Ledger](#9-observability-deal-health-signals--append-only-audit-ledger)
10. [Frontend Architecture & Client-Side B-Tree Indexing](#10-frontend-architecture--client-side-b-tree-indexing)
11. [Complete API Specification & Data Contracts](#11-complete-api-specification--data-contracts)
12. [Environment Setup & Verification Suite](#12-environment-setup--verification-suite)

---

## 1. System Architecture & Core Principles

DealFlow360 is built around strict architectural invariants designed to prevent data divergence and ensure complete auditability across long-running B2B deal cycles.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              HTTP Layer                                │
│       Express 5 Middleware: Authentication & Role-Based Gateways       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Controller Layer                              │
│       Zod Schema Validation · Request Orchestration · DTO Shaping      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
┌───────────────────────────────────┐   ┌────────────────────────────────┐
│          Service Layer            │   │      Pure Rule Engines         │
│  Multi-Table Atomic Transactions  │   │  Deterministic Math & Policies │
│  · quotationPricing.service.js    │   │  · resolveCeiling.js           │
│  · approvalRouting.service.js     │◄──┤  · scoreQuotation.js           │
│  · fulfillment.controller.js      │   │  · selectWarehouses.js         │
│  · invoicing.controller.js        │   │  · allocateStock.js            │
└─────────────────┬─────────────────┘   │  · calculateOrderStatus.js     │
                  │                     │  · calculateProration.js       │
                  │                     └────────────────────────────────┘
                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Data Persistence (Prisma)                       │
│      PostgreSQL 14+ · 36 Relational Models · Snapshot Immutability     │
└────────────────────────────────────────────────────────────────────────┘
```

### The Architectural Invariants

1. **The Layer Contract**: Pure business rules (`backend/rules/*`) never perform database I/O or network requests. They accept plain JavaScript objects and return plain objects. Controllers never re-implement rule logic; they orchestrate inputs and execute persistence.
2. **Snapshot Immutability**: All discount ceilings (`effectiveCeilingPercent`), unit costs (`unitCost`), and minimum margins (`minMarginPercent`) are captured as immutable columns on `QuotationLine` at quote creation time. If an administrator lowers a tier discount ceiling today, historical quotations and approved deals remain legally explainable without retroactive invalidation.
3. **The Four-Entity Data Spine**:
   $$\text{Customer} \xrightarrow{\text{raises}} \text{Quotation (1:N)} \xrightarrow{\text{confirms}} \text{Order (1:1)} \xrightarrow{\text{billed by}} \text{Invoice (1:N)}$$
   The transition from `Quotation` to `Order` is strictly $1:1$. Once an order is confirmed, negotiated pricing is locked, and execution begins.
4. **Dual Cryptographic Realm**: Internal staff authentication utilizes `JWT_SECRET`, whereas external customer portal links utilize `PORTAL_JWT_SECRET`. Portal tokens cannot authenticate internal API endpoints even if middleware is misconfigured.

---

## 2. End-to-End Website & Platform Workflow

The platform coordinates eight major workflow phases across administrative, sales, customer, operations, and financial actors.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Operations / Admin
    actor Rep as Sales Rep
    actor Manager as Sales Manager
    actor Customer as Customer (Portal)
    actor Finance as Finance Specialist

    Note over Admin: Phase 1: Setup Catalog, Tiers & Warehouses
    Admin->>System: Configure Products, Warehouses & Stock Levels

    Note over Rep: Phase 2: Quote Construction & Live Pricing
    Rep->>System: Draft Quotation & Add Product Lines
    System-->>Rep: Live Margin %, Upsell Recommendations & Ceiling Checks

    Note over Rep,Manager: Phase 3: Automated Governance & Routing
    Rep->>System: Submit Quotation for Review
    alt Within Ceilings & Healthy Margin
        System-->>Rep: Status = APPROVED (Auto-Granted)
    else Exceeds Discount Ceiling or Violates Margin Floor
        System-->>Manager: Status = PENDING_APPROVAL (Routes to Ladder Step)
        Manager->>System: Review Findings JSON -> Approve / Reject / Return
    end

    Note over Rep,Customer: Phase 4: Customer Portal & Negotiation
    Rep->>System: Generate Magic Link & Send to Customer
    Customer->>System: Access Portal & Propose Line Counter-Offer
    Rep->>System: Accept Counter-Offer (Triggers Re-Approval Cycle N+1)
    Customer->>System: Formal Order Confirmation (Accept Quote)

    Note over Admin,System: Phase 5 & 6: Order Confirmation & Warehouse Split
    System->>System: Generate Order (ORD-X) & OrderLines (1:1)
    Admin->>System: Request Fulfillment Plan
    System->>System: Run Warehouse Split Algorithm (Greedy Stock Optimization)
    Admin->>System: Accept Suggested Allocation or Apply Manual Override
    System->>System: Atomically Increment Reserved Stock & Record Allocations

    Note over Admin,System: Phase 7: Physical Fulfillment & Backorders
    System->>System: Generate Multi-Package Shipment Split
    Admin->>System: Dispatch Shipments / Track Backordered Units
    opt Mid-Fulfillment Stock Influx
        Admin->>System: Consolidate Backorders from Newly Arrived Inventory
    end

    Note over Finance: Phase 8: Hybrid Invoicing, Payments & Subscriptions
    System->>Finance: Decompose Order into One-Time & Recurring Streams
    Finance->>System: Post Invoices & Record Inbound Payments (DRAFT -> POSTED -> PAID)
    System->>System: Activate Subscriptions & Schedule Billing Periods
```

### Workflow Phase Details

1. **Catalog & Infrastructure Initialization**:
   - Operations administrators establish product categories, base prices, standard cost prices, customer discount tiers (`BRONZE`, `SILVER`, `GOLD`), and approval ladders.
   - Physical warehouses are created with specific shipping weights and stock inventory lines.
2. **Quotation Drafting & Live Pricing**:
   - Sales Reps create quotes via `POST /api/quotations`. Lines are added with quantities and proposed discounts.
   - The pricing engine dynamically recalculates subtotal, taxes, line totals, and blended gross margins on every keystroke.
   - The **Upsell Engine** computes co-purchase pairings and surfaces high-margin product recommendations with real-time revenue and margin delta forecasts.
3. **Automated Governance & Multi-Step Approvals**:
   - The rep submits the quotation (`POST /api/quotations/:id/submit`).
   - The system evaluates lines using pure functions (`resolveCeiling`, `scoreQuotation`, `riskEngine`).
   - If compliant, approval is auto-granted (`status = APPROVED`). If non-compliant, approval cycle $N$ is created, and the deal is routed to Sales Managers or Finance according to severity and role rungs.
4. **Customer Presentation & Portal Negotiation**:
   - The approved quote is dispatched via a cryptographically isolated magic link (`POST /api/portal/magic-link`).
   - Customers review line items and can counter-propose discounts or quantity alterations.
   - Reps accept or reject counter-offers. Modifying terms automatically initiates approval cycle $N+1$, ensuring customer revisions never bypass governance.
5. **Order Conversion**:
   - Upon customer acceptance (`POST /api/portal/accept`), the quotation transitions to `CONFIRMED`.
   - An atomic database transaction constructs the corresponding `Order` and clones `QuotationLine` records into immutable `OrderLine` records.
6. **Warehouse Fulfillment Split**:
   - Operations queries the optimized fulfillment plan (`GET /api/fulfillment/orders/:id/plan`).
   - The multi-warehouse allocation engine computes the optimal distribution across physical locations, minimizing split shipments while respecting stock levels and freight weights.
   - Allocations are committed (`POST /api/fulfillment/orders/:id/allocate`), placing atomic reservations on warehouse inventory.
7. **Shipment Dispatch & Backorder Consolidation**:
   - Package labels and warehouse splits are generated.
   - Unfulfilled quantities are assigned to `BACKORDERED` allocations.
   - When new inventory arrives, the system dynamically suggests backorder consolidation (`POST /api/fulfillment/orders/:id/consolidate-backorder`), collapsing split orders into fewer packages.
8. **Hybrid Billing & Revenue Recognition**:
   - Orders are bifurcated into one-time hardware lines and recurring service plans.
   - One-time items generate GST-compliant commercial invoices displaying warehouse provenance.
   - Recurring items spawn `Subscription` records with recurring `BillingSchedule` rows.
   - Finance records incoming payments against invoices, advancing statuses through `POSTED`, `PARTIALLY_PAID`, and `PAID`.

---

## 3. Deep Dive: Warehouse Architecture & Inventory Management

DealFlow360 manages distributed multi-warehouse supply chains where products may be stocked across geographically dispersed facilities with variable logistics costs.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              WAREHOUSES                                │
├───────────────┬────────────────────────┬───────────────────────────────┤
│ WH-BLR        │ WH-BOM                 │ WH-DEL                        │
│ Bengaluru Hub │ Mumbai Port Hub        │ Delhi NCR Hub                 │
│ Weight: 1.0   │ Weight: 1.2            │ Weight: 1.5                   │
└───────┬───────┴───────────┬────────────┴───────────────┬───────────────┘
        │                   │                            │
        ▼                   ▼                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        INVENTORY SNAPSHOT PER SKU                      │
│                                                                        │
│ Total Physical Available: 150 units                                    │
│ Active Reserved Stock:     40 units                                    │
│ Net Sellable Inventory:   110 units = MAX(0, Available - Reserved)     │
└────────────────────────────────────────────────────────────────────────┘
```

### Relational Schema Design

```prisma
model Warehouse {
  id             String                  @id @default(cuid())
  code           String                  @unique // e.g. WH-BLR, WH-BOM
  name           String
  address        String?
  shippingWeight Decimal                 @default(1) @map("shipping_weight") @db.Decimal(6, 2)
  priority       Int                     @default(0)
  isActive       Boolean                 @default(true) @map("is_active")
  inventory      Inventory[]
  allocations    FulfillmentAllocation[]

  @@map("warehouses")
}

model Inventory {
  id           String    @id @default(cuid())
  warehouseId  String    @map("warehouse_id")
  productId    String    @map("product_id")
  warehouse    Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  product      Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  availableQty Int       @default(0) @map("available_qty")
  reservedQty  Int       @default(0) @map("reserved_qty")
  reorderLevel Int       @default(0) @map("reorder_level")

  @@unique([warehouseId, productId])
  @@index([productId])
  @@map("inventory")
}
```

### Physical vs. Sellable Inventory

To guarantee that inventory is never double-allocated to concurrent orders, DealFlow360 strictly distinguishes between physical and sellable inventory:

$$\text{Physical Available} = \texttt{availableQty}$$
$$\text{Reserved Units} = \texttt{reservedQty}$$
$$\text{Net Sellable Quantity} = \max\bigl(0,\, \texttt{availableQty} - \texttt{reservedQty}\bigr)$$

### Concurrency & Atomic Stock Reservation

When an allocation is confirmed, inventory reservations are executed inside a PostgreSQL serializable transaction using conditional count validation:

```javascript
// Atomically reserve inventory ensuring available balance exceeds reservation
const updated = await tx.inventory.updateMany({
  where: {
    warehouseId: allocation.warehouseId,
    productId: linePlan.productId,
    availableQty: {
      gte: allocation.quantity // Concurrency Guard: Prevents negative sellable stock
    }
  },
  data: {
    reservedQty: {
      increment: allocation.quantity
    }
  }
});

if (updated.count !== 1) {
  throw new Error(`Insufficient inventory in warehouse ${allocation.warehouseId}`);
}
```

If two sales orders attempt to reserve the same last 10 units simultaneously, the database row-level locking guarantees that exactly one transaction succeeds while the second fails the `availableQty >= 10` condition and rolls back cleanly.

---

## 4. Deep Dive: Fulfillment Engine & Split Allocation Algorithm

When an order is confirmed, line items must be fulfilled from one or more warehouses. The fulfillment engine (`backend/rules/fulfillment/*`) minimizes operational friction, shipping costs, and customer parcel fragmentation.

```
Order Line Requirement: 50 Units of SKU-A
Warehouses:
  WH-BLR: Sellable = 30, Shipping Weight = 1.0
  WH-BOM: Sellable = 60, Shipping Weight = 1.5
  WH-DEL: Sellable = 20, Shipping Weight = 0.8

Evaluation:
  1. Single-Box Check: Can any warehouse fulfill 50 units alone?
     -> WH-BOM has 60 units (>= 50). It can fulfill the line alone!
  2. WH-BOM is chosen despite higher shipping weight to avoid multi-box splits.
  3. Result: 1 Shipment (50 units from WH-BOM). Zero backorder.
```

### Algorithm Phase 1: Warehouse Normalization & Heuristic Sorting

Implemented in `backend/rules/fulfillment/selectWarehouses.js`:

```javascript
export function selectWarehouses(warehouses, requiredQuantity) {
  const normalizedWarehouses = warehouses
    .filter(w => w && w.isActive !== false)
    .map(w => ({
      ...w,
      sellableQty: Math.max(0, Number(w.availableQty || 0) - Number(w.reservedQty || 0)),
      shippingWeight: Number(w.shippingWeight || 1.0)
    }))
    .filter(w => w.sellableQty > 0);

  normalizedWarehouses.sort((a, b) => {
    // 1. Single-Warehouse Satisfaction Priority
    const aCanFulfill = a.sellableQty >= requiredQuantity;
    const bCanFulfill = b.sellableQty >= requiredQuantity;
    if (aCanFulfill !== bCanFulfill) return aCanFulfill ? -1 : 1;

    // 2. Strongest Stock Position (Minimizes Fragment Count)
    if (a.sellableQty !== b.sellableQty) return b.sellableQty - a.sellableQty;

    // 3. Lowest Shipping Weight (Freight Cost Optimization)
    if (a.shippingWeight !== b.shippingWeight) return a.shippingWeight - b.shippingWeight;

    // 4. Deterministic Tie-Breaker
    return String(a.code || a.id).localeCompare(String(b.code || b.id));
  });

  return normalizedWarehouses;
}
```

### Algorithm Phase 2: Greedy Allocation & Backorder Segregation

Implemented in `backend/rules/fulfillment/allocateStock.js`:

```javascript
export function allocateStock(selectedWarehouses, requiredQuantity) {
  const allocations = [];
  let remainingQuantity = requiredQuantity;

  for (const warehouse of selectedWarehouses) {
    if (remainingQuantity <= 0) break;
    const sellable = Math.max(0, warehouse.availableQty - warehouse.reservedQty);
    if (sellable <= 0) continue;

    const allocatedQuantity = Math.min(sellable, remainingQuantity);
    allocations.push({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      quantity: allocatedQuantity,
      shippingWeight: warehouse.shippingWeight
    });

    remainingQuantity -= allocatedQuantity;
  }

  const backorderQuantity = Math.max(0, remainingQuantity);

  return {
    allocations,
    requiredQuantity,
    fulfilledQuantity: requiredQuantity - backorderQuantity,
    backorderQuantity,
    isFullyAllocated: backorderQuantity === 0
  };
}
```

### Algorithm Phase 3: Order Status State Machine

The fulfillment engine computes the holistic order status based on line-item allocations (`calculateOrderStatus.js`):

```
                     ┌────────────────────────┐
                     │  PENDING_FULFILLMENT   │
                     └───────────┬────────────┘
                                 │ Allocate Stock
                                 ▼
                     ┌────────────────────────┐
                     │ Has Unallocated Units? │
                     └─────┬────────────┬─────┘
                     Yes   │            │ No
        ┌──────────────────┘            └──────────────────┐
        ▼                                                  ▼
┌───────────────┐                                  ┌───────────────┐
│  BACKORDERED  │                                  │   ALLOCATED   │
└───────┬───────┘                                  └───────┬───────┘
        │ Partial Shipment Dispatched                      │ Partial Shipment Dispatched
        └──────────────────┬───────────────────────────────┘
                           ▼
                 ┌───────────────────┐
                 │ PARTIALLY_SHIPPED │
                 └─────────┬─────────┘
                           │ All Allocations Dispatched
                           ▼
                 ┌───────────────────┐
                 │      SHIPPED      │
                 └─────────┬─────────┘
                           │ Invoiced & Reconciled
                           ▼
                 ┌───────────────────┐
                 │     COMPLETED     │
                 └───────────────────┘
```

| Order Status | Condition |
|---|---|
| `PENDING_FULFILLMENT` | Order confirmed; no stock allocated yet. |
| `ALLOCATED` | Total order quantity fully reserved across warehouses; awaiting dispatch. |
| `BACKORDERED` | At least one item has insufficient network inventory (`backorderQty > 0`). Units that can be fulfilled are reserved; the remainder is flagged. |
| `PARTIALLY_SHIPPED` | At least one warehouse shipment has been dispatched, while other lines or backorders remain open. |
| `SHIPPED` | All required units have been dispatched across all assigned warehouses. |
| `COMPLETED` | All shipments delivered and all linked invoices settled. |

### Manual Operations Override & Validation

Operations managers can override the automated allocation via `POST /api/fulfillment/orders/:id/override`:
- **Line Quantity Conservation**: For every order line, $\sum (\text{Allocated Units} + \text{Backordered Units}) \equiv \text{Line Quantity}$.
- **Stock Ceiling Verification**: Validates that no warehouse is assigned more units than its real-time sellable inventory (accounting for previously released reservations for that specific order).
- **Audit Flagging**: Overridden allocations are stored with `isManualOverride: true` and logged to the system audit trail.

### Dynamic Mid-Fulfillment Backorder Consolidation

When fresh inventory is received at any warehouse, the consolidation engine evaluates open orders:
1. `GET /api/fulfillment/orders/:id/consolidation-status`: Scans all `fulfillmentAllocation` records with `backorderQty > 0`. It checks if new stock in any active warehouse can now satisfy the backorder.
2. `POST /api/fulfillment/orders/:id/consolidate-backorder`: Atomically reserves the newly available inventory, converts backorder rows into active warehouse allocations, decrements or removes the backorder allocation, and recalculates the order status from `BACKORDERED` to `ALLOCATED` or `PARTIALLY_SHIPPED`.

---

## 5. Deep Dive: Post-Fulfillment, Order Lifecycle & Hybrid Billing

Once physical fulfillment allocations are locked, DealFlow360 automatically executes financial decomposition.

```
                              ┌──────────────────┐
                              │ Confirmed Order  │
                              └────────┬─────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
     ┌──────────────────────┐                      ┌──────────────────────┐
     │   ONE_TIME Lines     │                      │   RECURRING Lines    │
     │   Hardware, Units    │                      │   Software, Services │
     └──────────┬───────────┘                      └──────────┬───────────┘
                │                                             │
                ▼                                             ▼
     ┌──────────────────────┐                      ┌──────────────────────┐
     │ Commercial Invoice   │                      │ Active Subscriptions │
     │ Status: DRAFT/POSTED │                      │ 12-Month Schedules   │
     │ Line Provenance Tags │                      └──────────┬───────────┘
     └──────────┬───────────┘                                 │
                │                                             ▼
                │ Inbound Bank Wire / Card         ┌──────────────────────┐
                ▼                                  │ Periodic Invoices    │
     ┌──────────────────────┐                      │ Auto-Generated       │
     │   Payment Ledger     │                      └──────────────────────┘
     │ PAID / PARTIAL_PAID  │
     └──────────────────────┘
```

### Hybrid Order Decomposition

A single enterprise order frequently combines capital expenditures (hardware appliances) and operational expenditures (annual SaaS subscriptions). DealFlow360 bifurcates these into distinct accounting pipelines (`generateInvoicesForOrder`):

#### Stream 1: One-Time Product Commercial Invoice
- Aggregates all lines where `lineType === 'ONE_TIME'`.
- Calculates GST tax ($18\%$) and builds invoice lines containing **physical fulfillment provenance**:
  ```
  SKU-SERVER-01: Enterprise Rackmount Server (10 Units)
  — Fulfilled from: Bengaluru Hub (6 units), Mumbai Port Hub (4 units)
  ```
- Generates invoice `INV-ORD-XXXX-01` with status `DRAFT`.

#### Stream 2: Recurring Subscription Billing Schedules
- Aggregates lines where `lineType === 'RECURRING'`.
- Instantiates `Subscription` records linked to the customer and order.
- Generates future `BillingSchedule` milestone rows.

### Invoice State Lifecycle & Financial Integrity

The invoice entity manages payment collection through four states:

```
[DRAFT] ──POST /post──▶ [POSTED] ──Payment < Balance──▶ [PARTIALLY_PAID]
                           │                                   │
                           │ Payment == Balance                │ Payment == Remaining
                           ▼                                   ▼
                        [PAID] ◀───────────────────────────────┘
```

1. `DRAFT`: Newly generated invoice. Quantities and taxes are reviewable.
2. `POSTED`: Formally posted to the accounts receivable ledger. Payment recording is enabled.
3. `PARTIALLY_PAID`: Inbound payment has been received, but $\text{amountPaid} < \text{totalAmount}$. The balance due is tracked.
4. `PAID`: Cumulative payments equal or exceed the total invoice amount.

### Payment Recording & Precision Guardrails

Implemented in `backend/controllers/invoicing.controller.js`:
- **Overpayment Guard**: Payments exceeding the current remaining balance are rejected:
  $$\text{paymentAmount} > (\text{totalAmount} - \text{amountPaid}) + 0.01 \implies \text{HTTP 400 Bad Request}$$
- **Float Rounding Precision**: All money arithmetic is rounded to two decimal places:
  $$\text{newPaid} = \frac{\operatorname{round}\bigl((\text{currentPaid} + \text{paymentAmount}) \times 100\bigr)}{100}$$
- **Atomic State Progression**: If $\text{newPaid} \ge \text{totalAmount} - 0.01$, the invoice automatically transitions to `PAID`. Otherwise, it transitions to `PARTIALLY_PAID`.
- **Payment Provenance**: Each payment record logs the payment method (`BANK_TRANSFER`, `CARD`, `CHEQUE`), transaction reference, receiving bank timestamp, and authenticated staff member.

---

## 6. Deep Dive: Subscriptions, Proration & Financial Reconciliation

For recurring contracts, DealFlow360 implements day-accurate proration, recurring billing generation, and cancellation refund accounting.

### Day-Accurate Proration Engine

When a customer upgrades, downgrades, or modifies a subscription mid-cycle, `backend/rules/subscriptions/calculateProration.js` determines the exact billable factor:

$$\text{Total Days} = \frac{\text{PeriodEnd} - \text{PeriodStart}}{86{,}400{,}000}$$
$$\text{Remaining Days} = \frac{\text{PeriodEnd} - \text{EffectiveDate}}{86{,}400{,}000}$$
$$\text{Proration Factor} = \frac{\text{Remaining Days}}{\text{Total Days}}$$
$$\text{Prorated Charge} = \operatorname{round}\bigl(\text{UnitPrice} \times \text{Quantity} \times \text{Proration Factor},\, 2\bigr)$$

- Boundary Guards: If $\text{EffectiveDate} \le \text{PeriodStart}$, factor is $1.0$. If $\text{EffectiveDate} \ge \text{PeriodEnd}$, factor is $0.0$.
- Input Validation: Negative day spans or non-finite numbers throw descriptive errors immediately.

### Contract Cancellation & Credit Notes

When an active subscription is terminated prior to its contracted end date (`cancelSubscription`):
1. Future `BillingSchedule` rows with `billingDate > cancelledAt` and `status === 'SCHEDULED'` are updated to `CANCELLED`.
2. The subscription status transitions to `CANCELLED`.
3. If the plan includes a `cancellationRefundPercent`, the engine computes the refund amount:
   $$\text{Refund Amount} = \operatorname{round}\left(\text{Paid Amount} \times \frac{\text{cancellationRefundPercent}}{100},\, 2\right)$$
4. A `CreditNote` row is issued against the original invoice and logged to the audit ledger.

---

## 7. Deep Dive: Deal Governance, Risk Engine & Multi-Cycle Approvals

DealFlow360 eliminates manual routing bottlenecks through automated discount ceiling evaluation, risk scoring, and policy ladders.

### Ceiling Resolution Engine

Implemented in `backend/rules/resolveCeiling.js`:
- Strictest Rule Precedence:
  1. `DiscountRule` matching both `(customerTierId, categoryId)`
  2. `DiscountRule` matching `(null, categoryId)` (category-wide)
  3. `DiscountRule` matching `(customerTierId, null)` (tier-wide)
  4. `CustomerTier.maxDiscountPercent`
  5. `GovernanceSetting.unconfiguredCeilingPolicy` (`DENY` $\implies 0\%$, `TIER_ONLY`, `PERMISSIVE` $\implies 100\%$)
- Ceiling Determination:
  $$\text{Effective Ceiling} = \min(\text{All Matching Rules})$$
- Anti-Bypass Heuristic: Reps sometimes bypass discount controls by lowering the unit price directly. The engine calculates both forms and selects the greater:
  $$\text{Calculated Price Discount} = \frac{\text{Reference Price} - \text{Unit Price}}{\text{Reference Price}} \times 100$$
  $$\text{Effective Discount} = \max(\text{Entered Discount},\, \text{Calculated Price Discount})$$

### Scoring Engine

Implemented in `backend/rules/scoreQuotation.js`:
- Per-Line Overage:
  $$\text{Overage}_i = \max(0,\, \text{Effective Discount}_i - \text{Effective Ceiling}_i)$$
- Worst-Line Overage:
  $$\text{Worst Line Overage} = \max_i(\text{Overage}_i)$$
- Blended Deal Score (Default: `VALUE_WEIGHTED`):
  $$\text{Blended Score} = \frac{\sum_i (\text{Overage}_i \times \text{Line Total}_i)}{\sum_i \text{Line Total}_i}$$

### Explainable Risk Scoring Engine

Implemented in `backend/rules/riskEngine.js`, producing a 0–100 score:

| Risk Factor | Weight | Evaluation Logic |
|---|---|---|
| **Discount Excess** | Up to 40 pts | Scales with aggregate overage points above authorized ceiling. |
| **Margin Breach** | Up to 40 pts | 20 base points + 2 pts per % below margin floor. Missing cost = 30 pts. |
| **Deal Value Exposure**| Up to 15 pts | $\ge ₹10\text{L} \implies 15\text{ pts}; \ge ₹5\text{L} \implies 10\text{ pts}; \ge ₹1\text{L} \implies 5\text{ pts}$. |
| **Multiple Violations**| Up to 10 pts | 3+ non-compliant lines = 10 pts; 2 lines = 6 pts; 1 line = 3 pts. |
| **Customer Tier Risk** | Up to 15 pts | Bronze Tier = 12 pts; Silver Tier = 6 pts; Gold Tier = 2 pts. |

**Risk Bands**: $\ge 71 \implies \text{CRITICAL}$; $\ge 41 \text{ or margin breach} \implies \text{HIGH}$; $\ge 21 \text{ or any overage} \implies \text{MEDIUM}$; else $\text{LOW}$.

### Multi-Cycle Approval Ladder

```
Quotation Submitted (Cycle 1)
  │
  ├─ Non-Compliant ──▶ Pending Approval ──▶ Manager Approves
  │                                               │
  ▼                                               ▼
Customer Counters on Portal ◀───────────── Dispatched to Customer
  │
  ▼
Rep Accepts Counter-Offer
  │
  ▼
Automatic Re-Entry:
Cycle 2 Created (Findings JSON Preserved, Prior Cycle Remains Intact)
```

Approval steps are dynamically populated from `ApprovalPolicyStep`. A step triggers if:
$$\text{blendedScore} \ge \text{minBlendedScore} \quad\lor\quad \text{worstLineOverage} \ge \text{minWorstLineOverage} \quad\lor\quad \text{riskBand} \in \{\text{HIGH}, \text{CRITICAL}\}$$

Cycles are immutable rows in `QuotationApproval`. When terms change during customer negotiation, Cycle $N+1$ is initiated, preserving prior approval history for compliance review.

---

## 8. Deep Dive: Customer Portal & Asymmetric Negotiation Protocol

Customer interactions occur within a dedicated portal (`frontend/app/portal/*`), separated from staff tooling.

### Cryptographic Realm Isolation

```
Internal Staff Token:  Sign(payload, JWT_SECRET)        ──▶ Authenticates /api/*
Customer Portal Token: Sign(payload, PORTAL_JWT_SECRET) ──▶ Authenticates /api/portal/*
```

A staff JWT presented to a portal route fails cryptographic signature verification immediately, preventing privilege escalation.

### Negotiation Protocol & Asymmetric Permissions

1. Customers access quotes via magic token (`GET /api/portal/quote/:token`).
2. Customers can propose structured modifications:
   - Line discount percentage counters
   - Line quantity modifications
   - Text clarification requests
3. Reps receive counter-offers in their workspace. Accepting a counter-offer updates `QuotationLine` values, triggers a price recalculation, and re-routes the quote through governance as Cycle $N+1$.

---

## 9. Observability: Deal Health Signals & Append-Only Audit Ledger

### Real-Time Deal Health Signals

DealFlow360 continuously monitors the active pipeline for five risk signals (`controllers/quotation.controller.js`):

```
┌────────────────────────────────────────────────────────────────────────┐
│                          DEAL HEALTH SIGNALS                           │
├──────────────────────┬─────────────────────────────────────────────────┤
│ STALLED_DEAL         │ Inactive for > stalledAfterDays (Default 7)     │
├──────────────────────┼─────────────────────────────────────────────────┤
│ MARGIN_FLOOR_BREACH  │ Blended gross margin falls below 15%            │
├──────────────────────┼─────────────────────────────────────────────────┤
│ DISCOUNT_ANOMALY     │ Discount exceeds rep's settled baseline by >= N │
├──────────────────────┼─────────────────────────────────────────────────┤
│ APPROVAL_OVERDUE     │ Quote remains PENDING_APPROVAL for > 48 hours   │
├──────────────────────┼─────────────────────────────────────────────────┤
│ DELIVERY_SLIPPAGE    │ Promised delivery within 3 days while unconfirmed│
└──────────────────────┴─────────────────────────────────────────────────┘
```

#### The Discount Anomaly Baseline Engine
Rather than comparing against static ceilings (which approval routing already enforces), anomaly detection calculates the rep's personal baseline from their historical **settled** deals (`CONFIRMED`, `REJECTED`, `CANCELLED`):

$$\text{Effective Discount} = \frac{\text{discountTotal}}{\text{subtotal}} \times 100$$
$$\text{Rep Baseline} = \operatorname{mean}\bigl(\text{Effective Discount of Rep's Settled Quotes}\bigr)$$
$$\text{Anomaly Flagged} \iff (\text{Effective Discount} - \text{Rep Baseline}) \ge \text{anomalyDeviationPoints}$$

- Excludes in-flight drafts to prevent reps from manipulating their own baseline.
- Fallback Ladder: If a rep has $<3$ settled deals, the team-wide baseline is used. If the team has $<3$ deals, no anomaly signal is raised to avoid false positives.

### Append-Only Audit Ledger

All state transitions, manager overrides, approvals, nudges, and financial transactions write immutable records to the `AuditLog` table via `lib/audit.js`. The module exposes `recordAuditLog()` with zero update or delete endpoints.

---

## 10. Frontend Architecture & Client-Side B-Tree Indexing

### Architecture & Directory Layout

```
frontend/
├── app/
│   ├── quotations/         Pipeline Kanban, quote builder, line-level drawer
│   ├── approvals/          Manager approval queue, stalled deals, health dashboard
│   ├── orders/             Order list, fulfillment allocation viewer, warehouse split cards
│   ├── invoicing/          Invoice detail, payment recording modal, revenue rollups
│   ├── reports/            Filtered reports, chart analytics, CSV/XLS/PDF export
│   ├── admin/              13 configuration screens (warehouses, tiers, ladders, plans)
│   └── portal/             Cryptographically isolated customer negotiation portal
├── components/ui/          Odoo-styled design system (Cards, Tables, Badges, ControlPanel)
├── context/                AuthContext, SidebarContext
└── lib/                    apiClient, btree.js, exportReport.js
```

### Client-Side B-Tree Search Index

To provide instant prefix searches across thousands of quotations and orders without round-trip database latency, `frontend/lib/btree.js` maintains an in-memory B-Tree index:

```
                  ┌──────────────────────────────┐
                  │      [ "2026", "CUST" ]      │
                  │         Node Degree t=3      │
                  └──────┬────────────────┬──────┘
                         │                │
           ┌─────────────┴──────┐  ┌──────┴─────────────┐
           ▼                    ▼  ▼                    ▼
┌──────────────────────┐              ┌──────────────────────┐
│ [ "001", "002" ]     │              │ [ "DEAL", "ORD" ]    │
└──────────────────────┘              └──────────────────────┘
```

- **Order & Parameters**: Minimum degree $t=3$ (each node contains between $2$ and $5$ keys).
- **Tokenization**: Input strings are tokenized across whitespace, hyphens, slashes, and punctuation (`[\s,._\-/]+`). A search for `0010` finds `QT-2026-0010` in $O(\log N)$ time.
- **Memoized Lifecycle**: The B-Tree is constructed within a React `useMemo` hook, rebuilding only when the underlying dataset changes.

---

## 11. Complete API Specification & Data Contracts

All endpoints return a uniform response envelope:
```json
{
  "statusCode": 200,
  "data": {},
  "message": "Operation completed successfully",
  "success": true
}
```

### Primary Endpoints by Domain

| Domain | Method | Endpoint | Access / Role | Description |
|---|---|---|---|---|
| **Auth** | `POST` | `/api/auth/login` | Public | Staff login; issues internal JWT & refresh cookie |
| | `POST` | `/api/auth/refresh` | Public | Rotates expired access tokens |
| **Catalog** | `GET` | `/api/products` | Rep, Manager, Admin | Retrieves product catalog with tiered pricing |
| | `POST` | `/api/warehouses` | Admin | Registers a physical warehouse & shipping weight |
| | `POST` | `/api/warehouses/:id/inventory` | Admin | Updates warehouse stock levels |
| **Quotations** | `POST` | `/api/quotations` | Sales Rep | Drafts a new quotation |
| | `POST` | `/api/quotations/:id/lines` | Sales Rep | Adds product line; recalculates margins & ceilings |
| | `GET` | `/api/quotations/:id/suggestions` | Sales Rep | Generates upsell pairings with margin delta |
| | `POST` | `/api/quotations/:id/submit` | Sales Rep | Submits quote; triggers automatic routing |
| | `GET` | `/api/quotations/deal-health` | Manager, Admin | Retrieves active health signals & anomaly chips |
| | `POST` | `/api/quotations/:id/nudge` | Manager | Dispatches a rep nudge with a 12-hour cooldown |
| **Approvals** | `GET` | `/api/approvals/queue` | Manager, Finance | Fetches pending approval cycles & findings JSON |
| | `POST` | `/api/approvals/steps/:id/approve`| Manager, Finance | Approves ladder rung with audit explanation |
| | `POST` | `/api/approvals/steps/:id/reject` | Manager, Finance | Rejects quotation approval step |
| | `POST` | `/api/approvals/steps/:id/return` | Manager | Returns quote to rep for margin revision |
| **Portal** | `GET` | `/api/portal/quote/:token` | Customer | Loads customer-facing view via magic token |
| | `POST` | `/api/portal/negotiate` | Customer | Submits line-item discount or quantity counter |
| | `POST` | `/api/portal/accept` | Customer | Confirms quotation into an active order |
| **Fulfillment** | `GET` | `/api/fulfillment/orders/:id/plan` | Ops, Admin | Computes optimal multi-warehouse split plan |
| | `POST` | `/api/fulfillment/orders/:id/allocate` | Ops, Admin | Commits split plan; places atomic inventory holds |
| | `POST` | `/api/fulfillment/orders/:id/override` | Ops, Admin | Applies custom warehouse allocation override |
| | `GET` | `/api/fulfillment/orders/:id/consolidation-status` | Ops, Admin | Checks for new stock to satisfy backorders |
| | `POST` | `/api/fulfillment/orders/:id/consolidate-backorder` | Ops, Admin | Merges backorders into active allocations |
| **Invoicing** | `GET` | `/api/invoices` | Finance, Admin | Lists invoices with financial summary totals |
| | `POST` | `/api/invoices/:id/post` | Finance | Advances status from `DRAFT` to `POSTED` |
| | `POST` | `/api/invoices/:id/payments` | Finance | Records payment (`PARTIALLY_PAID` / `PAID`) |
| **Subscriptions**| `GET` | `/api/subscriptions` | Finance, Admin | Lists active recurring subscription contracts |
| | `POST` | `/api/subscriptions/:id/cancel` | Finance, Admin | Terminates subscription; calculates credit refund |
| **Reports** | `GET` | `/api/reports/sales` | Manager, Admin | Computes filtered sales KPIs & line rollups |

---

## 12. Environment Setup & Verification Suite

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 14+

### Environment Configuration

Configure `backend/.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/dealflow360?schema=public"
PORT=4000
JWT_SECRET="generate-with-crypto-random-bytes-32"
REFRESH_TOKEN_SECRET="generate-with-crypto-random-bytes-32"
PORTAL_JWT_SECRET="generate-different-key-for-portal-isolation"
```

Configure `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
```

### Installation & Database Initialization

```bash
# 1. Backend Setup
cd backend
npm install
npx prisma migrate dev --name init
npm run db:seed               # Seeds catalogs, warehouses, customers & rules
npm run dev                   # Starts API on http://localhost:4000

# 2. Frontend Setup
cd ../frontend
npm install
npm run dev                   # Starts Next.js on http://localhost:3000
```

### Testing & Verification Commands

```bash
# Execute pure rule test fixtures (No database required, runs in milliseconds)
npm run test:rules

# Execute integration test suites
npm run test:portal           # Validates dual-JWT cryptographic boundaries
npm run test:negotiation      # Validates counter-offer -> Cycle N+1 re-entry
npm run test:invoicing        # Validates partial payments & overpayment guards

# End-to-End Walkthrough Verification (Requires running API server)
npm run verify                # Executes all 8 PRD stages over real HTTP calls
```

---

**DealFlow360** — Designed and Engineered by **SyntaxSquad**.
