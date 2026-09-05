"use client";

/**
 * Shared building blocks for the admin configuration screens.
 * Aligned strictly with DESIGN.md for typography, spacing, inputs, and hierarchy.
 */

import React from "react";
import Link from "next/link";

/**
 * Labelled text/number/select input per DESIGN.md §29 & §30.
 * Guarantees visible dark text (#212529), white background, and crisp focus rings.
 */
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
    "w-full h-10 px-3 text-sm border border-[#CED4DA] rounded-[6px] bg-white text-[#212529] placeholder:text-[#868E96] transition-all outline-none hover:border-[#ADB5BD] focus:border-[#714B67] focus:ring-2 focus:ring-[#F3EEF2] disabled:bg-[#F1F3F5] disabled:text-[#868E96] disabled:cursor-not-allowed";

  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-[#495057] mb-1.5 uppercase tracking-wider">
        {label} {required && <span className="text-[#DC3545]">*</span>}
      </span>

      {options ? (
        <select
          className={`${base} cursor-pointer`}
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
        <div className="flex items-center h-10">
          <input
            type="checkbox"
            checked={!!value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
          />
        </div>
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
            onChange(
              type === "number"
                ? e.target.value === ""
                  ? ""
                  : Number(e.target.value)
                : e.target.value
            )
          }
        />
      )}

      {hint && <span className="block text-[11px] text-[#6C757D] mt-1.5">{hint}</span>}
    </label>
  );
};

/**
 * Page header with breadcrumb, title, description, and action CTA per DESIGN.md §21.
 * Hierarchy: Breadcrumb → Page Title → Description → Actions
 */
export const AdminHeader = ({ title, description, section = "Backend Configuration", children }) => (
  <div className="mb-6">
    {/* Breadcrumb per DESIGN.md §21 */}
    <div className="flex items-center gap-2 text-xs text-[#6C757D] mb-1.5 font-medium">
      <Link href="/admin" className="hover:text-[#714B67] transition-colors">
        Admin
      </Link>
      <span className="text-[#CED4DA]">/</span>
      <span>{section}</span>
      <span className="text-[#CED4DA]">/</span>
      <span className="text-[#714B67] font-semibold">{title}</span>
    </div>

    {/* Title & Actions */}
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-[#212529] tracking-tight">{title}</h1>
        {description && (
          <p className="text-xs text-[#6C757D] mt-1 max-w-3xl leading-relaxed">{description}</p>
        )}
      </div>
      {children && <div className="shrink-0 flex items-center gap-3">{children}</div>}
    </div>
  </div>
);

/** Inline success / error banners per DESIGN.md §6 */
export const Banners = ({ error, notice }) => (
  <>
    {error && (
      <div className="mb-5 bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-xs font-medium rounded-[6px] px-4 py-3 shadow-xs">
        {error}
      </div>
    )}
    {notice && (
      <div className="mb-5 bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-xs font-medium rounded-[6px] px-4 py-3 shadow-xs">
        {notice}
      </div>
    )}
  </>
);

/** Empty-state row for tables per DESIGN.md §45 */
export const EmptyRow = ({ colSpan, children }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-8 text-center text-xs text-[#6C757D] bg-white">
      {children}
    </td>
  </tr>
);

export default { Field, AdminHeader, Banners, EmptyRow };
