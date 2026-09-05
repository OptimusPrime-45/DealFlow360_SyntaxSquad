"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "./Badge.jsx";

/**
 * Enterprise Grouped & Selectable Table Component
 * 
 * Supports:
 * - Master checkbox with indeterminate state
 * - Row-level multi-select checkboxes
 * - Group By collapsible headers with aggregate calculations
 * - Group-level checkboxes
 */
export function GroupedTable({
  headers = [],             // [{ label: 'Name', key: 'name', className: '...' }, ...]
  data = [],                // Array of raw items
  getId = (item) => item.id,
  selectedIds = new Set(),  // Set or Array of selected IDs
  onToggleSelect,           // (id) => void
  onToggleSelectAll,        // (visibleIds) => void
  groupBy = "",             // Key to group by, e.g. 'status', 'category.name'
  renderRow,                // (item, isSelected) => JSX <tr>
  aggregateCols = [],       // [{ key: 'grandTotal', label: 'Sum', type: 'sum', formatter: (val) => val }]
  emptyMessage = "No records found matching current criteria.",
  className = "",
}) {
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const selectedSet = useMemo(() => {
    return selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  }, [selectedIds]);

  const visibleIds = useMemo(() => {
    return data.map(getId);
  }, [data, getId]);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedSet.has(id)) && !allVisibleSelected;

  const getNestedValue = (obj, path) => {
    if (!obj || !path) return undefined;
    return path.split(".").reduce((curr, p) => (curr ? curr[p] : undefined), obj);
  };

  // Group data if groupBy is specified
  const groupedData = useMemo(() => {
    if (!groupBy) return null;

    const groups = new Map();
    data.forEach((item) => {
      const rawVal = getNestedValue(item, groupBy);
      const groupKey =
        rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ""
          ? String(rawVal)
          : "Unspecified";

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(item);
    });

    return Array.from(groups.entries()).map(([key, items]) => {
      // Calculate aggregates
      const aggs = aggregateCols.map((col) => {
        let val = 0;
        if (col.type === "sum") {
          val = items.reduce((sum, item) => sum + (Number(getNestedValue(item, col.key)) || 0), 0);
        } else if (col.type === "avg") {
          const total = items.reduce((sum, item) => sum + (Number(getNestedValue(item, col.key)) || 0), 0);
          val = items.length ? total / items.length : 0;
        }
        return {
          label: col.label,
          val: col.formatter ? col.formatter(val) : val,
        };
      });

      return {
        groupKey,
        items,
        aggregates: aggs,
      };
    });
  }, [data, groupBy, aggregateCols]);

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const handleGroupSelectToggle = (items) => {
    if (!onToggleSelect) return;
    const itemIds = items.map(getId);
    const allGroupSelected = itemIds.every((id) => selectedSet.has(id));

    itemIds.forEach((id) => {
      if (allGroupSelected) {
        if (selectedSet.has(id)) onToggleSelect(id);
      } else {
        if (!selectedSet.has(id)) onToggleSelect(id);
      }
    });
  };

  return (
    <div className={`w-full overflow-x-auto bg-white border border-[#DEE2E6] rounded-[8px] shadow-xs ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#F8F9FA] border-b border-[#E9ECEF] text-xs font-semibold text-[#495057] uppercase tracking-wider">
            {onToggleSelect && (
              <th className="py-2.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someVisibleSelected;
                  }}
                  onChange={() => onToggleSelectAll && onToggleSelectAll(visibleIds)}
                  className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
                />
              </th>
            )}
            {headers.map((h, idx) => (
              <th
                key={idx}
                className={`py-2.5 px-4 ${h.className || ""}`}
              >
                {typeof h === "string" ? h : h.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-[#E9ECEF] text-sm text-[#212529]">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length + (onToggleSelect ? 1 : 0)}
                className="py-12 text-center text-xs text-[#6C757D]"
              >
                <div className="w-10 h-10 rounded-full bg-[#F8F9FA] border border-[#CED4DA] text-[#6C757D] flex items-center justify-center mx-auto mb-2 text-base">
                  🔍
                </div>
                {emptyMessage}
              </td>
            </tr>
          ) : !groupedData ? (
            // Flat List View
            data.map((item) => {
              const id = getId(item);
              const isSelected = selectedSet.has(id);
              return renderRow(item, isSelected, () => onToggleSelect && onToggleSelect(id));
            })
          ) : (
            // Grouped Collapsible View
            groupedData.map((group) => {
              const isCollapsed = collapsedGroups.has(group.groupKey);
              const groupItemIds = group.items.map(getId);
              const allGroupSelected =
                groupItemIds.length > 0 && groupItemIds.every((id) => selectedSet.has(id));
              const someGroupSelected =
                groupItemIds.some((id) => selectedSet.has(id)) && !allGroupSelected;

              return (
                <React.Fragment key={group.groupKey}>
                  {/* Group Header Row */}
                  <tr className="bg-[#F8F9FA] hover:bg-[#EDF2F7] border-t-2 border-b border-[#CED4DA] transition-colors">
                    {onToggleSelect && (
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          ref={(input) => {
                            if (input) input.indeterminate = someGroupSelected;
                          }}
                          onChange={() => handleGroupSelectToggle(group.items)}
                          className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
                        />
                      </td>
                    )}
                    <td
                      colSpan={headers.length}
                      className="py-2 px-4 cursor-pointer select-none"
                      onClick={() => toggleGroupCollapse(group.groupKey)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#714B67] font-bold w-4">
                            {isCollapsed ? "▶" : "▼"}
                          </span>
                          <span className="font-bold text-sm text-[#212529]">
                            {group.groupKey}
                          </span>
                          <Badge variant="neutral" size="sm">
                            {group.items.length} item{group.items.length === 1 ? "" : "s"}
                          </Badge>
                        </div>

                        {/* Aggregates */}
                        {group.aggregates.length > 0 && (
                          <div className="flex items-center gap-3 text-xs text-[#6C757D]">
                            {group.aggregates.map((agg, idx) => (
                              <span key={idx} className="flex items-center gap-1">
                                <span>{agg.label}:</span>
                                <strong className="text-[#212529] font-bold">{agg.val}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Group Children Rows (Hidden when collapsed) */}
                  {!isCollapsed &&
                    group.items.map((item) => {
                      const id = getId(item);
                      const isSelected = selectedSet.has(id);
                      return renderRow(item, isSelected, () => onToggleSelect && onToggleSelect(id));
                    })}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default GroupedTable;
