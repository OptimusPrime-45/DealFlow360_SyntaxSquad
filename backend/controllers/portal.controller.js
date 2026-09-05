import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { confirmQuotationToOrder } from './orders.controller.js';
import { generateInvoicesForOrder } from './invoicing.controller.js';
import { recordAuditLog } from '../lib/audit.js';

/**
 * Customer Portal Controller
 * Contains all business logic and request handlers for magic-link portal access.
 */

/**
 * POST /api/quotations/:id/portal-link
 * Internal sales rep endpoint: Generates a new magic link for a quotation
 */
export const generatePortalLink = asyncHandler(async (req, res) => {
  const { id: quotationId } = req.params;
  const { expiresInDays = 7 } = req.body || {};

  // 1. Verify that the quotation exists in the database
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, customerId: true, quotationNumber: true, salesRepId: true }
  });

  if (!quotation) {
    throw new ApiError(404, `Quotation with ID "${quotationId}" was not found`);
  }

  if (req.user?.role?.code === "SALES_REP" && quotation.salesRepId !== req.user.id) {
    throw new ApiError(403, "Forbidden: You can only generate portal links for your own quotations");
  }

  const portalSecret = process.env.PORTAL_JWT_SECRET;
  if (!portalSecret) {
    throw new ApiError(500, 'PORTAL_JWT_SECRET is missing in server environment');
  }

  // 2. Compute expiration date (e.g. 7 days from now)
  const days = Number(expiresInDays) || 7;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // 3. Cryptographically sign a customer portal token (PRD Metric M6 guard)
  const payload = {
    typ: 'portal',
    quotationId: quotation.id,
    customerId: quotation.customerId
  };

  const token = jwt.sign(payload, portalSecret, {
    expiresIn: `${days}d`
  });

  // 4. Persist the token record in the database table 'portal_tokens'
  const tokenRecord = await prisma.portalToken.create({
    data: {
      quotationId: quotation.id,
      token,
      expiresAt
    }
  });

  // 5. Construct the customer portal URL
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const portalUrl = `${baseUrl}/portal/${token}`;

  return res.status(201).json(
    new ApiResponse(201, {
      id: tokenRecord.id,
      token,
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      expiresAt,
      portalUrl
    }, 'Portal access link generated successfully')
  );
});

/**
 * GET /api/portal/verify/:token
 * Public endpoint: Checks if a magic link is valid before loading the portal view
 */
export const verifyToken = asyncHandler(async (req, res) => {
  const { token: tokenString } = req.params;

  if (!tokenString) {
    throw new ApiError(400, 'Token parameter is required');
  }

  const portalSecret = process.env.PORTAL_JWT_SECRET;
  if (!portalSecret) {
    throw new ApiError(500, 'PORTAL_JWT_SECRET is not configured on the server');
  }

  // 1. Verify cryptographic JWT signature
  let decoded;
  try {
    decoded = jwt.verify(tokenString, portalSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'This portal access link has expired');
    }
    throw new ApiError(401, 'Invalid or tampered portal access link');
  }

  if (decoded.typ !== 'portal') {
    throw new ApiError(403, 'Provided token is not a customer portal token');
  }

  // 2. Lookup database record to verify it hasn't been revoked
  const tokenRecord = await prisma.portalToken.findUnique({
    where: { token: tokenString },
    include: {
      quotation: {
        select: {
          id: true,
          quotationNumber: true,
          customerId: true,
          status: true,
          customer: {
            select: { name: true }
          }
        }
      }
    }
  });

  if (!tokenRecord) {
    throw new ApiError(404, 'Portal link record not found in system');
  }

  if (tokenRecord.isRevoked) {
    throw new ApiError(401, 'This portal link has been revoked by sales operations');
  }

  if (new Date(tokenRecord.expiresAt) < new Date()) {
    throw new ApiError(401, 'This portal link has expired');
  }

  return res.status(200).json(
    new ApiResponse(200, {
      valid: true,
      tokenId: tokenRecord.id,
      quotationId: tokenRecord.quotationId,
      quotationNumber: tokenRecord.quotation.quotationNumber,
      customerName: tokenRecord.quotation.customer?.name,
      expiresAt: tokenRecord.expiresAt
    }, 'Portal token is valid')
  );
});

/**
 * GET /api/portal/quote
 * Protected endpoint: Returns the quotation details for the authenticated portal session.
 * Uses req.portalSession.quotationId to guarantee strict cross-quote isolation!
 */
