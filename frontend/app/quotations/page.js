"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { Button, Card, Badge, Table } from "../../components/ui/index.js";

export default function QuotationsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [quotations, setQuotations] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [repFilter, setRepFilter] = useState("");
  const [error, setError] = useState("");

  const isManagerOrAdmin = user?.role === "SALES_MANAGER" || user?.role === "ADMIN" || user?.role === "FINANCE";

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const fetchQuotations = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (repFilter) params.append("salesRepId", repFilter);
      const queryStr = params.toString() ? `?${params.toString()}` : "";

      const res = await apiClient.get(`/quotations${queryStr}`);
      const data = res.quotations || [];
      setQuotations(data);

      // Collect available sales reps for the manager dropdown
      if (isManagerOrAdmin) {
        setSalesReps((prev) => {
          const repMap = new Map(prev.map((r) => [r.id, r]));
          data.forEach((q) => {
            if (q.salesRep?.id) {
              repMap.set(q.salesRep.id, q.salesRep);
            }
          });
          return Array.from(repMap.values());
        });
      }
    } catch (err) {
      setError(err.message || "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchQuotations();
    }
  }, [isAuthenticated, statusFilter, repFilter]);

  const statusColors = {
    DRAFT: "gray",
    PENDING_APPROVAL: "warning",
    APPROVED: "success",
    SENT: "info",
    UNDER_NEGOTIATION: "warning",
    REJECTED: "danger",
    CONFIRMED: "neutral",
  };

  const tierColors = {
    GOLD: "warning",
    SILVER: "neutral",
    BRONZE: "gray",
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Top Navigation */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[6px] bg-[#714B67] text-white flex items-center justify-center font-bold text-xs">
              DF
            </div>
            <span className="font-bold text-base text-[#212529]">
              DealFlow360
            </span>
          </Link>
          <span className="text-[#CED4DA]">/</span>
          <span className="text-sm font-semibold text-[#714B67]">
            Quotations Pipeline
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-1 rounded bg-[#F3EEF2] text-[#714B67] font-semibold border border-[#714B67]/20">
            {user?.role || "User"}
          </span>
          <Link href="/quotations/new">
            <Button variant="primary" size="sm" className="font-semibold">
              + New Quotation
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#212529]">
              Quotations Pipeline
            </h1>
            <p className="text-xs text-[#6C757D] mt-0.5">
              {user?.role === "SALES_REP"
                ? "Your authored quotations, live discount discipline, and margin health"
                : "All team quotations across sales reps, policy compliance, and approval status"}
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sales Rep Filter (Visible to Managers & Admins) */}
            {isManagerOrAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                  Rep:
                </span>
                <select
                  value={repFilter}
                  onChange={(e) => setRepFilter(e.target.value)}
                  className="h-9 px-3 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] transition-all cursor-pointer"
                >
                  <option value="">All Sales Reps</option>
                  {salesReps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.fullName || rep.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#6C757D] uppercase tracking-wider">
                Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] transition-all cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="SENT">Sent to Customer</option>
                <option value="UNDER_NEGOTIATION">Under Negotiation</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={fetchQuotations}
              className="text-xs"
            >
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs bg-[#DC3545]/10 border border-[#DC3545]/30 text-[#DC3545] rounded-[6px]">
            {error}
          </div>
        )}

        {/* Data Table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-[#6C757D]">Loading quotations...</p>
          </div>
        ) : quotations.length === 0 ? (
          <Card className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-[#F3EEF2] text-[#714B67] flex items-center justify-center mx-auto mb-3 font-bold text-lg">
              📄
            </div>
            <h3 className="text-base font-semibold text-[#212529]">
              No quotations found
            </h3>
            <p className="text-xs text-[#6C757D] max-w-sm mx-auto mt-1 mb-4">
              {user?.role === "SALES_REP"
                ? "You have not authored any quotations matching these filters."
                : "No quotations matching the selected filter criteria."}
            </p>
            <Link href="/quotations/new">
              <Button variant="primary" size="sm">
                + Create Quotation
              </Button>
            </Link>
          </Card>
        ) : (
          <Table
            headers={[
              "Quote Number",
              "Customer",
              "Sales Rep",
              "Customer Tier",
              "Status",
              "Lines",
              "Grand Total",
              "Margin",
              "Worst Overage",
              "Created At",
            ]}
          >
            {quotations.map((q) => (
              <tr
                key={q.id}
                onClick={() => router.push(`/quotations/${q.id}`)}
                className="hover:bg-[#F8F9FA] transition-colors cursor-pointer"
              >
                <td className="py-3 px-4 font-semibold text-[#714B67]">
                  {q.quotationNumber}
                </td>
                <td className="py-3 px-4">
                  <div className="font-medium text-[#212529]">
                    {q.customer?.name}
                  </div>
                  <div className="text-[11px] text-[#6C757D]">
                    {q.customer?.contactEmail}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="font-medium text-xs text-[#212529]">
                    {q.salesRep?.fullName || "Unassigned"}
                  </div>
                  <div className="text-[11px] text-[#6C757D]">
                    {q.salesRep?.email}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <Badge
                    variant={tierColors[q.customerTier?.code] || "neutral"}
                    size="sm"
                  >
                    {q.customerTier?.name || q.customerTier?.code}
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <Badge
                    variant={statusColors[q.status] || "neutral"}
                    size="sm"
                  >
                    {q.status}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-xs text-[#6C757D]">
                  {q._count?.lines || 0} items
                </td>
                <td className="py-3 px-4 font-semibold text-[#212529]">
                  ₹{Number(q.grandTotal).toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`font-semibold text-xs ${
                      Number(q.marginPercent) < 15
                        ? "text-[#DC3545]"
                        : "text-[#28A745]"
                    }`}
                  >
                    {Number(q.marginPercent).toFixed(1)}%
                  </span>
                </td>
                <td className="py-3 px-4">
                  {Number(q.worstLineOverage) > 0 ? (
                    <Badge variant="danger" size="sm">
                      +{Number(q.worstLineOverage).toFixed(1)} pts
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm">
                      Compliant
                    </Badge>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-[#6C757D]">
                  {new Date(q.lastActivityAt || q.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </main>
    </div>
  );
}
