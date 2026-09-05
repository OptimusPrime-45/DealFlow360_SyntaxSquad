"use client";

/**
 * Approval queue — §9 steps 3 and 5.
 *
 * The reviewer must be able to say WHY a quotation reached them without asking
 * the rep. The per-line explanation is read from QuotationApproval.findings,
 * which was stored when the cycle opened — not recomputed here, so it still
 * reflects the ceilings that were actually in force at the time.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { Button, Card, Badge, Table } from "../../components/ui/index.js";

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v ?? 0).toFixed(2)}%`;

export default function ApprovalsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [quotations, setQuotations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const loadQueue = useCallback(async () => {
    try {
      const data = await apiClient.get("/quotations?status=PENDING_APPROVAL");
      setQuotations(data.quotations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadQueue();
  }, [isAuthenticated, loadQueue]);

  const openQuotation = async (q) => {
    setSelected(q);
    setDetail(null);
    setReason("");
    setNotice("");
    try {
      const [full, history] = await Promise.all([
        apiClient.get(`/quotations/${q.id}`),
        apiClient.get(`/approvals/quotation/${q.id}/history`).catch(() => null),
      ]);
      setDetail({ quotation: full.quotation, history });
    } catch (err) {
      setError(err.message);
    }
  };

  const act = async (stepId, action) => {
    if (action !== "approve" && !reason.trim()) {
      setError("A reason is required when rejecting or returning a quotation.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiClient.post(`/approvals/steps/${stepId}/${action}`, {
        reason: reason.trim() || "Approved after review",
      });
      if (action === "approve") {
        setNotice(
          res.cycleCompleted
            ? "Final approval granted! Quotation is now APPROVED and ready for customer acceptance."
            : "Step approved! Quotation has been escalated to Finance for secondary authorization."
        );
      } else if (action === "reject") {
        setNotice("Quotation rejected. Status changed to REJECTED (open for changes and negotiation).");
      } else {
        setNotice("Quotation returned to sales rep for revision.");
      }
      setReason("");
      await loadQueue();
      if (selected) await openQuotation(selected);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // The cycle currently awaiting a decision.
  const cycles =
    detail?.history?.cycles ||
    detail?.history?.approvals ||
    detail?.history?.history ||
    detail?.quotation?.approvals ||
    [];
  const activeCycle =
    Array.isArray(cycles) ? cycles.find((c) => c.status === "PENDING") || cycles[0] : null;
  const findings = activeCycle?.findings;
  const findingRows = Array.isArray(findings) ? findings : findings?.lines || [];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-[#6C757D] hover:text-[#714B67]">← Workspace</Link>
          <div>
            <div className="font-bold text-base text-[#212529]">Approvals</div>
            <div className="text-[11px] text-[#6C757D]">
              {quotations.length} quotation{quotations.length === 1 ? "" : "s"} awaiting a decision
            </div>
          </div>
        </div>
        <Badge variant="info" size="md">{user?.role}</Badge>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {error && (
          <div className="mb-4 bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Queue ── */}
          <Card title="Awaiting Approval" padding="p-0">
            <div className="divide-y divide-[#E9ECEF]">
              {quotations.length === 0 && (
                <p className="text-xs text-[#6C757D] p-4">
                  Nothing is waiting. Compliant quotations are approved automatically and never
                  reach this queue.
                </p>
              )}
              {quotations.map((q) => (
                <button
                  key={q.id}
                  onClick={() => openQuotation(q)}
                  className={`w-full text-left p-4 hover:bg-[#F8F9FA] transition ${
                    selected?.id === q.id ? "bg-[#F3EEF2] border-l-2 border-l-[#714B67]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#212529]">{q.quotationNumber}</span>
                    <span className="text-sm font-semibold">{money(q.grandTotal)}</span>
                  </div>
                  <div className="text-[11px] text-[#6C757D] mt-1 flex items-center justify-between">
                    <span>{q.customer?.name}</span>
                    {q.salesRep?.fullName && (
                      <span className="text-[#714B67] font-medium">Rep: {q.salesRep.fullName}</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="warning" size="sm">
                      blended {Number(q.blendedScore).toFixed(2)}
                    </Badge>
                    <Badge variant="danger" size="sm">
                      worst +{Number(q.worstLineOverage).toFixed(1)}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* ── Detail ── */}
          <div className="lg:col-span-2 space-y-5">
            {!detail && (
              <Card>
                <p className="text-sm text-[#6C757D]">
                  Select a quotation to see why it was routed here.
                </p>
              </Card>
            )}

            {detail && (
              <>
                <Card
                  title={`${detail.quotation.quotationNumber} — why this is on your desk`}
                  subtitle={`${detail.quotation.customer?.name} · ${detail.quotation.customerTier?.name || "Standard Tier"}${
                    detail.quotation.salesRep
                      ? ` · Assigned Rep: ${detail.quotation.salesRep.fullName} (${detail.quotation.salesRep.email})`
                      : ""
                  }`}
                >
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-[11px] uppercase text-[#6C757D]">Blended Score</div>
                      <div className="text-lg font-bold">
                        {Number(detail.quotation.blendedScore).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-[#6C757D]">Worst Line</div>
                      <div className="text-lg font-bold text-[#DC3545]">
                        +{Number(detail.quotation.worstLineOverage).toFixed(2)} pts
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-[#6C757D]">Order Total</div>
                      <div className="text-lg font-bold">{money(detail.quotation.grandTotal)}</div>
                    </div>
                  </div>

                  {activeCycle && (
                    <p className="text-xs text-[#6C757D] mb-3">
                      Approval cycle {activeCycle.approvalCycle} · triggered by{" "}
                      <strong>{String(activeCycle.triggeredBy).replace(/_/g, " ").toLowerCase()}</strong>
                    </p>
                  )}

                  <Table headers={["Line", "Discount", "Ceiling", "Over by"]}>
                    {(findingRows.length > 0 ? findingRows : detail.quotation.lines).map((f, i) => (
                      <tr key={f.lineId || f.id || i} className="border-t border-[#E9ECEF]">
                        <td className="px-4 py-2 text-sm">
                          {f.productName || f.product?.name || "Line"}
                        </td>
                        <td className="px-4 py-2 text-sm">{pct(f.discountPercent)}</td>
                        <td className="px-4 py-2 text-sm text-[#6C757D]">
                          {pct(f.effectiveCeilingPercent)}
                        </td>
                        <td className="px-4 py-2">
                          {Number(f.overagePts) > 0 ? (
                            <Badge variant="danger" size="sm">
                              +{Number(f.overagePts).toFixed(1)} pts
                            </Badge>
                          ) : (
                            <span className="text-[#28A745] text-sm">within limit</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Card>

                <Card title="Decision" subtitle="Every action is logged with user, timestamp and reason">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (required to reject or return)"
                    className="w-full px-3 py-2 text-sm bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] mb-3 placeholder:text-[#868E96] focus:border-[#714B67] focus:outline-none"
                  />

                  <div className="space-y-2">
                    {(activeCycle?.steps || []).map((s) => {
                      const userRoleCode = typeof user?.role === 'string' ? user.role : user?.role?.code;
                      const isAuthor = user?.id === detail.quotation?.salesRepId;
                      const isAuthorizedReviewer =
                        (userRoleCode === "ADMIN" ||
                          userRoleCode === s.role?.code ||
                          (user?.roleId && user.roleId === s.roleId)) &&
                        !isAuthor;

                      return (
                        <div
                          key={s.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between border border-[#E9ECEF] rounded-[6px] p-3 gap-2"
                        >
                          <div>
                            <div className="text-sm font-semibold text-[#212529] flex items-center gap-2">
                              <span>Step {s.stepOrder}: {s.role?.name || s.role?.code}</span>
                              {s.status === "PENDING" && isAuthorizedReviewer && (
                                <Badge variant="warning" size="sm">Your Action Required</Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-[#6C757D] mt-0.5">
                              {s.reviewer ? `Reviewed by ${s.reviewer.fullName}` : "Awaiting review"}
                              {s.reason && ` — "${s.reason}"`}
                            </div>
                          </div>

                          {s.status === "PENDING" ? (
                            isAuthorizedReviewer ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="text-xs font-semibold"
                                  disabled={busy}
                                  onClick={() => act(s.id, "approve")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  className="text-xs"
                                  disabled={busy}
                                  onClick={() => act(s.id, "reject")}
                                >
                                  Reject
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="text-xs"
                                  disabled={busy}
                                  onClick={() => act(s.id, "return")}
                                >
                                  Return
                                </Button>
                              </div>
                            ) : isAuthor ? (
                              <span className="text-xs text-[#DC3545] font-medium italic">
                                Anti-self-approval rule in effect
                              </span>
                            ) : (
                              <span className="text-xs text-[#6C757D] font-medium">
                                Awaiting {s.role?.name || s.role?.code}
                              </span>
                            )
                          ) : (
                            <Badge
                              variant={
                                s.status === "APPROVED"
                                  ? "success"
                                  : s.status === "REJECTED"
                                  ? "danger"
                                  : "neutral"
                              }
                              size="sm"
                            >
                              {s.status}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Link href={`/quotations/${detail.quotation.id}`}>
                    <Button variant="secondary" size="sm" className="mt-4 text-xs">
                      Open full quotation
                    </Button>
                  </Link>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
