"use client";

import React from "react";

/**
 * Odoo-styled Enterprise Card
 */
export const Card = ({
  children,
  title,
  subtitle,
  action,
  className = "",
  padding = "p-6",
}) => {
  return (
    <div
      className={`bg-white border border-[#DEE2E6] rounded-[8px] shadow-[0_2px_6px_rgba(0,0,0,0.05)] ${padding} ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E9ECEF]">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-[#212529]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-[#6C757D] mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
