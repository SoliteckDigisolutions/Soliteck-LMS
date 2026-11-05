import {
  DEFAULT_COMPANY_SETTINGS,
  clearAllStoredData,
  deleteMonthData,
  deleteStoredDeptRecord,
  getStoredDeptRecords,
  getStoredEmployees,
  getStoredEvents,
  getStoredSettings,
  getStoredSummaries,
  getStoredUploads,
  saveStoredDeptRecord,
} from "@/lib/storage";
import type { DepartmentLeaveRecord } from "@/db/schema";
import {
  buildEmployeeWeeklyBreakdown,
  buildPerformanceSnapshot,
  datasetStats,
  monthlyTrend,
} from "@/lib/report/aggregate";
import type { EventRowInput } from "@/lib/leave/types";
import { toNumber } from "@/lib/utils";

export async function ensureCompanySettings() {
  // Safe no-op with persistent localStorage
  return getStoredSettings();
}

export async function getCompanySettings() {
  return getStoredSettings();
}

export async function getDashboardData() {
  const settings = getStoredSettings();
  const employeeRows = [...getStoredEmployees()].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName),
  );
  const summaryRows = [...getStoredSummaries()].sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey),
  );
  const uploadRows = [...getStoredUploads()]
    .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime())
    .slice(0, 5);

  const normalizedSummaries = summaryRows.map((row) => ({
    monthKey: row.monthKey,
    monthLabel: row.monthLabel,
    totalTaken: toNumber(row.totalTaken),
    lateMark: toNumber(row.lateMark),
    excessLeaves: toNumber(row.excessLeaves),
    totalBalanceLeaves: row.totalBalanceLeaves === null ? null : toNumber(row.totalBalanceLeaves),
  }));

  return {
    settings,
    employees: employeeRows,
    summaries: summaryRows,
    recentUploads: uploadRows,
    stats: datasetStats(normalizedSummaries),
    trend: monthlyTrend(normalizedSummaries),
    latestMonthKey: summaryRows.at(-1)?.monthKey ?? null,
  };
}

export async function getReportFilters() {
  const uploadRows = [...getStoredUploads()].sort((a, b) =>
    b.monthKey.localeCompare(a.monthKey),
  );
  const months = Array.from(
    new Map(
      uploadRows.map((row) => [row.monthKey, { key: row.monthKey, label: row.monthLabel }]),
    ).values(),
  );
  return { months };
}

export async function getMonthSummaries(monthKey: string) {
  const allSummaries = getStoredSummaries();
  const allEmployees = getStoredEmployees();
  const empMap = new Map(allEmployees.map((e) => [e.id, e]));

  const monthSummaries = allSummaries.filter((s) => s.monthKey === monthKey);

  const combined = monthSummaries.map((summary) => {
    const employee = empMap.get(summary.employeeId) ?? {
      id: summary.employeeId,
      employeeCode: "UNKNOWN",
      employeeName: "Unknown Employee",
      department: "General",
      team: null,
      reportingManager: null,
      dateOfJoining: null,
      dateOfConfirmation: null,
      createdAt: "",
      updatedAt: "",
    };
    return {
      summary,
      employee,
    };
  });

  combined.sort((a, b) => {
    const takenDiff = toNumber(b.summary.totalTaken) - toNumber(a.summary.totalTaken);
    if (takenDiff !== 0) return takenDiff;
    return a.employee.employeeName.localeCompare(b.employee.employeeName);
  });

  return combined.map((row) => ({
    employeeCode: row.employee.employeeCode,
    employeeName: row.employee.employeeName,
    department: row.employee.department,
    team: row.employee.team,
    totalTaken: toNumber(row.summary.totalTaken),
    balanceLeaves:
      row.summary.totalBalanceLeaves === null ? 0 : toNumber(row.summary.totalBalanceLeaves),
    excessLeaves: toNumber(row.summary.excessLeaves),
    lateMarks: toNumber(row.summary.lateMark),
    leaveStatus: row.summary.leaveStatus,
    monthLabel: row.summary.monthLabel,
    periodStart: row.summary.periodStart,
    periodEnd: row.summary.periodEnd,
  }));
}

