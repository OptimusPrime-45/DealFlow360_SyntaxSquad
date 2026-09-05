// ============================================================================
// DealFlow360 — Audit Routes
// ============================================================================

import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Internal authentication required; viewable by Admin, Sales Manager, and Finance
router.use(authenticate);
router.get('/', requireRole('ADMIN', 'SALES_MANAGER', 'FINANCE'), getAuditLogs);

export default router;
