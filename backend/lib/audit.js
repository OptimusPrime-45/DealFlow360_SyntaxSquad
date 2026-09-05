// ============================================================================
// DealFlow360 — Audit Logger Helper
// Append-only audit logger wrapping the AuditLog Prisma model.
// Reference: PDF §4-A3, Architecture doc (Audit trail)
// ============================================================================

import { prisma } from './prisma.js';

/**
 * Appends an audit log entry.
 *
 * @param {Object} params
 * @param {string|null} [params.userId=null] - User performing the action (null for system/customer)
 * @param {string|null} [params.quotationId=null] - Associated quotation ID
 * @param {'USER'|'CUSTOMER'|'SYSTEM'} [params.actorType='USER'] - Actor category
 * @param {string} params.entityType - e.g. "Quotation", "DiscountRule", "GovernanceSetting", "ApprovalStep"
 * @param {string} params.entityId - ID of modified record
 * @param {string} params.action - e.g. "APPROVAL_REQUESTED", "STEP_APPROVED", "CEILING_CHANGED"
 * @param {Object|null} [params.oldValue=null] - Previous state snapshot
 * @param {Object|null} [params.newValue=null] - New state snapshot
 * @param {string|null} [params.reason=null] - Mandatory for rejections/returns, optional for others
 * @returns {Promise<Object>} Created audit log record
 */
export async function recordAuditLog({
  userId = null,
  quotationId = null,
  actorType = 'USER',
  entityType,
  entityId,
  action,
  oldValue = null,
  newValue = null,
  reason = null,
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId,
        quotationId,
        actorType,
        entityType,
        entityId: String(entityId),
        action,
        oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
        newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
        reason,
      },
    });
  } catch (error) {
    // Non-blocking: log warning rather than crashing user transaction if audit fails
    console.warn(`[AuditLog Warning] Failed to record audit for ${entityType}:${entityId} (${action}):`, error.message);
    return null;
  }
}

export default {
  recordAuditLog,
};
