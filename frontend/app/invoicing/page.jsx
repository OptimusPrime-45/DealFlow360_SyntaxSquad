'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import apiClient from '../../lib/apiClient.js';

/**
 * DealFlow360 — Invoicing & Payment Management Screen (Feature 3 / §9 Step 8)
 * 
 * Design System Compliance (DESIGN.md):
 * - Clean Odoo business application aesthetic
 * - Primary accent: Odoo Purple (#714B67)
 * - Soft neutral background (#f8f9fa), crisp white surfaces, clean borders
 * - Real-time financial summary KPIs (Invoiced, Collected, Outstanding)
 * - Interactive payment recording modal with real-time status projection
 *   (DRAFT -> POSTED -> PARTIALLY_PAID -> PAID)
 */

export default function InvoicingDashboardPage() {
  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================
  const [invoices, setInvoices] = useState([]);
  const [ordersAwaitingInvoice, setOrdersAwaitingInvoice] = useState([]);
  const [summary, setSummary] = useState({
    totalInvoiced: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    count: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Filtering state
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Modal state
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [transactionRef, setTransactionRef] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Invoice Detail Modal state
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Backend API URL (defaults to localhost:4000)
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Currency Formatter for Indian Rupees (₹)
  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(num);
  };

  // Date Formatter
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // ==========================================================================
  // DATA FETCHING: Load Invoices, Orders and Summary using Authenticated apiClient
  // ==========================================================================
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string based on active filters
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (typeFilter !== 'ALL') params.append('type', typeFilter);

      const endpoint = `/invoices${params.toString() ? `?${params.toString()}` : ''}`;
      const [invoiceData, ordersData] = await Promise.all([
        apiClient.get(endpoint),
        apiClient.get('/orders').catch(() => ({ orders: [] })),
      ]);

      setInvoices(invoiceData?.invoices || []);
      setSummary(invoiceData?.summary || {
        totalInvoiced: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        count: 0
      });

      const ordersList = ordersData?.orders || [];
      const awaiting = ordersList.filter((o) => (o.invoices || []).length === 0);
      setOrdersAwaitingInvoice(awaiting);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError(err.message || 'Failed to load invoices from server');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  // Load invoices on component mount or filter change
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // ==========================================================================
  // ACTION: Generate Invoices for an Order
  // ==========================================================================
  const handleGenerateInvoicesForOrder = async (orderId, orderNumber) => {
    try {
      setError(null);
      await apiClient.post(`/invoices/generate/${orderId}`, {});
      setNotification({
        type: 'success',
        message: `Invoices generated successfully for Order ${orderNumber}!`
      });
      fetchInvoices();
    } catch (err) {
      setError(err.message || 'Failed to generate invoices');
    }
  };

  // ==========================================================================
  // ACTION: Post Invoice (DRAFT -> POSTED)
  // ==========================================================================
  const handlePostInvoice = async (invoiceId, invoiceNumber) => {
    try {
      setError(null);
      await apiClient.post(`/invoices/${invoiceId}/post`, {});

      setNotification({
        type: 'success',
        message: `Invoice ${invoiceNumber} successfully posted for collection!`
      });

      // Refresh invoice list
      fetchInvoices();
    } catch (err) {
      setError(err.message || 'Failed to post invoice');
    }
  };

  // ==========================================================================
  // ACTION: Open Payment Modal
  // ==========================================================================
  const openPaymentModal = (invoice) => {
    setSelectedInvoiceForPayment(invoice);
    // Default the payment amount input to the exact remaining balance
    setPaymentAmount(invoice.balanceDue.toString());
    setPaymentMethod('BANK_TRANSFER');
    setTransactionRef(`TXN-${Date.now().toString().slice(-6)}`);
    setPaymentError(null);
  };

  const closePaymentModal = () => {
    setSelectedInvoiceForPayment(null);
    setPaymentAmount('');
    setPaymentError(null);
  };

  // ==========================================================================
  // ACTION: Submit Payment to Backend (POST /api/invoices/:id/payments)
  // ==========================================================================
  const handleRecordPaymentSubmit = async (e) => {
    e.preventDefault();

    if (!selectedInvoiceForPayment) return;

    const amountNum = parseFloat(paymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setPaymentError('Please enter a valid positive payment amount');
      return;
    }

    if (amountNum > selectedInvoiceForPayment.balanceDue + 0.01) {
      setPaymentError(
        `Amount cannot exceed the remaining balance of ${formatCurrency(selectedInvoiceForPayment.balanceDue)}`
      );
      return;
    }

    try {
      setSubmittingPayment(true);
      setPaymentError(null);

      const res = await apiClient.post(`/invoices/${selectedInvoiceForPayment.id}/payments`, {
        amount: amountNum,
        paymentMethod: paymentMethod,
        transactionReference: transactionRef.trim() || `PAY-${Date.now()}`
      });

      setNotification({
        type: 'success',
        message: res?.message || `Payment of ${formatCurrency(amountNum)} recorded successfully!`
      });

      closePaymentModal();
      fetchInvoices();
    } catch (err) {
      setPaymentError(err.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // ==========================================================================
  // ACTION: View Invoice Detail & Audit History
  // ==========================================================================
  const handleViewInvoiceDetail = async (invoiceId) => {
    try {
      setLoadingDetail(true);
      const data = await apiClient.get(`/invoices/${invoiceId}`);
      setSelectedInvoiceDetail(data);
    } catch (err) {
      setError(err.message || 'Failed to load invoice details');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filter invoices by search query (Invoice #, Customer Name, or Order #)
  const filteredInvoices = invoices.filter((inv) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(query) ||
      inv.customerName?.toLowerCase().includes(query) ||
      inv.orderNumber?.toLowerCase().includes(query)
    );
  });

  // Calculate projected new balance and status in Payment Modal
  const enteredAmountNum = parseFloat(paymentAmount) || 0;
  const projectedBalance = selectedInvoiceForPayment
    ? Math.max(0, selectedInvoiceForPayment.balanceDue - enteredAmountNum)
    : 0;
  const projectedStatus =
    projectedBalance <= 0.01
      ? 'PAID'
      : enteredAmountNum > 0
      ? 'PARTIALLY_PAID'
      : selectedInvoiceForPayment?.status;

  // ==========================================================================
  // HELPER: Render Status Badge with Odoo Theme Colors
  // ==========================================================================
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-gray-400"></span>
            Draft
          </span>
        );
      case 'POSTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-blue-500"></span>
            Posted / Unpaid
          </span>
        );
      case 'PARTIALLY_PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-300">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-500"></span>
            Partially Paid
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-300">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500"></span>
            Paid
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-300">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-rose-500"></span>
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#212529] font-sans antialiased">
      {/* ==================================================================== */}
      {/* Top Application Header (Odoo Purple Brand Bar) */}
      {/* ==================================================================== */}
      <header className="bg-[#714B67] text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Navigation Title */}
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-white/80 hover:text-white text-xs">
                ← Workspace
              </Link>
              <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center font-bold text-lg text-white">
                D
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">DealFlow360</h1>
                <p className="text-xs text-purple-200">Revenue & Invoicing Engine</p>
              </div>
            </div>

            {/* Navigation Links & Badges */}
            <div className="flex items-center space-x-3">
              <Link
                href="/orders"
                className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded transition"
              >
                Orders & Fulfillment
              </Link>
              <Link
                href="/quotations"
                className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded transition"
              >
                Quotations
              </Link>
              <button
                onClick={fetchInvoices}
                className="px-3 py-1.5 text-xs font-medium bg-white text-[#714B67] rounded hover:bg-purple-50 transition shadow-sm"
              >
                Refresh Data
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* ================================================================== */}
        {/* Alerts & Notifications */}
        {/* ================================================================== */}
        {notification && (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-rose-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-600 hover:text-rose-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* ================================================================== */}
        {/* KPI Dashboard Summary Cards */}
        {/* ================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Total Invoiced */}
          <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Invoiced</span>
              <span className="p-2 rounded bg-purple-50 text-[#714B67]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalInvoiced)}</div>
              <p className="text-xs text-gray-500 mt-1">{summary.count} Total Invoices Generated</p>
            </div>
          </div>

          {/* Card 2: Total Collected */}
          <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Collected</span>
              <span className="p-2 rounded bg-emerald-50 text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.totalCollected)}</div>
              <p className="text-xs text-gray-500 mt-1">Realized Cash Inflow</p>
            </div>
          </div>

          {/* Card 3: Total Outstanding */}
          <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding Balance</span>
              <span className="p-2 rounded bg-amber-50 text-amber-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-amber-600">{formatCurrency(summary.totalOutstanding)}</div>
              <p className="text-xs text-gray-500 mt-1">Pending Customer Collections</p>
            </div>
          </div>

          {/* Card 4: Collection Rate */}
          <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Collection Rate</span>
              <span className="p-2 rounded bg-blue-50 text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900">
                {summary.totalInvoiced > 0
                  ? `${Math.round((summary.totalCollected / summary.totalInvoiced) * 100)}%`
                  : '0%'}
              </div>
              <p className="text-xs text-gray-500 mt-1">Paid vs Invoiced Ratio</p>
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* Confirmed Orders Awaiting Invoices */}
        {/* ================================================================== */}
        {ordersAwaitingInvoice.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-sm font-bold text-amber-900">
                  {ordersAwaitingInvoice.length} Confirmed Deal(s) Awaiting Invoicing
                </h2>
              </div>
              <span className="text-xs text-amber-700">Orders confirmed without invoices generated</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ordersAwaitingInvoice.map((order) => (
                <div key={order.id} className="bg-white p-3.5 rounded border border-amber-200 flex items-center justify-between">
                  <div>
                    <Link href={`/orders/${order.id}`} className="text-xs font-bold text-[#714B67] hover:underline">
                      {order.orderNumber}
                    </Link>
                    <div className="text-[11px] text-gray-600">{order.customer?.name}</div>
                    <div className="text-xs font-semibold text-gray-900 mt-1">{formatCurrency(order.totalAmount)}</div>
                  </div>
                  <button
                    onClick={() => handleGenerateInvoicesForOrder(order.id, order.orderNumber)}
                    className="px-3 py-1.5 text-xs font-medium bg-[#714B67] text-white rounded hover:bg-[#593b51] transition shadow-xs"
                  >
                    Generate Invoices
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* Table Controls & Filter Toolbar */}
        {/* ================================================================== */}
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search Field */}
          <div className="w-full md:w-80 relative">
            <input
              type="text"
              placeholder="Search by Invoice #, Order, Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#714B67] focus:border-[#714B67]"
            />
            <svg
              className="w-4 h-4 text-gray-400 absolute left-3 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center space-x-3 w-full md:w-auto">
            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-gray-500">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#714B67]"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-gray-500">Type:</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#714B67]"
              >
                <option value="ALL">All Types</option>
                <option value="ONE_TIME">One-Time Sale</option>
                <option value="RECURRING">Subscription Schedule</option>
              </select>
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* Invoices List Table */}
        {/* ================================================================== */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Customer Invoices ({filteredInvoices.length})
            </h2>
            <span className="text-xs text-gray-500">
              PRD Spine: Step 8 Invoicing & Payment
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#714B67] border-t-transparent mb-3"></div>
              <p className="text-sm">Loading invoices from database...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No invoices found</h3>
              <p className="mt-1 text-xs text-gray-500">Try adjusting your filters or check back after confirming an order.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Invoice Number</th>
                    <th className="px-6 py-3">Customer & Order</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Total Amount</th>
                    <th className="px-6 py-3 text-right">Amount Paid</th>
                    <th className="px-6 py-3 text-right">Balance Due</th>
                    <th className="px-6 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50/80 transition">
                      {/* Invoice Number & Date */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-[#714B67] hover:underline cursor-pointer"
                          onClick={() => handleViewInvoiceDetail(inv.id)}
                        >
                          {inv.invoiceNumber}
                        </div>
                        <div className="text-xs text-gray-500">
                          Due: {formatDate(inv.dueDate)}
                        </div>
                      </td>

                      {/* Customer & Order */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{inv.customerName}</div>
                        <div className="text-xs text-gray-500">
                          Order: <span className="font-mono">{inv.orderNumber}</span>
                        </div>
                      </td>

                      {/* Invoice Type */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {inv.invoiceType === 'ONE_TIME' ? 'One-Time Sale' : 'Subscription'}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderStatusBadge(inv.status)}
                      </td>

                      {/* Total Amount */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900">
                        {formatCurrency(inv.totalAmount)}
                      </td>

                      {/* Amount Paid */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-emerald-600">
                        {formatCurrency(inv.amountPaid)}
                      </td>

                      {/* Balance Due */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-900">
                        {inv.balanceDue > 0 ? (
                          <span className="text-amber-600">{formatCurrency(inv.balanceDue)}</span>
                        ) : (
                          <span className="text-gray-400">₹0.00</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-6 py-4 whitespace-nowrap text-center space-x-2">
                        {inv.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePostInvoice(inv.id, inv.invoiceNumber)}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition shadow-sm"
                          >
                            Post Invoice
                          </button>
                        )}

                        {(inv.status === 'POSTED' || inv.status === 'PARTIALLY_PAID') && (
                          <button
                            onClick={() => openPaymentModal(inv)}
                            className="inline-flex items-center px-3 py-1 text-xs font-semibold text-white bg-[#714B67] hover:bg-[#5c3d54] rounded transition shadow-sm"
                          >
                            Record Payment
                          </button>
                        )}

                        {inv.status === 'PAID' && (
                          <span className="text-xs text-emerald-600 font-semibold px-2 py-1 bg-emerald-50 rounded border border-emerald-200">
                            ✓ Settled
                          </span>
                        )}

                        <button
                          onClick={() => handleViewInvoiceDetail(inv.id)}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ==================================================================== */}
      {/* MODAL 1: RECORD PAYMENT DIALOG */}
      {/* ==================================================================== */}
      {selectedInvoiceForPayment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden border border-gray-200 animate-scale-up">
            {/* Modal Header */}
            <div className="bg-[#714B67] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Record Customer Payment</h3>
                <p className="text-xs text-purple-200">
                  {selectedInvoiceForPayment.invoiceNumber} — {selectedInvoiceForPayment.customerName}
                </p>
              </div>
              <button
                onClick={closePaymentModal}
                className="text-purple-200 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRecordPaymentSubmit} className="p-6 space-y-4">
              {/* Financial Snapshot Card */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-gray-500 block">Total Due</span>
                  <span className="font-bold text-gray-900 text-sm">
                    {formatCurrency(selectedInvoiceForPayment.totalAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Already Paid</span>
                  <span className="font-bold text-emerald-600 text-sm">
                    {formatCurrency(selectedInvoiceForPayment.amountPaid)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Remaining</span>
                  <span className="font-bold text-amber-600 text-sm">
                    {formatCurrency(selectedInvoiceForPayment.balanceDue)}
                  </span>
                </div>
              </div>

              {/* Error Message inside Modal */}
              {paymentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
                  {paymentError}
                </div>
              )}

              {/* Payment Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Payment Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-500 text-sm font-semibold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={selectedInvoiceForPayment.balanceDue}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#714B67]"
                    placeholder="Enter amount"
                  />
                </div>
                {/* Quick Selection Buttons */}
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-xs text-gray-500">Quick set:</span>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(selectedInvoiceForPayment.balanceDue.toString())}
                    className="text-xs text-[#714B67] bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded font-medium"
                  >
                    Full Balance ({formatCurrency(selectedInvoiceForPayment.balanceDue)})
                  </button>
                  {selectedInvoiceForPayment.balanceDue > 100000 && (
                    <button
                      type="button"
                      onClick={() => setPaymentAmount('100000')}
                      className="text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded font-medium"
                    >
                      Partial ₹1,00,000
                    </button>
                  )}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#714B67]"
                >
                  <option value="BANK_TRANSFER">Bank Wire Transfer (NEFT / RTGS / IMPS)</option>
                  <option value="CARD">Corporate Credit / Debit Card</option>
                  <option value="CHEQUE">Cheque / Demand Draft</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              {/* Transaction Reference */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Transaction / UTR Reference
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="e.g. UTR-AXIS-992019"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#714B67]"
                />
              </div>

              {/* Live Preview of State Transition */}
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Resulting Status:</span>
                  <span className="font-semibold">{renderStatusBadge(projectedStatus)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-gray-600">New Balance Remaining:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(projectedBalance)}</span>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#714B67] hover:bg-[#5c3d54] rounded-md transition shadow-sm disabled:opacity-50"
                >
                  {submittingPayment ? 'Processing...' : 'Confirm & Post Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: INVOICE DETAIL & AUDIT HISTORY VIEW */}
      {/* ==================================================================== */}
      {selectedInvoiceDetail && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden border border-gray-200">
            {/* Header */}
            <div className="bg-[#714B67] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Invoice Details & History</h3>
                <p className="text-xs text-purple-200 font-mono">
                  {selectedInvoiceDetail.invoiceNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoiceDetail(null)}
                className="text-purple-200 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                <div>
                  <span className="text-gray-500 block">Customer</span>
                  <span className="font-semibold text-gray-900">{selectedInvoiceDetail.customer?.name}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Order</span>
                  <span className="font-semibold text-gray-900 font-mono">{selectedInvoiceDetail.orderNumber}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Status</span>
                  <div>{renderStatusBadge(selectedInvoiceDetail.status)}</div>
                </div>
                <div>
                  <span className="text-gray-500 block">Due Date</span>
                  <span className="font-semibold text-gray-900">{formatDate(selectedInvoiceDetail.dueDate)}</span>
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                  Invoice Items
                </h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 text-gray-500 font-semibold">
                      <tr>
                        <th className="px-4 py-2 text-left">Description</th>
                        <th className="px-4 py-2 text-center">Qty</th>
                        <th className="px-4 py-2 text-right">Unit Price</th>
                        <th className="px-4 py-2 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedInvoiceDetail.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{l.description}</td>
                          <td className="px-4 py-2.5 text-center text-gray-700">{l.quantity}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(l.unitPrice)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(l.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 text-xs font-semibold">
                      <tr>
                        <td colSpan="3" className="px-4 py-2 text-right text-gray-500">Subtotal:</td>
                        <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(selectedInvoiceDetail.subtotal)}</td>
                      </tr>
                      <tr>
                        <td colSpan="3" className="px-4 py-2 text-right text-gray-500">18% GST:</td>
                        <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(selectedInvoiceDetail.taxAmount)}</td>
                      </tr>
                      <tr className="border-t border-gray-200 font-bold">
                        <td colSpan="3" className="px-4 py-2.5 text-right text-gray-900">Total Invoiced:</td>
                        <td className="px-4 py-2.5 text-right text-gray-900">{formatCurrency(selectedInvoiceDetail.totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Payment History */}
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                  Payment History ({selectedInvoiceDetail.payments.length})
                </h4>
                {selectedInvoiceDetail.payments.length === 0 ? (
                  <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded border border-gray-200 text-center">
                    No payments have been recorded for this invoice yet.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50 text-gray-500 font-semibold">
                        <tr>
                          <th className="px-4 py-2 text-left">Paid At</th>
                          <th className="px-4 py-2 text-left">Method</th>
                          <th className="px-4 py-2 text-left">Reference</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {selectedInvoiceDetail.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="px-4 py-2.5 text-gray-700">{formatDate(p.paidAt)}</td>
                            <td className="px-4 py-2.5 text-gray-700">{p.paymentMethod}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-700">{p.transactionReference}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Close Button */}
              <div className="pt-4 flex justify-end border-t border-gray-200">
                <button
                  onClick={() => setSelectedInvoiceDetail(null)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#714B67] hover:bg-[#5c3d54] rounded-md transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
