'use client';

/**
 * Customer portal sign-in — PDF §4-A1.
 * "Customers access their quotations through a portal login (magic link, or
 *  email and password)."
 *
 * The magic-link half already existed; this is the credential half, so a
 * customer can get in without waiting for a rep to mint and send a link.
 *
 * Kept strictly outside the internal app: no AuthContext, no apiClient (which
 * would attach the staff bearer token from localStorage), and its own session
 * key. A portal token is signed with a different secret and is useless against
 * any internal route.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

export const PORTAL_SESSION_KEY = 'dealflow_portal_session';

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || 'Unable to sign in');
      }

      const { token, customer } = json.data;
      try {
        sessionStorage.setItem(
          PORTAL_SESSION_KEY,
          JSON.stringify({ token, customer })
        );
      } catch {
        // Private browsing can block storage; the redirect still works for
        // this tab because the quotations page re-reads and will prompt again.
      }
      router.push('/portal/quotations');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-11 h-11 rounded-[10px] bg-[#111827] text-white flex items-center justify-center font-bold mx-auto mb-3">
            DF
          </div>
          <h1 className="text-lg font-semibold text-[#111827]">Customer Portal</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Sign in to view and respond to your quotations.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 space-y-4"
        >
          {error && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-sm rounded-[8px] px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-[8px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-[8px]"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2 text-sm font-medium rounded-[8px] bg-[#111827] text-white hover:bg-[#1F2937] disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 bg-white border border-[#E5E7EB] rounded-[12px] p-4">
          <div className="text-xs font-semibold text-[#374151] mb-1">
            Received a link instead?
          </div>
          <p className="text-xs text-[#6B7280]">
            If your account manager sent you a direct link, open it — no sign-in needed. It gives
            access to that one quotation.
          </p>
        </div>

        <p className="text-[11px] text-[#9CA3AF] text-center mt-4">
          Customer accounts are created by your account manager. There is no public sign-up.
        </p>
      </div>
    </div>
  );
}
