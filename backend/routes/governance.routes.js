// ============================================================================
// DealFlow360 — Governance Routes
// Mounts endpoints for Settings, Discount Rules, and Quotation Evaluation.
// ============================================================================

import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  listDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
  evaluateQuotation,
} from '../controllers/governance.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// All governance routes require internal authentication
router.use(authenticate);

// Settings
router.get('/settings', getSettings);
router.put('/settings', requireRole('ADMIN'), updateSettings);

// Discount Rules CRUD
router.get('/discount-rules', listDiscountRules);
router.post('/discount-rules', requireRole('ADMIN'), createDiscountRule);
router.put('/discount-rules/:id', requireRole('ADMIN'), updateDiscountRule);
router.delete('/discount-rules/:id', requireRole('ADMIN'), deleteDiscountRule);

// Evaluation
router.post('/evaluate/:quotationId', evaluateQuotation);

export default router;