export const getPortalQuote = asyncHandler(async (req, res) => {
  const { quotationId } = req.portalSession;

  // 1. Fetch quotation with lines and customer info from PostgreSQL
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: {
        select: {
          name: true,
          contactEmail: true,
          billingAddress: true,
          customerTier: {
            select: {
              name: true,
              code: true
            }
          }
        }
      },
      salesRep: {
        select: {
          fullName: true,
          email: true
        }
      },
      lines: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              description: true,
              productType: true
            }
          },
          subscriptionPlan: {
            select: {
              name: true,
              billingInterval: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      }
    }
  });

  if (!quotation) {
    throw new ApiError(404, 'Quotation not found');
  }

  // 2. Format Prisma Decimal values into standard numbers for JSON delivery
  const formattedQuote = {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    status: quotation.status,
    createdAt: quotation.createdAt,
    validUntil: quotation.validUntil,
    promisedDeliveryAt: quotation.promisedDeliveryAt,
    customer: {
      name: quotation.customer.name,
      contactEmail: quotation.customer.contactEmail,
      billingAddress: quotation.customer.billingAddress,
      tier: quotation.customer.customerTier.name
    },
    salesRep: {
      name: quotation.salesRep.fullName,
      email: quotation.salesRep.email
    },
    financials: {
      subtotal: Number(quotation.subtotal),
      discountTotal: Number(quotation.discountTotal),
      taxTotal: Number(quotation.taxTotal),
      grandTotal: Number(quotation.grandTotal)
    },
    lines: quotation.lines.map((line) => ({
      id: line.id,
      productName: line.product.name,
      sku: line.product.sku,
      description: line.product.description,
      productType: line.product.productType,
      lineType: line.lineType,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      discountPercent: Number(line.discountPercent),
      lineTotal: Number(line.lineTotal),
      subscriptionPlan: line.subscriptionPlan ? {
        name: line.subscriptionPlan.name,
        billingInterval: line.subscriptionPlan.billingInterval
      } : null
    }))
  };

  return res.status(200).json(
    new ApiResponse(200, formattedQuote, 'Quotation loaded successfully')
  );
});

/**
 * POST /api/portal/revoke/:tokenId
 * Internal endpoint: Revokes a previously issued portal access token
 */
export const revokeToken = asyncHandler(async (req, res) => {
  const { tokenId } = req.params;

  await prisma.portalToken.update({
    where: { id: tokenId },
    data: { isRevoked: true }
  });

  return res.status(200).json(
    new ApiResponse(200, { revoked: true }, 'Portal access link revoked')
  );
});

/**
 * POST /api/portal/accept
 * Customer Endpoint: Formally accepts the quotation from the customer portal.
 * Transitions quotation to CONFIRMED, records customer acceptance, closes active negotiation,
 * automatically generates Order and initial Invoices, and records audit trail.
 */
export const acceptProposal = asyncHandler(async (req, res) => {
  const { quotationId } = req.portalSession;

  // 1. Fetch quotation
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: true,
      lines: true,
      order: true,
    },
  });

  if (!quotation) {
    throw new ApiError(404, 'Quotation not found');
  }

  // Quotation can be accepted from APPROVED, SENT, or UNDER_NEGOTIATION
  const ACCEPTABLE_STATUSES = ['APPROVED', 'SENT', 'UNDER_NEGOTIATION'];
  if (!ACCEPTABLE_STATUSES.includes(quotation.status)) {
    if (quotation.status === 'CONFIRMED') {
      return res.status(200).json(
        new ApiResponse(
          200,
          { quotationId, status: 'CONFIRMED', orderId: quotation.order?.id },
          'This proposal has already been confirmed and processed into an order.'
        )
      );
    }
    throw new ApiError(
      400,
      `Quotation cannot be accepted from current status: ${quotation.status}`
    );
  }

  // 2. Close any open negotiation session
  await prisma.negotiation.updateMany({
    where: { quotationId, status: 'OPEN' },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  // 3. Confirm quotation and generate order using the shared rule engine
  let orderResult = null;
  if (!quotation.order) {
    try {
      orderResult = await confirmQuotationToOrder(quotation.id);
    } catch (err) {
      console.error('Order creation during customer accept:', err.message);
    }
  }

  // 4. Update quotation to CONFIRMED
  const updatedQuotation = await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      lastActivityAt: new Date(),
    },
    include: {
      order: true,
    },
  });

  // 5. Generate invoices for the order if created
  const activeOrderId = orderResult?.order?.id || updatedQuotation.order?.id;
  let generatedInvoices = [];
  if (activeOrderId) {
    try {
      generatedInvoices = await generateInvoicesForOrder(activeOrderId);
    } catch (err) {
      console.error('Invoice generation during customer accept:', err.message);
    }
  }

  // 6. Record Audit Log
  await recordAuditLog({
    userId: null,
    quotationId,
    actorType: 'CUSTOMER',
    entityType: 'Quotation',
    entityId: quotationId,
    action: 'CUSTOMER_ACCEPTED_PROPOSAL',
    newValue: {
      status: 'CONFIRMED',
      orderId: activeOrderId,
      invoiceCount: generatedInvoices.length,
    },
    reason: 'Customer formally accepted the commercial proposal via customer portal',
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        quotationId: updatedQuotation.id,
        quotationNumber: updatedQuotation.quotationNumber,
        status: 'CONFIRMED',
        confirmedAt: updatedQuotation.confirmedAt,
        orderId: activeOrderId,
        orderNumber: orderResult?.order?.orderNumber || updatedQuotation.order?.orderNumber,
        order: orderResult?.order || updatedQuotation.order,
        invoicesGenerated: generatedInvoices.length,
      },
      'Commercial proposal accepted successfully! Order confirmed and invoice generated.'
    )
  );
});
