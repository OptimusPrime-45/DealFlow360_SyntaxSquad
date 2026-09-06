// ============================================================================
// DealFlow360 — Approval Routes
// Mounts endpoints for Approval Policy Ladders and the Approval Lifecycle.
// ============================================================================

import { Router } from 'express';
import {
  getPolicies,
  getPolicyById,
  createPolicy,
  createPolicyStep,
  updatePolicyStep,
  deletePolicyStep,
  requestApproval,
  approveStep,
  rejectStep,
  returnStep,
  getApprovalHistory,
} from '../controllers/approval.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// All approval routes require internal authentication
router.use(authenticate);

// Policy & Ladder Steps CRUD
router.get('/policies', getPolicies);
router.get('/policies/:id', getPolicyById);
router.post('/policies', requireRole('ADMIN', 'SALES_MANAGER'), createPolicy);
router.post('/policies/:id/steps', requireRole('ADMIN', 'SALES_MANAGER'), createPolicyStep);
router.put('/policies/steps/:stepId', requireRole('ADMIN', 'SALES_MANAGER'), updatePolicyStep);
router.delete('/policies/steps/:stepId', requireRole('ADMIN', 'SALES_MANAGER'), deletePolicyStep);

// Approval Lifecycle
router.post('/request/:quotationId', requestApproval);
router.post('/steps/:stepId/approve', approveStep);
router.post('/steps/:stepId/reject', rejectStep);
router.post('/steps/:stepId/return', returnStep);

// History & Audit
router.get('/quotation/:quotationId/history', getApprovalHistory);

export default router;
