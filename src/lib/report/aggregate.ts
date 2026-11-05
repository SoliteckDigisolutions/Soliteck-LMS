import { addDays, differenceInCalendarWeeks, endOfMonth, endOfWeek, format, isAfter, isBefore, parseISO, startOfMonth, startOfWeek } from "date-fns";
import type { EventRowInput } from "@/lib/leave/types";
import { percentage, toNumber } from "@/lib/utils";

export const DEFAULT_LEAVE_TYPES: Record<string, string> = {
  PL: "Approve Paid Leave",
  SL: "Sick Leave",
  CL: "Casual Leave",
  CO: "Compensatory Off",
  LWP: "Approve Leave Without Pay",
  ULWP: "Un-approve Leave Without Pay",
  LM: "Late Mark",
  LMW: "Late Mark Waived",
  HD: "Half Day",
};

export function getLeaveUnitsFromCode(code: string) {
  switch (code.toUpperCase()) {
    case "HD":
      return 0.5;
    case "LM":
      return 0.25;
    case "LMW":
      return 0;
    case "PL":
    case "SL":
    case "LWP":
    case "ULWP":
    default:
      return 1;
  }
}

export function getLeaveStatusRating(balance: number) {
  if (balance >= 1) {
    return "Good";
  }

  if (balance >= 0) {
    return "Satisfactory";
  }

  return "Needs Attention";
}

export function buildMonthKeyFromDate(date: string) {
  const parsed = parseISO(date);
  return format(parsed, "yyyy-MM");
}

export function buildWeekLabel(dateValue: string) {
  const date = parseISO(dateValue);
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const firstWeekEnd = isAfter(endOfWeek(monthStart, { weekStartsOn: 1 }), monthEnd)
    ? monthEnd
    : endOfWeek(monthStart, { weekStartsOn: 1 });

  let weekNumber = 1;
  let weekStart = monthStart;
  let weekEnd = firstWeekEnd;

  if (isAfter(date, firstWeekEnd)) {
    const firstFullWeekStart = addDays(firstWeekEnd, 1);
    weekNumber = differenceInCalendarWeeks(date, firstFullWeekStart, {
      weekStartsOn: 1,
    }) + 2;
    weekStart = startOfWeek(date, { weekStartsOn: 1 });
    weekEnd = endOfWeek(date, { weekStartsOn: 1 });

    if (isBefore(weekStart, monthStart)) {
      weekStart = monthStart;
    }

    if (isAfter(weekEnd, monthEnd)) {
      weekEnd = monthEnd;
    }
  }

  return `Week ${weekNumber} (${format(weekStart, "dd-MM")} - ${format(weekEnd, "dd-MM")})`;
}

export function listMonthWeekLabels(periodStart: string, periodEnd: string) {
  const start = parseISO(periodStart);
  const end = parseISO(periodEnd);
  const labels = new Set<string>();

  for (let cursor = start; !isAfter(cursor, end); cursor = addDays(cursor, 1)) {
    labels.add(buildWeekLabel(format(cursor, "yyyy-MM-dd")));
  }

  return Array.from(labels);
}

