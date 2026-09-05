"use client";

/**
 * Shared building blocks for the admin configuration screens.
 * Small and unstyled-by-convention so each config page reads as a form and a
 * table rather than a wall of Tailwind.
 */

import React from "react";

/** Labelled text/number/select input. */
export const Field = ({
  label,
  hint,
  type = "text",
  value,
  onChange,
  options,
  placeholder,
  required = false,
  disabled = false,
  min,
  max,
  step,
  className = "",
}) => {
  const base =
    "w-full px-3 py-2 text-sm border border-[#DEE2E6] rounded-[6px] bg-white focus:outline-none focus:border-[#714B67] disabled:bg-[#F1F3F5]";

  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-[#495057] mb-1">
        {label} {required && <span className="text-[#DC3545]">*</span>}
      </span>

      {options ? (
        <select
          className={base}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "checkbox" ? (
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-[#714B67]"
        />
      ) : (
        <input
          className={base}
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          onChange={(e) =>
            onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
          }
        />
      )}

      {hint && <span className="block text-[11px] text-[#6C757D] mt-1">{hint}</span>}
    </label>
  );
};

/** Page header with a one-line explanation of what the setting governs. */
export const AdminHeader = ({ title, description, children }) => (
  <div className="flex items-start justify-between gap-6 mb-5">
    <div>
      <h1 className="text-xl font-bold text-[#212529]">{title}</h1>
      {description && <p className="text-sm text-[#6C757D] mt-1 max-w-2xl">{description}</p>}
    </div>
    {children}
  </div>
);

/** Inline success / error banners. */
export const Banners = ({ error, notice }) => (
  <>
    {error && (
      <div className="mb-4 bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3">
        {error}
      </div>
    )}
    {notice && (
      <div className="mb-4 bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3">
        {notice}
      </div>
    )}
  </>
);

/** Empty-state row for tables. */
export const EmptyRow = ({ colSpan, children }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-6 text-center text-xs text-[#6C757D]">
      {children}
    </td>
  </tr>
);

export default { Field, AdminHeader, Banners, EmptyRow };
