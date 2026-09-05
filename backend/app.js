import express from 'express';
import cors from 'cors';
import portalRoutes from './routes/portal.routes.js';
import negotiationRoutes from './routes/negotiation.routes.js';
import internalNegotiationRoutes from './routes/internal-negotiation.routes.js';
import invoicingRoutes from './routes/invoicing.routes.js';
import { generatePortalLink } from './controllers/portal.controller.js';
import { requireInternal } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { ApiResponse } from './utils/api-response.js';

const app = express();

// Enable Cross-Origin Resource Sharing for the Next.js frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json(new ApiResponse(200, { status: 'healthy', timestamp: new Date() }, 'API is active'));
});

// Customer Portal namespace (/api/portal/*)
app.use('/api/portal', portalRoutes);
app.use('/api/portal', negotiationRoutes);

// Internal Negotiations namespace (/api/negotiations/*)
app.use('/api/negotiations', internalNegotiationRoutes);

// Invoicing & Revenue namespace (/api/invoices/*)
app.use('/api/invoices', invoicingRoutes);

// Internal Quotations endpoint for sales reps to generate portal links
app.post('/api/quotations/:id/portal-link', generatePortalLink);

// Dedicated internal test route used to assert PRD Metric M6 (Zero internal routes reachable by portal token)
app.get('/api/internal/test-protected', requireInternal, (req, res) => {
  res.json(new ApiResponse(200, { accessGranted: true, user: req.user }, 'Internal route access confirmed'));
});

// Centralized error handling middleware (must be after all routes)
app.use(errorHandler);

export default app;
