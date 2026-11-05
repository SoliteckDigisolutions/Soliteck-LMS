export type EmployeeProfileInput = {
  employeeCode: string;
  employeeName: string;
  department: string;
  team: string | null;
  reportingManager: string | null;
  dateOfJoining: string | null;
  dateOfConfirmation: string | null;
  totalBalanceLeaves: number | null;
};

export type SummaryRowInput = {
  employeeCode: string;
  employeeName: string;
  department: string;
  team: string | null;
  approvedPaidLeave: number;
  sickLeave: number;
  approvedLeaveWithoutPay: number;
  unapprovedLeaveWithoutPay: number;
  halfDay: number;
  lateMark: number;
  lateMarkWaived: number;
  totalTaken: number;
  totalBalanceLeaves: number | null;
  excessLeaves: number;
  leaveStatus: string;
};

export type EventRowInput = {
  employeeCode: string;
  employeeName: string;
  eventDate: string;
  leaveCode: string;
  leaveType: string;
  reason: string;
  leaveCode2?: string | null;
  leaveType2?: string | null;
  reason2?: string | null;
  documentSubmitted?: string | null;
  lateTime: string | null;
  lateMinutes: number;
  informedStatus: string | null;
  managerApproved: string | null;
  waived: string | null;
  leaveUnits: number;
  weekLabel: string;
};

export type DepartmentLeaveItem = {
  department: string;
  employeeCount: number;
  totalBalanceLeaves: number;
  totalAllocatedLeaves?: number;
  totalLeaveTaken: number;
  totalHalfDay: number;
  totalLateMark: number;
  totalLateMarkWaived?: number;
  totalUnpaidLeave?: number;
  leavePercentage: number;
};

export type DepartmentLeaveRecord = {
  id: string;
  title: string;
  recordDate: string;
  monthKey: string;
  monthLabel: string;
  overall: {
    totalEmployee: number;
    totalBalanceLeaves: number;
    totalAllocatedLeaves?: number;
    totalLeaveTaken: number;
    totalHalfDay: number;
    totalLateMark: number;
    totalLateMarkWaived?: number;
    totalUnpaidLeave?: number;
    leavePercentage: number;
  };
  departments: DepartmentLeaveItem[];
  importedAt: string;
};

export type ParsedWorkbook = {
  fileName: string;
  monthKey: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  sheetNames: string[];
  employees: EmployeeProfileInput[];
  summaries: SummaryRowInput[];
  events: EventRowInput[];
  leaveTypes: Record<string, string>;
  notes: string[];
  departmentRecord?: DepartmentLeaveRecord | null;
  preview: {
    summarySample: SummaryRowInput[];
    eventSample: EventRowInput[];
    employeeSample: EmployeeProfileInput[];
  };
};
