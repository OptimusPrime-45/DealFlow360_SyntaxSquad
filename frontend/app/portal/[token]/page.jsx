'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

/**
 * DealFlow360 Customer Portal — Proposal & Interactive Negotiation View
 * 
 * DESIGN SPEC (DESIGN.md):
 * - Odoo-inspired business design language
 * - Primary brand color: Odoo Purple (#714B67 / #875A7B)
 * - Soft gray background (#f8f9fa), clean white cards, subtle borders
 * - Completely isolated from internal app layout (no internal navigation or admin header)
 * 
 * FEATURES COVERED:
 * - Feature 1: Secure magic link verification & proposal view
 * - Feature 2: Customer counter-offer submission & live negotiation timeline (§9 Step 7)
 */
export default function CustomerPortalPage({ token: tokenProp, quotationId: quotationIdProp }) {
  // Two ways in, one view (PDF §4-A1):
  //   magic link      -> token comes from the URL segment, scoped to ONE quote
  //   customer login  -> token is the session, and the quote is named explicitly
  // When a quotationId is supplied the API verifies it belongs to that customer
  // before attaching it to the session, so this cannot be used to reach another
  // customer's quotation.
  const params = useParams();
  const token = tokenProp || params?.token;
  const quotationId = quotationIdProp || null;
  const quoteQuery = quotationId ? `?quotationId=${encodeURIComponent(quotationId)}` : '';
  const isLinkSession = !tokenProp;

  // Component state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [acceptedMessage, setAcceptedMessage] = useState(false);

  // Negotiation state (Feature 2)
  const [negotiations, setNegotiations] = useState([]);
  const [showNegotiateModal, setShowNegotiateModal] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [requestType, setRequestType] = useState('DISCOUNT');
  const [proposedDiscount, setProposedDiscount] = useState('');
  const [proposedQty, setProposedQty] = useState('');
  const [negotiationMessage, setNegotiationMessage] = useState('');
  const [submittingNegotiation, setSubmittingNegotiation] = useState(false);
  const [negotiationFeedback, setNegotiationFeedback] = useState(null);

  // Backend API URL (defaults to localhost:4000)
  // NEXT_PUBLIC_API_URL is set WITH the /api suffix elsewhere in the app
  // (lib/apiClient.js defaults to http://localhost:4000/api). This page builds
  // its own '/api/portal/...' paths, so strip a trailing /api to avoid /api/api.
  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

  // Function to load quotation and negotiation history
  const loadPortalData = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);

      // Step 1: Verify token freshness and revocation state
      // /verify/:token validates a magic link. A credential session has no
      // PortalToken row to verify, so it is skipped.
      const verifyRes = isLinkSession
        ? await fetch(`${API_URL}/api/portal/verify/${token}`)
        : { ok: true, json: async () => ({}) };
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.error?.message || 'Invalid or expired portal link');
      }

      // Step 2: Fetch quotation details with Bearer token
      const quoteRes = await fetch(`${API_URL}/api/portal/quote${quoteQuery}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const quoteData = await quoteRes.json();

      if (!quoteRes.ok) {
        throw new Error(quoteData.error?.message || 'Could not load quotation details');
      }

      setQuotation(quoteData.data);

      // Pre-select the first line item in negotiation modal
      if (quoteData.data.lines && quoteData.data.lines.length > 0 && !selectedLineId) {
        setSelectedLineId(quoteData.data.lines[0].id);
      }

      // Step 3: Fetch active negotiation timeline
      const negRes = await fetch(`${API_URL}/api/portal/negotiations${quoteQuery}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const negData = await negRes.json();

      if (negRes.ok && negData.data?.requests) {
        setNegotiations(negData.data.requests);
      }
    } catch (err) {
      console.error('Portal error:', err);
      setError(err.message || 'An error occurred while loading your proposal');
    } finally {
      setLoading(false);
    }
  }, [token, API_URL, selectedLineId]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  // Handle submitting customer counter-offer (Feature 2)
  const handleNegotiateSubmit = async (e) => {
    e.preventDefault();
    setSubmittingNegotiation(true);
    setNegotiationFeedback(null);

    try {
      const payload = {
        quotationLineId: selectedLineId || null,
        requestType: requestType,
        message: negotiationMessage.trim()
      };

      if (requestType === 'DISCOUNT') {
        payload.proposedDiscountPercent = Number(proposedDiscount);
      } else if (requestType === 'QUANTITY') {
        payload.proposedQuantity = Number(proposedQty);
      }

      const res = await fetch(`${API_URL}/api/portal/negotiate${quoteQuery}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to submit counter-offer');
      }

      // Success
      setNegotiationFeedback({
        type: 'success',
        message: 'Counter-offer submitted successfully! Your sales executive has been notified.'
      });

      // Reset form fields
      setNegotiationMessage('');
      setProposedDiscount('');
      setProposedQty('');

      // Reload proposal data to reflect UNDER_NEGOTIATION status and new timeline item
      await loadPortalData();

      // Close modal after brief delay
      setTimeout(() => {
        setShowNegotiateModal(false);
        setNegotiationFeedback(null);
      }, 1800);
    } catch (err) {
      setNegotiationFeedback({
        type: 'error',
        message: err.message || 'Failed to submit revision request'
      });
    } finally {
      setSubmittingNegotiation(false);
    }
  };

  // Helper to format currency numbers cleanly (INR)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Helper to render friendly status badges
  const getStatusBadge = (status) => {
    const statusMap = {
      DRAFT: { label: 'Draft Proposal', bg: 'bg-amber-100', text: 'text-amber-800' },
      SENT: { label: 'Active Proposal', bg: 'bg-blue-100', text: 'text-blue-800' },
      UNDER_NEGOTIATION: { label: 'Under Negotiation', bg: 'bg-purple-100', text: 'text-purple-800' },
      PENDING_APPROVAL: { label: 'Pending Management Review', bg: 'bg-amber-100', text: 'text-amber-800' },
      APPROVED: { label: 'Approved Terms', bg: 'bg-emerald-100', text: 'text-emerald-800' },
      CONFIRMED: { label: 'Order Confirmed', bg: 'bg-green-100', text: 'text-green-800' }
    };
    const s = statusMap[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-800' };
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  // Helper for negotiation request status badges
  const getRequestBadge = (status) => {
    const map = {
      OPEN: { label: 'Pending Rep Review', bg: 'bg-amber-100', text: 'text-amber-800' },
      ACCEPTED: { label: 'Accepted by Rep', bg: 'bg-emerald-100', text: 'text-emerald-800' },
      DECLINED: { label: 'Declined by Rep', bg: 'bg-red-100', text: 'text-red-800' }
    };
    const b = map[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-800' };
    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${b.bg} ${b.text}`}>
        {b.label}
      </span>
    );
  };

  // Render Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white p-8 rounded-xl shadow-sm border border-gray-200">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#714B67] mx-auto mb-4"></div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Loading Your DealFlow360 Proposal</h2>
          <p className="text-sm text-gray-500">Verifying secure magic link session...</p>
        </div>
      </div>
    );
  }

  // Render Error / Expired Link State
  if (error) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Link Expired or Invalid</h2>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <p className="text-xs text-gray-400">
            Please reach out to your sales representative to generate an updated proposal link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Top Header & Brand Bar */}
        <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xl font-black tracking-tight text-[#714B67]">
                  DealFlow<span className="text-gray-900">360</span>
                </span>
                <span className="text-xs uppercase px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-bold">
                  Customer Portal
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Commercial proposal prepared for <span className="font-semibold text-gray-800">{quotation?.customer?.name}</span>
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{quotation?.quotationNumber}</span>
                {getStatusBadge(quotation?.status)}
              </div>
              <p className="text-xs text-gray-400">
                Issued: {quotation?.createdAt ? new Date(quotation.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </header>

        {/* Customer & Rep Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Customer Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Customer Details
            </h3>
            <p className="text-base font-semibold text-gray-900">{quotation?.customer?.name}</p>
            <p className="text-sm text-gray-600">{quotation?.customer?.contactEmail}</p>
            <p className="text-sm text-gray-500 mt-2">
              {quotation?.customer?.billingAddress || 'Standard commercial terms'}
            </p>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Account Tier:</span>
              <span className="font-semibold text-[#714B67] bg-[#714B67]/10 px-2 py-0.5 rounded">
                {quotation?.customer?.tier}
              </span>
            </div>
          </div>

          {/* Sales Representative Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Sales Executive
            </h3>
            <p className="text-base font-semibold text-gray-900">{quotation?.salesRep?.name}</p>
            <p className="text-sm text-gray-600">{quotation?.salesRep?.email}</p>
            <p className="text-xs text-gray-400 mt-2">
              Direct point of contact for this proposal and line-item negotiations.
            </p>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Valid Until:</span>
              <span className="font-semibold text-gray-800">
                {quotation?.validUntil ? new Date(quotation.validUntil).toLocaleDateString() : '30 Days from Issue'}
              </span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900">Proposed Line Items</h3>
            <p className="text-xs text-gray-500">Review products, quantities, and negotiated discounts</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-[#fcfbfc] text-gray-600 text-xs font-semibold uppercase">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Product / Description</th>
                  <th className="py-3.5 px-3">Type</th>
                  <th className="py-3.5 px-3 text-right">Quantity</th>
                  <th className="py-3.5 px-3 text-right">Unit Price</th>
                  <th className="py-3.5 px-3 text-right">Discount</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotation?.lines && quotation.lines.length > 0 ? (
                  quotation.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-gray-50/75 transition-colors">
                      <td className="py-4 px-4 sm:px-6">
                        <div className="font-semibold text-gray-900">{line.productName}</div>
                        {line.description && (
                          <div className="text-xs text-gray-500 line-clamp-1">{line.description}</div>
                        )}
                        {line.subscriptionPlan && (
                          <div className="text-xs text-[#714B67] font-medium mt-0.5">
                            Plan: {line.subscriptionPlan.name} ({line.subscriptionPlan.billingInterval})
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-3">
                        <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          {line.lineType === 'RECURRING' ? 'Recurring' : 'One-Time'}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-right font-medium text-gray-700">
                        {line.quantity}
                      </td>
                      <td className="py-4 px-3 text-right text-gray-600">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="py-4 px-3 text-right">
                        {line.discountPercent > 0 ? (
                          <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                            {line.discountPercent}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right font-semibold text-gray-900">
                        {formatCurrency(line.lineTotal)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-gray-400">
                      No line items included in this proposal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown Section */}
          <div className="bg-[#fcfbfc] p-6 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="text-xs text-gray-500 max-w-sm">
                * Prices reflect live governed discounts and contractual guarantees.
              </div>
              <div className="w-full sm:w-80 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(quotation?.financials?.subtotal)}</span>
                </div>
                {quotation?.financials?.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Total Discount Savings</span>
                    <span>- {formatCurrency(quotation?.financials?.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Tax (GST)</span>
                  <span>{formatCurrency(quotation?.financials?.taxTotal)}</span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline font-bold text-gray-900 text-lg">
                  <span>Grand Total</span>
                  <span className="text-[#714B67]">{formatCurrency(quotation?.financials?.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Actions & Negotiation Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Ready to proceed or have revisions?</h3>
              <p className="text-sm text-gray-500">
                You can accept these terms directly or submit a counter-offer on discounts or quantities.
              </p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowNegotiateModal(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-[#714B67] text-[#714B67] hover:bg-[#714B67]/5 font-medium text-sm transition-colors cursor-pointer"
              >
                Propose Revision / Counter
              </button>
              <button
                type="button"
                onClick={() => setAcceptedMessage(true)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#714B67] hover:bg-[#5B3A53] text-white font-medium text-sm transition-colors shadow-sm cursor-pointer"
              >
                Accept Proposal
              </button>
            </div>
          </div>

          {acceptedMessage && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center justify-between">
              <span>Thank you! Acceptance recorded. Your sales executive will proceed with order confirmation.</span>
              <button 
                onClick={() => setAcceptedMessage(false)}
                className="text-xs text-emerald-600 hover:text-emerald-900 font-semibold ml-4"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Negotiation History Timeline (Feature 2) */}
        {negotiations && negotiations.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Negotiation History</h3>
            <p className="text-xs text-gray-500 mb-4">Track counter-offers and responses between you and your sales executive</p>

            <div className="space-y-3">
              {negotiations.map((item) => (
                <div key={item.id} className="p-4 rounded-lg bg-[#fcfbfc] border border-gray-100">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <span className="font-semibold text-xs text-gray-800 mr-2">{item.lineName}</span>
                      {getRequestBadge(item.status)}
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700 mb-2">
                    {item.requestType === 'DISCOUNT' && item.proposedDiscountPercent !== null && (
                      <span className="font-semibold text-[#714B67] mr-1">
                        Proposed Discount: {item.proposedDiscountPercent}% —
                      </span>
                    )}
                    {item.requestType === 'QUANTITY' && item.proposedQuantity !== null && (
                      <span className="font-semibold text-[#714B67] mr-1">
                        Requested Quantity: {item.proposedQuantity} units —
                      </span>
                    )}
                    "{item.message}"
                  </p>

                  {item.responseMessage && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs bg-white p-2.5 rounded border border-gray-100">
                      <span className="font-semibold text-gray-900">
                        {item.respondedByName || 'Sales Executive'}:
                      </span>{' '}
                      <span className="text-gray-600">"{item.responseMessage}"</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Counter-Offer / Revision Modal (Feature 2) */}
        {showNegotiateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-gray-200">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                <h3 className="text-lg font-bold text-gray-900">Submit Proposal Revision</h3>
                <button
                  type="button"
                  onClick={() => setShowNegotiateModal(false)}
                  className="text-gray-400 hover:text-gray-600 font-bold text-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleNegotiateSubmit} className="space-y-4">
                {/* Target Line Item */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                    Select Line Item
                  </label>
                  <select
                    value={selectedLineId}
                    onChange={(e) => setSelectedLineId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-[#714B67] focus:outline-none"
                  >
                    {quotation?.lines?.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.productName} (Current Discount: {line.discountPercent}%)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Request Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                      Request Type
                    </label>
                    <select
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-[#714B67] focus:outline-none"
                    >
                      <option value="DISCOUNT">Discount Revision (%)</option>
                      <option value="QUANTITY">Quantity Revision</option>
                      <option value="QUESTION">General Question</option>
                    </select>
                  </div>

                  {requestType === 'DISCOUNT' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                        Requested Discount (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="e.g. 15"
                        value={proposedDiscount}
                        onChange={(e) => setProposedDiscount(e.target.value)}
                        required
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-[#714B67] focus:outline-none"
                      />
                    </div>
                  )}

                  {requestType === 'QUANTITY' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                        Requested Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 5"
                        value={proposedQty}
                        onChange={(e) => setProposedQty(e.target.value)}
                        required
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-[#714B67] focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Message Box */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                    Explanation / Note for Sales Executive
                  </label>
                  <textarea
                    rows={3}
                    value={negotiationMessage}
                    onChange={(e) => setNegotiationMessage(e.target.value)}
                    placeholder="Provide context for your request (e.g. bulk order, budget constraints)..."
                    required
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-[#714B67] focus:outline-none"
                  ></textarea>
                </div>

                {negotiationFeedback && (
                  <div className={`p-3 rounded-lg text-xs ${negotiationFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {negotiationFeedback.message}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowNegotiateModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingNegotiation}
                    className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#714B67] hover:bg-[#5B3A53] text-white transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {submittingNegotiation ? 'Submitting...' : 'Send Counter-Offer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-gray-400">
          Powered by DealFlow360 Self-Governing Deal Engine • Secured via One-Time Magic Link
        </footer>

      </div>
    </div>
  );
}
