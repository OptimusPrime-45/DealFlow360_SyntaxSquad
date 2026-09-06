'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import apiClient from '../../lib/apiClient.js';
import { OdooControlPanel } from '../../components/ui/OdooControlPanel.jsx';
import { GroupedTable } from '../../components/ui/GroupedTable.jsx';
import { BatchActionBar } from '../../components/ui/BatchActionBar.jsx';
import { BTreeSearchIndex } from '../../lib/btree.js';
import { exportToCSV } from '../../lib/exportCsv.js';
import { AppShell, SidebarToggleButton } from '../../components/ui/index.js';

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
 * - B-Tree fast indexing, OdooControlPanel, Group By, Checkboxes, and CSV Export
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

  // Search, Filter & Group By State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState({
    status: [],
    invoiceType: [],
  });
  const [activeGroupBy, setActiveGroupBy] = useState('');

  // Multi-Select Checkboxes State
  const [selectedIds, setSelectedIds] = useState(new Set());

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

      const [invoiceData, ordersData] = await Promise.all([
        apiClient.get('/invoices'),
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
  }, []);

  // Load invoices on component mount
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
  // ACTION: Cancel / Void Invoice (DRAFT or POSTED with zero payment)
  // ==========================================================================
  const handleCancelSingleInvoice = async (invoiceId, invoiceNumber) => {
    const reason = prompt(`Enter reason for cancelling Invoice ${invoiceNumber}:`, 'Cancelled by administrator');
    if (reason === null) return;
    try {
      setError(null);
      await apiClient.post(`/invoices/${invoiceId}/cancel`, {
        reason: reason.trim() || 'Cancelled by administrator',
      });
      setNotification({
        type: 'success',
        message: `Invoice ${invoiceNumber} successfully cancelled!`,
      });
      fetchInvoices();
    } catch (err) {
      setError(err.message || 'Failed to cancel invoice');
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

  // B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex();
    invoices.forEach((inv) => {
      index.insertRecord(inv.id, {
        invoiceNumber: inv.invoiceNumber || '',
        customer: inv.customerName || '',
        order: inv.orderNumber || '',
        status: inv.status || '',
        invoiceType: inv.invoiceType || '',
      });
    });
    return index;
  }, [invoices]);

  // Filter invoices by B-Tree search query and active filters
  const filteredInvoices = useMemo(() => {
    let result = invoices;

    if (searchQuery.trim()) {
      const matchIds = btreeIndex.query(searchQuery.trim());
      result = result.filter((inv) => matchIds.has(inv.id));
    }

    if (activeFilters.status && activeFilters.status.length > 0) {
      const set = new Set(activeFilters.status);
      result = result.filter((inv) => set.has(inv.status));
    }

    if (activeFilters.invoiceType && activeFilters.invoiceType.length > 0) {
      const set = new Set(activeFilters.invoiceType);
      result = result.filter((inv) => set.has(inv.invoiceType));
    }

    return result;
  }, [invoices, searchQuery, activeFilters, btreeIndex]);

  // Selection Handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = (visibleIds) => {
    setSelectedIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Batch CSV Export
  const handleExportSelected = () => {
    const selectedRows = filteredInvoices.filter((inv) => selectedIds.has(inv.id));
    if (selectedRows.length === 0) return;

    exportToCSV(
      selectedRows,
      [
        { key: 'invoiceNumber', label: 'Invoice #' },
        { key: 'customerName', label: 'Customer' },
        { key: 'orderNumber', label: 'Order #' },
        { key: 'invoiceType', label: 'Type', formatter: (v) => (v === 'ONE_TIME' ? 'One-Time Sale' : 'Subscription') },
        { key: 'status', label: 'Status' },
        { key: 'totalAmount', label: 'Total Amount (₹)', formatter: (v) => Number(v || 0).toFixed(2) },
        { key: 'amountPaid', label: 'Amount Paid (₹)', formatter: (v) => Number(v || 0).toFixed(2) },
        { key: 'balanceDue', label: 'Balance Due (₹)', formatter: (v) => Number(v || 0).toFixed(2) },
        { key: 'dueDate', label: 'Due Date', formatter: (v) => (v ? new Date(v).toISOString().split('T')[0] : '') },
      ],
      `invoices_export_${new Date().toISOString().split('T')[0]}.csv`
    );
  };

  // Batch Post Draft Invoices
  const handleBatchPostInvoices = async () => {
    const selectedDrafts = filteredInvoices.filter(
      (inv) => selectedIds.has(inv.id) && inv.status === 'DRAFT'
    );
    if (selectedDrafts.length === 0) return;
    if (!confirm(`Post ${selectedDrafts.length} draft invoice(s) for collection?`)) return;

    try {
      setError(null);
      for (const inv of selectedDrafts) {
        await apiClient.post(`/invoices/${inv.id}/post`, {});
      }
      setNotification({
        type: 'success',
        message: `Successfully posted ${selectedDrafts.length} invoice(s) for collection!`,
      });
      setSelectedIds(new Set());
      await fetchInvoices();
    } catch (err) {
      setError(err.message || 'Failed to post selected invoices');
    }
  };

  const draftCount = useMemo(() => {
    return filteredInvoices.filter(
      (inv) => selectedIds.has(inv.id) && inv.status === 'DRAFT'
    ).length;
  }, [filteredInvoices, selectedIds]);

  // Batch Cancel / Void Invoices (DRAFT or POSTED with zero payment)
  const handleBatchCancelInvoices = async () => {
    const selectedCancellable = filteredInvoices.filter(
      (inv) =>
        selectedIds.has(inv.id) &&
        (inv.status === 'DRAFT' || (inv.status === 'POSTED' && Number(inv.amountPaid || 0) === 0))
    );
    if (selectedCancellable.length === 0) return;

    const reason = prompt(
      `Enter reason for cancelling/voiding ${selectedCancellable.length} invoice(s):`,
      'Cancelled by billing administrator'
    );
    if (reason === null) return;

    try {
      setError(null);
      for (const inv of selectedCancellable) {
        await apiClient.post(`/invoices/${inv.id}/cancel`, {
          reason: reason.trim() || 'Cancelled by billing administrator',
        });
      }
      setNotification({
        type: 'success',
        message: `Successfully cancelled ${selectedCancellable.length} invoice(s).`,
      });
      setSelectedIds(new Set());
      await fetchInvoices();
    } catch (err) {
      setError(err.message || 'Failed to cancel selected invoices');
    }
  };

  const cancellableCount = useMemo(() => {
    return filteredInvoices.filter(
      (inv) =>
        selectedIds.has(inv.id) &&
        (inv.status === 'DRAFT' || (inv.status === 'POSTED' && Number(inv.amountPaid || 0) === 0))
    ).length;
  }, [filteredInvoices, selectedIds]);

  // Control Panel Options
  const filterGroups = [
    {
      label: 'Invoice Status',
      key: 'status',
      options: [
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Posted / Unpaid', value: 'POSTED' },
        { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
        { label: 'Paid', value: 'PAID' },
        { label: 'Cancelled', value: 'CANCELLED' },
      ],
    },
    {
      label: 'Invoice Type',
      key: 'invoiceType',
      options: [
        { label: 'One-Time Sale', value: 'ONE_TIME' },
        { label: 'Subscription Schedule', value: 'RECURRING' },
      ],
    },
  ];

  const groupByOptions = [
    { label: 'Invoice Status', value: 'status' },
    { label: 'Invoice Type', value: 'invoiceType' },
    { label: 'None', value: '' },
  ];

  const tableHeaders = [
    { label: 'Invoice Number', key: 'invoiceNumber' },
    { label: 'Customer & Order', key: 'customerName' },
    { label: 'Type', key: 'invoiceType' },
    { label: 'Status', key: 'status' },
    { label: 'Total Amount', key: 'totalAmount', className: 'text-right' },
    { label: 'Amount Paid', key: 'amountPaid', className: 'text-right' },
    { label: 'Balance Due', key: 'balanceDue', className: 'text-right' },
    { label: 'Actions', key: 'actions', className: 'text-center' },
  ];

  const renderInvoiceRow = (inv, isSelected, toggleSelect) => (
    <tr
      key={inv.id}
      className={`hover:bg-[#F8F9FA] transition ${
        isSelected ? 'bg-purple-50/50' : ''
      }`}
    >
      <td className="py-3 px-3 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={toggleSelect}
          className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
        />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div
          className="font-semibold text-[#714B67] hover:underline cursor-pointer"
          onClick={() => handleViewInvoiceDetail(inv.id)}
        >
          {inv.invoiceNumber}
        </div>
        <div className="text-xs text-gray-500">
          Due: {formatDate(inv.dueDate)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="font-medium text-gray-900">{inv.customerName}</div>
        <div className="text-xs text-gray-500">
          Order: <span className="font-mono">{inv.orderNumber}</span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
          {inv.invoiceType === 'ONE_TIME' ? 'One-Time Sale' : 'Subscription'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {renderStatusBadge(inv.status)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900">
        {formatCurrency(inv.totalAmount)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-emerald-600">
        {formatCurrency(inv.amountPaid)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-900">
        {inv.balanceDue > 0 ? (
          <span className="text-amber-600">{formatCurrency(inv.balanceDue)}</span>
        ) : (
          <span className="text-gray-400">₹0.00</span>
        )}
      </td>
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
        {(inv.status === 'DRAFT' || (inv.status === 'POSTED' && Number(inv.amountPaid || 0) === 0)) && (
          <button
            onClick={() => handleCancelSingleInvoice(inv.id, inv.invoiceNumber)}
            className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition border border-red-200"
            title="Cancel invoice"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => handleViewInvoiceDetail(inv.id)}
          className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition"
        >
          View
        </button>
      </td>
    </tr>
  );

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
    <AppShell>
      {/* ==================================================================== */}
      {/* Top Application Header (Odoo Purple Brand Bar) */}
      {/* ==================================================================== */}
      <header className="bg-[#714B67] text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Navigation Title */}
            <div className="flex items-center space-x-4">
              <SidebarToggleButton className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white" />
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
        {/* Odoo Control Panel: Search, Filters & Group By */}
        {/* ================================================================== */}
        <OdooControlPanel
          searchTerm={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder="Search invoices by invoice #, customer, order #."
          filterGroups={filterGroups}
          activeFilters={activeFilters}
          onFilterChange={(key, val) => setActiveFilters((prev) => ({ ...prev, [key]: val }))}
          groupByOptions={groupByOptions}
          activeGroupBy={activeGroupBy}
          onGroupByChange={setActiveGroupBy}
          totalCount={invoices.length}
          filteredCount={filteredInvoices.length}
          onResetAll={() => {
            setSearchQuery('');
            setActiveFilters({ status: [], invoiceType: [] });
            setActiveGroupBy('');
          }}
        />

        {/* ================================================================== */}
        {/* Batch Action Bar */}
        {/* ================================================================== */}
        <BatchActionBar
          selectedCount={selectedIds.size}
          totalCount={filteredInvoices.length}
          onSelectAll={() => setSelectedIds(new Set(filteredInvoices.map((inv) => inv.id)))}
          onClearSelection={() => setSelectedIds(new Set())}
          actions={[
            ...(draftCount > 0
              ? [
                  {
                    label: `Post Selected (${draftCount})`,
                    icon: '✓',
                    onClick: handleBatchPostInvoices,
                    variant: 'primary',
                  },
                ]
              : []),
            ...(cancellableCount > 0
              ? [
                  {
                    label: `Cancel / Void (${cancellableCount})`,
                    icon: '✕',
                    onClick: handleBatchCancelInvoices,
                    variant: 'danger',
                  },
                ]
              : []),
            {
              label: 'Export Selected (CSV)',
              icon: '📥',
              onClick: handleExportSelected,
              variant: 'secondary',
            },
          ]}
        />

        {/* ================================================================== */}
        {/* Grouped & Selectable Invoices Table */}
        {/* ================================================================== */}
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#714B67] border-t-transparent mb-3"></div>
            <p className="text-sm">Loading invoices from database...</p>
          </div>
        ) : (
          <GroupedTable
            headers={tableHeaders}
            data={filteredInvoices}
            getId={(inv) => inv.id}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            groupBy={activeGroupBy}
            renderRow={renderInvoiceRow}
            aggregateCols={[
              {
                key: 'totalAmount',
                label: 'Total Invoiced',
                type: 'sum',
                formatter: (val) => formatCurrency(val),
              },
              {
                key: 'balanceDue',
                label: 'Total Due',
                type: 'sum',
                formatter: (val) => formatCurrency(val),
              },
            ]}
            emptyMessage="No invoices found matching current search or filter criteria."
          />
        )}
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
                    className="w-full pl-8 pr-4 py-2 bg-white text-[#212529] border border-[#CED4DA] rounded-md text-sm font-medium placeholder:text-[#868E96] focus:outline-none focus:ring-2 focus:ring-[#714B67]"
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
                  className="w-full px-3 py-2 border border-[#CED4DA] rounded-md text-sm bg-white text-[#212529] focus:outline-none focus:ring-2 focus:ring-[#714B67]"
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
                  className="w-full px-3 py-2 border border-[#CED4DA] rounded-md text-sm font-mono bg-white text-[#212529] placeholder:text-[#868E96] focus:outline-none focus:ring-2 focus:ring-[#714B67]"
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
    </AppShell>
  );
}

