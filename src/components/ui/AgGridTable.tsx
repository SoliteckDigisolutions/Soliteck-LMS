"use client";

import { useMemo, useState } from "react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  themeQuartz,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Search } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

interface AgGridTableProps<TData> {
  title?: string;
  description?: string;
  data: TData[];
  columnDefs: ColDef<TData>[];
  pageSize?: number;
  searchPlaceholder?: string;
  height?: number;
}

export function AgGridTable<TData>({
  title,
  description,
  data,
  columnDefs,
  pageSize = 10,
  searchPlaceholder = "Search in records...",
  height,
}: AgGridTableProps<TData>) {
  const [quickFilterText, setQuickFilterText] = useState("");

  const customTheme = useMemo(() => {
    return themeQuartz.withParams({
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      fontSize: 13,
      headerFontSize: 11,
      headerFontWeight: 600,
      headerTextColor: "#6b7280",
      headerBackgroundColor: "#f9fafb",
      borderColor: "#e5e7eb",
      borderRadius: 8,
      wrapperBorderRadius: 8,
      accentColor: "#0070f3",
      selectedRowBackgroundColor: "#eff6ff",
      rowHoverColor: "#f9fafb",
    });
  }, []);

  const defaultColDef = useMemo<ColDef>(() => {
    return {
      sortable: true,
      resizable: true,
      filter: true,
    };
  }, []);

  const tableHeight = useMemo(() => {
    if (height) return height;
    if (data.length === 0) return 200;
    return Math.min(Math.max(data.length * 42 + 90, 260), 520);
  }, [data.length, height]);

  return (
    <section className="rounded-xl border border-[#e5e7eb] bg-white p-6 sm:p-7 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
      {(title || description) && (
        <div className="mb-5 flex flex-col gap-3 border-b border-[#f3f4f6] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h3 className="text-[17px] font-semibold tracking-tight text-[#111827]">{title}</h3>}
            {description && <p className="mt-1 text-[13px] text-[#6b7280]">{description}</p>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] font-medium text-[#6b7280]">
              <strong className="text-[#111827]">{data.length}</strong> total row{data.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pl-10 pr-4 text-[13.5px] text-[#111827] placeholder-[#9ca3af] outline-none transition focus:border-[#0070f3] focus:ring-2 focus:ring-[#0070f3]/10"
            />
          </div>
          {quickFilterText && (
            <button
              type="button"
              onClick={() => setQuickFilterText("")}
              className="text-[12.5px] font-medium text-[#0070f3] hover:underline"
            >
              Clear search
            </button>
          )}
        </div>

        {/* AG Grid Container */}
        <div className="w-full overflow-hidden rounded-lg border border-[#e5e7eb]">
          <div style={{ height: tableHeight, width: "100%" }}>
            <AgGridReact
              theme={customTheme}
              rowData={data}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              quickFilterText={quickFilterText}
              pagination={true}
              paginationPageSize={pageSize}
              paginationPageSizeSelector={[10, 25, 50, 100]}
              animateRows={true}
              domLayout="normal"
              rowHeight={42}
              headerHeight={38}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
