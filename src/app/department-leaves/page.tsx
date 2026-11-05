"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import * as XLSX from "xlsx";
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronDown,
  Download,
  FileImage,
  FileJson,
  FileSpreadsheet,
  Image as ImageIcon,
  MoreHorizontal,
  PlusCircle,
  RotateCcw,
  Search,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Page } from "@/components/ui/Page";
import {
  deleteIndependentDeptRecord,
  getIndependentDeptRecords,
  saveIndependentDeptRecord,
} from "@/lib/data";
import type { DepartmentLeaveItem, DepartmentLeaveRecord } from "@/db/schema";
import { DEFAULT_DEPARTMENT_RECORD } from "@/lib/storage";

/* ══════════════════════════════════════════════════════════════
   1. SHEET PARSER  (paste + xlsx both go through this)
   ══════════════════════════════════════════════════════════════ */

interface Metrics {
  employees?: number;
  balance?: number;
  allocated?: number; // 2nd number on the "Total Leave Balance" row (e.g. 98.5)
  taken?: number;
  halfDay?: number;
  lateMark?: number;
  lateMarkWaived?: number;
  unpaid?: number;
  percentage?: number;
}
type MetricKey = Exclude<keyof Metrics, "allocated">;

const MONTH_RE =
  /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i;
const TITLE_RE = /record|report|summary|\b(19|20)\d{2}\b/i;
const round2 = (n: number) => Math.round(n * 100) / 100;

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[,%\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Map a row label to a metric. Returns null for department names / titles. */
function metricKey(label: string): MetricKey | null {
  const l = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^total employees?$/.test(l)) return "employees";
  if (/^total leave balance/.test(l)) return "balance";
  if (/^total leave taken/.test(l)) return "taken";
  if (/^total half ?days?/.test(l)) return "halfDay";
  if (/waived/.test(l)) return "lateMarkWaived";
  if (/^total late marks?/.test(l)) return "lateMark";
  if (/unpaid/.test(l)) return "unpaid";
  if (/^(total )?leave (percentage|%)/.test(l)) return "percentage";
  return null;
}

/** Split one pasted line into cells (tabs first, then "Label 12.5 30" fallback). */
function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const cols = line.split(/\s{2,}/).map((c) => c.trim());
  if (cols.length > 1) return cols;
  const m = line.match(/^(.*?[^\d\s.,%-])\s+(-?\d[\d.,]*(?:\s+-?\d[\d.,]*)*)\s*%?\s*$/);
  if (m && metricKey(m[1])) return [m[1].trim(), ...m[2].trim().split(/\s+/)];
  return [line.trim()];
}

function pasteToRows(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(splitLine)
    .filter((r) => r.some((c) => c !== ""));
}

/** label = first non-empty cell, nums = every numeric cell after it */
function toLines(rows: unknown[][]) {
  const out: { label: string; nums: number[] }[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => (typeof c === "number" ? c : String(c ?? "").trim()));
    const first = cells.findIndex((c) => c !== "");
    if (first === -1) continue;
    const nums = cells
      .slice(first + 1)
      .map(toNum)
      .filter((n): n is number => n !== null);
    out.push({ label: String(cells[first]), nums });
  }
  return out;
}

function derivePct(m: Metrics): number {
  if (m.percentage !== undefined) return m.percentage;
  const taken = m.taken ?? 0;
  const base = m.allocated && m.allocated > 0 ? m.allocated : (m.balance ?? 0) + taken;
  return base > 0 ? (taken / base) * 100 : 0;
}

/** Extracts structured Month Metadata for the schema */
function getMonthMeta(dateStr: string) {
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  const cleanStr = dateStr.toLowerCase();
  const matchedMonthIndex = months.findIndex((m) => cleanStr.includes(m));
  const matchedYear = dateStr.match(/\b(19|20)\d{2}\b/)?.[0];

  const now = new Date();
  const yearNum = matchedYear ? parseInt(matchedYear, 10) : now.getFullYear();
  const monthIdx = matchedMonthIndex !== -1 ? matchedMonthIndex : now.getMonth();

  const monthKey = `${yearNum}-${String(monthIdx + 1).padStart(2, "0")}`;
  const capitalizedMonth = months[monthIdx].charAt(0).toUpperCase() + months[monthIdx].slice(1);
  const monthLabel = `${capitalizedMonth} ${yearNum}`;

  return { monthKey, monthLabel };
}

