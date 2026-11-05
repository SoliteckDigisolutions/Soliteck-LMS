"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Building2, FileSpreadsheet, FileText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredSettings } from "@/lib/storage";

const navigation = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/upload", label: "Upload", icon: FileSpreadsheet },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/department-leaves", label: "Dept Leaves", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  children,
  company,
}: {
  children: ReactNode;
  company?: {
    companyName?: string;
    companyLogoUrl?: string | null;
  };
}) {
  const pathname = usePathname();
  const [companyInfo, setCompanyInfo] = useState({
    companyName: company?.companyName || "Leave Manager",
    companyLogoUrl: company?.companyLogoUrl || null,
  });

  useEffect(() => {
    const stored = getStoredSettings();
    setCompanyInfo({
      companyName: stored.companyName || company?.companyName || "Leave Manager",
      companyLogoUrl: stored.companyLogoUrl ?? company?.companyLogoUrl ?? null,
    });
  }, [company?.companyName, company?.companyLogoUrl]);

  useEffect(() => {
    function handleUpdate(e: Event) {
      const custom = e as CustomEvent<{ companyName: string; companyLogoUrl: string | null }>;
      if (custom.detail) {
        setCompanyInfo({
          companyName: custom.detail.companyName || "Leave Manager",
          companyLogoUrl: custom.detail.companyLogoUrl || null,
        });
      }
    }

    window.addEventListener("company-settings-updated", handleUpdate);
    return () => window.removeEventListener("company-settings-updated", handleUpdate);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#f9fafb]">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[#e5e7eb] bg-white">
        {/* Logo & Company Name */}
        <div className="flex h-14 items-center gap-2.5 border-b border-[#e5e7eb] px-5">
          {companyInfo.companyLogoUrl ? (
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-[#e5e7eb] bg-white p-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={companyInfo.companyLogoUrl}
                alt={companyInfo.companyName}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-black text-[11px] font-bold text-white">
              {companyInfo.companyName ? companyInfo.companyName.charAt(0).toUpperCase() : "L"}
            </div>
          )}
          <span className="truncate text-sm font-semibold tracking-tight text-[#111827]">
            {companyInfo.companyName || "Leave Manager"}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-5">
          <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
            Navigation
          </p>
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-all",
                    active
                      ? "bg-[#f3f4f6] text-[#111827] shadow-sm"
                      : "text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#111827]",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      active ? "text-[#111827]" : "text-[#9ca3af]",
                    )}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#111827]" />
                  )}
                </Link>
              );
            })}
          </div>

          <div className="my-6 px-2">
            <div className="h-px bg-[#e5e7eb]" />
          </div>

          <div className="px-2">
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
              Workflow
            </p>
            <ol className="space-y-3 text-[12.5px] leading-5 text-[#6b7280]">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#374151]">1</span>
                Upload monthly workbook
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#374151]">2</span>
                Review parsed preview
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#374151]">3</span>
                Import &amp; open reports
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-bold text-[#374151]">4</span>
                Download PDF
              </li>
            </ol>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-[#e5e7eb] px-5 py-3.5">
          <p className="text-[11px] text-[#9ca3af]">HR Command Center · v1</p>
        </div>
      </aside>

      {/* ── Main content area ────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-[#e5e7eb] bg-white px-8 lg:px-10">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2.5 text-[13px] text-[#6b7280]">
              {navigation.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                if (!active) return null;
                return (
                  <span key={item.href} className="font-semibold text-[#111827]">
                    {item.label}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3.5 py-1 text-[11px] font-medium text-[#6b7280]">
                Next.js · SQLite · Drizzle
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