export async function getMonthEvents(monthKey: string) {
  const allEvents = getStoredEvents();
  const allEmployees = getStoredEmployees();
  const empMap = new Map(allEmployees.map((e) => [e.id, e]));

  const monthEvents = allEvents
    .filter((e) => e.monthKey === monthKey)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  return monthEvents.map((event) => {
    const emp = empMap.get(event.employeeId);
    return {
      employeeCode: emp?.employeeCode ?? "UNKNOWN",
      employeeName: emp?.employeeName ?? "Unknown Employee",
      eventDate: event.eventDate,
      leaveCode: event.leaveCode,
      leaveType: event.leaveType,
      reason: event.reason ?? "",
      leaveCode2: event.leaveCode2 ?? null,
      leaveType2: event.leaveType2 ?? null,
      reason2: event.reason2 ?? null,
      documentSubmitted: event.documentSubmitted ?? null,
      lateTime: event.lateTime ?? null,
      lateMinutes: toNumber(event.lateMinutes),
      informedStatus: event.informedStatus ?? null,
      managerApproved: event.managerApproved ?? null,
      waived: event.waived ?? null,
      leaveUnits: toNumber(event.leaveUnits),
      weekLabel: event.weekLabel,
    } as EventRowInput;
  });
}

export async function getEmployeeMonthlyReport(monthKey: string, employeeCode: string) {
  const allEmployees = getStoredEmployees();
  const allSummaries = getStoredSummaries();
  const allEvents = getStoredEvents();

  const employee = allEmployees.find(
    (e) => e.employeeCode.toLowerCase() === employeeCode.toLowerCase(),
  );
  if (!employee) return null;

  const summary = allSummaries.find(
    (s) => s.monthKey === monthKey && s.employeeId === employee.id,
  );
  if (!summary) return null;

  let eventRows = allEvents
    .filter((e) => e.monthKey === monthKey && e.employeeId === employee.id)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  if (eventRows.length === 0) {
    const targetNorm = employee.employeeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
    eventRows = allEvents
      .filter((e) => e.monthKey === monthKey)
      .filter((e) => {
        const emp = allEmployees.find((item) => item.id === e.employeeId);
        if (!emp) return false;
        const norm = emp.employeeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
        return norm === targetNorm || norm.includes(targetNorm) || targetNorm.includes(norm);
      })
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }

  const reportEvents: EventRowInput[] = eventRows.map((event) => ({
    employeeCode: employee.employeeCode,
    employeeName: employee.employeeName,
    eventDate: event.eventDate,
    leaveCode: event.leaveCode,
    leaveType: event.leaveType,
    reason: event.reason ?? "",
    leaveCode2: event.leaveCode2 ?? null,
    leaveType2: event.leaveType2 ?? null,
    reason2: event.reason2 ?? null,
    documentSubmitted: event.documentSubmitted ?? null,
    lateTime: event.lateTime,
    lateMinutes: event.lateMinutes,
    informedStatus: event.informedStatus,
    managerApproved: event.managerApproved,
    waived: event.waived,
    leaveUnits: toNumber(event.leaveUnits),
    weekLabel: event.weekLabel,
  }));

  const netLM = Math.max(0, toNumber(summary.lateMark) - toNumber(summary.lateMarkWaived));
  const calculatedTaken =
    toNumber(summary.approvedPaidLeave) +
    toNumber(summary.sickLeave) +
    toNumber(summary.approvedLeaveWithoutPay) +
    toNumber(summary.unapprovedLeaveWithoutPay) +
    toNumber(summary.halfDay) * 0.5 +
    netLM * 0.25;

  const totalTakenVal =
    toNumber(summary.totalTaken) > 0 && toNumber(summary.lateMarkWaived) === 0
      ? toNumber(summary.totalTaken)
      : calculatedTaken;

  const summaryData = {
    totalTaken: totalTakenVal,
    lateMark: toNumber(summary.lateMark),
    lateMarkWaived: toNumber(summary.lateMarkWaived),
    totalBalanceLeaves:
      summary.totalBalanceLeaves === null ? 0 : toNumber(summary.totalBalanceLeaves),
    excessLeaves: toNumber(summary.excessLeaves),
  };

  const company = getStoredSettings();

  return {
    company,
    employee,
    summary,
    events: reportEvents,
    weeklyBreakdown: buildEmployeeWeeklyBreakdown(
      reportEvents,
      summary.periodStart,
      summary.periodEnd,
    ),
    snapshot: buildPerformanceSnapshot(summaryData, reportEvents),
  };
}

