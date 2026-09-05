"use client";

import React from "react";

/**
 * Odoo-styled Enterprise Data Table
 */
export const Table = ({ headers = [], children, className = "" }) => {
  return (
    <div
      className={`w-full overflow-x-auto bg-white border border-[#DEE2E6] rounded-[8px] shadow-xs ${className}`}
    >
      <table className="w-full text-left border-collapse">
        {headers.length > 0 && (
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E9ECEF]">
              {headers.map((h, idx) => (
                <th
                  key={idx}
                  className="py-2.5 px-4 text-xs font-semibold text-[#495057] uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-[#E9ECEF] text-sm text-[#212529]">
          {children}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
