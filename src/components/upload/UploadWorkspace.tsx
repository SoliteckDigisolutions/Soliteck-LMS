"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Upload,
} from "lucide-react";
import type { ColDef } from "ag-grid-community";
import { parseWorkbook } from "@/lib/leave/parser";
import { deleteMonthData, importParsedWorkbook } from "@/lib/storage";
import type { ParsedWorkbook, SummaryRowInput, EventRowInput, EmployeeProfileInput } from "@/lib/leave/types";
import { formatDisplayDate, formatMetric } from "@/lib/utils";
import { AgGridTable } from "@/components/ui/AgGridTable";

export function UploadWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [restoredFileName, setRestoredFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedWorkbook | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importedMonthKey, setImportedMonthKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Hydrate state from localStorage on mount (Safe for Next.js SSR)
  useEffect(() => {
    const saved = localStorage.getItem("upload_workspace_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.preview) setPreview(parsed.preview);
        if (parsed.message) setMessage(parsed.message);
        if (parsed.importedMonthKey) setImportedMonthKey(parsed.importedMonthKey);
        if (parsed.fileName) setRestoredFileName(parsed.fileName);
      } catch (e) {
        console.error("Failed to restore upload session:", e);
      }
    }
  }, []);

  // 2. Automatically backup state to localStorage on changes
  useEffect(() => {
    const stateToSave = {
      preview,
      message,
      importedMonthKey,
      fileName: file ? file.name : restoredFileName,
    };
    localStorage.setItem("upload_workspace_state", JSON.stringify(stateToSave));
  }, [preview, message, importedMonthKey, file, restoredFileName]);

  const counts = useMemo(
    () => ({
      employees: preview?.summaries.length ?? 0,
      eventLines: preview?.events.length ?? 0,
      sheets: preview?.sheetNames.length ?? 0,
    }),
    [preview],
  );

  async function handlePreviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      if (restoredFileName) {
        setError("Please choose a new file first if you wish to re-parse.");
      } else {
        setError("Please choose the monthly workbook first.");
      }
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setImportedMonthKey(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbook(file.name, buffer);

      setPreview(parsed);
      setRestoredFileName(file.name);
      setMessage(
        "Workbook parsed successfully. Review the AG Grid previews below, then click 'Import this month'.",
      );
    } catch (caughtError) {
      setPreview(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The workbook could not be parsed. Please verify the monthly file format.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview) {
      return;
    }

    setImporting(true);
    setError(null);
    setMessage(null);

    try {
      const result = importParsedWorkbook(preview);
      setMessage(result.message);
      setImportedMonthKey(result.monthKey);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Import to local storage failed.",
      );
    } finally {
      setImporting(false);
    }
  }

  // Clear session workspace and delete current data from storage
  function handleReset() {
    const monthToDelete = importedMonthKey || preview?.monthKey;
    if (monthToDelete) {
      deleteMonthData(monthToDelete);
    }
    setFile(null);
    setRestoredFileName(null);
    setPreview(null);
    setImportedMonthKey(null);
    setError(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("upload_workspace_state");
    }
    setMessage("Current data and workspace have been reset and removed.");
  }

  // ── Column Definitions for Summary AG Grid ────────────────────────
  const summaryColDefs = useMemo<ColDef<SummaryRowInput>[]>(() => {
    return [
      {
        field: "employeeCode",
        headerName: "Emp ID",
        width: 110,
        filter: "agTextColumnFilter",
        cellClass: "font-mono text-[12px] text-gray-500 flex items-center",
      },
      {
        field: "employeeName",
        headerName: "Employee Name",
        flex: 1.5,
        minWidth: 160,
        filter: "agTextColumnFilter",
        cellClass: "font-medium text-[#111827] flex items-center",
      },
      {
        field: "department",
        headerName: "Department",
        flex: 1,
        minWidth: 120,
        filter: "agTextColumnFilter",
        cellClass: "text-[#6b7280] flex items-center",
      },
      {
        field: "approvedPaidLeave",
        headerName: "PL",
        width: 80,
        valueFormatter: (p) => formatMetric(p.value),
        cellClass: "text-right flex items-center justify-end",
        headerClass: "ag-right-aligned-header",
      },
      {
        field: "sickLeave",
        headerName: "SL",
        width: 80,
        valueFormatter: (p) => formatMetric(p.value),
        cellClass: "text-right flex items-center justify-end",
        headerClass: "ag-right-aligned-header",
      },
      // {
      //   field: "approvedLeaveWithoutPay",
      //   headerName: "LWP",
      //   width: 85,
      //   valueFormatter: (p) => formatMetric(p.value),
      //   cellClass: "text-right flex items-center justify-end",
      //   headerClass: "ag-right-aligned-header",
      // },
      // {
      //   field: "unapprovedLeaveWithoutPay",
      //   headerName: "ULWP",
      //   width: 90,
      //   valueFormatter: (p) => formatMetric(p.value),
      //   cellClass: "text-right flex items-center justify-end",
      //   headerClass: "ag-right-aligned-header",
      // },
      {
        field: "halfDay",
        headerName: "HD",
        width: 80,
        valueFormatter: (p) => formatMetric(p.value),
        cellClass: "text-right flex items-center justify-end",
        headerClass: "ag-right-aligned-header",
      },
      {
        field: "lateMark",
        headerName: "LM",
        width: 80,
        valueFormatter: (p) => formatMetric(p.value),
        cellClass: "text-right flex items-center justify-end",
        headerClass: "ag-right-aligned-header",
      },
      {
        field: "lateMarkWaived",
        headerName: "LMW",
        width: 85,
        valueFormatter: (p) => formatMetric(p.value),
        cellClass: "text-right flex items-center justify-end",
        headerClass: "ag-right-aligned-header",
      },
      {
        field: "totalTaken",
        headerName: "Taken",
        width: 95,
        valueFormatter: (p) => formatMetric(p.value),
        cellClass: "font-semibold text-[#111827] text-right flex items-center justify-end",
        headerClass: "ag-right-aligned-header",
      },
      {
        field: "totalBalanceLeaves",
        headerName: "Balance",
        width: 95,
        valueFormatter: (p) => (p.value === null ? "—" : formatMetric(p.value)),
        cellClass: "text-right flex items-center justify-end font-medium text-emerald-700",
        headerClass: "ag-right-aligned-header",
      },
      {
        headerName: "Closing Bal.",
        width: 110,
        filter: "agNumberColumnFilter",
        // Formula: Balance (totalBalanceLeaves) - Taken (totalTaken)
        valueGetter: (params) => {
          if (!params.data) return 0;
          const balance = Number(params.data.totalBalanceLeaves ?? 0);
          const taken = Number(params.data.totalTaken ?? 0);
          return balance - taken;
        },
        cellRenderer: (p: { value: any }) => {
          const val = Number(p.value) || 0;

          if (val === 0) {
            return (
              <span className="flex h-full items-center justify-end text-right text-gray-400 font-medium">
                0
              </span>
            );
          }

          // Negative balance (Deficit / Overused leaves)
          if (val < 0) {
            return (
              <span className="flex h-full items-center justify-end text-right font-semibold text-[#dc2626]">
                {formatMetric(val)}
              </span>
            );
          }

          // Positive remaining closing balance
          return (
            <span className="flex h-full items-center justify-end text-right font-semibold text-[#059669]">
              {formatMetric(val)}
            </span>
          );
        },
        headerClass: "ag-right-aligned-header",
      },
    ];
  }, []);

  // ── Column Definitions for Detailed Leave Lines AG Grid ────────────
  const eventColDefs = useMemo<ColDef<EventRowInput>[]>(() => {
    return [
      {
        field: "eventDate",
        headerName: "Date",
        width: 125,
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
            <span className="inline-flex items-center rounded  px-1 py-1 font-mono text-[12px] font-semibold text-gray-800">
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
        cellRenderer: (p: { value?: string | null }) => (
          p.value ? (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                {p.value}
              </span>
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          )
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
      // {
      //   field: "reason2",
      //   headerName: "Reason 2",
      //   flex: 1.5,
      //   minWidth: 160,
      //   valueFormatter: (p) => p.value || "—",
      //   filter: "agTextColumnFilter",
      //   cellClass: "text-[#6b7280] flex items-center",
      // },
      {
        field: "documentSubmitted",
        headerName: "Doc Submitted",
        width: 135,
        valueFormatter: (p) => p.value || "—",
        filter: "agTextColumnFilter",
        cellRenderer: (p: { value?: string | null }) => {
          if (!p.value) return <span className="text-gray-400 flex items-center h-full">—</span>;
          const isSubmitted = p.value.toLowerCase().includes("yes") || p.value.toLowerCase().includes("sub");
          return (
            <div className="flex items-center h-full">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none ${
                isSubmitted ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}>
                {p.value}
              </span>
            </div>
          );
        },
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

  // ── Column Definitions for Employee Master AG Grid ─────────────────
  const employeeColDefs = useMemo<ColDef<EmployeeProfileInput>[]>(() => {
    return [
      {
        field: "employeeCode",
        headerName: "Employee ID",
        width: 130,
        filter: "agTextColumnFilter",
        cellClass: "font-mono text-[12px] text-gray-500 flex items-center",
      },
      {
        field: "employeeName",
        headerName: "Employee Name",
        flex: 1.5,
        minWidth: 160,
        filter: "agTextColumnFilter",
        cellClass: "font-medium text-[#111827] flex items-center",
      },
      {
        field: "department",
        headerName: "Department",
        flex: 1.2,
        minWidth: 130,
        filter: "agTextColumnFilter",
        cellClass: "text-[#6b7280] flex items-center",
      },
      {
        field: "dateOfJoining",
        headerName: "Date of Joining",
        width: 150,
        valueFormatter: (p) => formatDisplayDate(p.value),
        cellClass: "flex items-center text-[#374151]",
      },
      {
        field: "dateOfConfirmation",
        headerName: "Date of Confirmation",
        width: 165,
        valueFormatter: (p) => formatDisplayDate(p.value),
        cellClass: "flex items-center text-[#374151]",
      },
      {
        field: "totalBalanceLeaves",
        headerName: "Balance Leaves",
        width: 140,
        valueFormatter: (p) => (p.value === null ? "—" : formatMetric(p.value)),
        cellClass: "text-right flex items-center justify-end font-semibold text-emerald-700",
        headerClass: "ag-right-aligned-header",
      },
    ];
  }, []);

  return (
    <div className="space-y-8 sm:space-y-9">
      {/* Upload Card */}
      <section className="rounded-xl border border-[#e5e7eb] bg-white p-7 sm:p-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        <form className="space-y-6" onSubmit={handlePreviewSubmit}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#e5e7eb] bg-[#f9fafb] text-[#111827]">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[#111827]">
                  Upload monthly attendance Excel
                </h2>
                <p className="mt-0.5 text-[13px] text-[#6b7280]">
                  Supports the summary grid, detailed leave line sheet, employee master, and leave type reference.
                </p>
              </div>
            </div>
            {(preview || restoredFileName || file || importedMonthKey) && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#dc2626] transition hover:bg-[#fef2f2]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset &amp; delete current data</span>
              </button>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="group relative block cursor-pointer rounded-xl border border-dashed border-[#d1d5db] bg-[#fafafa] p-6 transition hover:border-[#9ca3af] hover:bg-[#f3f4f6]">
              <span className="mb-2 block text-[13.5px] font-medium text-[#374151]">
                {file
                  ? `Selected: ${file.name}`
                  : restoredFileName
                  ? `Loaded from backup: ${restoredFileName}`
                  : "Choose workbook (.xlsx or .xls)"}
              </span>
              <input
                className="block w-full text-[13px] text-[#6b7280] file:mr-3.5 file:rounded-md file:border file:border-[#e5e7eb] file:bg-white file:px-3.5 file:py-1.5 file:text-[12.5px] file:font-medium file:text-[#111827] hover:file:bg-[#f9fafb]"
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  if (selected) setRestoredFileName(null);
                }}
              />
              <p className="mt-2.5 text-[12px] text-[#9ca3af]">
                Format: contains monthly summary sheet, leave log, employee master, and leave codes.
              </p>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#111827] px-6 text-[13.5px] font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-[#9ca3af]"
            >
              {loading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>{loading ? "Parsing workbook..." : "Preview workbook"}</span>
            </button>
          </div>
        </form>

        {message && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[13px] text-[#166534] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{message}</p>
            </div>
            {importedMonthKey && (
              <div className="flex items-center gap-4">
                <Link
                  href={`/reports?month=${encodeURIComponent(importedMonthKey)}`}
                  className="inline-flex items-center gap-1 font-semibold text-[#166534] underline underline-offset-2 hover:text-[#14532d]"
                >
                  View Reports <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 font-semibold text-[#166534] underline underline-offset-2 hover:text-[#14532d]"
                >
                  Dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-[13px] text-[#991b1b]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </section>

      {preview && (
        <div className="space-y-8 sm:space-y-9">
          {/* Stat Cards */}
          {/* <section className="grid gap-4 sm:grid-cols-3 sm:gap-5">
            <StatCard label="Employees parsed" value={String(counts.employees)} />
            <StatCard label="Detailed leave lines" value={String(counts.eventLines)} />
            <StatCard label="Sheets detected" value={String(counts.sheets)} />
          </section> */}

          {/* Detected Period Card */}
          <section className="rounded-xl border border-[#e5e7eb] bg-white p-6 sm:p-7 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
                  Detected period
                </p>
                <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-[#111827]">
                  {preview.monthLabel}
                </h3>
                <p className="mt-1 text-[13px] text-[#6b7280]">
                  {formatDisplayDate(preview.periodStart)} → {formatDisplayDate(preview.periodEnd)} · {preview.fileName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#fecaca] bg-white px-4 text-[13px] font-medium text-[#dc2626] transition hover:bg-[#fef2f2]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset &amp; delete</span>
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#111827] px-5 text-[13px] font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-[#9ca3af]"
                >
                  {importing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>{importing ? "Importing to storage..." : "Import this month"}</span>
                </button>
              </div>
            </div>

            {preview.notes.length > 0 && (
              <ul className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {preview.notes.map((note) => (
                  <li
                    key={note}
                    className="flex items-center rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-[12.5px] text-[#4b5563]"
                  >
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* AG Grid: Monthly Summary Preview */}
          <AgGridTable
            title="Monthly summary preview"
            description="Interactive AG Grid of normalized employee totals from the main attendance sheet."
            data={preview.summaries}
            columnDefs={summaryColDefs}
            pageSize={10}
            searchPlaceholder="Filter summaries by employee name, code, department..."
          />

          {/* AG Grid: Detailed Leave Line Preview (Datewise) */}
          <AgGridTable
            title="Detailed leave line preview"
            description="Interactive AG Grid of line-by-line leave or late-mark records parsed datewise from the Mark Leave sheet."
            data={preview.events}
            columnDefs={eventColDefs}
            pageSize={10}
            searchPlaceholder="Filter leave records by date, employee, code, reason..."
          />

          {/* AG Grid: Employee Master Preview */}
          <AgGridTable
            title="Employee master preview"
            description="Interactive AG Grid of employee master details used to enrich report headers and joining dates."
            data={preview.employees}
            columnDefs={employeeColDefs}
            pageSize={10}
            searchPlaceholder="Filter master records by employee name, ID, department..."
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
      <p className="text-[12.5px] font-medium text-[#6b7280]">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold tracking-tight text-[#111827]">{value}</p>
    </div>
  );
}