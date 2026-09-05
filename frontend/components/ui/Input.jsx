"use client";

import React from "react";

/**
 * Odoo-styled Enterprise Form Input
 */
export const Input = ({
  label,
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
  className = "",
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-[#495057] uppercase tracking-wider"
        >
          {label} {required && <span className="text-[#DC3545]">*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className={`w-full h-10 px-3 text-sm bg-white text-[#212529] border rounded-[6px] transition-all outline-none placeholder:text-[#868E96] disabled:bg-[#F1F3F5] disabled:text-[#868E96] disabled:cursor-not-allowed ${
          error
            ? "border-[#DC3545] focus:border-[#DC3545] focus:ring-2 focus:ring-[#DC3545]/20"
            : "border-[#CED4DA] hover:border-[#ADB5BD] focus:border-[#714B67] focus:ring-2 focus:ring-[#F3EEF2]"
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-[#DC3545] mt-0.5">{error}</p>}
      {!error && helperText && (
        <p className="text-xs text-[#6C757D] mt-0.5">{helperText}</p>
      )}
    </div>
  );
};

export default Input;
