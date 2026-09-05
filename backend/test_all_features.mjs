// backend/test_all_features.mjs
// Comprehensive test suite for all DealFlow360 business rules and backend endpoints on mock data

import app from "./app.js";
import { confirmQuotation } from "./controllers/rules/orders/confirmQuotation.js";
import { selectWarehouses } from "./controllers/rules/fulfillment/selectWarehouses.js";
import { allocateStock } from "./controllers/rules/fulfillment/allocateStock.js";
import { validateAllocation } from "./controllers/rules/fulfillment/validateAllocation.js";
import { createShipmentPlan } from "./controllers/rules/fulfillment/createShipments.js";
import { calculateOrderStatus } from "./controllers/rules/fulfillment/calculateOrderStatus.js";
import { calculateBillingPeriod, calculateNextBillingPeriod } from "./controllers/rules/subscriptions/calculateBillingPeriod.js";
import { calculateProration, calculateProratedAmount } from "./controllers/rules/subscriptions/calculateProration.js";
import { generateBillingSchedule } from "./controllers/rules/subscriptions/generateBillingSchedule.js";
import { calculateCancellationRefund } from "./controllers/rules/subscriptions/calculateCancellationRefund.js";

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failedCount++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passedCount++;
  }
}

async function testSection(title, fn) {
  console.log(`\n======================================================`);
  console.log(`🧪 ${title}`);
  console.log(`======================================================`);
  try {
    await fn();
  } catch (err) {
    console.error(`Section error:`, err.message);
  }
}

