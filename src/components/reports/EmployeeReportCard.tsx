"use client";

import { format } from "date-fns";
import {
  CalendarRange,
  PlaneTakeoff,
  AlarmClock,
  Building2,
  FileText,
  User,
  CheckCircle2,
  BarChart3,
  Star,
  ShieldAlert,
  Clock,
  Coffee,
  Stethoscope,
  Timer,
  CalendarX,
  FileWarning,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { CompanySettings, Employee, MonthlyLeaveSummary } from "@/db/schema";
import type { EventRowInput } from "@/lib/leave/types";
import { formatMetric } from "@/lib/utils";

type WeeklyRow = {
  weekLabel: string;
  approvedPaidLeave: number;
  sickLeave: number;
  approvedLeaveWithoutPay: number;
  unapprovedLeaveWithoutPay: number;
  halfDay: number;
  lateMarks: number;
  lateMarkWaived: number;
  totalLeaveTaken: number;
  eventCount: number;
};

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  fontSize: 11,
  boxShadow: "0 12px 40px -8px rgba(15, 23, 42, 0.15)",
  padding: "10px 14px",
  background: "#ffffff",
  color: "#1e293b",
};

// ═══════════════════ LEAVE CATEGORY CONFIG ═══════════════════
const CATEGORY_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    codes: string[];
    accent: string;
    badgeStyle: string;
    iconBg: string;
    iconColor: string;
    border: string;
    headerBg: string;
    rowHover: string;
  }
> = {
  paid: {
    label: "Paid Leave",
    icon: <Coffee size={13} strokeWidth={2.5} />,
    codes: ["PL", "CL", "CO"],
    accent: "indigo",
    badgeStyle: "bg-indigo-100 text-indigo-800 ring-indigo-300",
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-700",
    border: "border-indigo-200",
    headerBg: "bg-gradient-to-r from-indigo-100 via-indigo-50 to-white",
    rowHover: "hover:bg-indigo-50/50",
  },
  sick: {
    label: "Sick Leave",
    icon: <Stethoscope size={13} strokeWidth={2.5} />,
    codes: ["SL"],
    accent: "rose",
    badgeStyle: "bg-rose-100 text-rose-800 ring-rose-300",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-700",
    border: "border-rose-200",
    headerBg: "bg-gradient-to-r from-rose-100 via-rose-50 to-white",
    rowHover: "hover:bg-rose-50/50",
  },
  halfDay: {
    label: "Half Day",
    icon: <CalendarX size={13} strokeWidth={2.5} />,
    codes: ["HD"],
    accent: "amber",
    badgeStyle: "bg-amber-100 text-amber-800 ring-amber-300",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    border: "border-amber-200",
    headerBg: "bg-gradient-to-r from-amber-100 via-amber-50 to-white",
    rowHover: "hover:bg-amber-50/50",
  },
  late: {
    label: "Late Marks",
    icon: <Timer size={13} strokeWidth={2.5} />,
    codes: ["LM", "LMW"],
    accent: "orange",
    badgeStyle: "bg-orange-100 text-orange-800 ring-orange-300",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-700",
    border: "border-orange-200",
    headerBg: "bg-gradient-to-r from-orange-100 via-orange-50 to-white",
    rowHover: "hover:bg-orange-50/50",
  },
  lwp: {
    label: "Leave Without Pay",
    icon: <FileWarning size={13} strokeWidth={2.5} />,
    codes: ["LWP", "ULWP"],
    accent: "slate",
    badgeStyle: "bg-slate-200 text-slate-800 ring-slate-300",
    iconBg: "bg-slate-200",
    iconColor: "text-slate-700",
    border: "border-slate-300",
    headerBg: "bg-gradient-to-r from-slate-100 via-slate-50 to-white",
    rowHover: "hover:bg-slate-50/70",
  },
};

function categorizeEvent(code: string): keyof typeof CATEGORY_CONFIG | "other" {
  const c = code.toUpperCase();
  for (const [key, cfg] of Object.entries(CATEGORY_CONFIG)) {
    if (cfg.codes.includes(c)) return key as keyof typeof CATEGORY_CONFIG;
  }
  return "other";
}

