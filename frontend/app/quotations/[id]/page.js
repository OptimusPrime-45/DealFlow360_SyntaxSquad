"use client";

/**
 * Quotation Builder — §9 steps 2, 3 and 4.
 *
 * Shows each line against ITS OWN ceiling (not one limit for the whole order),
 * a live margin indicator, and the upsell panel. Confirming does not ask the
 * rep to request approval — the system decides and says who it routed to.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext.js";
import apiClient from "../../../lib/apiClient.js";
import { Button, Card, Badge, Table } from "../../../components/ui/index.js";

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v ?? 0).toFixed(2)}%`;

const STATUS_VARIANT = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  SENT: "info",
  UNDER_NEGOTIATION: "warning",
  CONFIRMED: "success",
  CANCELLED: "neutral",
};

export default function QuotationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [quotation, setQuotation] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [portalLink, setPortalLink] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await apiClient.get(`/quotations/${id}`);
      setQuotation(data.quotation);

      // Suggestions only make sense while the quote is still editable.
      if (["DRAFT", "REJECTED", "UNDER_NEGOTIATION"].includes(data.quotation.status)) {
        const s = await apiClient.get(`/quotations/${id}/suggestions`);
        setSuggestions(s.suggestions || []);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthenticated && id) load();
  }, [isAuthenticated, id, load]);

  const acceptSuggestion = async (s) => {
    setBusy(true);
    setNotice("");
    try {
      await apiClient.post(`/quotations/${id}/lines`, {
        productId: s.productId,
        quantity: 1,
        discountPercent: 0,
        addedViaUpsell: true,
      });
      setNotice(`Added ${s.name} — totals and margin updated`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dismissSuggestion = (productId) =>
    setSuggestions((prev) => prev.filter((s) => s.productId !== productId));

  const changeDiscount = async (lineId, discountPercent) => {
    setBusy(true);
    try {
      await apiClient.patch(`/quotations/${id}/lines/${lineId}`, {
        discountPercent: Number(discountPercent),
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Mint a customer portal link (§9 step 7).
   *
   * Nothing in the UI could do this before, so demonstrating the customer
   * negotiation flow meant calling the API by hand. Email delivery is a stated
   * non-goal, so the link is shown here to be copied and sent however you like.
   */
  const sendToCustomer = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    setCopied(false);
    try {
      const res = await apiClient.post(`/quotations/${id}/portal-link`, {
        expiresInDays: 7,
      });
      const token = res.token || res.portalToken?.token;
      setPortalLink(`${window.location.origin}/portal/${token}`);
      setNotice("Customer link created. It opens this quotation only, and expires in 7 days.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalLink);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the link is selectable on screen regardless.
      setCopied(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const res = await apiClient.post(`/quotations/${id}/submit`, {});
      setNotice(
        res.autoApproved
          ? "Within every configured ceiling — approved automatically, no manager needed."
          : `Routed automatically to ${res.routedTo.join(" then ")}. The rep never requested this.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] p-6">
        <Card title="Quotation not found">
          <p className="text-sm text-[#6C757D]">{error || "No such quotation."}</p>
          <Link href="/quotations">
            <Button variant="secondary" size="sm" className="mt-4">Back to pipeline</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const editable = ["DRAFT", "REJECTED", "UNDER_NEGOTIATION"].includes(quotation.status);
  const breaches = quotation.lines.filter((l) => Number(l.overagePts) > 0);
  const marginPct = Number(quotation.marginPercent);

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/quotations" className="text-sm text-[#6C757D] hover:text-[#714B67]">
            ← Pipeline
          </Link>
          <div>
            <div className="font-bold text-base text-[#212529]">{quotation.quotationNumber}</div>
            <div className="text-[11px] text-[#6C757D] flex items-center gap-1.5 flex-wrap">
              <span>{quotation.customer?.name}</span>
              {quotation.salesRep && (
                <>
                  <span className="text-[#CED4DA]">·</span>
                  <span>
                    Sales Rep: <strong className="text-[#212529]">{quotation.salesRep.fullName}</strong> ({quotation.salesRep.email})
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANT[quotation.status] || "neutral"} size="md">
            {quotation.status.replace(/_/g, " ")}
          </Badge>
          {!["DRAFT"].includes(quotation.status) && (
            <Button variant="secondary" size="sm" onClick={sendToCustomer} disabled={busy}>
              Send to Customer
            </Button>
          )}
          {quotation.order && (
            <Link href={`/orders/${quotation.order.id}`}>
              <Button variant="secondary" size="sm">Fulfillment &amp; Billing</Button>
            </Link>
          )}
          {editable && (
            <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
              Confirm Quotation
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-5">
        {notice && (
          <div className="bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3">
            {notice}
          </div>
        )}
        {error && (
          <div className="bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3">
            {error}
          </div>
        )}

        {portalLink && (
          <div className="bg-white border border-[#714B67]/30 rounded-[8px] p-4">
            <div className="text-sm font-semibold text-[#212529] mb-1">
              Customer portal link
            </div>
            <p className="text-xs text-[#6C757D] mb-3">
              Send this to {quotation.customer?.contactEmail || "your customer"}. It is signed with
              a separate key and gives access to this one quotation — it cannot open anything else
              in the system.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={portalLink}
                onFocus={(e) => e.target.select()}
                className="flex-1 px-3 py-2 text-xs font-mono text-[#212529] border border-[#CED4DA] rounded-[6px] bg-[#F8F9FA] select-all focus:outline-none focus:border-[#714B67]"
              />
              <Button variant="secondary" size="sm" className="text-xs" onClick={copyLink}>
                {copied ? "Copied" : "Copy"}
              </Button>
              <a href={portalLink} target="_blank" rel="noreferrer">
                <Button variant="primary" size="sm" className="text-xs">Open</Button>
              </a>
            </div>
          </div>
        )}

        {/* ── Governance summary: the blended picture, not just one line ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Order Total</div>
            <div className="text-xl font-bold text-[#212529] mt-1">{money(quotation.grandTotal)}</div>
          </Card>
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Live Margin</div>
            <div
              className={`text-xl font-bold mt-1 ${
                marginPct < 15 ? "text-[#DC3545]" : marginPct < 25 ? "text-[#FD7E14]" : "text-[#28A745]"
              }`}
            >
              {pct(marginPct)}
            </div>
            <div className="text-[11px] text-[#6C757D]">{money(quotation.marginAmount)}</div>
          </Card>
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Blended Score</div>
            <div className="text-xl font-bold text-[#212529] mt-1">
              {Number(quotation.blendedScore).toFixed(2)}
            </div>
            <div className="text-[11px] text-[#6C757D]">value-weighted across the order</div>
          </Card>
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Worst Line</div>
            <div
              className={`text-xl font-bold mt-1 ${
                Number(quotation.worstLineOverage) > 0 ? "text-[#DC3545]" : "text-[#28A745]"
              }`}
            >
              {Number(quotation.worstLineOverage).toFixed(2)} pts
            </div>
            <div className="text-[11px] text-[#6C757D]">over its own ceiling</div>
          </Card>
        </div>

        {breaches.length > 0 && (
          <div className="bg-[#FFF4E5] border border-[#FD7E14]/30 rounded-[8px] px-4 py-3">
            <div className="text-sm font-semibold text-[#7A4100]">
              {breaches.length} line{breaches.length > 1 ? "s" : ""} over ceiling
            </div>
            <div className="text-xs text-[#7A4100]/80 mt-1">
              A line can break its own category ceiling even when the customer tier allows more —
              the stricter limit always wins.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Lines ── */}
          <div className="lg:col-span-2">
            <Card title="Order Lines" subtitle="Each line is checked against its own ceiling">
              <Table headers={["Product", "Qty", "Unit", "Disc %", "Ceiling", "Over", "Margin", "Total"]}>
                {quotation.lines.map((line) => {
                  const over = Number(line.overagePts) > 0;
                  return (
                    <tr key={line.id} className="border-t border-[#E9ECEF]">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-[#212529]">{line.product?.name}</div>
                        <div className="text-[11px] text-[#6C757D]">
                          {line.product?.category?.name} · {line.lineType === "RECURRING" ? "Recurring" : "One-time"}
                          {line.addedViaUpsell && (
                            <Badge variant="info" size="sm" className="ml-2">upsell</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{line.quantity}</td>
                      <td className="px-4 py-3 text-sm">{money(line.unitPrice)}</td>
                      <td className="px-4 py-3">
                        {editable ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            defaultValue={Number(line.discountPercent)}
                            disabled={busy}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== Number(line.discountPercent)) changeDiscount(line.id, v);
                            }}
                            className={`w-20 px-2 py-1 text-sm bg-white rounded-[4px] focus:outline-none ${
                              over ? "border border-[#DC3545] text-[#DC3545] font-semibold" : "border border-[#CED4DA] text-[#212529] focus:border-[#714B67]"
                            }`}
                          />
                        ) : (
                          <span className={over ? "text-[#DC3545] font-semibold text-sm" : "text-sm"}>
                            {pct(line.discountPercent)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6C757D]">{pct(line.effectiveCeilingPercent)}</td>
                      <td className="px-4 py-3">
                        {over ? (
                          <Badge variant="danger" size="sm">+{Number(line.overagePts).toFixed(1)}</Badge>
                        ) : (
                          <span className="text-[#28A745] text-sm">✓</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{pct(line.lineMarginPercent)}</td>
                      <td className="px-4 py-3 text-sm font-semibold">{money(line.lineTotal)}</td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          </div>

          {/* ── Upsell panel (§9 step 4) ── */}
          <div>
            <Card
              title="Upsell & Cross-sell"
              subtitle="Ranked on co-purchase history, filtered by margin floor"
            >
              {suggestions.length === 0 && (
                <p className="text-xs text-[#6C757D]">
                  {editable
                    ? "No suggestions for the products on this quote."
                    : "Suggestions are only shown while the quotation is editable."}
                </p>
              )}

              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div key={s.productId} className="border border-[#E9ECEF] rounded-[6px] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-[#212529]">{s.name}</div>
                        <div className="text-[11px] text-[#6C757D]">{s.sku} · {s.category}</div>
                      </div>
                      {s.promotionTag && (
                        <Badge variant="warning" size="sm">{s.promotionTag}</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-[11px]">
                      <span className="text-[#6C757D]">{money(s.unitPrice)}</span>
                      <span className="text-[#28A745] font-semibold">
                        margin +{money(s.marginDelta)}
                      </span>
                      <span className="text-[#6C757D]">({pct(s.marginPercent)})</span>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="primary"
                        size="sm"
                        className="text-xs"
                        disabled={busy || !editable}
                        onClick={() => acceptSuggestion(s)}
                      >
                        Add to Quote
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs"
                        onClick={() => dismissSuggestion(s.productId)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
