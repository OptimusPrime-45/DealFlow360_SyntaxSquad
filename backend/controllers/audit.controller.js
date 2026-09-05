// ============================================================================
// DealFlow360 — Audit Log Controller
// Provides read-only querying over the append-only AuditLog compliance ledger.
// ============================================================================

import { prisma } from '../lib/prisma.js';
import { ApiResponse } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

/**
 * GET /api/audit-logs
 * Queries the append-only audit trail with optional filters.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    quotationId,
    entityType,
    entityId,
    actorType,
    action,
    limit = 50,
    offset = 0,
  } = req.query;

  const where = {};

  if (quotationId) where.quotationId = String(quotationId);
  if (entityType) where.entityType = String(entityType);
  if (entityId) where.entityId = String(entityId);
  if (actorType) where.actorType = String(actorType);
  if (action) where.action = String(action);

  const [totalCount, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
        quotation: {
          select: { id: true, quotationNumber: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, parseInt(limit, 10))),
      skip: Math.max(0, parseInt(offset, 10)),
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        total: totalCount,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        logs,
      },
      'Audit logs retrieved successfully'
    )
  );
});

export default {
  getAuditLogs,
};
