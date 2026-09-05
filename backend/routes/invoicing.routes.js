import { Router } from 'express';
import * as invoicingController from '../controllers/invoicing.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// This router owns /api/invoices entirely, so a blanket guard is safe.
// These endpoints previously answered 200 with no authentication at all.
router.use(authenticate);

// PDF §3 — Finance "reconciles recurring billing and credit notes". Everyone
// authenticated may READ invoices; posting them and recording money is Finance.
const canBill = requireRole('ADMIN', 'FINANCE');

// ============================================================================
// Invoicing & Revenue Routes
// ============================================================================

// List and filter invoices
router.get('/', invoicingController.listInvoices);

// Get single invoice detail with line items and payment history
router.get('/:id', invoicingController.getInvoiceById);

// Post / finalize invoice for collection (DRAFT -> POSTED)
router.post('/:id/post', canBill, invoicingController.postInvoice);

// Record payment (supports partial payments and full payments)
router.post('/:id/payments', canBill, invoicingController.recordPayment);

// Generate invoices for confirmed order
router.post('/generate/:orderId', canBill, invoicingController.handleGenerateInvoices);

export default router;