export function buildEmployeeWeeklyBreakdown(
  events: EventRowInput[],
  periodStart: string,
  periodEnd: string,
) {
  // Always include all weeks of the period so the report table displays the complete month
  const allLabels = new Set<string>();
  if (periodStart && periodEnd) {
    for (const label of listMonthWeekLabels(periodStart, periodEnd)) {
      allLabels.add(label);
    }
  }

  // Also include any week labels present in the parsed line-by-line events
  for (const event of events) {
    if (event.weekLabel) {
      allLabels.add(event.weekLabel);
    }
  }

  const weekNum = (label: string) => {
    const m = label.match(/Week\s*(\d+)/i);
    return m ? Number(m[1]) : 0;
  };

  const orderedLabels = Array.from(allLabels).sort((a, b) => weekNum(a) - weekNum(b));

  const weeks = orderedLabels.map((label) => ({
    weekLabel: label,
    approvedPaidLeave: 0,
    sickLeave: 0,
    approvedLeaveWithoutPay: 0,
    unapprovedLeaveWithoutPay: 0,
    halfDay: 0,
    lateMarks: 0,
    lateMarkWaived: 0,
    totalLeaveTaken: 0,
    eventCount: 0,
  }));

  const byLabel = new Map(weeks.map((week) => [week.weekLabel, week]));

  // Match bucket by exact label OR by week number (e.g. "Week 3")
  function findBucket(label: string) {
    if (!label) return null;
    if (byLabel.has(label)) return byLabel.get(label)!;
    const num = weekNum(label);
    if (num > 0) {
      for (const [k, v] of byLabel.entries()) {
        if (weekNum(k) === num) return v;
      }
    }
    return null;
  }

  for (const event of events) {
    const bucket = findBucket(event.weekLabel);
    if (!bucket) {
      continue;
    }

    bucket.eventCount += 1;

    switch (event.leaveCode.toUpperCase()) {
      case "PL":
        bucket.approvedPaidLeave += event.leaveUnits;
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
      case "SL":
        bucket.sickLeave += event.leaveUnits;
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
      case "CL":
      case "CO":
        // Casual Leave / Compensatory Off — count as taken leave days
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
      case "LWP":
        bucket.approvedLeaveWithoutPay += event.leaveUnits;
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
      case "ULWP":
        bucket.unapprovedLeaveWithoutPay += event.leaveUnits;
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
      case "HD":
        bucket.halfDay += event.leaveUnits;
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
      case "LM":
        bucket.lateMarks += 1;
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
      case "LMW":
        bucket.lateMarkWaived += 1;
        break;
      default:
        bucket.totalLeaveTaken += event.leaveUnits;
        break;
    }
  }

  return weeks;
}

export function datasetStats(
  summaries: Array<{
    totalTaken: number | string;
    lateMark: number | string;
    excessLeaves: number | string;
    totalBalanceLeaves: number | string | null;
  }>,
) {
  const employees = summaries.length;
  const totalLeavesTaken = summaries.reduce((sum, row) => sum + toNumber(row.totalTaken), 0);
  const totalLateMarks = summaries.reduce((sum, row) => sum + toNumber(row.lateMark), 0);
  const atRisk = summaries.filter(
    (row) => toNumber(row.totalBalanceLeaves, 0) < 0 || toNumber(row.excessLeaves, 0) > 0,
  ).length;

  return {
    employees,
    totalLeavesTaken,
    totalLateMarks,
    atRisk,
  };
}

export function monthlyTrend(
  summaries: Array<{
    monthKey: string;
    monthLabel: string;
    totalTaken: number | string;
    lateMark: number | string;
  }>,
) {
  const grouped = new Map<
    string,
    { monthKey: string; monthLabel: string; totalLeaves: number; lateMarks: number }
  >();

  for (const row of summaries) {
    const entry = grouped.get(row.monthKey) ?? {
      monthKey: row.monthKey,
      monthLabel: row.monthLabel,
      totalLeaves: 0,
      lateMarks: 0,
    };

    entry.totalLeaves += toNumber(row.totalTaken);
    entry.lateMarks += toNumber(row.lateMark);
    grouped.set(row.monthKey, entry);
  }

  return Array.from(grouped.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function buildPerformanceSnapshot(summary: {
  totalTaken: number;
  lateMark: number;
  lateMarkWaived: number;
  totalBalanceLeaves: number;
  excessLeaves: number;
}, events: EventRowInput[]) {
  const informedEvents = events.filter((event) =>
    ["yes", "informed"].includes((event.informedStatus ?? "").toLowerCase()),
  ).length;

  return {
    leaveStatus: getLeaveStatusRating(summary.totalBalanceLeaves),
    informedRate: percentage(informedEvents, events.length || 1),
    lateMarks: summary.lateMark,
    waivedLateMarks: summary.lateMarkWaived,
    totalTaken: summary.totalTaken,
    balanceLeaves: summary.totalBalanceLeaves,
    excessLeaves: summary.excessLeaves,
  };
}
