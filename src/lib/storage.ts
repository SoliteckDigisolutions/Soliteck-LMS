import type {
  CompanySettings,
  DepartmentLeaveRecord,
  Employee,
  LeaveEvent,
  MonthlyLeaveSummary,
  Upload,
} from "@/db/schema";
import type { ParsedWorkbook, EmployeeProfileInput } from "@/lib/leave/types";

const LMS_SETTINGS_KEY = "lms_company_settings";
const LMS_EMPLOYEES_KEY = "lms_employees";
const LMS_UPLOADS_KEY = "lms_uploads";
const LMS_SUMMARIES_KEY = "lms_monthly_summaries";
const LMS_EVENTS_KEY = "lms_leave_events";
const LMS_DEPT_RECORDS_KEY = "lms_department_leave_records";

export const DEFAULT_DEPARTMENT_RECORD: DepartmentLeaveRecord = {
  id: "dept_2026-09_initial",
  title: "IT Department Leave Record- 21 September 2026",
  recordDate: "21 September 2026",
  monthKey: "2026-09",
  monthLabel: "September 2026",
  overall: {
    totalEmployee: 29,
    totalBalanceLeaves: 15.75,
    totalAllocatedLeaves: 98.5,
    totalLeaveTaken: 72,
    totalHalfDay: 7,
    totalLateMark: 29,
    leavePercentage: 84.01,
  },
  departments: [
    {
      department: "Android",
      employeeCount: 6,
      totalBalanceLeaves: 21.25,
      totalAllocatedLeaves: 23,
      totalLeaveTaken: 1,
      totalHalfDay: 0,
      totalLateMark: 3,
      leavePercentage: 7.61,
    },
    {
      department: "Design",
      employeeCount: 5,
      totalBalanceLeaves: 11.5,
      totalAllocatedLeaves: 17,
      totalLeaveTaken: 5,
      totalHalfDay: 1,
      totalLateMark: 0,
      leavePercentage: 32.35,
    },
    {
      department: "Front-End",
      employeeCount: 9,
      totalBalanceLeaves: 28.25,
      totalAllocatedLeaves: 35.25,
      totalLeaveTaken: 6,
      totalHalfDay: 0,
      totalLateMark: 4,
      leavePercentage: 19.86,
    },
    {
      department: "Back-End",
      employeeCount: 9,
      totalBalanceLeaves: 14.5,
      totalAllocatedLeaves: 21.75,
      totalLeaveTaken: 5,
      totalHalfDay: 0,
      totalLateMark: 9,
      leavePercentage: 33.33,
    },
  ],
  importedAt: "2026-09-21T00:00:00.000Z",
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  id: 1,
  companyName: "Leave Manager",
  companyLogoUrl: null,
  monthlyLeaveAllocation: 1.3,
  reviewByName: "HR Team",
  defaultManagerName: "Reporting Manager",
  companyFooter: "CONFIDENTIAL HR DOCUMENT",
  updatedAt: new Date().toISOString(),
};

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getItem<T>(key: string, fallback: T): T {
  if (!isClient()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Error reading ${key} from localStorage:`, err);
    return fallback;
  }
}

function setItem<T>(key: string, value: T): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error writing ${key} to localStorage:`, err);
  }
}

export function notifyStorageChange(): void {
  if (!isClient()) return;
  window.dispatchEvent(new Event("lms-data-updated"));
}

export function getStoredSettings(): CompanySettings {
  return getItem<CompanySettings>(LMS_SETTINGS_KEY, DEFAULT_COMPANY_SETTINGS);
}

export function saveStoredSettings(settings: Partial<CompanySettings>): CompanySettings {
  const current = getStoredSettings();
  const updated: CompanySettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  setItem(LMS_SETTINGS_KEY, updated);

  if (isClient()) {
    window.dispatchEvent(
      new CustomEvent("company-settings-updated", {
        detail: {
          companyName: updated.companyName,
          companyLogoUrl: updated.companyLogoUrl,
        },
      }),
    );
  }
  notifyStorageChange();
  return updated;
}

export function getStoredEmployees(): Employee[] {
  return getItem<Employee[]>(LMS_EMPLOYEES_KEY, []);
}

export function saveStoredEmployees(employees: Employee[]): void {
  setItem(LMS_EMPLOYEES_KEY, employees);
}

export function getStoredUploads(): Upload[] {
  return getItem<Upload[]>(LMS_UPLOADS_KEY, []);
}

export function saveStoredUploads(uploads: Upload[]): void {
  setItem(LMS_UPLOADS_KEY, uploads);
}

export function getStoredSummaries(): MonthlyLeaveSummary[] {
  return getItem<MonthlyLeaveSummary[]>(LMS_SUMMARIES_KEY, []);
}

export function saveStoredSummaries(summaries: MonthlyLeaveSummary[]): void {
  setItem(LMS_SUMMARIES_KEY, summaries);
}

export function getStoredEvents(): LeaveEvent[] {
  return getItem<LeaveEvent[]>(LMS_EVENTS_KEY, []);
}

