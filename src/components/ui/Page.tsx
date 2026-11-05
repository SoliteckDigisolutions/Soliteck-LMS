import type { ReactNode } from "react";

export function Page({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-7 sm:space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
            {eyebrow}
          </p>
          <h1 className="mt-1.5 text-[24px] font-semibold tracking-tight text-[#111827]">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-[#6b7280]">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-3">{actions}</div>
        ) : null}
      </div>

      {/* Separator */}
      <div className="h-px bg-[#e5e7eb]" />

      <div className="space-y-7 sm:space-y-8">{children}</div>
    </div>
  );
}

