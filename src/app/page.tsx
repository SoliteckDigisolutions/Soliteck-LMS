"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Clock3,
  FileText,
  UploadCloud,
  Users,
} from "lucide-react";
import { LeaveTrendChart } from "@/components/dashboard/LeaveTrendChart";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ResetDatasetButton } from "@/components/dashboard/ResetDatasetButton";
import { EmployeeBalancesGrid } from "@/components/dashboard/EmployeeBalancesGrid";
import { Page } from "@/components/ui/Page";
import { getDashboardData, getMonthSummaries } from "@/lib/data";
import { formatDisplayDate, formatMetric } from "@/lib/utils";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type SummaryItem = Awaited<ReturnType<typeof getMonthSummaries>>[number];

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [latestSummaries, setLatestSummaries] = useState<SummaryItem[]>([]);

  async function loadData() {
    const data = await getDashboardData();
    setDashboard(data);
    if (data.latestMonthKey) {
      const summaries = await getMonthSummaries(data.latestMonthKey);
      setLatestSummaries(summaries);
    } else {
      setLatestSummaries([]);
    }
  }

  useEffect(() => {
    setMounted(true);
    loadData();

    function handleUpdate() {
      loadData();
    }

    window.addEventListener("lms-data-updated", handleUpdate);
    return () => window.removeEventListener("lms-data-updated", handleUpdate);
  }, []);

  if (!mounted || !dashboard) {
    return (
      <Page
        eyebrow="Dashboard"
        title="Monthly Leave Report"
        description="Track imported monthly attendance files, understand leave trends, spot employees that need attention, and jump directly into printable employee reports."
      >
        <div className="flex h-64 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white">
          <p className="text-[13px] text-[#9ca3af]">Loading dashboard data from local storage…</p>
        </div>
      </Page>
    );
  }

  return (
    <Page
      eyebrow="Dashboard"
      title="Monthly Leave Report"
      description="Track imported monthly attendance files, understand leave trends, spot employees that need attention, and jump directly into printable employee reports."
      actions={
        <>
          <Link
            href="/upload"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#111827] px-4 text-[13.5px] font-medium text-white shadow-sm transition hover:bg-[#1f2937]"
          >
            <UploadCloud className="h-4 w-4" />
            Upload workbook
          </Link>
          <Link
            href="/reports"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-4 text-[13.5px] font-medium text-[#374151] shadow-sm transition hover:bg-[#f9fafb]"
          >
            <FileText className="h-4 w-4" />
            Open reports
          </Link>
          <ResetDatasetButton />
        </>
      }
    >
      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
        <KpiCard
          label="Employees"
          value={String(dashboard.stats.employees)}
          hint="In imported monthly summaries"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Leaves taken"
          value={formatMetric(dashboard.stats.totalLeavesTaken)}
          hint="Total units across all months"
          icon={<FileText className="h-4 w-4" />}
        />
        <KpiCard
          label="Late marks"
          value={formatMetric(dashboard.stats.totalLateMarks)}
          hint="Across all imported records"
          icon={<Clock3 className="h-4 w-4" />}
        />
        <KpiCard
          label="Needs attention"
          value={String(dashboard.stats.atRisk)}
          hint="Negative balance or excess leave"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </section>

      {/* Trend + Recent uploads */}
      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* Trend chart */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-6 sm:p-7 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                Monthly trend
              </p>
              <h2 className="mt-1 text-[16px] font-semibold text-[#111827]">
                Leave &amp; late-mark trend
              </h2>
            </div>
          </div>
          <div className="mt-5">
            <LeaveTrendChart data={dashboard.trend} />
          </div>
        </div>

        {/* Recent uploads */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-6 sm:p-7 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
            Recent imports
          </p>
          <h2 className="mt-1 text-[16px] font-semibold text-[#111827]">
            Latest workbooks
          </h2>

          <div className="mt-5 space-y-3">
            {dashboard.recentUploads.length > 0 ? (
              dashboard.recentUploads.map((upload) => (
                <div
                  key={upload.id}
                  className="group flex items-start justify-between gap-3.5 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 transition hover:border-[#d1d5db] hover:bg-white hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-[#111827]">
                      {upload.monthLabel}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-[#9ca3af]">
                      {upload.fileName}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11.5px] text-[#6b7280]">
                      <span>
                        {formatDisplayDate(upload.periodStart)} → {formatDisplayDate(upload.periodEnd)}
                      </span>
                      <span>·</span>
                      <span>{upload.summaryCount} employees</span>
                    </div>
                  </div>
                  <Link
                    href={`/reports?month=${upload.monthKey}`}
                    className="mt-0.5 flex-shrink-0 text-[#6b7280] transition group-hover:text-[#111827]"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#f9fafb] px-4 py-8 text-center">
                <p className="text-[13px] text-[#9ca3af]">No workbooks imported yet.</p>
                <Link
                  href="/upload"
                  className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[#111827] underline underline-offset-4"
                >
                  Upload your first file
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Latest month AG Grid table */}
      <section className="rounded-xl border border-[#e5e7eb] bg-white p-6 sm:p-7 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#f3f4f6] pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
              Latest month snapshot
            </p>
            <h2 className="mt-1 text-[17px] font-semibold text-[#111827]">
              {dashboard.latestMonthKey
                ? `Employee balances · ${latestSummaries[0]?.monthLabel ?? dashboard.latestMonthKey}`
                : "No imported month yet"}
            </h2>
          </div>
          {dashboard.latestMonthKey ? (
            <Link
              href={`/reports?month=${dashboard.latestMonthKey}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0070f3] transition hover:underline"
            >
              Full reports view <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <EmployeeBalancesGrid
          data={latestSummaries}
          monthKey={dashboard.latestMonthKey}
        />
      </section>
    </Page>
  );
}
