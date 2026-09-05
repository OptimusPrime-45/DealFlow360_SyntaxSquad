// ============================================================================
//  DealFlow360 — Express application
//
//  This file is the UNION of all four tracks' route surfaces. It was rebuilt
//  during the four-way merge, which had left three defects:
//    1. the 404 catch-all was mounted BEFORE /api/governance, /api/approvals
//       and /api/audit-logs, so all three silently returned 404;
//    2. /api/auth was mounted three times;
//    3. two different error handlers were imported, one of them unused.
//
//  MOUNT ORDER MATTERS. Express matches in registration order, so the
//  catch-all 404 and the error handler must stay LAST in this file.
// ============================================================================

import express from "express";
import cors from "cors";

// ── Track 1 · identity, catalog, quotations ─────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import tierRoutes from "./routes/tier.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import quotationRoutes from "./routes/quotation.routes.js";
import warehouseRoutes from "./routes/warehouse.routes.js";
import subscriptionPlanRoutes from "./routes/subscriptionPlan.routes.js";
import subscriptionProductRoutes from "./routes/subscriptionProduct.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import upsellRuleRoutes from "./routes/upsellRule.routes.js";
import priceListRoutes from "./routes/priceList.routes.js";

// ── Track 2 · governance, approvals, audit ──────────────────────────────────
import governanceRoutes from "./routes/governance.routes.js";
import approvalRoutes from "./routes/approval.routes.js";
import auditRoutes from "./routes/audit.routes.js";

// ── Track 3 · orders, fulfillment, subscription billing ─────────────────────
import ordersRoutes from "./routes/orders.routes.js";
import fulfillmentRoutes from "./routes/fulfillment.routes.js";
import subscriptionsRoutes from "./routes/subscriptions.routes.js";

// ── Track 4 · customer portal, negotiation, invoicing ───────────────────────
import portalRoutes from "./routes/portal.routes.js";
import portalNegotiationRoutes from "./routes/negotiation.routes.js";
import internalNegotiationRoutes from "./routes/internal-negotiation.routes.js";
import invoicingRoutes from "./routes/invoicing.routes.js";
import { generatePortalLink } from "./controllers/portal.controller.js";

import { requireInternal } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { ApiResponse } from "./utils/api-response.js";

const app = express();

// ── Base middleware ─────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// express.json() only populates req.body when a JSON content-type is present,
// so a DELETE sent without one leaves req.body undefined. Several handlers read
// req.body.reason for the audit trail and were throwing 500 on delete. Normalise
// once here rather than guarding every handler.
app.use((req, res, next) => {
  if (req.body === undefined || req.body === null) req.body = {};
  next();
});

// ── Health check ────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json(
    new ApiResponse(
      200,
      { status: "healthy", timestamp: new Date() },
      "DealFlow360 backend is running"
    )
  );
});

// ============================================================================
//  INTERNAL API  (/api/*)  — signed with JWT_SECRET, claim typ: 'internal'
// ============================================================================

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customer-tiers", tierRoutes);

// catalogRoutes defines /categories and /products, so it mounts at /api.
app.use("/api", catalogRoutes);

// A rep mints a magic link for a quotation. This MUST be registered before
// quotationRoutes, which applies a blanket `authenticate` to everything under
// /api/quotations and would otherwise 401 this path.
//
// Minting a customer portal link is an internal rep action, so it requires an
// internal token. It was unauthenticated before Phase 3 — anyone who could
// guess a quotation id could mint a working customer link for it.
app.post("/api/quotations/:id/portal-link", requireInternal, generatePortalLink);

app.use("/api/quotations", quotationRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/subscription-plans", subscriptionPlanRoutes);
app.use("/api/subscription-products", subscriptionProductRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/upsell-rules", upsellRuleRoutes);
app.use("/api/price-lists", priceListRoutes);
app.use("/api/governance", governanceRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/audit-logs", auditRoutes);

app.use("/api/orders", ordersRoutes);
app.use("/api/fulfillment", fulfillmentRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);

// Internal negotiation responses (rep replies to a customer's counter-offer).
app.use("/api/negotiations", internalNegotiationRoutes);

// Invoicing and payments.
app.use("/api/invoices", invoicingRoutes);

// ============================================================================
//  CUSTOMER PORTAL  (/api/portal/*)
//  Signed with PORTAL_JWT_SECRET, claim typ: 'portal'.
//  A portal token fails SIGNATURE verification on any /api/* route above, so
//  the boundary holds even if a middleware check is ever forgotten (PRD M6).
// ============================================================================

app.use("/api/portal", portalRoutes);
app.use("/api/portal", portalNegotiationRoutes);

// Probe route used by the M6 assertion in the test suite: a portal token must
// never reach this, an internal token always must.
app.get("/api/internal/test-protected", requireInternal, (req, res) => {
  res.json(
    new ApiResponse(
      200,
      { accessGranted: true, user: req.user },
      "Internal route access confirmed"
    )
  );
});

// ============================================================================
//  TERMINAL HANDLERS — these two must stay last, in this order.
// ============================================================================

// Unknown route.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}`, code: "NOT_FOUND" },
  });
});

// Centralised error handler.
app.use(errorHandler);

export default app;
