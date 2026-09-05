import { Router } from 'express';
import * as negotiationController from '../controllers/negotiation.controller.js';

const router = Router();

// ============================================================================
// Internal Staff Negotiation Review Endpoints
// ============================================================================

// Sales Rep accepts or declines a customer's counter-offer
router.post('/requests/:id/respond', negotiationController.respondToNegotiationRequest);

export default router;