function extractWeekAndPeriod(rawLabel: string, index: number) {
  if (!rawLabel) {
    return { weekName: `Week ${index + 1}`, period: "—" };
  }
  const parenMatch = rawLabel.match(/\((.+?)\)/);
  if (parenMatch) {
    return {
      weekName: rawLabel.split("(")[0].trim() || `Week ${index + 1}`,
      period: parenMatch[1].trim(),
    };
  }
  if (rawLabel.includes(":")) {
    const parts = rawLabel.split(":");
    return {
      weekName: parts[0].trim() || `Week ${index + 1}`,
      period: parts.slice(1).join(":").trim() || "—",
    };
  }
  if (rawLabel.includes(" - ") && rawLabel.toLowerCase().startsWith("week")) {
    const parts = rawLabel.split(" - ");
    return {
      weekName: parts[0].trim(),
      period: parts.slice(1).join(" - ").trim(),
    };
  }
  return {
    weekName: rawLabel.startsWith("Week") ? rawLabel : `Week ${index + 1}`,
    period: "—",
  };
}

function SectionHeader({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#1e3a8a] to-[#3730a3] text-white shadow-sm ring-1 ring-indigo-900/10">
        {icon}
      </div>
      <div className="min-w-0">
        <h4 className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#1e3a8a] leading-tight">
          {title}
        </h4>
        {sub && (
          <p className="text-[11px] leading-tight text-slate-500 mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-slate-200 py-2 last:border-0">
      <span className="text-[11.5px] font-medium text-slate-500">{label}</span>
      <span
        className={`text-[12px] font-semibold tracking-tight ${highlight ? "text-[#1e3a8a]" : "text-slate-800"
          }`}
      >
        {value}
      </span>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  colorClass,
  bgClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className="group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)]">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full ${bgClass} ${colorClass} ring-2 ring-inset ring-current/10 transition-transform duration-200 group-hover:scale-105`}
      >
        {icon}
      </div>
      <p
        className={`text-[22px] font-black leading-none tracking-tight ${colorClass}`}
      >
        {value}
      </p>
      <p className="text-[10px] font-medium text-slate-500">{unit}</p>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
    </div>
  );
}

// ═══════════════════ COMPACT EVENT ROW ═══════════════════
function EventRow({
  event,
  config,
}: {
  event: EventRowInput;
  config: (typeof CATEGORY_CONFIG)[keyof typeof CATEGORY_CONFIG];
}) {
  const code = event.leaveCode.toUpperCase();
  const isLM = code === "LM";
  const isLMW = code === "LMW";
  const isHD = code === "HD";
  const isSL = code === "SL";
  const isPL = code === "PL" || code === "CL" || code === "CO";

  const unitsLabel =
    isPL || isSL
      ? "1.0 day"
      : isHD
        ? "0.5 day"
        : isLM
          ? "0.25 day"
          : isLMW
            ? "Waived"
            : `${event.leaveUnits ?? 1} day`;

  const isInformed =
    event.informedStatus === "Yes" || event.informedStatus === "Informed";

  const hasLate =
    (event.lateMinutes && Number(event.lateMinutes) > 0) || event.lateTime;

  return (
    <div className={`flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors ${config.rowHover}`}>
      {/* Date Pill */}
      <div className={`flex min-w-[52px] flex-col items-center justify-center rounded-md border ${config.border} bg-white px-1.5 py-1.5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]`}>
        <span className={`text-[11px] font-bold leading-none tracking-tight ${config.iconColor}`}>
          {format(new Date(event.eventDate), "dd MMM")}
        </span>
        <span className="mt-1 text-[9px] font-semibold uppercase text-slate-500">
          {format(new Date(event.eventDate), "EEE")}
        </span>
      </div>

      {/* Info Block */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ring-1 ${config.badgeStyle}`}>
            {event.leaveCode}
          </span>
          <span className="text-[10.5px] font-semibold text-slate-600">
            {unitsLabel}
          </span>
          {hasLate && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-300">
              <Clock size={9} />
              {event.lateTime || `${event.lateMinutes}m`}
            </span>
          )}
          {isInformed && (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-300">
              <CheckCircle2 size={9} />
              Informed
            </span>
          )}
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-slate-700 break-words">
          {event.reason || (
            <span className="italic text-slate-400">No reason provided</span>
          )}
        </p>
        {(event.leaveCode2 || event.leaveType2 || event.reason2) && (
          <div className="mt-1.5 border-t border-dashed border-slate-200 pt-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Additional:
              </span>
              <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-slate-800 ring-1 ring-slate-300">
                {event.leaveCode2 || event.leaveType2}
              </span>
              {event.leaveType2 && event.leaveCode2 !== event.leaveType2 && (
                <span className="text-[10px] font-medium text-slate-600">
                  ({event.leaveType2})
                </span>
              )}
            </div>
            {event.reason2 && (
              <p className="mt-1 text-[10px] leading-snug text-slate-600 break-words">
                <span className="font-semibold text-slate-500">Note:</span>{" "}
                {event.reason2}
              </p>
            )}
          </div>
        )}
        {event.documentSubmitted && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Doc:
            </span>
            {(() => {
              const val = event.documentSubmitted;
              const submitted =
                val.toLowerCase().includes("yes") ||
                val.toLowerCase().includes("sub");
              return (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${submitted
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    }`}
                >
                  {submitted ? "✓ " : "✗ "}
                  {val}
                </span>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════ CATEGORY COLUMN ═══════════════════
function CategoryColumn({
  categoryKey,
  events,
  totalDays,
}: {
  categoryKey: keyof typeof CATEGORY_CONFIG;
  events: EventRowInput[];
  totalDays: number;
}) {
  const config = CATEGORY_CONFIG[categoryKey];

  return (
    <div className={`overflow-hidden rounded-lg border ${config.border} bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] break-inside-avoid`}>
      {/* Category Header */}
      <div className={`flex items-center justify-between border-b ${config.border} ${config.headerBg} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <div className={`flex h-6 w-6 items-center justify-center rounded ${config.iconBg} ${config.iconColor}`}>
            {config.icon}
          </div>
          <span className={`text-[11.5px] font-bold uppercase tracking-wide ${config.iconColor}`}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`rounded-md ${config.iconBg} px-2 py-0.5 text-[10px] font-bold ${config.iconColor}`}>
            {events.length} {events.length === 1 ? "entry" : "entries"}
          </span>
          <span className={`text-[11.5px] font-bold ${config.iconColor}`}>
            {totalDays}d
          </span>
        </div>
      </div>

      {/* Events List */}
      <div className="divide-y divide-slate-100 p-1.5">
        {events.length > 0 ? (
          events.map((event, idx) => (
            <EventRow
              key={`${event.eventDate}-${event.leaveCode}-${idx}`}
              event={event}
              config={config}
            />
          ))
        ) : (
          <div className="py-5 text-center text-[10.5px] italic text-slate-400">
            No entries recorded
          </div>
        )}
      </div>
    </div>
  );
}

export function EmployeeReportCard({
  company,
  employee,
  summary,
  snapshot,
  weeklyBreakdown,
  events,
  reportId = "employee-report-card",
}: {
  company: CompanySettings;
  employee: Employee;
  summary: MonthlyLeaveSummary;
  snapshot: {
    leaveStatus: string;
    informedRate: number;
    lateMarks: number;
    waivedLateMarks: number;
    totalTaken: number;
    balanceLeaves: number;
    excessLeaves: number;
  };
  weeklyBreakdown: WeeklyRow[];
  events: EventRowInput[];
  reportId?: string;
}) {
  const trendData = weeklyBreakdown.map((w, i) => {
    const { weekName } = extractWeekAndPeriod(w.weekLabel, i);
    return {
      week: weekName.replace("Week ", "W"),
      fullWeek: weekName,
      Leaves: w.totalLeaveTaken ?? 0,
      LateMarks: w.lateMarks ?? 0,
    };
  });

  const totalPL =
    summary.approvedPaidLeave ??
    weeklyBreakdown.reduce((s, w) => s + (w.approvedPaidLeave ?? 0), 0);
  const totalSL =
    summary.sickLeave ??
    weeklyBreakdown.reduce((s, w) => s + (w.sickLeave ?? 0), 0);
  const totalHD =
    summary.halfDay ??
    weeklyBreakdown.reduce((s, w) => s + (w.halfDay ?? 0), 0);
  const totalLateMarks =
    summary.lateMark ??
    weeklyBreakdown.reduce((s, w) => s + (w.lateMarks ?? 0), 0);
  const totalWaived =
    summary.lateMarkWaived ??
    weeklyBreakdown.reduce((s, w) => s + (w.lateMarkWaived ?? 0), 0);

  const groupedEvents: Record<string, EventRowInput[]> = {
    paid: [],
    sick: [],
    halfDay: [],
    late: [],
    lwp: [],
    other: [],
  };

  for (const event of events) {
    const cat = categorizeEvent(event.leaveCode);
    if (cat === "other") {
      groupedEvents.other.push(event);
    } else {
      groupedEvents[cat].push(event);
    }
  }

  const categoryTotals = {
    paid: groupedEvents.paid.reduce((s, e) => s + (e.leaveUnits ?? 1), 0),
    sick: groupedEvents.sick.reduce((s, e) => s + (e.leaveUnits ?? 1), 0),
    halfDay: groupedEvents.halfDay.length * 0.5,
    late: groupedEvents.late.reduce((s, e) => {
      const code = e.leaveCode.toUpperCase();
      return s + (code === "LM" ? 0.25 : 0);
    }, 0),
    lwp: groupedEvents.lwp.reduce((s, e) => s + (e.leaveUnits ?? 1), 0),
  };

  const activeCategories = (
    ["paid", "sick", "halfDay", "late", "lwp"] as const
  ).filter((k) => groupedEvents[k].length > 0);

  const closingBalance =
    (snapshot.balanceLeaves ?? 0) - (snapshot.totalTaken ?? 0);

  const utilizationPercent =
    snapshot.balanceLeaves > 0
      ? Math.min(
        Math.round(((snapshot.totalTaken ?? 0) / snapshot.balanceLeaves) * 100),
        999
      )
      : 0;

  let closingBalanceStatus = "Satisfactory";
  let closingBalanceColor = "text-emerald-600";
  let closingBalanceBg = "bg-emerald-50";

  if (closingBalance < 0) {
    closingBalanceStatus = "Needs Attention";
    closingBalanceColor = "text-rose-600";
    closingBalanceBg = "bg-rose-50";
  } else if (closingBalance >= 1) {
    closingBalanceStatus = "Good";
    closingBalanceColor = "text-indigo-600";
    closingBalanceBg = "bg-indigo-50";
  }

  const statusMeta = {
    Good: {
      icon: <Star size={22} strokeWidth={2.2} />,
      description: "Excellent leave management — balance carried forward.",
      gradient: "from-indigo-50 via-indigo-50/40 to-white",
      border: "border-indigo-200",
      accent: "bg-gradient-to-br from-indigo-600 to-indigo-700",
      progress: "from-indigo-500 to-indigo-600",
    },
    Satisfactory: {
      icon: <CheckCircle2 size={22} strokeWidth={2.2} />,
      description: "Well-managed leaves within the allocated quota.",
      gradient: "from-emerald-50 via-emerald-50/40 to-white",
      border: "border-emerald-200",
      accent: "bg-gradient-to-br from-emerald-600 to-emerald-700",
      progress: "from-emerald-500 to-emerald-600",
    },
    "Needs Attention": {
      icon: <ShieldAlert size={22} strokeWidth={2.2} />,
      description: "Leave quota exceeded — review recommended.",
      gradient: "from-rose-50 via-rose-50/40 to-white",
      border: "border-rose-200",
      accent: "bg-gradient-to-br from-rose-600 to-rose-700",
      progress: "from-rose-500 to-rose-600",
    },
  }[closingBalanceStatus] ?? {
    icon: <CheckCircle2 size={22} />,
    description: "",
    gradient: "from-slate-50 to-white",
    border: "border-slate-200",
    accent: "bg-slate-600",
    progress: "from-slate-500 to-slate-600",
  };

  return (
    <div className="mx-auto my-6 w-full max-w-[210mm]">
      {/* Action Header — Hidden during printing */}
      <div className="mb-4 flex items-center justify-between px-3 print:hidden">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-800">
            Leave Report Preview
          </h2>
          <p className="text-xs text-slate-500">
            Official HR document generated from record sheets.
          </p>
        </div>
      </div>

      {/* Printable Paper Canvas */}
      <article
        id={reportId}
        className="a4-page mx-auto w-full max-w-[210mm] bg-white font-sans text-slate-800 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.15)] ring-1 ring-slate-100 print:shadow-none print:ring-0"
        style={{
          padding: "12mm 12mm",
          fontSize: "12px",
          lineHeight: 1.45,
        }}
      >
        {/* ═══════════════════ EMPLOYEE INFO + STATS ═══════════════════ */}
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-5">
          {/* Employee Details — spans 3 cols */}
          <div className="md:col-span-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-4">
            <div>
              <SectionHeader
                icon={<User size={15} />}
                title="Employee Information"
                sub="Personal & review period details"
              />
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <div>
                  <DetailRow
                    label="Full Name"
                    value={employee.employeeName}
                    highlight
                  />
                  <DetailRow label="Employee ID" value={employee.employeeCode} />
                </div>
                <div>
                  <DetailRow label="Review Period" value={summary.monthLabel} />
                  <DetailRow label="Company" value={company.companyName} />
                </div>
              </div>
            </div>

            {/* Performance Status Card */}
            <div
              className={`relative overflow-hidden rounded-xl border ${statusMeta.border} bg-gradient-to-br ${statusMeta.gradient} p-4 shadow-[0_1px_3px_rgba(15,23,42,0.03)]`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/40 blur-2xl" />

              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${statusMeta.accent} text-white shadow-md ring-2 ring-white/60`}
                  >
                    {statusMeta.icon}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                        Leave Utilization
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold ${statusMeta.accent} text-white shadow-sm`}
                      >
                        {closingBalanceStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-slate-600">
                      {statusMeta.description}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`text-3xl font-black leading-none tracking-tight ${closingBalanceColor}`}
                  >
                    {utilizationPercent}
                    <span className="text-lg font-bold">%</span>
                  </span>
                </div>
              </div>

              <div className="relative mt-4">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/80 shadow-inner ring-1 ring-slate-200/60">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${statusMeta.progress} transition-all duration-700 ease-out`}
                    style={{
                      width: `${Math.min(Math.max(utilizationPercent, 0), 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats — spans 2 cols */}
          <div className="md:col-span-2 grid grid-cols-2 gap-2.5 content-start">
            <StatCard
              icon={<CalendarRange size={18} />}
              label="Opening Bal."
              value={formatMetric(snapshot.balanceLeaves)}
              unit="allocated"
              colorClass="text-indigo-600"
              bgClass="bg-indigo-50"
            />
            <StatCard
              icon={<PlaneTakeoff size={18} />}
              label="Leave Taken"
              value={formatMetric(snapshot.totalTaken)}
              unit="days"
              colorClass="text-rose-500"
              bgClass="bg-rose-50"
            />
            <StatCard
              icon={<Timer size={18} />}
              label="Late Marks"
              value={String(snapshot.lateMarks)}
              unit={`${snapshot.waivedLateMarks} waived`}
              colorClass="text-amber-600"
              bgClass="bg-amber-50"
            />
            <StatCard
              icon={<AlarmClock size={18} />}
              label="Closing Bal."
              value={formatMetric(closingBalance)}
              unit={closingBalance < 0 ? "over quota" : "remaining"}
              colorClass={closingBalanceColor}
              bgClass={closingBalanceBg}
            />
          </div>
        </div>

        {/* ═══════════════════ WEEKLY LEAVE & LATE TRENDS ═══════════════════ */}
        {trendData.length > 0 && (
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.03)] break-inside-avoid">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHeader
                icon={<BarChart3 size={15} />}
                title="Weekly Leave & Late-Mark Trends"
                sub="Visual breakdown of leaves taken and late marks per week"
              />
              <div className="mt-1 flex gap-3 text-[10.5px] font-semibold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f43f5e] ring-2 ring-rose-100" />
                  Leaves Taken
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f59e0b] ring-2 ring-amber-100" />
                  Late Marks
                </span>
              </div>
            </div>

            <div className="mt-3 h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trendData}
                  margin={{ left: -20, right: 8, top: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="leavesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: "#475569" }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#475569" }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                  <Bar
                    yAxisId="left"
                    dataKey="Leaves"
                    name="Leaves Taken"
                    barSize={24}
                    fill="url(#leavesGradient)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={30}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="LateMarks"
                    name="Late Marks"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ═══════════════════ DETAILED LEAVE LOG — CATEGORY GRID ═══════════════════ */}
        <div className="mb-5">
          {/* Header with Summary Pills */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 via-slate-50/60 to-transparent px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
            <SectionHeader
              icon={<FileText size={15} />}
              title="Detailed Leave & Late-Mark Log"
              sub={`Category-wise breakdown for ${employee.employeeName}`}
            />
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold">
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-indigo-700 ring-1 ring-indigo-200">
                <Coffee size={10} /> Paid
                <span className="font-bold ml-0.5">{totalPL}d</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-rose-700 ring-1 ring-rose-200">
                <Stethoscope size={10} /> Sick
                <span className="font-bold ml-0.5">{totalSL}d</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700 ring-1 ring-amber-200">
                <CalendarX size={10} /> Half Day
                <span className="font-bold ml-0.5">
                  {totalHD} ({totalHD * 0.5}d)
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-orange-700 ring-1 ring-orange-200">
                <Timer size={10} /> Late
                <span className="font-bold ml-0.5">
                  {totalLateMarks} ({totalWaived}w)
                </span>
              </span>
            </div>
          </div>

          {/* Category Grid — 2 column layout with break-inside-avoid */}
          {events.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {activeCategories.map((catKey) => (
                <CategoryColumn
                  key={catKey}
                  categoryKey={catKey}
                  events={groupedEvents[catKey]}
                  totalDays={categoryTotals[catKey]}
                />
              ))}

              {/* Other / uncategorized */}
              {groupedEvents.other.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] break-inside-avoid">
                  <div className="flex items-center justify-between border-b border-slate-300 bg-gradient-to-r from-slate-100 to-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-slate-700">
                        <FileText size={13} strokeWidth={2.5} />
                      </div>
                      <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-700">
                        Other
                      </span>
                    </div>
                    <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {groupedEvents.other.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 p-1.5">
                    {groupedEvents.other.map((event, idx) => (
                      <EventRow
                        key={`other-${idx}`}
                        event={event}
                        config={CATEGORY_CONFIG.lwp}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-3 py-12 text-center text-[11.5px] italic text-slate-500">
              No leave or late-mark entries recorded for this period.
            </div>
          )}
        </div>

        {/* ═══════════════════ MOTIVATIONAL LINE ═══════════════════ */}
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="h-px flex-1 max-w-[100px] bg-gradient-to-r from-transparent to-indigo-200" />
          <p className="text-center text-[11px] font-semibold tracking-wide text-indigo-600">
            ✦ Thank you for your contributions and commitment. Keep up the great work! ✦
          </p>
          <span className="h-px flex-1 max-w-[100px] bg-gradient-to-l from-transparent to-indigo-200" />
        </div>

        {/* ═══════════════════ FOOTER ═══════════════════ */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          <p className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.1em]">
            <Building2 size={11} />
            {company.companyName} &middot; Confidential HR Document
          </p>
          <p className="uppercase tracking-[0.1em]">
            Page 1 of 1 &middot; Generated {format(new Date(), "dd MMM yyyy")}
          </p>
        </footer>
      </article>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .a4-page {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 12mm 12mm !important;
            box-shadow: none !important;
            page-break-after: always;
          }
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}