async function runAllSuites() {
  // ---------------------------------------------------------------------------
  // 1. ORDERS MODULE: confirmQuotation
  // ---------------------------------------------------------------------------
  await testSection("Suite 1: Orders - Quotation Confirmation Rules & Validations", () => {
    const mockQuotation = {
      id: "quote_test_001",
      status: "APPROVED",
      customerId: "cust_acme_corp",
      grandTotal: 15400.0,
      lines: [
        {
          id: "qline_01",
          productId: "prod_server_rack",
          subscriptionPlanId: null,
          lineType: "ONE_TIME",
          quantity: 2,
          unitPrice: 5000.0,
          unitCost: 3500.0,
          discountPercent: 10.0,
          taxRate: 18.0,
          lineTotal: 10620.0
        },
        {
          id: "qline_02",
          productId: "prod_saas_cloud",
          subscriptionPlanId: "plan_enterprise_yearly",
          lineType: "RECURRING",
          quantity: 1,
          unitPrice: 4780.0,
          unitCost: 500.0,
          discountPercent: 0.0,
          taxRate: 0.0,
          lineTotal: 4780.0
        }
      ]
    };

    // Test positive confirmation
    const result = confirmQuotation(mockQuotation, "ORD-2026-9999");
    assert(result.order.orderNumber === "ORD-2026-9999", "Sets correct order number");
    assert(result.order.status === "PENDING_FULFILLMENT", "Initial order status is PENDING_FULFILLMENT");
    assert(result.order.totalAmount === 15400.0, "Total amount matches quotation grand total");
    assert(result.orderLines.length === 2, "Copies all quotation lines into orderLines");
    assert(result.orderLines[0].quotationLineId === "qline_01", "Preserves quotation line provenance");
    assert(result.orderLines[1].subscriptionPlanId === "plan_enterprise_yearly", "Retains subscription plan reference");
    assert(result.quotationUpdate.status === "CONFIRMED", "Updates quotation status to CONFIRMED");

    // Test support for SENT and UNDER_NEGOTIATION statuses
    const sentResult = confirmQuotation({ ...mockQuotation, status: "SENT" }, "ORD-SENT");
    assert(sentResult.quotationUpdate.status === "CONFIRMED", "Allows confirmation from SENT status");
    const negResult = confirmQuotation({ ...mockQuotation, status: "UNDER_NEGOTIATION" }, "ORD-NEG");
    assert(negResult.quotationUpdate.status === "CONFIRMED", "Allows confirmation from UNDER_NEGOTIATION status");

    // Edge case: Reject unconfirmable status (DRAFT, REJECTED, etc.)
    try {
      confirmQuotation({ ...mockQuotation, status: "DRAFT" }, "ORD-ERR");
      assert(false, "Should have thrown for DRAFT status");
    } catch (err) {
      assert(err.message.includes("cannot be confirmed from status DRAFT"), "Correctly rejects quotation with status DRAFT");
    }

    // Edge case: Reject empty lines
    try {
      confirmQuotation({ ...mockQuotation, lines: [] }, "ORD-ERR");
      assert(false, "Should have thrown for empty lines");
    } catch (err) {
      assert(err.message.includes("at least one line"), "Correctly rejects quotation without lines");
    }

    // Edge case: Reject missing customerId
    try {
      confirmQuotation({ ...mockQuotation, customerId: "" }, "ORD-ERR");
      assert(false, "Should have thrown for missing customerId");
    } catch (err) {
      assert(err.message.includes("customerId is required"), "Correctly rejects missing customerId");
    }

    // Edge case: Reject invalid line quantity
    try {
      const invalidLines = [{ ...mockQuotation.lines[0], quantity: 0 }];
      confirmQuotation({ ...mockQuotation, lines: invalidLines }, "ORD-ERR");
      assert(false, "Should have thrown for quantity 0");
    } catch (err) {
      assert(err.message.includes("Invalid quantity"), "Correctly rejects line with quantity <= 0");
    }
  });

  // ---------------------------------------------------------------------------
  // 2. FULFILLMENT MODULE: Warehouse Selection & Stock Allocation
  // ---------------------------------------------------------------------------
  await testSection("Suite 2: Fulfillment - Warehouse Selection & Stock Allocation", () => {
    const mockWarehouses = [
      {
        id: "wh_mumbai",
        name: "Mumbai Primary",
        availableQty: 100,
        reservedQty: 20, // Sellable = 80
        shippingWeight: 1.2,
        priority: 10,
        isActive: true
      },
      {
        id: "wh_bangalore",
        name: "Bangalore Hub",
        availableQty: 50,
        reservedQty: 10, // Sellable = 40
        shippingWeight: 1.0,
        priority: 5,
        isActive: true
      },
      {
        id: "wh_delhi",
        name: "Delhi Depot",
        availableQty: 10,
        reservedQty: 10, // Sellable = 0 (out of stock)
        shippingWeight: 1.5,
        priority: 8,
        isActive: true
      },
      {
        id: "wh_inactive",
        name: "Inactive Warehouse",
        availableQty: 200,
        reservedQty: 0,
        shippingWeight: 1.0,
        priority: 1,
        isActive: false
      }
    ];

    // Test 1: selectWarehouses single warehouse fulfillment
    const selectedWhFor50 = selectWarehouses(mockWarehouses, 50);
    assert(selectedWhFor50.length === 2, "Filters out inactive and 0-stock warehouses (Mumbai & Bangalore remain)");
    assert(selectedWhFor50[0].id === "wh_mumbai", "Prefers warehouse capable of full fulfillment (Mumbai sellable 80 >= 50)");

    // Test 2: Tie-breaking logic (lower shipping weight wins if sellable qty equal)
    const tieWarehouses = [
      { id: "wh_heavy", name: "Heavy WH", availableQty: 50, reservedQty: 0, shippingWeight: 2.5, priority: 10, isActive: true },
      { id: "wh_light", name: "Light WH", availableQty: 50, reservedQty: 0, shippingWeight: 1.0, priority: 5, isActive: true }
    ];
    const sortedTie = selectWarehouses(tieWarehouses, 30);
    assert(sortedTie[0].id === "wh_light", "Tie-breaker prefers warehouse with lower shipping weight when stock is equal");

    // Test 3: allocateStock full allocation
    const allocation1 = allocateStock(selectedWhFor50, 50);
    assert(allocation1.isFullyAllocated === true, "Order quantity 50 is fully allocated");
    assert(allocation1.fulfilledQuantity === 50, "Fulfilled quantity is exactly 50");
    assert(allocation1.backorderQuantity === 0, "Backorder quantity is 0");
    assert(allocation1.allocations[0].warehouseId === "wh_mumbai", "Allocates from Mumbai primary");
    assert(allocation1.allocations[0].quantity === 50, "Mumbai allocation quantity is 50");

    // Test 4: Multi-warehouse allocation with split
    const selectedWhFor100 = selectWarehouses(mockWarehouses, 100);
    const allocation2 = allocateStock(selectedWhFor100, 100);
    assert(allocation2.isFullyAllocated === true, "Order quantity 100 is fully allocated across warehouses");
    assert(allocation2.allocations.length === 2, "Splits allocation across 2 warehouses");
    assert(allocation2.allocations[0].warehouseId === "wh_mumbai" && allocation2.allocations[0].quantity === 80, "First warehouse fulfills up to max sellable (80)");
    assert(allocation2.allocations[1].warehouseId === "wh_bangalore" && allocation2.allocations[1].quantity === 20, "Second warehouse fulfills remaining (20)");

    // Test 5: Backorder scenario when total stock is insufficient
    const allocation3 = allocateStock(selectedWhFor100, 150); // Total sellable is 80 + 40 = 120
    assert(allocation3.isFullyAllocated === false, "Recognizes order cannot be fully fulfilled");
    assert(allocation3.fulfilledQuantity === 120, "Fulfilled quantity matches total available sellable stock (120)");
    assert(allocation3.backorderQuantity === 30, "Creates backorder for remaining 30 units");

    // Test 6: validateAllocation (positive)
    const validationResult = validateAllocation(selectedWhFor100, allocation2.allocations, 100);
    assert(validationResult.valid === true, "Validates valid multi-warehouse allocation");
    assert(validationResult.isFullyAllocated === true, "Validation confirms full allocation");

    // Test 7: validateAllocation (negative cases)
    try {
      validateAllocation(selectedWhFor100, [{ warehouseId: "wh_mumbai", quantity: 999 }], 999);
      assert(false, "Should have thrown for over-allocation exceeding sellable stock");
    } catch (err) {
      assert(err.message.includes("not have enough sellable stock"), "Throws error when allocation exceeds warehouse sellable stock");
    }

    try {
      validateAllocation(selectedWhFor100, [{ warehouseId: "wh_mumbai", quantity: 50 }], 40);
      assert(false, "Should have thrown when total allocated exceeds required quantity");
    } catch (err) {
      assert(err.message.includes("cannot exceed required quantity"), "Throws error when allocated total exceeds required quantity");
    }

    try {
      validateAllocation(selectedWhFor100, [
        { warehouseId: "wh_mumbai", quantity: 30 },
        { warehouseId: "wh_mumbai", quantity: 20 }
      ], 50);
      assert(false, "Should have thrown for duplicate warehouse entry");
    } catch (err) {
      assert(err.message.includes("appears more than once"), "Throws error on duplicate warehouse allocation");
    }

    // Test 8: createShipmentPlan
    const shipmentPlan = createShipmentPlan(allocation2.allocations);
    assert(shipmentPlan.shipmentCount === 2, "Creates 2 distinct shipment groups for 2 warehouses");
    assert(shipmentPlan.shipments[0].totalQuantity === 80, "Mumbai shipment has 80 units");
    assert(shipmentPlan.shipments[1].totalQuantity === 20, "Bangalore shipment has 20 units");

    // Test 9: calculateOrderStatus state transitions
    const statusEmpty = calculateOrderStatus([], 100);
    assert(statusEmpty === "PENDING_FULFILLMENT", "Status is PENDING_FULFILLMENT when allocations are empty");

    const statusReserved = calculateOrderStatus(
      [
        { allocatedQty: 80, fulfilledQty: 0, backorderQty: 0, status: "RESERVED" },
        { allocatedQty: 20, fulfilledQty: 0, backorderQty: 0, status: "RESERVED" }
      ],
      100
    );
    assert(statusReserved === "ALLOCATED", "Status is ALLOCATED when stock is reserved");

    const statusPartial = calculateOrderStatus(
      [
        { allocatedQty: 80, fulfilledQty: 80, backorderQty: 0, status: "SHIPPED" },
        { allocatedQty: 20, fulfilledQty: 0, backorderQty: 0, status: "RESERVED" }
      ],
      100
    );
    assert(statusPartial === "PARTIALLY_SHIPPED", "Status is PARTIALLY_SHIPPED when one warehouse shipped");

    const statusShipped = calculateOrderStatus(
      [
        { allocatedQty: 80, fulfilledQty: 80, backorderQty: 0, status: "SHIPPED" },
        { allocatedQty: 20, fulfilledQty: 20, backorderQty: 0, status: "SHIPPED" }
      ],
      100
    );
    assert(statusShipped === "SHIPPED", "Status is SHIPPED when all quantities are fulfilled and shipped");
  });

  // ---------------------------------------------------------------------------
  // 3. SUBSCRIPTIONS & BILLING MODULE
  // ---------------------------------------------------------------------------
  await testSection("Suite 3: Subscriptions & Recurring Billing Engine", () => {
    const startDate = new Date("2026-01-01T00:00:00.000Z");

    // Test 1: calculateBillingPeriod (Monthly, Quarterly, Yearly)
    const monthly = calculateBillingPeriod(startDate, "MONTHLY");
    assert(monthly.periodStart.toISOString() === "2026-01-01T00:00:00.000Z", "Monthly period start matches");
    assert(monthly.periodEnd.toISOString() === "2026-02-01T00:00:00.000Z", "Monthly period end is 1 month later");

    const quarterly = calculateBillingPeriod(startDate, "QUARTERLY");
    assert(quarterly.periodEnd.toISOString() === "2026-04-01T00:00:00.000Z", "Quarterly period end is 3 months later");

    const yearly = calculateBillingPeriod(startDate, "YEARLY");
    assert(yearly.periodEnd.toISOString() === "2027-01-01T00:00:00.000Z", "Yearly period end is 1 year later");

    const nextPeriod = calculateNextBillingPeriod(monthly.periodEnd, "MONTHLY");
    assert(nextPeriod.periodStart.toISOString() === "2026-02-01T00:00:00.000Z", "Next billing period chains correctly from previous end date");

    // Test rejection of invalid billing interval
    try {
      calculateBillingPeriod(startDate, "WEEKLY");
      assert(false, "Should have thrown for WEEKLY interval");
    } catch (err) {
      assert(err.message.includes("Invalid billing interval"), "Correctly rejects unsupported interval WEEKLY");
    }

    // Test 2: calculateProration & calculateProratedAmount
    const pStart = new Date("2026-01-01T00:00:00.000Z");
    const pEnd = new Date("2026-01-31T00:00:00.000Z"); // 30 days
    const effectiveMid = new Date("2026-01-16T00:00:00.000Z"); // 15 days remaining

    const prorationMid = calculateProration(pStart, pEnd, effectiveMid);
    assert(prorationMid.totalDays === 30, "Calculates 30 total period days");
    assert(prorationMid.billableDays === 15, "Calculates 15 remaining billable days");
    assert(prorationMid.prorationFactor === 0.5, "Calculates accurate 0.5000 proration factor");

    const proratedAmount = calculateProratedAmount(100.0, 2, prorationMid.prorationFactor);
    assert(proratedAmount === 100.0, "Prorates $100 x 2 units at 0.5 factor to $100.00");

    const prorationStart = calculateProration(pStart, pEnd, pStart);
    assert(prorationStart.prorationFactor === 1, "Full period factor (1.0) when change happens on or before start");

    const prorationEnd = calculateProration(pStart, pEnd, pEnd);
    assert(prorationEnd.prorationFactor === 0, "Zero factor (0.0) when cancelled on or after period end");

    // Negative proration: periodEnd <= periodStart
    try {
      calculateProration(pEnd, pStart, effectiveMid);
      assert(false, "Should have thrown for inverted period dates");
    } catch (err) {
      assert(err.message.includes("periodEnd must be after periodStart"), "Rejects inverted period dates");
    }

    // Test 3: generateBillingSchedule
    const schedules = generateBillingSchedule(startDate, "MONTHLY", 2, 50.0, 4);
    assert(schedules.length === 4, "Generates requested 4 billing schedules");
    assert(schedules[0].amount === 100.0, "Calculates scheduled amount ($50 x 2 = $100.00)");
    assert(schedules[0].status === "SCHEDULED", "Sets status to SCHEDULED");
    assert(schedules[0].billingDate.toISOString() === "2026-01-01T00:00:00.000Z", "Schedule 1 billing date is Jan 1");
    assert(schedules[1].billingDate.toISOString() === "2026-02-01T00:00:00.000Z", "Schedule 2 billing date is Feb 1");
    assert(schedules[2].billingDate.toISOString() === "2026-03-01T00:00:00.000Z", "Schedule 3 billing date is Mar 1");
    assert(schedules[3].billingDate.toISOString() === "2026-04-01T00:00:00.000Z", "Schedule 4 billing date is Apr 1");

    // Test 4: calculateCancellationRefund
    const refundWithPercent = calculateCancellationRefund(1000.0, 60.0);
    assert(refundWithPercent.paidAmount === 1000.0, "Records paid amount");
    assert(refundWithPercent.cancellationRefundPercent === 60.0, "Records 60% cancellation refund policy");
    assert(refundWithPercent.refundAmount === 600.0, "Calculates accurate refund of $600.00");
    assert(refundWithPercent.hasRefund === true, "hasRefund flag is true");

    const fullRefund = calculateCancellationRefund(500.0, 100.0);
    assert(fullRefund.refundAmount === 500.0, "Full 100% refund calculates correctly");

    const zeroRefund = calculateCancellationRefund(1000.0, 0);
    assert(zeroRefund.refundAmount === 0, "Zero refund amount when policy is 0%");
    assert(zeroRefund.hasRefund === false, "hasRefund flag is false when refund amount is 0");

    try {
      calculateCancellationRefund(1000.0, 150.0);
      assert(false, "Should have thrown for refund percent > 100");
    } catch (err) {
      assert(err.message.includes("between 0 and 100"), "Rejects invalid refund percent > 100");
    }
  });

  // ---------------------------------------------------------------------------
  // 4. END-TO-END DEAL SIMULATION ON MOCK DATA
  // ---------------------------------------------------------------------------
  await testSection("Suite 4: End-to-End Deal Engine Lifecycle Simulation", () => {
    // 1. Rep creates a complex mixed quotation (Hardware + Recurring Cloud Subscription)
    const mockDeal = {
      id: "quote_enterprise_deal_401",
      status: "APPROVED",
      customerId: "cust_global_logistics",
      grandTotal: 28500.0,
      lines: [
        {
          id: "line_edge_router",
          productId: "prod_edge_router",
          subscriptionPlanId: null,
          lineType: "ONE_TIME",
          quantity: 10,
          unitPrice: 2000.0,
          unitCost: 1200.0,
          discountPercent: 5.0,
          taxRate: 10.0,
          lineTotal: 20900.0
        },
        {
          id: "line_cloud_monitoring",
          productId: "prod_cloud_monitoring",
          subscriptionPlanId: "plan_enterprise_cloud",
          lineType: "RECURRING",
          quantity: 1,
          unitPrice: 7600.0,
          unitCost: 800.0,
          discountPercent: 0.0,
          taxRate: 0.0,
          lineTotal: 7600.0
        }
      ]
    };

    // 2. Confirm quotation to create an active order
    const confirmedDeal = confirmQuotation(mockDeal, "ORD-2026-E2E-001");
    assert(confirmedDeal.order.orderNumber === "ORD-2026-E2E-001", "E2E: Order created with number ORD-2026-E2E-001");
    assert(confirmedDeal.order.status === "PENDING_FULFILLMENT", "E2E: Order initialized in PENDING_FULFILLMENT");
    assert(confirmedDeal.orderLines.length === 2, "E2E: Contains both one-time and recurring order lines");

    // 3. Multi-warehouse fulfillment for 10 hardware routers
    const regionalWarehouses = [
      { id: "wh_west", name: "West Coast DC", availableQty: 15, reservedQty: 9, shippingWeight: 2.0, priority: 10, isActive: true }, // Sellable = 6
      { id: "wh_east", name: "East Coast DC", availableQty: 20, reservedQty: 14, shippingWeight: 1.5, priority: 8, isActive: true }, // Sellable = 6
      { id: "wh_central", name: "Central Hub", availableQty: 2, reservedQty: 2, shippingWeight: 1.0, priority: 5, isActive: true }   // Sellable = 0
    ];

    const targetWarehouses = selectWarehouses(regionalWarehouses, 10);
    assert(targetWarehouses.length === 2, "E2E: Filters out 0-stock central hub; keeps West and East DCs");

    const stockAllocation = allocateStock(targetWarehouses, 10);
    assert(stockAllocation.isFullyAllocated === true, "E2E: 10 units fully allocated");
    assert(stockAllocation.allocations.length === 2, "E2E: Split allocation between West (6) and East (4)");

    const validation = validateAllocation(targetWarehouses, stockAllocation.allocations, 10);
    assert(validation.valid === true, "E2E: Fulfillment allocation passes rigorous audit validation");

    const shipments = createShipmentPlan(stockAllocation.allocations);
    assert(shipments.shipmentCount === 2, "E2E: Automatically generated 2 warehouse shipment manifests");

    // 4. Fulfillment lifecycle status tracking
    const reservedStatus = calculateOrderStatus(
      stockAllocation.allocations.map(a => ({ allocatedQty: a.quantity, fulfilledQty: 0, status: "RESERVED" })),
      10
    );
    assert(reservedStatus === "ALLOCATED", "E2E: Order transitions to ALLOCATED upon warehouse reservation");

    const partialStatus = calculateOrderStatus([
      { allocatedQty: 6, fulfilledQty: 6, status: "SHIPPED" },
      { allocatedQty: 4, fulfilledQty: 0, status: "RESERVED" }
    ], 10);
    assert(partialStatus === "PARTIALLY_SHIPPED", "E2E: Order transitions to PARTIALLY_SHIPPED when West DC dispatches");

    const completeStatus = calculateOrderStatus([
      { allocatedQty: 6, fulfilledQty: 6, status: "SHIPPED" },
      { allocatedQty: 4, fulfilledQty: 4, status: "SHIPPED" }
    ], 10);
    assert(completeStatus === "SHIPPED", "E2E: Order transitions to SHIPPED when both warehouses dispatch");

    // 5. Subscription billing generation for the cloud line
    const subscriptionSchedules = generateBillingSchedule(
      new Date("2026-03-01T00:00:00.000Z"),
      "MONTHLY",
      1,
      mockDeal.lines[1].unitPrice,
      12
    );
    assert(subscriptionSchedules.length === 12, "E2E: Generates 12 monthly subscription billing intervals");
    assert(subscriptionSchedules[0].amount === 7600.0, "E2E: Monthly recurring billing amount matches line price");

    // 6. Mid-cycle proration adjustment
    const cycleStart = new Date("2026-03-01T00:00:00.000Z");
    const cycleEnd = new Date("2026-03-31T00:00:00.000Z"); // 30 days
    const changeDate = new Date("2026-03-11T00:00:00.000Z"); // 20 days remaining

    const proration = calculateProration(cycleStart, cycleEnd, changeDate);
    const proratedCharge = calculateProratedAmount(mockDeal.lines[1].unitPrice, 1, proration.prorationFactor);
    assert(proration.billableDays === 20, "E2E: Accurately calculates 20 billable days remaining in cycle");
    assert(proratedCharge > 0 && proratedCharge < 7600.0, "E2E: Accurately computes prorated subscription fee");

    // 7. Cancellation refund policy
    const cancellation = calculateCancellationRefund(7600.0, 50.0);
    assert(cancellation.refundAmount === 3800.0, "E2E: Calculates exact 50% cancellation refund ($3,800.00)");
  });

  // ---------------------------------------------------------------------------
  // 5. EXPRESS HTTP API & ROUTE HANDLING (IN-MEMORY HTTP MOCK)
  // ---------------------------------------------------------------------------
  await testSection("Suite 5: Express App HTTP API & Middleware Routing", async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    try {
      // 1. Health check endpoint
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert(healthRes.status === 200, "GET /api/health responds with HTTP 200");
      const healthJson = await healthRes.json();
      assert(healthJson.success === true, "GET /api/health returns success: true");
      assert(healthJson.message === "DealFlow360 backend is running", "GET /api/health returns correct status message");

      // 2. 404 Route handling
      const notFoundRes = await fetch(`${baseUrl}/api/unknown-endpoint-test`);
      assert(notFoundRes.status === 404, "Unknown route responds with HTTP 404");
      const notFoundJson = await notFoundRes.json();
      assert(notFoundJson.success === false, "404 handler returns success: false");
      assert(notFoundJson.message === "Route not found", "404 handler returns 'Route not found'");

      // 3. Auth register validation check
      const originalConsoleError = console.error;
      console.error = () => {}; // Silence intentional error logging
      try {
        const authBadRes = await fetch(`${baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        assert(authBadRes.status >= 400, "POST /api/auth/register rejects empty payload with HTTP 4xx");
      } finally {
        console.error = originalConsoleError;
      }
    } finally {
      if (server.closeAllConnections) {
        server.closeAllConnections();
      }
      await new Promise(resolve => server.close(resolve));
      console.log(`  ✓ PASSED: Ephemeral test HTTP server cleanly closed`);
      passedCount++;
    }
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`📊 TEST EXECUTION SUMMARY:`);
  console.log(`   Passed assertions: ${passedCount}`);
  console.log(`   Failed assertions: ${failedCount}`);
  console.log(`======================================================\n`);

  if (failedCount > 0) {
    console.error(`💥 ${failedCount} test assertion(s) failed.`);
    process.exit(1);
  } else {
    console.log(`🎉 ALL ${passedCount} BACKEND TESTS & MOCK DATA SCENARIOS PASSED WITH ZERO ERRORS!`);
    process.exit(0);
  }
}

runAllSuites().catch(err => {
  console.error("Test runner encountered an uncaught error:", err);
  process.exit(1);
});
