'use client';

/**
 * A signed-in customer viewing one of their own quotations.
 *
 * Reuses the same view as the magic-link page rather than duplicating it —
 * the only difference is where the token comes from and that the quotation is
 * named explicitly (the API verifies it belongs to this customer).
 */

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerPortalView from '../../[token]/page.jsx';

const PORTAL_SESSION_KEY = 'dealflow_portal_session';

export default function PortalQuotePage() {
  const { id } = useParams();
  const router = useRouter();
  const [token, setToken] = useState(null);

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
    setToken(stored.token);
  }, [router]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="w-8 h-8 border-3 border-[#111827] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <CustomerPortalView token={token} quotationId={id} />;
}
