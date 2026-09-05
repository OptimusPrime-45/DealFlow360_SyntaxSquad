"use client";

import React from "react";

/**
 * Odoo-styled Enterprise Status Badge
 */
export const Badge = ({
  children,
  variant = "neutral",
  size = "md",
  className = "",
}) => {
  const variantStyles = {
    neutral: "bg-[#F3EEF2] text-[#714B67] border border-[#714B67]/20",
    success: "bg-[#28A745]/10 text-[#28A745] border border-[#28A745]/20",
    warning: "bg-[#F0AD00]/10 text-[#B78100] border border-[#F0AD00]/30",
    danger: "bg-[#DC3545]/10 text-[#DC3545] border border-[#DC3545]/20",
    info: "bg-[#17A2B8]/10 text-[#17A2B8] border border-[#17A2B8]/20",
    gray: "bg-[#F8F9FA] text-[#495057] border border-[#DEE2E6]",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px] font-medium",
    md: "px-2.5 py-1 text-xs font-medium",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[4px] uppercase tracking-wide ${variantStyles[variant] || variantStyles.neutral} ${sizeStyles[size]} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
};

export default Badge;