function parseDepartmentSheet(rows: unknown[][], sheetName?: string): DepartmentLeaveRecord | null {
  const lines = toLines(rows);
  if (lines.length === 0) return null;

  // Title row (e.g. "IT Department Leave Record- 21 September 2026")
  let title = sheetName?.trim() || "Department Leave Record";
  let start = 0;
  const head = lines[0];
  if (head.nums.length === 0 && !metricKey(head.label) && TITLE_RE.test(head.label)) {
    title = head.label;
    start = 1;
  }
  const recordDate =
    title.match(MONTH_RE)?.[1] ??
    new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const { monthKey, monthLabel } = getMonthMeta(recordDate);

  // Rows before the first department name = overall block
  const overall: Metrics = {};
  const blocks: { name: string; m: Metrics }[] = [];
  let current: Metrics = overall;

  for (let i = start; i < lines.length; i++) {
    const { label, nums } = lines[i];
    const key = metricKey(label);
    if (key) {
      if (nums.length === 0) continue;
      current[key] = nums[0];
      if (key === "balance" && nums[1] !== undefined) current.allocated = nums[1];
      continue;
    }
    // Non-metric label with no numbers → a department header ("Android", "Front-End", …)
    if (nums.length === 0) {
      const m: Metrics = {};
      blocks.push({ name: label, m });
      current = m;
    }
  }

  if (blocks.length === 0) return null;

  const departments: DepartmentLeaveItem[] = blocks.map(({ name, m }) => ({
    department: name,
    employeeCount: m.employees ?? 0,
    totalBalanceLeaves: m.balance ?? 0,
    totalAllocatedLeaves: m.allocated,
    totalLeaveTaken: m.taken ?? 0,
    totalHalfDay: m.halfDay ?? 0,
    totalLateMark: m.lateMark ?? 0,
    totalUnpaidLeave: m.unpaid ?? 0,
    totalLateMarkWaived: m.lateMarkWaived ?? 0,
    leavePercentage: round2(derivePct(m)),
  }));

  // If the sheet has no overall block, aggregate from departments
  const sum = (fn: (d: DepartmentLeaveItem) => number) => departments.reduce((s, d) => s + fn(d), 0);
  const o: Metrics = {
    employees: overall.employees ?? sum((d) => d.employeeCount),
    balance: overall.balance ?? sum((d) => d.totalBalanceLeaves),
    allocated:
      overall.allocated ??
      (departments.some((d) => d.totalAllocatedLeaves != null)
        ? sum((d) => d.totalAllocatedLeaves ?? 0)
        : undefined),
    taken: overall.taken ?? sum((d) => d.totalLeaveTaken),
    halfDay: overall.halfDay ?? sum((d) => d.totalHalfDay),
    lateMark: overall.lateMark ?? sum((d) => d.totalLateMark),
    percentage: overall.percentage,
  };

  return {
    id: `dept_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    recordDate,
    monthKey,
    monthLabel,
    importedAt: new Date().toISOString() as any, // Cast to 'any' allows compatibility if the DB type expects String or Date
    overall: {
      totalEmployee: o.employees ?? 0,
      totalBalanceLeaves: o.balance ?? 0,
      totalAllocatedLeaves: o.allocated,
      totalLeaveTaken: o.taken ?? 0,
      totalHalfDay: o.halfDay ?? 0,
      totalLateMark: o.lateMark ?? 0,
      leavePercentage: round2(derivePct(o)),
    },
    departments,
  };
}

/* ══════════════════════════════════════════════════════════════
   2. HELPERS  (format, colors, export)
   ══════════════════════════════════════════════════════════════ */

function fmt(n: number | undefined | null) {
  if (n === undefined || n === null) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function percentColor(pct: number) {
  if (pct >= 60) return "#e5484d";
  if (pct >= 35) return "#f5a623";
  return "#17a34a";
}

function percentTone(pct: number) {
  if (pct >= 60) return { bg: "#fef2f2", ring: "#fecaca", text: "#991b1b" };
  if (pct >= 35) return { bg: "#fffbeb", ring: "#fde68a", text: "#854d0e" };
  return { bg: "#f0fdf4", ring: "#bbf7d0", text: "#166534" };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Clone a DOM tree and bake computed styles into it so Tailwind classes survive inside an SVG. */
function cloneWithInlineStyles(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;
  const src = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const dst = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    let css = "";
    for (let j = 0; j < cs.length; j++) {
      const prop = cs[j];
      css += `${prop}:${cs.getPropertyValue(prop)};`;
    }
    dst[i].setAttribute("style", css);
  });
  return clone;
}

function buildSvg(el: HTMLElement) {
  const pad = 24;
  const rect = el.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  const totalW = w + pad * 2;
  const totalH = h + pad * 2;
  const xhtml = new XMLSerializer().serializeToString(cloneWithInlineStyles(el));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">` +
    `<foreignObject x="0" y="0" width="${totalW}" height="${totalH}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff;padding:${pad}px;width:${w}px;box-sizing:content-box;">${xhtml}</div>` +
    `</foreignObject></svg>`;
  return { svg, width: totalW, height: totalH };
}

function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("SVG render failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, active]);
}

/* ══════════════════════════════════════════════════════════════
   3. UI PIECES
   ══════════════════════════════════════════════════════════════ */

function GaugeMeter({ percent }: { percent: number }) {
  const r = 58;
  const cx = 75;
  const cy = 75;
  const circumference = Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;
  const color = percentColor(percent);
  const angle = Math.PI - (clamped / 100) * Math.PI;
  const nx = cx + (r - 4) * Math.cos(angle);
  const ny = cy - (r - 4) * Math.sin(angle);
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="150" height="90" viewBox="0 0 150 90" className="overflow-visible">
        <path d={arc} fill="none" stroke="#f4f4f5" strokeWidth={8} strokeLinecap="round" />
        <path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#171717" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3.5" fill="#171717" />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-[20px] font-semibold tabular-nums tracking-[-0.03em]" style={{ color }}>
          {percent.toFixed(2)}%
        </span>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#a1a1a1]">
          Overall Leave
        </span>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-[#f4f4f5] py-2 last:border-0 ${highlight ? "-mx-3 rounded-md bg-[#fffbeb] px-3" : ""
        }`}
    >
      <span className="text-[12px] font-medium text-[#666666]">{label}</span>
      <span
        className={`text-[12.5px] font-semibold tabular-nums ${highlight ? "text-[#854d0e]" : "text-[#171717]"
          }`}
      >
        {value}
      </span>
    </div>
  );
}

function MicroKpi({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#ededed] bg-white px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#ededed] bg-[#fafafa] text-[#737373] [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#a1a1a1]">{label}</span>
        <span className="text-[14px] font-semibold tabular-nums tracking-[-0.01em] text-[#171717]">
          {value}
        </span>
      </div>
    </div>
  );
}

function DepartmentCard({ dept }: { dept: DepartmentLeaveItem }) {
  const pct = dept.leavePercentage;
  const color = percentColor(pct);
  const tone = percentTone(pct);

  return (
    <div className="rounded-xl border border-[#ededed] bg-white p-5 transition-all duration-150 hover:border-[#d4d4d8] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#ededed] bg-[#fafafa] text-[#737373]">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#a1a1a1]">Department</p>
            <h3 className="mt-0.5 text-[14px] font-semibold tracking-[-0.01em] text-[#171717]">
              {dept.department}
            </h3>
          </div>
        </div>
        {dept.totalLeaveTaken === 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[10.5px] font-medium text-[#166534] ring-1 ring-inset ring-[#bbf7d0]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#17a34a]" />
            Zero Leave
          </span>
        )}
      </div>

      <div className="mb-4">
        <StatRow label="Employees" value={dept.employeeCount} />
        <StatRow
          label="Balance"
          value={
            dept.totalAllocatedLeaves != null
              ? `${fmt(dept.totalBalanceLeaves)} / ${fmt(dept.totalAllocatedLeaves)}`
              : fmt(dept.totalBalanceLeaves)
          }
        />
        <StatRow label="Leave Taken" value={fmt(dept.totalLeaveTaken)} />
        <StatRow label="Half Day" value={fmt(dept.totalHalfDay)} />
        <StatRow label="Late Mark" value={fmt(dept.totalLateMark)} />
        {(dept.totalUnpaidLeave ?? 0) > 0 && (
          <StatRow label="Unpaid Leave" value={fmt(dept.totalUnpaidLeave)} highlight />
        )}
        {(dept.totalLateMarkWaived ?? 0) > 0 && (
          <StatRow label="Waived Late Mark" value={fmt(dept.totalLateMarkWaived)} />
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#a1a1a1]">Leave %</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{
              backgroundColor: tone.bg,
              color: tone.text,
              boxShadow: `inset 0 0 0 1px ${tone.ring}`,
            }}
          >
            {pct.toFixed(2)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#f4f4f5]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

function OverallCard({ record }: { record: DepartmentLeaveRecord }) {
  const o = record.overall;
  return (
    <div className="overflow-hidden rounded-xl border border-[#ededed] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ededed] bg-[#fafafa] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[#171717]">{record.title}</h3>
          {record.recordDate && (
            <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10.5px] font-medium text-[#525252] ring-1 ring-inset ring-[#ededed]">
              {record.recordDate}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-medium text-[#525252] ring-1 ring-inset ring-[#ededed]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#17a34a]" />
          Department Sheet
        </span>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_240px]">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          <MicroKpi label="Employees" value={o.totalEmployee} icon={<Users />} />
          <MicroKpi
            label="Leave Balance"
            value={
              o.totalAllocatedLeaves != null
                ? `${fmt(o.totalBalanceLeaves)} / ${fmt(o.totalAllocatedLeaves)}`
                : fmt(o.totalBalanceLeaves)
            }
            icon={<Activity />}
          />
          <MicroKpi label="Leave Taken" value={fmt(o.totalLeaveTaken)} icon={<TrendingUp />} />
          <MicroKpi label="Half Day" value={fmt(o.totalHalfDay)} icon={<Activity />} />
          <MicroKpi label="Late Mark" value={fmt(o.totalLateMark)} icon={<Activity />} />
          <MicroKpi label="Leave %" value={`${o.leavePercentage.toFixed(2)}%`} icon={<TrendingUp />} />
        </div>
        <div className="flex items-center justify-center border-t border-[#ededed] pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <GaugeMeter percent={o.leavePercentage} />
        </div>
      </div>
    </div>
  );
}

type ExportType = "svg" | "png" | "json";

function ExportMenu({ onExport }: { onExport: (t: ExportType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const items: { type: ExportType; label: string; icon: ReactNode }[] = [
    { type: "png", label: "Export as PNG", icon: <FileImage className="h-3.5 w-3.5 text-[#666666]" /> },
    { type: "svg", label: "Export as SVG", icon: <ImageIcon className="h-3.5 w-3.5 text-[#666666]" /> },
    { type: "json", label: "Export as JSON", icon: <FileJson className="h-3.5 w-3.5 text-[#666666]" /> },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#ededed] bg-white px-3 text-[12.5px] font-medium text-[#171717] transition hover:bg-[#fafafa]"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className="h-3 w-3 text-[#a1a1a1]" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-40 w-48 overflow-hidden rounded-lg border border-[#ededed] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          {items.map((it) => (
            <button
              key={it.type}
              type="button"
              onClick={() => {
                onExport(it.type);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#171717] transition hover:bg-[#fafafa]"
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MoreActionsMenu({ onReset, onDelete }: { onReset: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ededed] bg-white text-[#666666] transition hover:bg-[#fafafa] hover:text-[#171717]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-40 w-44 overflow-hidden rounded-lg border border-[#ededed] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[#171717] transition hover:bg-[#fafafa]"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#666666]" />
            Reset Default
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 border-t border-[#ededed] px-3 py-2 text-left text-[12.5px] text-[#dc2626] transition hover:bg-[#fef2f2]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Record
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface CommandItem {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  icon: ReactNode;
  action: () => void;
}

function CommandPalette({
  open,
  setOpen,
  commands,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  commands: CommandItem[];
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIdx];
        if (cmd) {
          cmd.action();
          setOpen(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIdx, setOpen]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, c) => {
    (acc[c.group] ||= []).push(c);
    return acc;
  }, {});
  let idx = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[#ededed] bg-white shadow-[0_10px_38px_rgba(0,0,0,0.16),0_10px_20px_rgba(0,0,0,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#ededed] px-4">
          <Search className="h-4 w-4 shrink-0 text-[#a1a1a1]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Type a command or search…"
            className="h-12 flex-1 bg-transparent text-[13.5px] text-[#171717] placeholder-[#a1a1a1] outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-[#ededed] bg-[#fafafa] px-1.5 py-0.5 text-[10.5px] font-medium text-[#666666] sm:inline-flex">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-[13px] text-[#a1a1a1]">No results found.</div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-1">
              <div className="px-2 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#a1a1a1]">
                {group}
              </div>
              {items.map((cmd) => {
                idx++;
                const myIdx = idx;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => {
                      cmd.action();
                      setOpen(false);
                    }}
                    onMouseEnter={() => setActiveIdx(myIdx)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] transition ${myIdx === activeIdx ? "bg-[#fafafa] text-[#171717]" : "text-[#525252]"
                      }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded border border-[#ededed] bg-white text-[#666666] [&>svg]:h-3.5 [&>svg]:w-3.5">
                      {cmd.icon}
                    </span>
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="hidden rounded border border-[#ededed] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#666666] sm:inline-flex">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[#ededed] bg-[#fafafa] px-3 py-2 text-[10.5px] text-[#666666]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#ededed] bg-white px-1 py-0.5 font-medium">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#ededed] bg-white px-1 py-0.5 font-medium">↵</kbd>
              Select
            </span>
          </div>
          <span className="font-medium">LMS Command</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   4. PAGE
   ══════════════════════════════════════════════════════════════ */

export default function DepartmentLeavesPage() {
  const [mounted, setMounted] = useState(false);
  const [records, setRecords] = useState<DepartmentLeaveRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportRegionRef = useRef<HTMLDivElement>(null);

  const loadRecords = useCallback(async () => {
    const list = await getIndependentDeptRecords();
    const finalRecords = list.length > 0 ? list : [DEFAULT_DEPARTMENT_RECORD];
    setRecords(finalRecords);
    setSelectedRecordId((prev) =>
      prev && finalRecords.some((r) => r.id === prev) ? prev : finalRecords[0]?.id || "",
    );
  }, []);

  useEffect(() => {
    setMounted(true);
    loadRecords();
    const onUpdate = () => loadRecords();
    window.addEventListener("lms-data-updated", onUpdate);
    return () => window.removeEventListener("lms-data-updated", onUpdate);
  }, [loadRecords]);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) || records[0] || DEFAULT_DEPARTMENT_RECORD,
    [records, selectedRecordId],
  );

  // Live preview of what the pasted text will import as
  const preview = useMemo(() => {
    if (!pasteText.trim()) return null;
    try {
      return parseDepartmentSheet(pasteToRows(pasteText));
    } catch {
      return null;
    }
  }, [pasteText]);

  /* ── import (paste + upload share this) ── */
  async function importRows(rows: unknown[][], sheetName?: string) {
    const parsed = parseDepartmentSheet(rows, sheetName);
    if (!parsed) {
      setImportError(
        "Could not detect departments. Copy the whole sheet: the title row, the overall block, and each department block (name row followed by Total Employee, Total Leave Balance, …).",
      );
      return;
    }
    await saveIndependentDeptRecord(parsed);
    setSelectedRecordId(parsed.id);
    await loadRecords();
    setIsImportOpen(false);
    setPasteText("");
    setImportError(null);
  }

  async function handlePasteImport() {
    if (!pasteText.trim()) {
      setImportError("Please paste the data from your Excel sheet.");
      return;
    }
    try {
      await importRows(pasteToRows(pasteText));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to parse pasted data.");
    }
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result as ArrayBuffer, { type: "array" });
        const sheetName =
          wb.SheetNames.find((s) => /department.*wise.*leave|dept.*leave|it.*department.*leave/i.test(s)) ||
          wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
          header: 1,
          raw: true,
          defval: "",
        });
        await importRows(rows, sheetName);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Error reading Excel file.");
      } finally {
        input.value = ""; // allow re-selecting the same file
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleDeleteRecord(id: string) {
    if (records.length <= 1) {
      alert("At least one department record must be retained.");
      return;
    }
    if (confirm("Are you sure you want to remove this department leave record?")) {
      await deleteIndependentDeptRecord(id);
      await loadRecords();
    }
  }

  async function handleResetDefault() {
    await saveIndependentDeptRecord(DEFAULT_DEPARTMENT_RECORD);
    setSelectedRecordId(DEFAULT_DEPARTMENT_RECORD.id);
    await loadRecords();
  }

  /* ── export ── */
  async function handleExport(type: ExportType) {
    const base = activeRecord.title.replace(/[^\w-]+/g, "_");
    if (type === "json") {
      downloadBlob(
        new Blob([JSON.stringify(activeRecord, null, 2)], { type: "application/json" }),
        `${base}.json`,
      );
      return;
    }
    const el = exportRegionRef.current;
    if (!el) return;
    try {
      const { svg, width, height } = buildSvg(el);
      if (type === "svg") {
        downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${base}.svg`);
      } else {
        downloadBlob(await svgToPng(svg, width, height), `${base}.png`);
      }
    } catch {
      alert("Export failed in this browser. Try SVG or JSON instead.");
    }
  }

  const openImport = () => {
    setImportError(null);
    setIsImportOpen(true);
  };

  const commands: CommandItem[] = [
    { id: "import", label: "Import / Paste Sheet", group: "Actions", icon: <PlusCircle />, action: openImport },
    { id: "reset", label: "Reset to Default Record", group: "Actions", icon: <RotateCcw />, action: handleResetDefault },
    { id: "png", label: "Export Dashboard as PNG", group: "Export", icon: <FileImage />, action: () => handleExport("png") },
    { id: "svg", label: "Export Dashboard as SVG", group: "Export", icon: <ImageIcon />, action: () => handleExport("svg") },
    { id: "json", label: "Export Record as JSON", group: "Export", icon: <FileJson />, action: () => handleExport("json") },
    ...records.map((r) => ({
      id: `switch-${r.id}`,
      label: `Switch to: ${r.title}`,
      group: "Records",
      icon: <FileSpreadsheet />,
      action: () => setSelectedRecordId(r.id),
    })),
  ];

  const pageMeta = {
    eyebrow: "",
    title: "",
    description: "",
  };

  if (!mounted) {
    return (
      <Page {...pageMeta}>
        <div className="flex h-64 items-center justify-center rounded-xl border border-[#ededed] bg-white">
          <p className="text-[13px] text-[#a1a1a1]">Loading department record…</p>
        </div>
      </Page>
    );
  }

  return (
    <Page
      {...pageMeta}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCmdOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ededed] bg-white pl-2.5 pr-1.5 text-[12.5px] text-[#666666] transition hover:border-[#d4d4d8] hover:text-[#171717]"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search commands…</span>
            <kbd className="ml-2 rounded border border-[#ededed] bg-[#fafafa] px-1.5 py-0.5 text-[10.5px] font-medium text-[#666666]">
              ⌘K
            </kbd>
          </button>

          <div className="relative">
            <select
              id="dept-record-select"
              value={selectedRecordId}
              onChange={(e) => setSelectedRecordId(e.target.value)}
              className="h-9 appearance-none rounded-md border border-[#ededed] bg-white pl-3 pr-8 text-[12.5px] font-medium text-[#171717] outline-none transition hover:border-[#d4d4d8] focus:border-[#171717] focus:ring-2 focus:ring-black/5"
            >
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.recordDate})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a1a1a1]" />
          </div>

          <ExportMenu onExport={handleExport} />

          <button
            id="import-dept-sheet-btn"
            type="button"
            onClick={openImport}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#171717] px-3 text-[12.5px] font-medium text-white transition hover:bg-black"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Import
          </button>

          <MoreActionsMenu
            onReset={handleResetDefault}
            onDelete={records.length > 1 ? () => handleDeleteRecord(activeRecord.id) : undefined}
          />
        </div>
      }
    >
      {/* Everything inside this ref is what PNG / SVG export captures */}
      <div ref={exportRegionRef} className="space-y-6">
        <OverallCard record={activeRecord} />

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h4 className="text-[13px] font-semibold tracking-[-0.01em] text-[#171717]">Department Breakdown</h4>
            <span className="inline-flex items-center rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-medium text-[#525252] ring-1 ring-inset ring-[#ededed]">
              {activeRecord.departments.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeRecord.departments.map((d) => (
              <DepartmentCard key={d.department} dept={d} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#ededed] bg-white">
          <div className="border-b border-[#ededed] px-5 py-3">
            <h4 className="text-[13px] font-semibold tracking-[-0.01em] text-[#171717]">Leave % Comparison</h4>
            <p className="mt-0.5 text-[12px] text-[#666666]">Department vs overall leave percentage</p>
          </div>
          <div className="space-y-2 p-5">
            {[
              ...activeRecord.departments.map((d) => ({
                name: d.department,
                pct: d.leavePercentage,
                emp: d.employeeCount,
                overall: false,
              })),
              {
                name: "Overall",
                pct: activeRecord.overall.leavePercentage,
                emp: activeRecord.overall.totalEmployee,
                overall: true,
              },
            ].map((row) => {
              const color = percentColor(row.pct);
              return (
                <div
                  key={row.name + row.overall}
                  className={`flex items-center gap-4 ${row.overall ? "mt-2 border-t border-[#ededed] pt-3" : ""}`}
                >
                  <div className="w-36 shrink-0">
                    <span
                      className={`block truncate text-[12.5px] text-[#171717] ${row.overall ? "font-semibold" : "font-medium"
                        }`}
                    >
                      {row.name}
                    </span>
                  </div>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f4f4f5]">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, Math.max(0, row.pct))}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="w-14 text-right text-[12px] font-semibold tabular-nums" style={{ color }}>
                    {row.pct.toFixed(2)}%
                  </span>
                  <span className="w-16 text-right text-[11px] tabular-nums text-[#a1a1a1]">{row.emp} emp</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <CommandPalette open={isCmdOpen} setOpen={setIsCmdOpen} commands={commands} />

      {/* Import modal */}
      {isImportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setIsImportOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-[#ededed] bg-white shadow-[0_10px_38px_rgba(0,0,0,0.16)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ededed] px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#ededed] bg-[#fafafa]">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-[#666666]" />
                </div>
                <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-[#171717]">
                  Import Department Sheet
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-[#a1a1a1] transition hover:bg-[#fafafa] hover:text-[#171717]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {importError && (
                <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">
                  {importError}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-[#666666]">
                  Paste Sheet Content
                </label>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Select the whole block in Excel (title → last department), copy, and paste here…"}
                  rows={8}
                  className="w-full rounded-md border border-[#ededed] bg-white p-3 font-mono text-[12px] text-[#171717] outline-none transition focus:border-[#171717] focus:ring-2 focus:ring-black/5"
                />
                {pasteText.trim() && (
                  <p
                    className={`mt-1.5 flex items-center gap-1.5 text-[11.5px] ${preview ? "text-[#166534]" : "text-[#854d0e]"
                      }`}
                  >
                    {preview ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Detected “{preview.title}” · {preview.departments.length} departments ·{" "}
                        {preview.overall.totalEmployee} employees
                      </>
                    ) : (
                      "Nothing detected yet. Include the department name rows and their Total … rows."
                    )}
                  </p>
                )}
              </div>

              <div className="relative flex items-center justify-center py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#ededed]" />
                </div>
                <span className="relative bg-white px-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[#a1a1a1]">
                  or
                </span>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-[#666666]">
                  Upload Excel File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="block w-full cursor-pointer text-[12px] text-[#525252] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#171717] file:px-3 file:py-2 file:text-[12px] file:font-medium file:text-white hover:file:bg-black"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#ededed] bg-[#fafafa] px-5 py-3">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="rounded-md border border-[#ededed] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#525252] transition hover:bg-[#f4f4f5]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteImport}
                className="rounded-md bg-[#171717] px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-black"
              >
                Parse &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}