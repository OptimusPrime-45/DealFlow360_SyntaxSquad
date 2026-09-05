"use client";

import React from "react";

/**
 * Odoo-styled Enterprise Button
 * Variants: primary (#714B67), secondary (white with border), danger (#DC3545), ghost
 */
export const Button = ({
  children,
  type = "button",
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className = "",
  onClick,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none rounded-[6px]";

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs h-8",
    md: "px-4 py-2 text-sm h-10",
    lg: "px-5 py-2.5 text-base h-11",
  };

  const variantStyles = {
    primary:
      "bg-[#714B67] hover:bg-[#5F3D56] active:bg-[#513349] text-white border border-[#714B67] focus:ring-[#714B67]/40 shadow-xs",
    secondary:
      "bg-white hover:bg-[#F8F9FA] active:bg-[#F1F2F3] text-[#212529] border border-[#DEE2E6] focus:ring-[#714B67]/20 shadow-xs",
    danger:
      "bg-[#DC3545] hover:bg-[#C82333] text-white border border-[#DC3545] focus:ring-[#DC3545]/30 shadow-xs",
    ghost:
      "bg-transparent hover:bg-[#F3EEF2] text-[#714B67] border border-transparent focus:ring-[#714B67]/20",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;
