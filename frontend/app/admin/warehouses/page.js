"use client";

/**
 * Warehouses & Multi-SKU Inventory Management — PDF §4-A4, §9 steps 1 and 5.
 *
 * Clearly partitioned into two primary operational domains:
 *   Part 1: Warehouse Registration & Pairwise Relational Transit Matrix
 *   Part 2: Multi-SKU Stock Updation & Inventory Management
 */

import React, { useState, useEffect, useCallback } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const EMPTY_WH = { code: "", name: "", address: "", shippingWeight: 1 };

export default function WarehousesPage() {
  const warehouses = useResource("/warehouses", "warehouses");
  const [activeTab, setActiveTab] = useState("hubs"); // 'hubs' | 'stock'
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [form, setForm] = useState(EMPTY_WH);
  const [pairWeights, setPairWeights] = useState({});
  const [shippingData, setShippingData] = useState({ warehouses: [], routes: [], matrix: {} });
  const [loadingWeights, setLoadingWeights] = useState(true);
  const [savingWeight, setSavingWeight] = useState(false);
  const [inlineEdit, setInlineEdit] = useState(null); // { fromId, toId, weight }

  // Part 2: Multi-SKU stock management state
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [whInventory, setWhInventory] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryEdits, setInventoryEdits] = useState({}); // { [productId]: { availableQty, reorderLevel } }
  const [savingBatch, setSavingBatch] = useState(false);
  const [searchSku, setSearchSku] = useState("");

  const loadStock = async () => {
    const [p, s] = await Promise.all([
      apiClient.get("/products").catch(() => ({ products: [] })),
      apiClient.get("/warehouses/stock/overview").catch(() => ({ stock: [] })),
    ]);
    setProducts(p.products || []);
    setStock(s.stock || []);
  };

  const loadShippingWeights = useCallback(async () => {
    try {
      setLoadingWeights(true);
      const data = await apiClient.get("/warehouses/shipping-weights");
      setShippingData(data || { warehouses: [], routes: [], matrix: {} });
    } catch (err) {
      console.error("Failed to load shipping weights:", err);
    } finally {
      setLoadingWeights(false);
    }
  }, []);

  const loadWarehouseInventory = useCallback(async (whId) => {
    if (!whId) return;
    try {
      setLoadingInventory(true);
      const data = await apiClient.get(`/warehouses/${whId}/inventory`);
      const inv = data?.data?.inventory || data?.inventory || [];
      setWhInventory(inv);
      // Initialize edit state with current available & reorder quantities
      const initialEdits = {};
      inv.forEach((item) => {
        initialEdits[item.productId] = {
          availableQty: item.availableQty,
          reorderLevel: item.reorderLevel,
        };
      });
      setInventoryEdits(initialEdits);
    } catch (err) {
      console.error("Failed to load warehouse inventory:", err);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    loadStock();
    loadShippingWeights();
  }, [loadShippingWeights]);

  // Set default selected warehouse for stock management
  useEffect(() => {
    if (warehouses.items.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses.items[0].id);
    }
  }, [warehouses.items, selectedWarehouseId]);

  // Load inventory when selected warehouse changes
  useEffect(() => {
    if (selectedWarehouseId) {
      loadWarehouseInventory(selectedWarehouseId);
    }
  }, [selectedWarehouseId, loadWarehouseInventory]);

  // Sync pairWeights keys with existing warehouses whenever warehouses change
  useEffect(() => {
    if (warehouses.items.length > 0) {
      setPairWeights((prev) => {
        const next = { ...prev };
        warehouses.items.forEach((w, idx) => {
          if (next[w.id] === undefined) {
            next[w.id] = Number((1.2 + (idx % 4) * 0.4).toFixed(1));
          }
        });
        return next;
      });
    }
  }, [warehouses.items]);

  // --- Part 1: Register Warehouse ---
  const createWarehouse = async (e) => {
    e.preventDefault();
    const ok = await warehouses.create(
      {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        address: form.address?.trim() || null,
        shippingWeight: Number(form.shippingWeight) || 1,
        pairWeights,
      },
      `Warehouse ${form.code} onboarded with ${Object.keys(pairWeights).length} inter-warehouse pair routes!`
    );
    if (ok) {
      setForm(EMPTY_WH);
      loadStock();
      loadShippingWeights();
    }
  };

  // --- Part 1: Update Pairwise Shipping Weight ---
  const handleUpdateWeight = async (fromWarehouseId, toWarehouseId, newWeight) => {
    const num = Number(newWeight);
    if (isNaN(num) || num < 0) return;
    try {
      setSavingWeight(true);
      await apiClient.put("/warehouses/shipping-weights", {
        fromWarehouseId,
        toWarehouseId,
        weight: num,
        bidirectional: true,
      });
      setInlineEdit(null);
      await loadShippingWeights();
    } catch (err) {
      warehouses.setError(err.message || "Failed to update shipping weight");
    } finally {
      setSavingWeight(false);
    }
  };

  // --- Part 2: Multi-SKU Stock Updates ---
  const handleStockQtyChange = (productId, field, value) => {
    const numVal = value === "" ? "" : Math.max(0, parseInt(value, 10) || 0);
    setInventoryEdits((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: numVal,
      },
    }));
  };

  const handleSaveSingleSku = async (item) => {
    const edit = inventoryEdits[item.productId];
    if (!edit) return;
    const ok = await warehouses.run(
      () =>
        apiClient.put(`/warehouses/${selectedWarehouseId}/inventory`, {
          productId: item.productId,
          availableQty: Number(edit.availableQty) || 0,
          reorderLevel: Number(edit.reorderLevel) || 0,
        }),
      `Stock updated for ${item.sku}`
    );
    if (ok) {
      loadStock();
      loadWarehouseInventory(selectedWarehouseId);
    }
  };

  const handleBatchSaveStock = async () => {
    if (!selectedWarehouseId) return;
    setSavingBatch(true);
    try {
      const itemsToUpdate = whInventory.map((item) => {
        const edit = inventoryEdits[item.productId];
        return {
          productId: item.productId,
          availableQty: Number(edit?.availableQty ?? item.availableQty) || 0,
          reorderLevel: Number(edit?.reorderLevel ?? item.reorderLevel) || 0,
        };
      });

      await apiClient.put(`/warehouses/${selectedWarehouseId}/inventory/batch`, {
        items: itemsToUpdate,
      });

      warehouses.setNotice(`Successfully updated stock levels for ${itemsToUpdate.length} SKUs!`);
      await loadStock();
      await loadWarehouseInventory(selectedWarehouseId);
    } catch (err) {
      warehouses.setError(err.message || "Failed to batch save stock levels");
    } finally {
      setSavingBatch(false);
    }
  };

  const matrixWarehouses = shippingData.warehouses || [];
  const matrix = shippingData.matrix || {};
  const currentWh = warehouses.items.find((w) => w.id === selectedWarehouseId);

  const filteredInventory = whInventory.filter((item) => {
    if (!searchSku.trim()) return true;
    const term = searchSku.toLowerCase();
    return (
      item.sku.toLowerCase().includes(term) ||
      item.name.toLowerCase().includes(term) ||
      item.category?.toLowerCase().includes(term)
    );
  });

  return (
    <>
      <AdminHeader
        section="Operations"
        title="Warehouses &amp; Inventory Hubs"
        description="Configure warehouse distribution centers, pairwise transit shipping weights, and manage multi-SKU physical stock levels."
      />
      <Banners error={warehouses.error} notice={warehouses.notice} />

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-[#DEE2E6] pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("hubs")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-[5px] cursor-pointer ${
            activeTab === "hubs"
              ? "border-[#714B67] text-[#714B67] bg-[#F3EEF2]/50 rounded-t-[6px]"
              : "border-transparent text-[#6C757D] hover:text-[#212529] hover:bg-white/60"
          }`}
        >
          <span>🏢 Part 1: Logistics Hubs &amp; Route Matrix</span>
          <Badge variant={activeTab === "hubs" ? "primary" : "neutral"} size="sm">
            {warehouses.items.length} Hubs
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("stock")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-[5px] cursor-pointer ${
            activeTab === "stock"
              ? "border-[#714B67] text-[#714B67] bg-[#F3EEF2]/50 rounded-t-[6px]"
              : "border-transparent text-[#6C757D] hover:text-[#212529] hover:bg-white/60"
          }`}
        >
          <span>📦 Part 2: Multi-SKU Stock Updation</span>
          <Badge variant={activeTab === "stock" ? "success" : "neutral"} size="sm">
            {products.length} Catalog SKUs
          </Badge>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LOGISTICS HUBS & ROUTE MATRIX                                      */}
      {/* ========================================================================= */}
      {activeTab === "hubs" && (
        <div className="space-y-6">
          {/* Onboarding Form */}
          <Card
            title="Register a Warehouse"
            subtitle="Register new distribution hub and configure its relation shipping weights to existing hubs"
          >
            <form onSubmit={createWarehouse} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <Field
                  label="Code"
                  required
                  placeholder="WH-PUNE"
                  value={form.code}
                  onChange={(v) => setForm((f) => ({ ...f, code: v }))}
                />
                <Field
                  label="Name"
                  required
                  placeholder="Pune Regional DC"
                  value={form.name}
                  onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                />
                <Field
                  label="Address"
                  placeholder="Hinjawadi, Pune"
                  value={form.address}
                  onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                  className="md:col-span-2"
                />
              </div>

              {/* Dynamic Pairwise Weights Section */}
              <div className="pt-3 border-t border-[#E9ECEF]">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs font-bold text-[#495057] uppercase tracking-wider">
                      ⚡ Inter-Warehouse Shipping Weights (Pairwise Relations)
                    </span>
                    <p className="text-xs text-[#6C757D] mt-0.5">
                      Define shipping effort/weight between <strong>{form.code || "the new warehouse"}</strong> and every existing warehouse in the network.
                    </p>
                  </div>
                  <span className="text-xs text-[#714B67] font-semibold">
                    {warehouses.items.length} existing hub{warehouses.items.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {warehouses.items.length === 0 ? (
                  <div className="p-4 bg-[#F8F9FA] rounded-[6px] border border-[#DEE2E6] text-xs text-[#6C757D]">
                    This is your primary warehouse. Once additional hubs are created, pairwise relation weights will be configured here.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {warehouses.items.map((w) => (
                      <div
                        key={w.id}
                        className="p-3 bg-[#F8F9FA] rounded-[6px] border border-[#DEE2E6] flex items-center justify-between shadow-xs"
                      >
                        <div>
                          <div className="text-xs font-bold text-[#212529] flex items-center gap-1.5">
                            <span className="text-[#714B67]">{form.code || "NEW"}</span>
                            <span className="text-[#ADB5BD]">⟷</span>
                            <span>{w.code}</span>
                          </div>
                          <div className="text-[11px] text-[#6C757D] truncate max-w-[140px]">{w.name}</div>
                        </div>
                        <div className="w-24">
                          <div className="text-[10px] text-[#6C757D] text-right mb-0.5">Weight:</div>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            className="w-full h-8 px-2 text-xs border border-[#CED4DA] rounded-[4px] bg-white text-[#212529] text-right font-medium focus:border-[#714B67] focus:outline-none"
                            value={pairWeights[w.id] ?? 1.5}
                            onChange={(e) => {
                              const val = e.target.value === "" ? "" : Number(e.target.value);
                              setPairWeights((p) => ({ ...p, [w.id]: val }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" size="sm" disabled={warehouses.busy}>
                  Register Warehouse &amp; Save Relations
                </Button>
              </div>
            </form>
          </Card>

          {/* Active Warehouses Table */}
          <Card title="Active Warehouses" subtitle="All operational distribution centers in the network">
            <Table headers={["Code", "Name", "Address", "Base Weight", "Connected Routes", "Stocked SKUs", "Actions"]}>
              {warehouses.items.length === 0 && !warehouses.loading && (
                <EmptyRow colSpan={7}>No warehouses configured. Orders cannot be allocated.</EmptyRow>
              )}
              {warehouses.items.map((w) => {
                const routeCount = w._count?.routesFrom ?? w.routesFrom?.length ?? 0;
                const skuCount = w._count?.inventory ?? w.inventory?.length ?? 0;
                return (
                  <tr key={w.id} className="border-t border-[#E9ECEF] hover:bg-[#F8F9FA]/40 transition">
                    <td className="px-4 py-3 font-mono font-semibold">
                      <Badge variant="info" size="sm">{w.code}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[#212529]">{w.name}</td>
                    <td className="px-4 py-3 text-sm text-[#6C757D]">{w.address || "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono text-[#6C757D]">
                      {Number(w.shippingWeight).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant={routeCount > 0 ? "success" : "warning"} size="sm">
                        {routeCount} active route{routeCount !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      <span className="text-[#714B67]">{skuCount}</span> SKUs
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setSelectedWarehouseId(w.id);
                            setActiveTab("stock");
                          }}
                        >
                          Manage Stock
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          className="text-xs"
                          disabled={warehouses.busy}
                          onClick={() =>
                            warehouses.remove(w.id, `Warehouse ${w.code} deleted`).then(() => {
                              loadStock();
                              loadShippingWeights();
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          {/* 2D Shipping Weight Matrix */}
          <Card
            title="Inter-Warehouse Shipping Weight Matrix"
            subtitle="Pairwise bidirectional transit weights between hubs. Click any cell to update."
          >
            {loadingWeights ? (
              <div className="p-8 text-center text-xs text-[#6C757D]">Loading shipping routes matrix...</div>
            ) : matrixWarehouses.length < 2 ? (
              <div className="p-6 text-center text-xs text-[#6C757D]">
                At least 2 warehouses are required to form an inter-warehouse transit matrix.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse border border-[#E9ECEF]">
                  <thead>
                    <tr className="bg-[#F8F9FA] text-[#495057] border-b border-[#DEE2E6]">
                      <th className="p-3 font-semibold border-r border-[#DEE2E6] bg-[#F1F3F5]">
                        Origin \ Destination
                      </th>
                      {matrixWarehouses.map((dest) => (
                        <th
                          key={dest.id}
                          className="p-3 font-semibold text-center border-r border-[#DEE2E6] last:border-r-0"
                        >
                          <div>{dest.code}</div>
                          <div className="text-[10px] font-normal text-[#6C757D] truncate max-w-[100px]">
                            {dest.name}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9ECEF]">
                    {matrixWarehouses.map((origin) => (
                      <tr key={origin.id} className="hover:bg-[#F8F9FA]/50 transition">
                        <td className="p-3 font-semibold text-[#212529] border-r border-[#DEE2E6] bg-[#F8F9FA]/70">
                          <div>{origin.code}</div>
                          <div className="text-[10px] font-normal text-[#6C757D] truncate max-w-[120px]">
                            {origin.name}
                          </div>
                        </td>
                        {matrixWarehouses.map((dest) => {
                          const isSelf = origin.id === dest.id;
                          const weight = matrix[origin.id]?.[dest.id];
                          const isEditing = inlineEdit?.fromId === origin.id && inlineEdit?.toId === dest.id;

                          if (isSelf) {
                            return (
                              <td
                                key={dest.id}
                                className="p-3 text-center border-r border-[#DEE2E6] last:border-r-0 bg-[#E9ECEF]/40 text-[#ADB5BD] font-mono"
                              >
                                —
                              </td>
                            );
                          }

                          return (
                            <td key={dest.id} className="p-2 text-center border-r border-[#DEE2E6] last:border-r-0">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    autoFocus
                                    defaultValue={weight ?? 1.5}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        handleUpdateWeight(origin.id, dest.id, e.target.value);
                                      if (e.key === "Escape") setInlineEdit(null);
                                    }}
                                    onBlur={(e) => handleUpdateWeight(origin.id, dest.id, e.target.value)}
                                    className="w-16 px-1.5 py-1 text-xs border border-[#714B67] rounded bg-white text-center font-bold focus:outline-none"
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setInlineEdit({ fromId: origin.id, toId: dest.id, weight })}
                                  disabled={savingWeight}
                                  className="px-2.5 py-1 rounded-[4px] hover:bg-[#F3EEF2] hover:text-[#714B67] transition font-mono font-semibold text-xs border border-transparent hover:border-[#714B67]/30 cursor-pointer"
                                  title="Click to edit shipping weight (bidirectional)"
                                >
                                  {weight !== null && weight !== undefined ? Number(weight).toFixed(2) : "1.00"}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[11px] text-[#6C757D] flex items-center justify-between">
                  <span>* Diagonal cells represent local warehouse storage. Clicking any off-diagonal cell updates the pair weight bidirectionally.</span>
                  <span className="font-semibold text-[#714B67]">{shippingData.routes?.length || 0} total directed routes</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MULTI-SKU STOCK UPDATION                                           */}
      {/* ========================================================================= */}
      {activeTab === "stock" && (
        <div className="space-y-6">
          {/* Warehouse Selector Bar */}
          <Card
            title="Multi-SKU Warehouse Stock Manager"
            subtitle="Every warehouse holds quantities for multiple product types (SKUs). Select a warehouse to inspect or update quantities."
          >
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs font-semibold text-[#495057] uppercase tracking-wider mr-2">
                Active Warehouse:
              </span>
              {warehouses.items.map((w) => {
                const isSelected = w.id === selectedWarehouseId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWarehouseId(w.id)}
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                      isSelected
                        ? "bg-[#714B67] text-white border-[#714B67] shadow-xs"
                        : "bg-white text-[#495057] border-[#CED4DA] hover:bg-[#F8F9FA]"
                    }`}
                  >
                    <span>{w.code}</span>
                    <span className="text-[11px] opacity-80 font-normal">({w.name})</span>
                  </button>
                );
              })}
            </div>

            {currentWh && (
              <div className="p-3 bg-[#F8F9FA] rounded-[6px] border border-[#DEE2E6] flex flex-wrap items-center justify-between text-xs text-[#495057] mb-4">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[#6C757D]">Selected DC:</span>{" "}
                    <strong className="text-[#212529] font-mono">{currentWh.code}</strong> — {currentWh.name}
                  </div>
                  <div>
                    <span className="text-[#6C757D]">Address:</span> {currentWh.address || "Local DC"}
                  </div>
                  <div>
                    <span className="text-[#6C757D]">Base Transit Weight:</span>{" "}
                    <span className="font-mono font-semibold">{Number(currentWh.shippingWeight).toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#714B67] font-semibold">
                  {whInventory.length} Catalog SKUs Available for Stocking
                </div>
              </div>
            )}

            {/* Filter and Action Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
              <div className="w-full sm:w-72">
                <input
                  type="text"
                  placeholder="Filter by SKU, name, or category..."
                  value={searchSku}
                  onChange={(e) => setSearchSku(e.target.value)}
                  className="w-full h-9 px-3 text-xs border border-[#CED4DA] rounded-[6px] bg-white text-[#212529] focus:border-[#714B67] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loadingInventory}
                  onClick={() => loadWarehouseInventory(selectedWarehouseId)}
                >
                  Refresh Stock
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={loadingInventory || savingBatch || !selectedWarehouseId}
                  onClick={handleBatchSaveStock}
                >
                  {savingBatch ? "Saving..." : "Save All Stock Levels"}
                </Button>
              </div>
            </div>

            {/* Multi-SKU Inventory Table */}
            {loadingInventory ? (
              <div className="p-8 text-center text-xs text-[#6C757D]">
                Loading multi-SKU inventory for {currentWh?.code || "warehouse"}...
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#6C757D]">
                No matching product SKUs found in the catalog.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E9ECEF] rounded-[6px]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8F9FA] text-[#495057] border-b border-[#DEE2E6]">
                      <th className="p-3 font-semibold">SKU</th>
                      <th className="p-3 font-semibold">Product Name</th>
                      <th className="p-3 font-semibold">Category</th>
                      <th className="p-3 font-semibold text-right">Physical Stock</th>
                      <th className="p-3 font-semibold text-right">Reserved</th>
                      <th className="p-3 font-semibold text-right">Sellable</th>
                      <th className="p-3 font-semibold text-right">Reorder Level</th>
                      <th className="p-3 font-semibold text-center">Status</th>
                      <th className="p-3 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9ECEF]">
                    {filteredInventory.map((item) => {
                      const edit = inventoryEdits[item.productId] || {
                        availableQty: item.availableQty,
                        reorderLevel: item.reorderLevel,
                      };
                      const sellable = Math.max(0, (Number(edit.availableQty) || 0) - item.reservedQty);
                      const isOutOfStock = sellable === 0;
                      const isLowStock = sellable > 0 && sellable <= (Number(edit.reorderLevel) || 0);

                      return (
                        <tr key={item.productId} className="hover:bg-[#F8F9FA]/60 transition">
                          <td className="p-3 font-mono font-bold text-[#212529]">
                            <Badge variant="neutral" size="sm">{item.sku}</Badge>
                          </td>
                          <td className="p-3 font-medium text-[#212529]">
                            {item.name}
                          </td>
                          <td className="p-3 text-[#6C757D]">
                            <span className="px-2 py-0.5 rounded bg-[#F1F3F5] text-[10px] font-medium text-[#495057]">
                              {item.category}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={edit.availableQty ?? 0}
                              onChange={(e) =>
                                handleStockQtyChange(item.productId, "availableQty", e.target.value)
                              }
                              className="w-20 h-8 px-2 text-xs border border-[#CED4DA] rounded-[4px] bg-white text-[#212529] text-right font-semibold focus:border-[#714B67] focus:outline-none"
                            />
                          </td>
                          <td className="p-3 text-right font-mono">
                            {item.reservedQty > 0 ? (
                              <span className="text-[#FD7E14] font-semibold">{item.reservedQty}</span>
                            ) : (
                              <span className="text-[#ADB5BD]">0</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            <span className={sellable > 0 ? "text-[#198754]" : "text-[#DC3545]"}>
                              {sellable}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={edit.reorderLevel ?? 0}
                              onChange={(e) =>
                                handleStockQtyChange(item.productId, "reorderLevel", e.target.value)
                              }
                              className="w-16 h-8 px-2 text-xs border border-[#CED4DA] rounded-[4px] bg-white text-[#212529] text-right focus:border-[#714B67] focus:outline-none"
                            />
                          </td>
                          <td className="p-3 text-center">
                            {isOutOfStock ? (
                              <Badge variant="danger" size="sm">Out of Stock</Badge>
                            ) : isLowStock ? (
                              <Badge variant="warning" size="sm">Low Stock</Badge>
                            ) : (
                              <Badge variant="success" size="sm">In Stock</Badge>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-[11px] px-2.5 py-1"
                              disabled={warehouses.busy}
                              onClick={() => handleSaveSingleSku(item)}
                            >
                              Save
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Network Stock Overview */}
          <Card
            title="Network Stock Overview (All Warehouses)"
            subtitle="Live summary of sellable inventory across all hubs (Sellable = Available − Reserved)"
            padding="p-0"
          >
            <div className="divide-y divide-[#E9ECEF]">
              {stock.length === 0 && (
                <p className="text-xs text-[#6C757D] p-4">No stock recorded yet.</p>
              )}
              {stock.map((s) => (
                <div key={s.sku} className="p-4 hover:bg-[#F8F9FA]/40 transition">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold text-[#212529] font-mono">{s.sku}</span>
                      <span className="text-xs text-[#6C757D] ml-2">{s.name}</span>
                    </div>
                    <span className="text-sm font-semibold">
                      <strong className="text-[#198754]">{s.totalAvailable}</strong> total sellable
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.warehouses.map((w) => (
                      <span
                        key={w.warehouseId}
                        className={`text-[11px] px-2.5 py-1 rounded-[4px] border ${
                          w.warehouseId === selectedWarehouseId
                            ? "bg-[#F3EEF2] border-[#714B67]/40 text-[#714B67] font-semibold"
                            : "bg-[#F8F9FA] border-[#E9ECEF] text-[#495057]"
                        }`}
                      >
                        {w.code}: <strong>{w.sellableQty}</strong>
                        {w.reservedQty > 0 && (
                          <span className="text-[#FD7E14]"> ({w.reservedQty} reserved)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
