"use client";

import React, { useState, useRef, useEffect } from "react";
import { Badge } from "./Badge.jsx";

/**
 * Odoo-Style Enterprise Control Panel
 * 
 * Provides an integrated Search Bar, Filter presets, Group By dimensions,
 * and active filter chips with B-Tree instant performance.
 */
export function OdooControlPanel({
  searchTerm = "",
  onSearchChange,
  placeholder = "Search by keyword, code, or name...",
  filterGroups = [],      // [{ label: 'Status', key: 'status', options: [{ label: 'Approved', value: 'APPROVED' }, ...] }]
  activeFilters = {},     // { status: ['APPROVED'], category: 'Hardware' }
  onFilterChange,
  groupByOptions = [],    // [{ label: 'Status', value: 'status' }, { label: 'Customer', value: 'customer.name' }]
  activeGroupBy = "",
  onGroupByChange,
  totalCount = 0,
  filteredCount = 0,
  onResetAll,
  className = "",
}) {
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);

  const filterRef = useRef(null);
  const groupRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterDropdownOpen(false);
      }
      if (groupRef.current && !groupRef.current.contains(e.target)) {
        setGroupDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Calculate active filter count
  const activeFilterCount = Object.values(activeFilters).reduce((acc, val) => {
    if (Array.isArray(val)) return acc + val.length;
    if (val && val !== "ALL") return acc + 1;
    return acc;
  }, 0);

  const handleFilterToggle = (groupKey, optionValue) => {
    const current = activeFilters[groupKey];
    let updated;
    if (Array.isArray(current)) {
      if (current.includes(optionValue)) {
        updated = current.filter((v) => v !== optionValue);
      } else {
        updated = [...current, optionValue];
      }
    } else {
      updated = current === optionValue ? "" : optionValue;
    }
    onFilterChange(groupKey, updated);
  };

  const removeFilterTag = (groupKey, valToRemove) => {
    const current = activeFilters[groupKey];
    if (Array.isArray(current)) {
      onFilterChange(groupKey, current.filter((v) => v !== valToRemove));
    } else {
      onFilterChange(groupKey, "");
    }
  };

  const hasAnyActiveFilters =
    Boolean(searchTerm) || activeFilterCount > 0 || Boolean(activeGroupBy);

  return (
    <div className={`space-y-3 bg-white border border-[#CED4DA] rounded-[8px] p-3 shadow-xs ${className}`}>
      {/* Top Bar: Search + Filter Dropdown + Group By Dropdown */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Unified Search Input with B-Tree Indicator */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6C757D]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="w-full h-10 pl-9 pr-9 text-xs sm:text-sm bg-[#F8F9FA] text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] focus:bg-white focus:ring-1 focus:ring-[#714B67] transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#6C757D] hover:text-[#212529] text-sm cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Controls Button Group */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Filters Dropdown */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => {
                setFilterDropdownOpen((prev) => !prev);
                setGroupDropdownOpen(false);
              }}
              className={`h-10 px-3.5 text-xs font-semibold rounded-[6px] border flex items-center gap-2 transition-all cursor-pointer ${
                activeFilterCount > 0
                  ? "bg-[#714B67]/10 border-[#714B67] text-[#714B67]"
                  : "bg-white border-[#CED4DA] text-[#495057] hover:bg-[#F8F9FA]"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#714B67] text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterDropdownOpen && (
              <div className="absolute right-0 sm:left-0 mt-1.5 w-64 bg-white rounded-[8px] shadow-xl border border-[#CED4DA] p-3 z-30 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-[#E9ECEF]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#495057]">
                    Filter Presets
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        Object.keys(activeFilters).forEach((k) => onFilterChange(k, Array.isArray(activeFilters[k]) ? [] : ""));
                      }}
                      className="text-[11px] text-[#DC3545] hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {filterGroups.map((grp) => (
                    <div key={grp.key} className="space-y-1.5">
                      <div className="text-[11px] font-bold text-[#6C757D] uppercase tracking-wider">
                        {grp.label}
                      </div>
                      <div className="space-y-1">
                        {grp.options.map((opt) => {
                          const isSelected = Array.isArray(activeFilters[grp.key])
                            ? activeFilters[grp.key]?.includes(opt.value)
                            : activeFilters[grp.key] === opt.value;
                          return (
                            <label
                              key={String(opt.value)}
                              className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#F8F9FA] cursor-pointer text-xs text-[#212529]"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(isSelected)}
                                onChange={() => handleFilterToggle(grp.key, opt.value)}
                                className="w-3.5 h-3.5 accent-[#714B67] rounded cursor-pointer"
                              />
                              <span className="flex-1 truncate">{opt.label}</span>
                              {opt.count !== undefined && (
                                <span className="text-[10px] text-[#6C757D]">({opt.count})</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Group By Dropdown */}
          <div className="relative" ref={groupRef}>
            <button
              type="button"
              onClick={() => {
                setGroupDropdownOpen((prev) => !prev);
                setFilterDropdownOpen(false);
              }}
              className={`h-10 px-3.5 text-xs font-semibold rounded-[6px] border flex items-center gap-2 transition-all cursor-pointer ${
                activeGroupBy
                  ? "bg-[#714B67]/10 border-[#714B67] text-[#714B67]"
                  : "bg-white border-[#CED4DA] text-[#495057] hover:bg-[#F8F9FA]"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span>Group By</span>
              {activeGroupBy && (
                <span className="text-[11px] font-bold text-[#714B67]">
                  ({groupByOptions.find((o) => o.value === activeGroupBy)?.label || activeGroupBy})
                </span>
              )}
            </button>

            {groupDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-[8px] shadow-xl border border-[#CED4DA] p-2.5 z-30 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6C757D] px-2 py-1 border-b border-[#E9ECEF] mb-1">
                  Group Records By
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onGroupByChange("");
                    setGroupDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${
                    !activeGroupBy ? "bg-[#714B67] text-white font-semibold" : "hover:bg-[#F8F9FA] text-[#212529]"
                  }`}
                >
                  <span>None (Flat View)</span>
                  {!activeGroupBy && <span>✓</span>}
                </button>
                {groupByOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onGroupByChange(opt.value);
                      setGroupDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${
                      activeGroupBy === opt.value
                        ? "bg-[#714B67] text-white font-semibold"
                        : "hover:bg-[#F8F9FA] text-[#212529]"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {activeGroupBy === opt.value && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Filter & Group Facet Chips Bar */}
      {hasAnyActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#E9ECEF] text-xs">
          <span className="text-[11px] font-semibold text-[#6C757D] uppercase mr-1">Active:</span>

          {searchTerm && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F8F9FA] text-[#212529] border border-[#CED4DA] text-xs">
              <span className="text-[#6C757D]">Search:</span>
              <strong className="font-semibold">"{searchTerm}"</strong>
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="hover:text-[#DC3545] ml-0.5 cursor-pointer font-bold"
              >
                ✕
              </button>
            </span>
          )}

          {activeGroupBy && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EBF5FB] text-[#1B4F72] border border-[#2980B9]/30 text-xs">
              <span className="text-[#2980B9]">Grouped by:</span>
              <strong className="font-semibold">
                {groupByOptions.find((o) => o.value === activeGroupBy)?.label || activeGroupBy}
              </strong>
              <button
                type="button"
                onClick={() => onGroupByChange("")}
                className="hover:text-[#DC3545] ml-0.5 cursor-pointer font-bold"
              >
                ✕
              </button>
            </span>
          )}

          {Object.entries(activeFilters).map(([grpKey, val]) => {
            const grp = filterGroups.find((g) => g.key === grpKey);
            if (!val || val === "ALL") return null;

            if (Array.isArray(val)) {
              return val.map((v) => {
                const opt = grp?.options.find((o) => o.value === v);
                return (
                  <span
                    key={`${grpKey}-${v}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F3EEF2] text-[#714B67] border border-[#714B67]/30 text-xs"
                  >
                    <span className="text-[#714B67]/70">{grp?.label || grpKey}:</span>
                    <strong className="font-semibold">{opt?.label || v}</strong>
                    <button
                      type="button"
                      onClick={() => removeFilterTag(grpKey, v)}
                      className="hover:text-[#DC3545] ml-0.5 cursor-pointer font-bold"
                    >
                      ✕
                    </button>
                  </span>
                );
              });
            }

            const opt = grp?.options.find((o) => o.value === val);
            return (
              <span
                key={grpKey}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F3EEF2] text-[#714B67] border border-[#714B67]/30 text-xs"
              >
                <span className="text-[#714B67]/70">{grp?.label || grpKey}:</span>
                <strong className="font-semibold">{opt?.label || val}</strong>
                <button
                  type="button"
                  onClick={() => removeFilterTag(grpKey, val)}
                  className="hover:text-[#DC3545] ml-0.5 cursor-pointer font-bold"
                >
                  ✕
                </button>
              </span>
            );
          })}

          {onResetAll && (
            <button
              type="button"
              onClick={onResetAll}
              className="text-[11px] text-[#DC3545] hover:underline font-semibold ml-auto cursor-pointer"
            >
              Reset All
            </button>
          )}
        </div>
      )}

      {/* Results Summary Bar */}
      <div className="flex items-center justify-between text-[11px] text-[#6C757D] pt-1">
        <div className="flex items-center gap-2">
          <span>
            Showing <strong className="text-[#212529] font-bold">{filteredCount}</strong> of {totalCount} records
          </span>
          
        </div>
      </div>
    </div>
  );
}

export default OdooControlPanel;
