"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ICellRendererParams,
  themeQuartz,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { ArrowUpRight, Search, Users, X } from "lucide-react";
import type { getMonthSummaries } from "@/lib/data";
import { formatMetric } from "@/lib/utils";

// Register all Community features for AG Grid
ModuleRegistry.registerModules([AllCommunityModule]);

type SummaryItem = Awaited<ReturnType<typeof getMonthSummaries>>[number];

interface EmployeeBalancesGridProps {
  data: SummaryItem[];
  monthKey: string | null;
}

export function EmployeeBalancesGrid({ data, monthKey }: EmployeeBalancesGridProps) {
  const [quickFilterText, setQuickFilterText] = useState("");

  const customTheme = useMemo(() => {
    return themeQuartz.withParams({
      fontFamily:
        "var(--font-geist-sans), Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      fontSize: 13,
      headerFontSize: 12,
      headerFontWeight: 500,
      headerTextColor: "#666666",
      headerBackgroundColor: "#fafafa",
      backgroundColor: "#ffffff",
      foregroundColor: "#171717",
      borderColor: "#ededed",
      rowBorder: { style: "solid", width: 1, color: "#f4f4f5" },
      headerRowBorder: { style: "solid", width: 1, color: "#ededed" },
      wrapperBorder: false,
      borderRadius: 0,
      wrapperBorderRadius: 0,
      accentColor: "#000000",
      selectedRowBackgroundColor: "#fafafa",
      rowHoverColor: "#fafafa",
      cellHorizontalPadding: 16,
      headerHeight: 40,
      rowHeight: 48,
    });
  }, []);

  const columnDefs = useMemo<ColDef<SummaryItem>[]>(() => {
    return [
      {
        field: "employeeCode",
        headerName: "ID",
        width: 100,
        filter: "agTextColumnFilter",
        cellClass: "font-mono text-[12px] text-[#666666] flex items-center",
      },
      {
        field: "employeeName",
        headerName: "Employee",
        flex: 1.5,
        minWidth: 200,
        filter: "agTextColumnFilter",
        cellRenderer: (params: ICellRendererParams<SummaryItem>) => {
          if (!params.data) return null;
          const href = monthKey
            ? `/reports/${monthKey}/${encodeURIComponent(params.data.employeeCode)}`
            : `/reports`;
          const initials = (params.value ?? "")
            .split(" ")
            .map((n: string) => n[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <Link
              href={href}
              className="group flex h-full items-center gap-3 text-[#171717] hover:text-black"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f4f4f5] text-[10.5px] font-medium text-[#666666] ring-1 ring-inset ring-[#ededed]">
                {initials || "?"}
              </span>
              <span className="truncate text-[13px] font-medium tracking-[-0.01em] group-hover:underline group-hover:decoration-[#a1a1a1] group-hover:underline-offset-4">
                {params.value}
              </span>
            </Link>
          );
        },
      },
      {
        field: "department",
        headerName: "Department",
        flex: 1,
        minWidth: 140,
        filter: "agTextColumnFilter",
        cellRenderer: (params: ICellRendererParams<SummaryItem>) => {
          if (!params.value) return <span className="text-[#a1a1a1]">—</span>;
          return (
            <span className="text-[13px] text-[#525252]">{params.value}</span>
          );
        },
      },
      {
        field: "totalTaken",
        headerName: "Taken",
        width: 100,
        filter: "agNumberColumnFilter",
        valueFormatter: (params) => formatMetric(params.value),
        cellClass: "font-medium text-[#171717] flex items-center justify-end text-right tabular-nums",
        headerClass: "ag-right-aligned-header",
      },
      {
        field: "balanceLeaves",
        headerName: "Balance",
        width: 110,
        filter: "agNumberColumnFilter",
        cellRenderer: (params: ICellRendererParams<SummaryItem>) => {
          const val = Number(params.value) || 0;
          const color =
            val < 0 ? "text-[#e5484d]" : val === 0 ? "text-[#f5a623]" : "text-[#17a34a]";
          return (
            <span
              className={`flex h-full items-center justify-end text-right font-medium tabular-nums ${color}`}
            >
              {formatMetric(val)}
            </span>
          );
        },
        headerClass: "ag-right-aligned-header",
      },
      {
        headerName: "Closing",
        width: 110,
        filter: "agNumberColumnFilter",
        valueGetter: (params) => {
          if (!params.data) return 0;
          const balance = Number(params.data.balanceLeaves ?? 0);
          const taken = Number(params.data.totalTaken ?? 0);
          return balance - taken;
        },
        cellRenderer: (params: ICellRendererParams<SummaryItem>) => {
          const val = Number(params.value) || 0;

          if (val === 0) {
            return (
              <span className="flex h-full items-center justify-end text-right tabular-nums text-[#a1a1a1]">
                0
              </span>
            );
          }

          const color = val < 0 ? "text-[#e5484d]" : "text-[#17a34a]";
          return (
            <span
              className={`flex h-full items-center justify-end text-right font-medium tabular-nums ${color}`}
            >
              {formatMetric(val)}
            </span>
          );
        },
        headerClass: "ag-right-aligned-header",
      },
      {
        field: "lateMarks",
        headerName: "Late",
        width: 90,
        filter: "agNumberColumnFilter",
        valueFormatter: (params) => formatMetric(params.value),
        cellClass:
          "text-[#525252] flex items-center justify-end text-right tabular-nums",
        headerClass: "ag-right-aligned-header",
      },
      {
        headerName: "Status",
        width: 150,
        filter: "agTextColumnFilter",
        valueGetter: (params) => {
          if (!params.data) return "";
          const balance = Number(params.data.balanceLeaves ?? 0);
          const taken = Number(params.data.totalTaken ?? 0);
          const remaining = balance - taken;

          if (remaining < 0) return "Needs Attention";
          if (remaining >= 1) return "Good";
          return "Satisfactory";
        },
        cellRenderer: (params: ICellRendererParams<SummaryItem>) => {
          const status = params.value;
          if (!status) return null;

          let dotClass = "bg-[#a1a1a1]";
          let textClass = "text-[#525252]";
          let ringClass = "ring-[#ededed]";

          if (status === "Good") {
            dotClass = "bg-[#17a34a]";
            textClass = "text-[#166534]";
            ringClass = "ring-[#dcfce7]";
          } else if (status === "Satisfactory") {
            dotClass = "bg-[#f5a623]";
            textClass = "text-[#854d0e]";
            ringClass = "ring-[#fef3c7]";
          } else if (status === "Needs Attention") {
            dotClass = "bg-[#e5484d]";
            textClass = "text-[#991b1b]";
            ringClass = "ring-[#fee2e2]";
          }

          return (
            <div className="flex h-full items-center">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${ringClass} ${textClass}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                {status}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "",
        width: 80,
        sortable: false,
        filter: false,
        resizable: false,
        cellRenderer: (params: ICellRendererParams<SummaryItem>) => {
          if (!params.data || !monthKey) return null;
          return (
            <div className="flex h-full items-center justify-end">
              <Link
                href={`/reports/${monthKey}/${encodeURIComponent(params.data.employeeCode)}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[#525252] transition hover:bg-[#f4f4f5] hover:text-[#171717]"
              >
                View
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          );
        },
      },
    ];
  }, [monthKey]);

  const defaultColDef = useMemo<ColDef>(() => {
    return {
      sortable: true,
      resizable: true,
      filter: true,
      suppressHeaderMenuButton: true,
    };
  }, []);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#ededed] bg-[#fafafa] px-4 py-16 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#ededed] bg-white">
          <Users className="h-4 w-4 text-[#a1a1a1]" />
        </div>
        <p className="text-[13px] font-medium text-[#171717]">No employees found</p>
        <p className="mt-1 text-[12.5px] text-[#666666]">
          Upload an attendance workbook to populate this table.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#ededed] bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ededed] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-[#171717]">
            Employee Balances
          </h3>
          <span className="inline-flex items-center rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-medium text-[#525252] ring-1 ring-inset ring-[#ededed]">
            {data.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1a1]" />
            <input
              id="ag-grid-quick-filter"
              type="text"
              placeholder="Search…"
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="h-8 w-64 rounded-md border border-[#ededed] bg-white pl-8 pr-8 text-[12.5px] text-[#171717] placeholder-[#a1a1a1] outline-none transition focus:border-[#171717] focus:ring-2 focus:ring-black/5"
            />
            {quickFilterText && (
              <button
                type="button"
                onClick={() => setQuickFilterText("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#a1a1a1] transition hover:bg-[#f4f4f5] hover:text-[#171717]"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          height: Math.min(Math.max(data.length * 48 + 96, 300), 600),
          width: "100%",
        }}
      >
        <AgGridReact
          theme={customTheme}
          rowData={data}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50, 100]}
          animateRows={true}
          domLayout="normal"
          rowHeight={48}
          headerHeight={40}
          suppressCellFocus={true}
        />
      </div>
    </div>
  );
}