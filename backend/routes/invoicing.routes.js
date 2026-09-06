import { Router } from 'express';
import * as invoicingController from '../controllers/invoicing.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// This router owns /api/invoices entirely, so a blanket guard is safe.
// These endpoints previously answered 200 with no authentication at all.
router.use(authenticate);

// Allow Finance, Admin, Sales Managers and Sales Reps to generate invoices and record payments
const canBill = requireRole('ADMIN', 'FINANCE', 'SALES_MANAGER', 'SALES_REP');

// ============================================================================
// Invoicing & Revenue Routes
// ============================================================================

// List and filter invoices
router.get('/', invoicingController.listInvoices);

// Get single invoice detail with line items and payment history
router.get('/:id', invoicingController.getInvoiceById);

// Post / finalize invoice for collection (DRAFT -> POSTED)
router.post('/:id/post', canBill, invoicingController.postInvoice);

// Cancel / void unpaid invoice
router.post('/:id/cancel', canBill, invoicingController.cancelInvoice);

// Record payment (supports partial payments and full payments)
router.post('/:id/payments', canBill, invoicingController.recordPayment);

// Generate invoices for confirmed order
router.post('/generate/:orderId', canBill, invoicingController.handleGenerateInvoices);

export default router;
