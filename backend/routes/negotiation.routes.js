import { Router } from 'express';
import { requirePortal } from '../middleware/portal-auth.js';
import * as negotiationController from '../controllers/negotiation.controller.js';

const router = Router();

// ============================================================================
// Customer Portal Negotiation Routes (Protected by requirePortal)
// ============================================================================

// Customer submits a counter-offer or revision request
router.post('/negotiate', requirePortal, negotiationController.submitCustomerNegotiation);

// Customer fetches active negotiation requests and timeline
router.get('/negotiations', requirePortal, negotiationController.getPortalNegotiations);

export default router;
