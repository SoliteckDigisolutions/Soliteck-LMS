"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EmployeeReportCard } from "@/components/reports/EmployeeReportCard";
import { PdfDownloadButton } from "@/components/reports/PdfDownloadButton";
import { Page } from "@/components/ui/Page";
import { getEmployeeMonthlyReport } from "@/lib/data";

type EmployeeReport = Awaited<ReturnType<typeof getEmployeeMonthlyReport>>;

export default function EmployeeReportPage({
  params,
}: {
  params: Promise<{ monthKey: string; employeeCode: string }>;
}) {
  const resolvedParams = use(params);
  const monthKey = resolvedParams.monthKey;
  const employeeCode = decodeURIComponent(resolvedParams.employeeCode);

  const [mounted, setMounted] = useState(false);
  const [report, setReport] = useState<EmployeeReport>(null);

  useEffect(() => {
    setMounted(true);
    getEmployeeMonthlyReport(monthKey, employeeCode).then(setReport);
  }, [monthKey, employeeCode]);

  if (!mounted) {
    return (
      <Page
        eyebrow="Employee report"
        title="Loading Report…"
        description="Printable employee leave performance report."
      >
        <div className="flex h-64 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white">
          <p className="text-[13px] text-[#9ca3af]">Loading report data…</p>
        </div>
      </Page>
    );
  }

  if (!report) {
    return (
      <Page
        eyebrow="Employee report"
        title="Report Not Found"
        description="The requested employee record could not be found for this month in local storage."
        actions={
          <Link
            href={`/reports?month=${monthKey}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] transition hover:bg-[#f9fafb]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to reports
          </Link>
        }
      >
        <div className="rounded-lg border border-dashed border-[#e5e7eb] bg-white p-12 text-center">
          <p className="text-[14px] text-[#6b7280]">
            No employee report data exists for <span className="font-mono font-medium text-[#111827]">{employeeCode}</span> in month <span className="font-mono font-medium text-[#111827]">{monthKey}</span>.
          </p>
          <Link
            href="/reports"
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0070f3] hover:underline"
          >
            Return to employee listing
          </Link>
        </div>
      </Page>
    );
  }

  return (
    <Page
      eyebrow="Employee report"
      title={`${report.employee.employeeName} · ${report.summary.monthLabel}`}
      description="Printable employee leave performance report with weekly breakdown, detailed line preview, and direct PDF download."
      actions={
        <>
          <Link
            href={`/reports?month=${monthKey}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] transition hover:bg-[#f9fafb]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to reports
          </Link>
          <PdfDownloadButton
            targetId="employee-report-card"
            fileName={`${(report.employee.employeeName || report.employee.employeeCode).trim().replace(/[/\\?%*:|"<>]/g, "_")}.pdf`}
          />
        </>
      }
    >
      <EmployeeReportCard
        company={report.company}
        employee={report.employee}
        summary={report.summary}
        snapshot={report.snapshot}
        weeklyBreakdown={report.weeklyBreakdown}
        events={report.events}
      />
    </Page>
  );
}