export function saveStoredEvents(events: LeaveEvent[]): void {
  setItem(LMS_EVENTS_KEY, events);
}

export function getStoredDeptRecords(): DepartmentLeaveRecord[] {
  return getItem<DepartmentLeaveRecord[]>(LMS_DEPT_RECORDS_KEY, [DEFAULT_DEPARTMENT_RECORD]);
}

export function saveStoredDeptRecord(record: DepartmentLeaveRecord): void {
  const current = getStoredDeptRecords();
  const filtered = current.filter((r) => r.id !== record.id && r.title !== record.title);
  setItem(LMS_DEPT_RECORDS_KEY, [record, ...filtered]);
  notifyStorageChange();
}

export function deleteStoredDeptRecord(id: string): void {
  const current = getStoredDeptRecords();
  setItem(
    LMS_DEPT_RECORDS_KEY,
    current.filter((r) => r.id !== id),
  );
  notifyStorageChange();
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
}

function dedupeEmployees(parsed: ParsedWorkbook): EmployeeProfileInput[] {
  const map = new Map<string, EmployeeProfileInput>();

  for (const employee of parsed.employees) {
    map.set(employee.employeeCode, employee);
  }

  for (const summary of parsed.summaries) {
    if (!map.has(summary.employeeCode)) {
      map.set(summary.employeeCode, {
        employeeCode: summary.employeeCode,
        employeeName: summary.employeeName,
        department: summary.department,
        team: summary.team ?? null,
        reportingManager: null,
        dateOfJoining: null,
        dateOfConfirmation: null,
        totalBalanceLeaves: summary.totalBalanceLeaves ?? null,
      });
    } else {
      const existing = map.get(summary.employeeCode)!;
      map.set(summary.employeeCode, {
        ...existing,
        totalBalanceLeaves: summary.totalBalanceLeaves ?? existing.totalBalanceLeaves ?? null,
      });
    }
  }

  return Array.from(map.values());
}

