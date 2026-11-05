export interface CompanySettings {
  id: number;
  companyName: string;
  companyLogoUrl: string | null;
  monthlyLeaveAllocation: number;
  reviewByName: string;
  defaultManagerName: string;
  companyFooter: string;
  updatedAt: string;
}

export interface Employee {
  id: number;
  employeeCode: string;
  employeeName: string;
  department: string;
  team: string | null;
  reportingManager: string | null;
  dateOfJoining: string | null;
  dateOfConfirmation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Upload {
  id: string;
  fileName: string;
  monthKey: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  summaryCount: number;
  eventCount: number;
  sheetNames: string; // JSON array string
  notes: string; // JSON array string
  importedAt: string;
}

export interface MonthlyLeaveSummary {
  id: string;
  uploadId: string;
  employeeId: number;
  monthKey: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
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
  meta: string;
  createdAt: string;
}

export interface LeaveEvent {
  id: string;
  uploadId: string;
  employeeId: number;
  monthKey: string;
  eventDate: string;
  leaveCode: string;
  leaveType: string;
  reason: string | null;
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
  meta: string;
  createdAt: string;
}

export type { DepartmentLeaveItem, DepartmentLeaveRecord } from "@/lib/leave/types";