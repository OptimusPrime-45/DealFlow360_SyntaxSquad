import { Router } from 'express';
import * as invoicingController from '../controllers/invoicing.controller.js';

const router = Router();

// ============================================================================
// Invoicing & Revenue Routes
// ============================================================================

// List and filter invoices
router.get('/', invoicingController.listInvoices);

// Get single invoice detail with line items and payment history
router.get('/:id', invoicingController.getInvoiceById);

// Post / finalize invoice for collection (DRAFT -> POSTED)
router.post('/:id/post', invoicingController.postInvoice);

// Record payment (supports partial payments and full payments)
router.post('/:id/payments', invoicingController.recordPayment);

// Generate invoices for confirmed order
router.post('/generate/:orderId', invoicingController.handleGenerateInvoices);

export default router;
