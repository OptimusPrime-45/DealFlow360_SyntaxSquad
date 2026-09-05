import { Router } from 'express';
import { requirePortal } from '../middleware/portal-auth.js';
import { requireInternal } from '../middleware/auth.js';
import * as portalController from '../controllers/portal.controller.js';
import * as portalAuth from '../controllers/portalAuth.controller.js';

const router = Router();

// ============================================================================
// Public / Magic-Link Verification
// ============================================================================
// Validates token freshness before rendering customer page
router.get('/verify/:token', portalController.verifyToken);

// Credential sign-in (PDF §4-A1: "magic link, OR email and password").
router.post('/login', portalAuth.portalLogin);

// ============================================================================
// Customer-Facing Protected Endpoints (Requires valid PORTAL token)
// ============================================================================
// Scoped to req.portalSession.quotationId to prevent cross-tenant access
router.get('/quote', requirePortal, portalController.getPortalQuote);
router.post('/accept', requirePortal, portalController.acceptProposal);

// Who this session belongs to, and every quotation the customer owns.
// listPortalQuotations refuses magic-link sessions: a link is scoped to the one
// quotation it was minted for and must not open the rest.
router.get('/me', requirePortal, portalAuth.portalMe);
router.get('/quotations', requirePortal, portalAuth.listPortalQuotations);

// ============================================================================
// Staff / Sales Rep Endpoints (Protected by internal auth or direct link generation)
// ============================================================================
// Rep generates a magic link for a quote
router.post('/links/:id', requireInternal, portalController.generatePortalLink);

// Staff revokes a portal token
router.post('/revoke/:tokenId', requireInternal, portalController.revokeToken);

export default router;
