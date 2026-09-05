import { Router } from 'express';
import { requirePortal } from '../middleware/portal-auth.js';
import { requireInternal } from '../middleware/auth.js';
import * as portalController from '../controllers/portal.controller.js';

const router = Router();

// ============================================================================
// Public / Magic-Link Verification
// ============================================================================
// Validates token freshness before rendering customer page
router.get('/verify/:token', portalController.verifyToken);

// ============================================================================
// Customer-Facing Protected Endpoints (Requires valid PORTAL token)
// ============================================================================
// Scoped to req.portalSession.quotationId to prevent cross-tenant access
router.get('/quote', requirePortal, portalController.getPortalQuote);

// ============================================================================
// Staff / Sales Rep Endpoints (Protected by internal auth or direct link generation)
// ============================================================================
// Rep generates a magic link for a quote
router.post('/links/:id', requireInternal, portalController.generatePortalLink);

// Staff revokes a portal token
router.post('/revoke/:tokenId', requireInternal, portalController.revokeToken);

export default router;
