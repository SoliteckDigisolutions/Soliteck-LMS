import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  trend,
}: KpiCardProps) {
  return (
    <article className="group relative rounded-xl border border-[#ededed] bg-white p-5 transition-all duration-150 hover:border-[#d4d4d8]">
      {/* Header: Label & Micro Icon Container */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium tracking-[-0.01em] text-[#666666]">
          {label}
        </span>
        {icon && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#ededed] bg-[#fafafa] text-[#737373] transition-colors group-hover:border-[#e5e5e5] group-hover:text-[#171717]">
            <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
          </div>
        )}
      </div>

      {/* Main Metric Value */}
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-[26px] font-semibold tracking-[-0.03em] text-[#171717] tabular-nums">
          {value}
        </p>

        {trend && (
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
              trend.positive
                ? "bg-[#ecfdf5] text-[#059669] ring-1 ring-inset ring-[#a7f3d0]/40"
                : "bg-[#fef2f2] text-[#dc2626] ring-1 ring-inset ring-[#fecaca]/40"
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      {/* Footer Hint */}
      {hint && (
        <p className="mt-1 text-[12px] leading-normal text-[#8a8a8a]">
          {hint}
        </p>
      )}
    </article>
  );
}