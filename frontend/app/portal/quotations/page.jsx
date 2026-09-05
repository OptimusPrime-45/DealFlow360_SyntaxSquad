'use client';

/**
 * Customer's own quotations — what a credential session unlocks.
 *
 * A magic link is deliberately scoped to ONE quotation, so this list is only
 * reachable after signing in with email and password. The API refuses it for a
 * link session (403) rather than quietly widening a link's reach.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');
const PORTAL_SESSION_KEY = 'dealflow_portal_session';

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABEL = {
  SENT: 'Sent to you',
  APPROVED: 'Ready for your review',
  UNDER_NEGOTIATION: 'Your request is with the sales team',
  PENDING_APPROVAL: 'Being authorised internally',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Not proceeding',
  EXPIRED: 'Expired',
};

const STATUS_STYLE = {
  CONFIRMED: 'bg-[#ECFDF5] text-[#065F46]',
  APPROVED: 'bg-[#ECFDF5] text-[#065F46]',
  UNDER_NEGOTIATION: 'bg-[#FFFBEB] text-[#92400E]',
  PENDING_APPROVAL: 'bg-[#EEF2FF] text-[#3730A3]',
};

export default function PortalQuotationsPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (token) => {
    try {
      const res = await fetch(`${API_URL}/api/portal/quotations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);

      if (res.status === 401) {
        sessionStorage.removeItem(PORTAL_SESSION_KEY);
        router.push('/portal/login');
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message || 'Could not load your quotations');

      setQuotations(json.data.quotations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let stored = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(PORTAL_SESSION_KEY) || 'null');
    } catch {
      stored = null;
    }

    if (!stored?.token) {
      router.push('/portal/login');
      return;
    }
    setSession(stored);
    load(stored.token);
  }, [router, load]);

  const signOut = () => {
    try {
      sessionStorage.removeItem(PORTAL_SESSION_KEY);
    } catch {
      /* nothing to clear */
    }
    router.push('/portal/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="w-8 h-8 border-3 border-[#111827] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#111827]">Your Quotations</div>
            <div className="text-xs text-[#6B7280] mt-0.5">{session?.customer?.name}</div>
          </div>
          <button
            onClick={signOut}
            className="text-xs px-3 py-1.5 rounded-[8px] border border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB]"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-sm rounded-[10px] px-4 py-3">
            {error}
          </div>
        )}

        {quotations.length === 0 ? (
          <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-8 text-center">
            <p className="text-sm text-[#6B7280]">
              Nothing to review yet. Quotations appear here once your account manager sends them.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#E5E7EB] rounded-[12px] divide-y divide-[#F3F4F6]">
            {quotations.map((q) => (
              <Link
                key={q.id}
                href={`/portal/quote/${q.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-[#F9FAFB] transition"
              >
                <div>
                  <div className="text-sm font-semibold text-[#111827]">{q.quotationNumber}</div>
                  <div className="text-xs text-[#6B7280] mt-0.5">
                    {q._count?.lines ?? 0} item(s)
                    {q.validUntil && ` · valid until ${new Date(q.validUntil).toLocaleDateString()}`}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                      STATUS_STYLE[q.status] || 'bg-[#F3F4F6] text-[#374151]'
                    }`}
                  >
                    {STATUS_LABEL[q.status] || q.status}
                  </span>
                  <span className="text-sm font-semibold text-[#111827] whitespace-nowrap">
                    {money(q.grandTotal)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[#9CA3AF] text-center mt-6">
          You are signed in to your own account and can see only your quotations.
        </p>
      </main>
    </div>
  );
}