export async function resetDataset() {
  clearAllStoredData();
}

export async function deleteMonthDataset(monthKey: string) {
  deleteMonthData(monthKey);
}

export async function getEmployeesByCodes(codes: string[]) {
  if (codes.length === 0) return [];
  const codeSet = new Set(codes.map((c) => c.toLowerCase()));
  return getStoredEmployees().filter((e) => codeSet.has(e.employeeCode.toLowerCase()));
}

export async function getDepartmentSummaries(monthKey: string) {
  const allSummaries = getStoredSummaries();
  const allEmployees = getStoredEmployees();
  const empMap = new Map(allEmployees.map((e) => [e.id, e]));

  const monthSummaries = allSummaries.filter((s) => s.monthKey === monthKey);

  // Group by department
  const deptMap = new Map<
    string,
    {
      department: string;
      employeeCount: number;
      totalBalanceLeaves: number;
      totalLeaveTaken: number;
      totalHalfDay: number;
      totalLateMark: number;
      totalLateMarkWaived: number;
      totalUnpaidLeave: number;
    }
  >();

  for (const summary of monthSummaries) {
    const emp = empMap.get(summary.employeeId);
    const dept = emp?.department || "General";

    const existing = deptMap.get(dept) ?? {
      department: dept,
      employeeCount: 0,
      totalBalanceLeaves: 0,
      totalLeaveTaken: toNumber(summary.totalTaken),
      totalHalfDay: 0,
      totalLateMark: 0,
      totalLateMarkWaived: 0,
      totalUnpaidLeave: 0,
    };

    const balanceLeaves = summary.totalBalanceLeaves === null ? 0 : toNumber(summary.totalBalanceLeaves);

    deptMap.set(dept, {
      ...existing,
      employeeCount: existing.employeeCount + 1,
      totalBalanceLeaves: existing.totalBalanceLeaves + balanceLeaves,
      totalLeaveTaken: existing.totalLeaveTaken + toNumber(summary.totalTaken),
      totalHalfDay: existing.totalHalfDay + toNumber(summary.halfDay),
      totalLateMark: existing.totalLateMark + toNumber(summary.lateMark),
      totalLateMarkWaived: existing.totalLateMarkWaived + toNumber(summary.lateMarkWaived),
      totalUnpaidLeave:
        existing.totalUnpaidLeave +
        toNumber(summary.approvedLeaveWithoutPay) +
        toNumber(summary.unapprovedLeaveWithoutPay),
    });
  }

  const departments = Array.from(deptMap.values()).sort((a, b) =>
    a.department.localeCompare(b.department),
  );

  // Overall totals
  const overall = departments.reduce(
    (acc, d) => ({
      employeeCount: acc.employeeCount + d.employeeCount,
      totalBalanceLeaves: acc.totalBalanceLeaves + d.totalBalanceLeaves,
      totalLeaveTaken: acc.totalLeaveTaken + d.totalLeaveTaken,
      totalHalfDay: acc.totalHalfDay + d.totalHalfDay,
      totalLateMark: acc.totalLateMark + d.totalLateMark,
      totalLateMarkWaived: acc.totalLateMarkWaived + d.totalLateMarkWaived,
      totalUnpaidLeave: acc.totalUnpaidLeave + d.totalUnpaidLeave,
    }),
    {
      employeeCount: 0,
      totalBalanceLeaves: 0,
      totalLeaveTaken: 0,
      totalHalfDay: 0,
      totalLateMark: 0,
      totalLateMarkWaived: 0,
      totalUnpaidLeave: 0,
    },
  );

  return {
    departments,
    overall,
  };
}

export async function getIndependentDeptRecords(): Promise<DepartmentLeaveRecord[]> {
  return getStoredDeptRecords();
}

export async function getIndependentDeptRecord(idOrMonthKey: string): Promise<DepartmentLeaveRecord | null> {
  const records = getStoredDeptRecords();
  return records.find((r) => r.id === idOrMonthKey || r.monthKey === idOrMonthKey || r.title === idOrMonthKey) || records[0] || null;
}

export async function saveIndependentDeptRecord(record: DepartmentLeaveRecord): Promise<void> {
  saveStoredDeptRecord(record);
}

export async function deleteIndependentDeptRecord(id: string): Promise<void> {
  deleteStoredDeptRecord(id);
}