export function importParsedWorkbook(parsed: ParsedWorkbook): {
  message: string;
  monthKey: string;
} {
  if (!parsed || !parsed.monthKey || parsed.summaries.length === 0) {
    throw new Error("Parsed workbook payload is missing or incomplete.");
  }

  const existingEmployees = getStoredEmployees();
  const existingUploads = getStoredUploads();
  const existingSummaries = getStoredSummaries();
  const existingEvents = getStoredEvents();

  // Remove previous data for the same monthKey (upsert behavior)
  const filteredUploads = existingUploads.filter((u) => u.monthKey !== parsed.monthKey);
  const filteredSummaries = existingSummaries.filter((s) => s.monthKey !== parsed.monthKey);
  const filteredEvents = existingEvents.filter((e) => e.monthKey !== parsed.monthKey);

  // Process & merge employees
  const employeeInputs = dedupeEmployees(parsed);
  const employeeMap = new Map<string, Employee>();
  let nextEmployeeId = 1;

  for (const emp of existingEmployees) {
    employeeMap.set(emp.employeeCode, emp);
    if (emp.id >= nextEmployeeId) {
      nextEmployeeId = emp.id + 1;
    }
  }

  const now = new Date().toISOString();
  for (const input of employeeInputs) {
    const existing = employeeMap.get(input.employeeCode);
    if (existing) {
      employeeMap.set(input.employeeCode, {
        ...existing,
        employeeName: input.employeeName,
        department: input.department || existing.department || "General",
        team: input.team ?? existing.team,
        reportingManager: input.reportingManager ?? existing.reportingManager,
        dateOfJoining: input.dateOfJoining ?? existing.dateOfJoining,
        dateOfConfirmation: input.dateOfConfirmation ?? existing.dateOfConfirmation,
        updatedAt: now,
      });
    } else {
      const newEmp: Employee = {
        id: nextEmployeeId++,
        employeeCode: input.employeeCode,
        employeeName: input.employeeName,
        department: input.department || "General",
        team: input.team,
        reportingManager: input.reportingManager,
        dateOfJoining: input.dateOfJoining,
        dateOfConfirmation: input.dateOfConfirmation,
        createdAt: now,
        updatedAt: now,
      };
      employeeMap.set(input.employeeCode, newEmp);
    }
  }

  const updatedEmployees = Array.from(employeeMap.values());
  const employeeIdByCode = new Map(updatedEmployees.map((e) => [e.employeeCode, e.id]));
  const employeeIdByName = new Map(
    updatedEmployees.map((e) => [e.employeeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, " "), e.id]),
  );

  const uploadId = randomId();
  const newUpload: Upload = {
    id: uploadId,
    fileName: parsed.fileName,
    monthKey: parsed.monthKey,
    monthLabel: parsed.monthLabel,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    summaryCount: parsed.summaries.length,
    eventCount: parsed.events.length,
    sheetNames: JSON.stringify(parsed.sheetNames),
    notes: JSON.stringify(parsed.notes),
    importedAt: now,
  };

  const newSummaries: MonthlyLeaveSummary[] = [];
  for (const summary of parsed.summaries) {
    const employeeId = employeeIdByCode.get(summary.employeeCode);
    if (!employeeId) continue;

    newSummaries.push({
      id: randomId(),
      uploadId,
      employeeId,
      monthKey: parsed.monthKey,
      monthLabel: parsed.monthLabel,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      approvedPaidLeave: Number(summary.approvedPaidLeave) || 0,
      sickLeave: Number(summary.sickLeave) || 0,
      approvedLeaveWithoutPay: Number(summary.approvedLeaveWithoutPay) || 0,
      unapprovedLeaveWithoutPay: Number(summary.unapprovedLeaveWithoutPay) || 0,
      halfDay: Number(summary.halfDay) || 0,
      lateMark: Number(summary.lateMark) || 0,
      lateMarkWaived: Number(summary.lateMarkWaived) || 0,
      totalTaken: Number(summary.totalTaken) || 0,
      totalBalanceLeaves: summary.totalBalanceLeaves === null || summary.totalBalanceLeaves === undefined ? null : Number(summary.totalBalanceLeaves),
      excessLeaves: Number(summary.excessLeaves) || 0,
      leaveStatus: summary.leaveStatus || "Good",
      meta: "{}",
      createdAt: now,
    });
  }

  const newEvents: LeaveEvent[] = [];
  for (const event of parsed.events) {
    let employeeId = employeeIdByCode.get(event.employeeCode);
    if (!employeeId) {
      const norm = event.employeeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
      employeeId = employeeIdByName.get(norm);
      if (!employeeId) {
        for (const e of updatedEmployees) {
          const eNorm = e.employeeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
          if (eNorm.includes(norm) || norm.includes(eNorm)) {
            employeeId = e.id;
            break;
          }
        }
      }
    }
    if (!employeeId) continue;

    newEvents.push({
      id: randomId(),
      uploadId,
      employeeId,
      monthKey: parsed.monthKey,
      eventDate: event.eventDate,
      leaveCode: event.leaveCode,
      leaveType: event.leaveType,
      reason: event.reason || null,
      leaveCode2: event.leaveCode2 || null,
      leaveType2: event.leaveType2 || null,
      reason2: event.reason2 || null,
      documentSubmitted: event.documentSubmitted || null,
      lateTime: event.lateTime || null,
      lateMinutes: Number(event.lateMinutes) || 0,
      informedStatus: event.informedStatus || null,
      managerApproved: event.managerApproved || null,
      waived: event.waived || null,
      leaveUnits: Number(event.leaveUnits) || 0,
      weekLabel: event.weekLabel,
      meta: "{}",
      createdAt: now,
    });
  }

  saveStoredEmployees(updatedEmployees);
  saveStoredUploads([newUpload, ...filteredUploads]);
  saveStoredSummaries([...filteredSummaries, ...newSummaries]);
  saveStoredEvents([...filteredEvents, ...newEvents]);

  if (parsed.departmentRecord) {
    saveStoredDeptRecord(parsed.departmentRecord);
  }

  notifyStorageChange();

  return {
    message: `Imported ${newSummaries.length} employee summaries for ${parsed.monthLabel}.`,
    monthKey: parsed.monthKey,
  };
}

export function deleteMonthData(monthKey: string): void {
  if (!monthKey) return;

  const currentUploads = getStoredUploads();
  const currentSummaries = getStoredSummaries();
  const currentEvents = getStoredEvents();
  const currentEmployees = getStoredEmployees();

  const filteredUploads = currentUploads.filter((u) => u.monthKey !== monthKey);
  const filteredSummaries = currentSummaries.filter((s) => s.monthKey !== monthKey);
  const filteredEvents = currentEvents.filter((e) => e.monthKey !== monthKey);

  // If other uploads exist, keep employees who have summaries in remaining months
  const remainingEmployeeIds = new Set(filteredSummaries.map((s) => s.employeeId));
  const filteredEmployees =
    filteredUploads.length === 0
      ? []
      : currentEmployees.filter((emp) => remainingEmployeeIds.has(emp.id));

  saveStoredUploads(filteredUploads);
  saveStoredSummaries(filteredSummaries);
  saveStoredEvents(filteredEvents);
  saveStoredEmployees(filteredEmployees);

  if (isClient()) {
    const savedState = window.localStorage.getItem("upload_workspace_state");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed.importedMonthKey === monthKey || parsed.preview?.monthKey === monthKey) {
          window.localStorage.removeItem("upload_workspace_state");
        }
      } catch {
        // ignore JSON parse errors
      }
    }
  }

  notifyStorageChange();
}

export function clearAllStoredData(): void {
  setItem(LMS_EMPLOYEES_KEY, []);
  setItem(LMS_UPLOADS_KEY, []);
  setItem(LMS_SUMMARIES_KEY, []);
  setItem(LMS_EVENTS_KEY, []);
  if (isClient()) {
    window.localStorage.removeItem("upload_workspace_state");
  }
  notifyStorageChange();
}

