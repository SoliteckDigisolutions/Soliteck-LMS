"use client";

import { useEffect, useMemo, useState, useTransition, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import type { ColDef } from "ag-grid-community";
import { Page } from "@/components/ui/Page";
import { EmployeeBalancesGrid } from "@/components/dashboard/EmployeeBalancesGrid";
import { BulkEmployeeReportsPdf } from "@/components/reports/BulkEmployeeReportsPdf";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { getMonthEvents, getMonthSummaries, getReportFilters } from "@/lib/data";
import type { EventRowInput } from "@/lib/leave/types";
import { formatDisplayDate } from "@/lib/utils";

type MonthFilter = { key: string; label: string };
type SummaryRow = Awaited<ReturnType<typeof getMonthSummaries>>[number];
type ViewMode = "monthly" | "yearly";

// ALL_MONTHS sentinel means "aggregate all months in the year"
const ALL_MONTHS_KEY = "__all__";

function ReportsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mounted, setMounted] = useState(false);
  const [months, setMonths] = useState<MonthFilter[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [events, setEvents] = useState<EventRowInput[]>([]);

  // view mode
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedYear, setSelectedYear] = useState<string>("");
  // which month inside the year to show; ALL_MONTHS_KEY = aggregate all
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(ALL_MONTHS_KEY);

  const eventColDefs = useMemo<ColDef<EventRowInput>[]>(() => {
    return [
      {
        field: "eventDate",
        headerName: "Date",
        width: 120,
        valueFormatter: (p) => formatDisplayDate(p.value),
        filter: "agTextColumnFilter",
        cellClass: "font-medium text-[#111827] flex items-center",
      },
      {
        field: "employeeName",
        headerName: "Employee",
        flex: 1.3,
        minWidth: 150,
        filter: "agTextColumnFilter",
        cellClass: "font-medium text-[#111827] flex items-center",
      },
      {
        field: "leaveCode",
        headerName: "Code",
        width: 90,
        filter: "agTextColumnFilter",
        cellRenderer: (p: { value: string }) => (
          <div className="flex items-center h-full">
            <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-800">
              {p.value}
            </span>
          </div>
        ),
      },
      {
        field: "leaveType",
        headerName: "Leave Type",
        flex: 1,
        minWidth: 130,
        filter: "agTextColumnFilter",
        cellClass: "text-[#374151] flex items-center",
      },
      {
        field: "reason",
        headerName: "Reason",
        flex: 1.5,
        minWidth: 160,
        valueFormatter: (p) => p.value || "—",
        filter: "agTextColumnFilter",
        cellClass: "text-[#6b7280] flex items-center",
      },
      {
        field: "leaveCode2",
        headerName: "Code 2",
        width: 95,
        valueFormatter: (p) => p.value || "—",
        filter: "agTextColumnFilter",
        cellRenderer: (p: { value?: string | null }) =>
          p.value ? (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                {p.value}
              </span>
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
      {
        field: "leaveType2",
        headerName: "Leave Type 2",
        flex: 1,
        minWidth: 130,
        valueFormatter: (p) => p.value || "—",
        filter: "agTextColumnFilter",
        cellClass: "text-[#374151] flex items-center",
      },
      {
        field: "reason2",
        headerName: "Reason 2",
        flex: 1.5,
        minWidth: 160,
        valueFormatter: (p) => p.value || "—",
        filter: "agTextColumnFilter",
        cellClass: "text-[#6b7280] flex items-center",
      },
      {
        field: "lateTime",
        headerName: "Late Time",
        width: 105,
        valueFormatter: (p) => p.value || "—",
        cellClass: "text-center flex items-center justify-center font-mono text-[12px]",
        headerClass: "ag-center-aligned-header",
      },
      {
        field: "lateMinutes",
        headerName: "Late Mins",
        width: 100,
        valueFormatter: (p) => (p.value ? `${p.value}m` : "0m"),
        cellClass: "text-center flex items-center justify-center",
        headerClass: "ag-center-aligned-header",
      },
      {
        field: "informedStatus",
        headerName: "Informed",
        width: 105,
        valueFormatter: (p) => p.value || "—",
        cellClass: "text-center flex items-center justify-center",
        headerClass: "ag-center-aligned-header",
      },
      {
        field: "weekLabel",
        headerName: "Week",
        width: 110,
        filter: "agTextColumnFilter",
        cellClass: "text-center flex items-center justify-center text-[#6b7280] text-[12px]",
        headerClass: "ag-center-aligned-header",
      },
    ];
  }, []);

  // Unique years derived from all imported months
  const years = useMemo(() => {
    const yearSet = new Set<string>();
    for (const m of months) {
      const yr = m.key.slice(0, 4);
      if (yr && /^\d{4}$/.test(yr)) yearSet.add(yr);
    }
    return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
  }, [months]);

  // Months that belong to the currently selected year
  const monthsInSelectedYear = useMemo(
    () => months.filter((m) => m.key.slice(0, 4) === selectedYear),
    [months, selectedYear],
  );

  // Aggregate all months in a year
  async function loadAllYearData(year: string, allMonths: MonthFilter[]) {
    const yearMonths = allMonths.filter((m) => m.key.slice(0, 4) === year);
    if (yearMonths.length === 0) {
      setSummaries([]);
      setEvents([]);
      return;
    }
    const [allSummaryArrays, allEventArrays] = await Promise.all([
      Promise.all(yearMonths.map((m) => getMonthSummaries(m.key))),
      Promise.all(yearMonths.map((m) => getMonthEvents(m.key))),
    ]);
    const summaryMap = new Map<string, SummaryRow>();
    for (const arr of allSummaryArrays) {
      for (const row of arr) {
        const existing = summaryMap.get(row.employeeCode);
        if (!existing) {
          summaryMap.set(row.employeeCode, { ...row, monthLabel: `Year ${year}` });
        } else {
          summaryMap.set(row.employeeCode, {
            ...existing,
            totalTaken: existing.totalTaken + row.totalTaken,
            lateMarks: existing.lateMarks + row.lateMarks,
            excessLeaves: existing.excessLeaves + row.excessLeaves,
            balanceLeaves: existing.balanceLeaves + row.balanceLeaves,
            monthLabel: `Year ${year}`,
          });
        }
      }
    }
    setSummaries(Array.from(summaryMap.values()));
    setEvents(allEventArrays.flat());
  }

  // Load a single month inside yearly view
  async function loadSingleYearMonth(monthKey: string) {
    const [s, e] = await Promise.all([
      getMonthSummaries(monthKey),
      getMonthEvents(monthKey),
    ]);
    setSummaries(s);
    setEvents(e);
  }

  useEffect(() => {
    setMounted(true);
    const paramMonth = searchParams.get("month");

    getReportFilters().then(({ months: filterMonths }) => {
      setMonths(filterMonths);
      const activeMonth = paramMonth || filterMonths[0]?.key || "";
      setSelectedMonth(activeMonth);
      const initialYear = activeMonth.slice(0, 4);
      if (/^\d{4}$/.test(initialYear)) setSelectedYear(initialYear);

      if (activeMonth) {
        getMonthSummaries(activeMonth).then(setSummaries);
        getMonthEvents(activeMonth).then(setEvents);
      } else {
        setSummaries([]);
        setEvents([]);
      }
    });

    function handleDataUpdate() {
      getReportFilters().then(({ months: filterMonths }) => {
        setMonths(filterMonths);
        const activeMonth = selectedMonth || filterMonths[0]?.key || "";
        setSelectedMonth(activeMonth);
        if (activeMonth) {
          getMonthSummaries(activeMonth).then(setSummaries);
          getMonthEvents(activeMonth).then(setEvents);
        } else {
          setSummaries([]);
          setEvents([]);
        }
      });
    }

    window.addEventListener("lms-data-updated", handleDataUpdate);
    return () => window.removeEventListener("lms-data-updated", handleDataUpdate);
  }, [searchParams, selectedMonth]);

  // Monthly mode: change month
  function handleMonthChange(newMonth: string) {
    setSelectedMonth(newMonth);
    startTransition(() => {
      router.push(`/reports?month=${encodeURIComponent(newMonth)}`);
    });
    if (newMonth) {
      getMonthSummaries(newMonth).then(setSummaries);
      getMonthEvents(newMonth).then(setEvents);
    } else {
      setSummaries([]);
      setEvents([]);
    }
  }

  // Yearly mode: change year -> reset to all months
  function handleYearChange(year: string) {
    setSelectedYear(year);
    setSelectedYearMonth(ALL_MONTHS_KEY);
    loadAllYearData(year, months);
  }

  // Yearly mode: change the month-within-year dropdown
  function handleYearMonthChange(monthKey: string) {
    setSelectedYearMonth(monthKey);
    if (monthKey === ALL_MONTHS_KEY) {
      loadAllYearData(selectedYear, months);
    } else {
      loadSingleYearMonth(monthKey);
    }
  }

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "monthly") {
      if (selectedMonth) {
        getMonthSummaries(selectedMonth).then(setSummaries);
        getMonthEvents(selectedMonth).then(setEvents);
      }
    } else {
      setSelectedYearMonth(ALL_MONTHS_KEY);
      loadAllYearData(selectedYear, months);
    }
  }

  // Section label
  const activeSummaryLabel =
    viewMode === "yearly"
      ? selectedYearMonth === ALL_MONTHS_KEY
        ? `${selectedYear} — All Months`
        : monthsInSelectedYear.find((m) => m.key === selectedYearMonth)?.label ?? selectedYearMonth
      : summaries[0]?.monthLabel ?? (months.length > 0 ? "Select a month" : "No data");
  const reportMonthKeys =
    viewMode === "monthly"
      ? selectedMonth
        ? [selectedMonth]
        : []
      : selectedYearMonth === ALL_MONTHS_KEY
        ? monthsInSelectedYear.map((month) => month.key)
        : selectedYearMonth
          ? [selectedYearMonth]
          : [];

  if (!mounted) {
    return (
      <Page
        eyebrow="Reports"
        title="Employee leave reports"
        description="Choose an imported month or year, review each employee's leave totals, and open the print-friendly report view for PDF generation."
      >
        <div className="flex h-64 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white">
          <p className="text-[13px] text-[#9ca3af]">Loading reports…</p>
        </div>
      </Page>
    );
  }

  return (
    <Page
      eyebrow="Reports"
      title="Employee leave reports"
      description="Choose an imported month or year, review each employee's leave totals, and open the print-friendly report view for PDF generation."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {months.length > 0 ? (
            <>
              {/* Period dropdown: Monthly or Yearly */}
              <div className="flex items-center gap-2">
                <label htmlFor="view-mode-select" className="text-[12.5px] font-medium text-[#4b5563]">
                  Period:
                </label>
                <select
                  id="view-mode-select"
                  value={viewMode}
                  onChange={(e) => handleViewModeChange(e.target.value as ViewMode)}
                  className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13.5px] font-semibold text-[#111827] shadow-sm outline-none transition hover:border-[#d1d5db] focus:border-[#0070f3] focus:ring-2 focus:ring-[#0070f3]/10"
                >
                  <option value="monthly">📅 Monthly View</option>
                  <option value="yearly">📆 Yearly View</option>
                </select>
              </div>

              {/* Monthly mode: Month chooser dropdown */}
              {viewMode === "monthly" && (
                <div className="flex items-center gap-2">
                  <label htmlFor="month-select" className="text-[12.5px] font-medium text-[#4b5563]">
                    Month:
                  </label>
                  <select
                    id="month-select"
                    value={selectedMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#111827] shadow-sm outline-none transition hover:border-[#d1d5db] focus:border-[#0070f3] focus:ring-2 focus:ring-[#0070f3]/10"
                  >
                    {months.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Yearly mode: Year dropdown + Month chooser dropdown */}
              {viewMode === "yearly" && (
                <>
                  <div className="flex items-center gap-2">
                    <label htmlFor="year-select" className="text-[12.5px] font-medium text-[#4b5563]">
                      Year:
                    </label>
                    <select
                      id="year-select"
                      value={selectedYear}
                      onChange={(e) => handleYearChange(e.target.value)}
                      className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#111827] shadow-sm outline-none transition hover:border-[#d1d5db] focus:border-[#0070f3] focus:ring-2 focus:ring-[#0070f3]/10"
                    >
                      {years.map((yr) => (
                        <option key={yr} value={yr}>
                          Year {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Option to choose which month is needed in dropdown */}
                  {monthsInSelectedYear.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label htmlFor="year-month-select" className="text-[12.5px] font-medium text-[#4b5563]">
                        Month:
                      </label>
                      <select
                        id="year-month-select"
                        value={selectedYearMonth}
                        onChange={(e) => handleYearMonthChange(e.target.value)}
                        className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#111827] shadow-sm outline-none transition hover:border-[#d1d5db] focus:border-[#0070f3] focus:ring-2 focus:ring-[#0070f3]/10"
                      >
                        <option value={ALL_MONTHS_KEY}>All Months (Full Year)</option>
                        {monthsInSelectedYear.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <Link
              href="/upload"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#111827] px-4 text-[13.5px] font-medium text-white shadow-sm transition hover:bg-[#1f2937]"
            >
              Upload workbook first
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-8">
        <section className="rounded-xl border border-[#e5e7eb] bg-white p-6 sm:p-7 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <div className="mb-5 flex flex-col gap-3 border-b border-[#f3f4f6] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
                {viewMode === "yearly"
                  ? selectedYearMonth === ALL_MONTHS_KEY
                    ? "Yearly employee summary"
                    : "Monthly employee listing"
                  : "Monthly employee listing"}
              </p>
              <h2 className="mt-1 text-[17px] font-semibold text-[#111827]">
                {activeSummaryLabel}
              </h2>
            </div>
            <BulkEmployeeReportsPdf
              summaries={summaries}
              monthKeys={reportMonthKeys}
              periodLabel={activeSummaryLabel}
            />
          </div>

          {/* Quick-switch month chips in Yearly view */}
          {viewMode === "yearly" && monthsInSelectedYear.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-lg bg-[#f9fafb] p-2.5 border border-[#f3f4f6]">
              <span className="text-[12px] font-medium text-[#6b7280] mr-1">Choose month:</span>
              <button
                type="button"
                onClick={() => handleYearMonthChange(ALL_MONTHS_KEY)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  selectedYearMonth === ALL_MONTHS_KEY
                    ? "bg-[#111827] text-white shadow-sm"
                    : "bg-white text-[#374151] border border-[#e5e7eb] hover:bg-[#f3f4f6]"
                }`}
              >
                All Months
              </button>
              {monthsInSelectedYear.map((m) => (
                <button
                  type="button"
                  key={m.key}
                  onClick={() => handleYearMonthChange(m.key)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                    selectedYearMonth === m.key
                      ? "bg-[#0070f3] text-white shadow-sm"
                      : "bg-white text-[#374151] border border-[#e5e7eb] hover:bg-[#f3f4f6]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <EmployeeBalancesGrid
            data={summaries}
            monthKey={
              viewMode === "monthly"
                ? (selectedMonth || null)
                : selectedYearMonth !== ALL_MONTHS_KEY
                  ? selectedYearMonth
                  : (monthsInSelectedYear[0]?.key || null)
            }
          />
        </section>

        <AgGridTable
          title="Detailed leave line preview"
          description={
            viewMode === "yearly"
              ? selectedYearMonth === ALL_MONTHS_KEY
                ? `All leave events for ${selectedYear} across ${monthsInSelectedYear.length} month(s).`
                : `Leave events for ${monthsInSelectedYear.find((m) => m.key === selectedYearMonth)?.label ?? selectedYearMonth}.`
              : "Interactive AG Grid of line-by-line leave or late-mark records parsed datewise from the Mark Leave sheet."
          }
          data={events}
          columnDefs={eventColDefs}
          pageSize={10}
          searchPlaceholder="Search by date, employee, leave type, reason..."
        />
      </div>
    </Page>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <Page
          eyebrow="Reports"
          title="Employee leave reports"
          description="Choose an imported month or year, review each employee's leave totals, and open the print-friendly report view for PDF generation."
        >
          <div className="flex h-64 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white">
            <p className="text-[13px] text-[#9ca3af]">Loading reports…</p>
          </div>
        </Page>
      }
    >
      <ReportsContent />
    </Suspense>
  );
}