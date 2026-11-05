import { format, parse } from "date-fns";
import * as XLSX from "xlsx";
import {
  DEFAULT_LEAVE_TYPES,
  buildWeekLabel,
  getLeaveStatusRating,
  getLeaveUnitsFromCode,
} from "@/lib/report/aggregate";
import { formatMonthLabel, safeText, toNumber } from "@/lib/utils";
import type {
  DepartmentLeaveItem,
  DepartmentLeaveRecord,
  EmployeeProfileInput,
  EventRowInput,
  ParsedWorkbook,
  SummaryRowInput,
} from "@/lib/leave/types";

function normalizeHeader(value: unknown) {
  return safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDateCell(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }

  const text = safeText(value);

  if (!text) {
    return null;
  }

  const patterns = ["d-MMM-yy", "dd-MMM-yy", "d-MMM-yyyy", "dd-MMM-yyyy", "d-M-yy", "dd-MM-yy", "yyyy-MM-dd", "MM/dd/yyyy"];

  for (const pattern of patterns) {
    const parsed = parse(text, pattern, new Date());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function toIsoDate(value: unknown) {
  const date = parseDateCell(value);
  return date ? format(date, "yyyy-MM-dd") : null;
}

/**
 * Convert an Excel time value to "HH:MM" or "HH:MM:SS".
 * Excel stores time-of-day as a day fraction: 0.4027777… → 09:40.
 */
function formatExcelTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    // Day fraction  0 <= f < 1
    const fraction = value >= 1 ? value - Math.floor(value) : value;
    if (fraction > 0 && fraction < 1) {
      const totalSeconds = Math.round(fraction * 86400);
      const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
      const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const ss = totalSeconds % 60;
      return ss > 0 ? `${hh}:${mm}:${String(ss).padStart(2, "0")}` : `${hh}:${mm}`;
    }
  }

  const text = safeText(value).trim();
  if (!text) return null;

  // Numeric string that looks like a day fraction e.g. "0.4027777777777778"
  const num = Number(text);
  if (!Number.isNaN(num) && num > 0 && num < 1 && text.includes(".")) {
    return formatExcelTime(num);
  }

  // Already a time string like "09:40" or "9:40:00"
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2];
    const seconds = timeMatch[3];
    const mod = timeMatch[4]?.toUpperCase();
    if (mod === "PM" && hours < 12) hours += 12;
    if (mod === "AM" && hours === 12) hours = 0;
    const hh = String(hours).padStart(2, "0");
    return seconds ? `${hh}:${minutes}:${seconds}` : `${hh}:${minutes}`;
  }

  return text;
}

/**
 * Parse a late-minutes cell that may be:
 *   - A plain number of minutes (e.g. 40)
 *   - An Excel time fraction (e.g. 0.027777… = 40 min = 0.027777 × 1440)
 *   - A string version of either of the above
 *   - A "HH:MM" string (converted to total minutes)
 */
function parseLateMinutes(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    if (value > 0 && value < 1) {
      // Excel time fraction → convert to minutes and round off IEEE 754 noise
      return Math.round(value * 1440 * 100) / 100;
    }
    return Math.round(value * 100) / 100;
  }

  const text = safeText(value).trim();
  if (!text) return 0;

  // Plain numeric string (including decimal fractions like "0.027777...")
  const num = Number(text);
  if (!Number.isNaN(num)) return parseLateMinutes(num);

  // Time string "H:MM" or "HH:MM" → total minutes
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    return parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
  }

  return 0;
}

function findCellNearLabel(rows: unknown[][], label: string) {
  const normalizedLabel = normalizeHeader(label);

  for (const row of rows.slice(0, 8)) {
    for (let index = 0; index < row.length; index += 1) {
      if (normalizeHeader(row[index]) === normalizedLabel) {
        return row[index + 1] ?? row[index + 2] ?? null;
      }
    }
  }

  return null;
}

function combineHeader(rows: unknown[][], columnIndex: number, uptoRow = 6) {
  return normalizeHeader(
    rows
      .slice(0, uptoRow)
      .map((row) => row[columnIndex])
      .filter(Boolean)
      .join(" "),
  );
}

function findSheetByHeaders(sheets: Array<{ name: string; rows: unknown[][] }>, required: string[]) {
  return sheets.find((sheet) => {
    const headerBlob = sheet.rows
      .slice(0, 12)
      .map((row) => row.map(normalizeHeader).join(" | "))
      .join(" \n ");

    return required.every((needle) => headerBlob.includes(normalizeHeader(needle)));
  });
}

function buildSummaryHeaderMap(rows: unknown[][]) {
  const maxColumns = Math.max(...rows.slice(0, 6).map((row) => row.length), 0);
  const headers = Array.from({ length: maxColumns }, (_, columnIndex) => ({
    columnIndex,
    label: combineHeader(rows, columnIndex),
  }));

  const findColumn = (...needles: string[]) =>
    headers.find((header) => needles.every((needle) => header.label.includes(needle)))?.columnIndex ?? -1;

  return {
    employeeCode: findColumn("emp", "id"),
    department: findColumn("department"),
    employeeName: findColumn("emp", "name"),
    approvedPaidLeave: findColumn("approve", "paid", "leave"),
    sickLeave: findColumn("sick", "leave"),
    approvedLeaveWithoutPay: headers.find((header) =>
      header.label.includes("approve") && header.label.includes("without") && header.label.includes("pay") && !header.label.includes("un approve") && !header.label.includes("unapprove"),
    )?.columnIndex ?? -1,
    unapprovedLeaveWithoutPay: headers.find((header) =>
      (header.label.includes("un approve") || header.label.includes("unapprove")) && header.label.includes("without") && header.label.includes("pay"),
    )?.columnIndex ?? -1,
    halfDay: findColumn("half", "day"),
    lateMark: headers.find((header) => header.label.includes("late") && header.label.includes("mark") && !header.label.includes("waiv"))?.columnIndex ?? -1,
    lateMarkWaived: headers.find((header) => header.label.includes("late") && header.label.includes("waiv"))?.columnIndex ?? -1,
    totalTaken:
      // Prefer explicit "Total Taken" column
      headers.find((header) => header.label.includes("total") && header.label.includes("taken"))?.columnIndex ??
      // Fallback: any "total" column that is NOT balance / excess / late mark
      headers.find(
        (header) =>
          header.label.includes("total") &&
          !header.label.includes("balance") &&
          !header.label.includes("excess") &&
          !header.label.includes("late") &&
          !header.label.includes("mark"),
      )?.columnIndex ??
      -1,
    totalBalanceLeaves: headers.find((header) => header.label.includes("balance") && header.label.includes("leave"))?.columnIndex ?? -1,
    excessLeaves: headers.find((header) => header.label.includes("excess"))?.columnIndex ?? -1,
  };
}

function parseSummarySheet(rows: unknown[][]) {
  const periodStart = toIsoDate(findCellNearLabel(rows, "Start Date")) ?? format(new Date(), "yyyy-MM-01");
  const periodEnd = toIsoDate(findCellNearLabel(rows, "End Date")) ?? periodStart;
  const monthKey = format(new Date(`${periodStart}T00:00:00`), "yyyy-MM");
  const monthLabel = formatMonthLabel(monthKey);
  const columns = buildSummaryHeaderMap(rows);

  const summaries: SummaryRowInput[] = [];

  for (const row of rows) {
    const employeeCode = safeText(row[columns.employeeCode]);
    const employeeName = safeText(row[columns.employeeName]);
    const department = safeText(row[columns.department]);

    if (!employeeName || normalizeHeader(employeeName).includes("emp name")) {
      continue;
    }

    if (!employeeCode && !department) {
      continue;
    }

    summaries.push({
      employeeCode: employeeCode || employeeName.replace(/\s+/g, "-").toLowerCase(),
      employeeName,
      department: department || "General",
      team: department || null,
      approvedPaidLeave: toNumber(row[columns.approvedPaidLeave]),
      sickLeave: toNumber(row[columns.sickLeave]),
      approvedLeaveWithoutPay: toNumber(row[columns.approvedLeaveWithoutPay]),
      unapprovedLeaveWithoutPay: toNumber(row[columns.unapprovedLeaveWithoutPay]),
      halfDay: toNumber(row[columns.halfDay]),
      lateMark: toNumber(row[columns.lateMark]),
      lateMarkWaived: toNumber(row[columns.lateMarkWaived]),
      totalTaken: toNumber(row[columns.totalTaken]),
      totalBalanceLeaves:
        columns.totalBalanceLeaves >= 0 ? toNumber(row[columns.totalBalanceLeaves], 0) : null,
      excessLeaves: toNumber(row[columns.excessLeaves]),
      leaveStatus: "Good",
    });
  }

  for (const summary of summaries) {
    const closingBalance = (summary.totalBalanceLeaves ?? 0) - summary.totalTaken;
    summary.leaveStatus = getLeaveStatusRating(closingBalance);
  }

  return {
    monthKey,
    monthLabel,
    periodStart,
    periodEnd,
    summaries,
  };
}

function parseEmployeeSheet(rows: unknown[][]) {
  const headerRowIndex = rows.findIndex((row) => {
    const blob = row.map(normalizeHeader).join(" | ");
    return blob.includes("employee code") && blob.includes("employee name");
  });

  if (headerRowIndex === -1) {
    return [] as EmployeeProfileInput[];
  }

  const header = rows[headerRowIndex].map(normalizeHeader);
  const codeIndex = header.findIndex((value) => value.includes("employee code"));
  const nameIndex = header.findIndex((value) => value.includes("employee name"));
  const joiningIndex = header.findIndex((value) => value.includes("joining"));
  const confirmationIndex = header.findIndex((value) => value.includes("confirmation"));
  const balanceIndex = header.findIndex((value) => value.includes("balance"));
  const monthIndex = header.findIndex((value) => value.includes("month list"));

  const employees: EmployeeProfileInput[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const employeeCode = safeText(row[codeIndex]);
    const employeeName = safeText(row[nameIndex]);

    if (!employeeCode || !employeeName) {
      continue;
    }

    employees.push({
      employeeCode,
      employeeName,
      department: safeText(row[monthIndex]) || "General",
      team: null,
      reportingManager: null,
      dateOfJoining: joiningIndex >= 0 ? toIsoDate(row[joiningIndex]) : null,
      dateOfConfirmation: confirmationIndex >= 0 ? toIsoDate(row[confirmationIndex]) : null,
      totalBalanceLeaves: balanceIndex >= 0 ? toNumber(row[balanceIndex], 0) : null,
    });
  }

  return employees;
}

function parseLeaveTypeSheet(rows: unknown[][]) {
  const headerRowIndex = rows.findIndex((row) => {
    const blob = row.map(normalizeHeader).join(" | ");
    return blob.includes("leave type") && blob.includes("leave code");
  });

  const mapping = { ...DEFAULT_LEAVE_TYPES };

  if (headerRowIndex === -1) {
    return mapping;
  }

  const header = rows[headerRowIndex].map(normalizeHeader);
  const typeIndex = header.findIndex((value) => value.includes("leave type"));
  const codeIndex = header.findIndex((value) => value.includes("leave code"));

  for (const row of rows.slice(headerRowIndex + 1)) {
    const code = safeText(row[codeIndex]).toUpperCase();
    const label = safeText(row[typeIndex]);

    if (code && label) {
      mapping[code] = label;
    }
  }

  return mapping;
}

function looksLikeStatus(value: string) {
  const normalized = normalizeHeader(value);
  return normalized === "yes" || normalized === "no" || normalized.includes("inform");
}

/**
 * Parses the "Mark Leave" sheet by its proper column headers.
 * Columns detected: EMP Name | Date | Leave Type (code) | Reason |
 *                   Late Time | Late by (mins) | Informed | Manager Approved | Waived
 * Employee matching is done by normalised EMP Name → employee code from summaries.
 */
function parseMarkLeaveSheet(
  rows: unknown[][],
  summaries: SummaryRowInput[],
  leaveTypes: Record<string, string>,
): EventRowInput[] {
  // Build employee lookup maps from summaries
  const employeeCodeByName = new Map(
    summaries.map((s) => [normalizeHeader(s.employeeName), s]),
  );
  const summaryByCode = new Map(
    summaries.map((s) => [normalizeHeader(s.employeeCode), s]),
  );

  // Helper to resolve employee code & canonical name from summaries
  function resolveEmployee(codeRaw: string, nameRaw: string): { code: string; canonicalName: string } {
    if (codeRaw) {
      const directCode = summaryByCode.get(normalizeHeader(codeRaw));
      if (directCode) return { code: directCode.employeeCode, canonicalName: directCode.employeeName };
    }

    const norm = normalizeHeader(nameRaw);
    if (!norm) return { code: codeRaw || "", canonicalName: nameRaw || codeRaw };

    const direct = employeeCodeByName.get(norm);
    if (direct) return { code: direct.employeeCode, canonicalName: direct.employeeName };

    // Substring / partial match fallback
    for (const s of summaries) {
      const sNorm = normalizeHeader(s.employeeName);
      if (sNorm && (sNorm.includes(norm) || norm.includes(sNorm))) {
        return { code: s.employeeCode, canonicalName: s.employeeName };
      }
    }

    return {
      code: codeRaw || nameRaw.replace(/\s+/g, "-").toLowerCase(),
      canonicalName: nameRaw || codeRaw,
    };
  }

  // Find the header row by looking for key column names
  const headerRowIndex = rows.findIndex((row) => {
    const blob = row.map(normalizeHeader).join(" | ");
    return (
      (blob.includes("emp") || blob.includes("name")) &&
      blob.includes("date") &&
      (blob.includes("leave") || blob.includes("type") || blob.includes("code") || blob.includes("reason") || blob.includes("late"))
    );
  });

  if (headerRowIndex === -1) return [];

  const header = rows[headerRowIndex].map(normalizeHeader);

  // Map each logical column to its index
  const leaveCode2Index = header.findIndex((h) =>
    h.includes("leave type 2") || h.includes("leave code 2") || h.includes("type 2") || h.includes("code 2") || h.includes("leave 2") || h.includes("type2") || h.includes("code2")
  );

  const leaveCode1Index = header.findIndex((h, idx) =>
    idx !== leaveCode2Index &&
    (h.includes("leave type") || h.includes("leave code") || h.includes("type") || h.includes("code") || h.includes("leave"))
  );

  const reason2Index = header.findIndex((h) =>
    h.includes("reason 2") || h.includes("remarks 2") || h.includes("remark 2") || h.includes("reason2") || h.includes("remarks2")
  );

  const reason1Index = header.findIndex((h, idx) =>
    idx !== reason2Index &&
    (h.includes("reason") || h.includes("remarks") || h.includes("remark"))
  );

  const col = {
    empCode:         header.findIndex((h) => (h.includes("emp") && (h.includes("id") || h.includes("code"))) || h.includes("employee id") || h.includes("employee code")),
    empName:         header.findIndex((h) => (h.includes("emp") && h.includes("name")) || (h.includes("employee") && h.includes("name")) || h === "name" || h === "employee"),
    date:            header.findIndex((h) => h === "date" || h.includes("date") || h.includes("leave date")),
    leaveCode:       leaveCode1Index >= 0 ? leaveCode1Index : header.findIndex((h) => h.includes("leave type") || h.includes("leave code") || h.includes("type") || h.includes("code") || h.includes("leave")),
    leaveCode2:      leaveCode2Index,
    reason:          reason1Index >= 0 ? reason1Index : header.findIndex((h) => h.includes("reason") || h.includes("remarks") || h.includes("remark")),
    reason2:         reason2Index,
    documentSubmitted: header.findIndex((h) => h.includes("document") || h.includes("doc submitted") || h.includes("doc sub") || h.includes("doc status") || (h.includes("doc") && h.includes("submit"))),
    lateTime:        header.findIndex((h) => h.includes("late time") || h.includes("in time") || h.includes("punch time")),
    lateMinutes:     header.findIndex((h) => h.includes("late by") || (h.includes("late") && h.includes("min")) || h.includes("minutes")),
    informed:        header.findIndex((h) => h.includes("inform")),
    managerApproved: header.findIndex((h) => h.includes("manager") || h.includes("approved")),
    waived:          header.findIndex((h) => h.includes("waiv")),
  };

  const allKnownTypes = { ...DEFAULT_LEAVE_TYPES, ...leaveTypes };
  const events: EventRowInput[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const rawEmployeeName = col.empName >= 0 ? safeText(row[col.empName]) : "";
    const rawEmployeeCode = col.empCode >= 0 ? safeText(row[col.empCode]) : "";

    if (!rawEmployeeName && !rawEmployeeCode) continue;
    if (normalizeHeader(rawEmployeeName).includes("emp name") || normalizeHeader(rawEmployeeCode).includes("emp id")) continue;

    const eventDate = col.date >= 0 ? toIsoDate(row[col.date]) : null;
    if (!eventDate) continue;

    let rawCode = col.leaveCode >= 0 ? safeText(row[col.leaveCode]).trim().toUpperCase() : "";
    if (!rawCode) {
      const lateMins = col.lateMinutes >= 0 ? safeText(row[col.lateMinutes]) : "";
      const lateTime = col.lateTime >= 0 ? safeText(row[col.lateTime]) : "";
      if (lateMins || lateTime) {
        rawCode = "LM";
      } else {
        continue;
      }
    }

    // Normalise descriptive leave text to standard leave codes
    if (rawCode.includes("SICK")) rawCode = "SL";
    else if (rawCode.includes("HALF")) rawCode = "HD";
    else if (rawCode.includes("PAID") || rawCode === "PRIVILEGE LEAVE" || rawCode === "PL") rawCode = "PL";
    else if (rawCode.includes("WAIV")) rawCode = "LMW";
    else if (rawCode.includes("LATE") || rawCode === "LM") rawCode = "LM";
    else if (rawCode.includes("UNAPPROVE") || rawCode.includes("UN APPROVE") || rawCode === "ULWP") rawCode = "ULWP";
    else if (rawCode.includes("WITHOUT") || rawCode === "LWP") rawCode = "LWP";
    else if (rawCode.includes("CASUAL") || rawCode === "CL") rawCode = "CL";
    else if (rawCode.includes("COMP") || rawCode === "CO") rawCode = "CO";

    // Secondary leave type & reason (if Leave Type 2 column exists)
    let rawCode2 = col.leaveCode2 >= 0 ? safeText(row[col.leaveCode2]).trim().toUpperCase() : "";
    const reason2Val = col.reason2 >= 0 ? safeText(row[col.reason2]) : "";

    if (rawCode2.includes("SICK")) rawCode2 = "SL";
    else if (rawCode2.includes("HALF")) rawCode2 = "HD";
    else if (rawCode2.includes("PAID") || rawCode2 === "PRIVILEGE LEAVE" || rawCode2 === "PL") rawCode2 = "PL";
    else if (rawCode2.includes("WAIV")) rawCode2 = "LMW";
    else if (rawCode2.includes("LATE") || rawCode2 === "LM") rawCode2 = "LM";
    else if (rawCode2.includes("UNAPPROVE") || rawCode2.includes("UN APPROVE") || rawCode2 === "ULWP") rawCode2 = "ULWP";
    else if (rawCode2.includes("WITHOUT") || rawCode2 === "LWP") rawCode2 = "LWP";
    else if (rawCode2.includes("CASUAL") || rawCode2 === "CL") rawCode2 = "CL";
    else if (rawCode2.includes("COMP") || rawCode2 === "CO") rawCode2 = "CO";

    const leaveType2Val = rawCode2 ? (allKnownTypes[rawCode2] ?? rawCode2) : null;

    const { code: employeeCode, canonicalName } = resolveEmployee(rawEmployeeCode, rawEmployeeName);

    const lateTimeRaw  = col.lateTime        >= 0 ? (formatExcelTime(row[col.lateTime]) ?? "") : "";
    const informedRaw  = col.informed        >= 0 ? safeText(row[col.informed])        : "";
    const managerRaw   = col.managerApproved >= 0 ? safeText(row[col.managerApproved]) : "";
    const waivedRaw    = col.waived          >= 0 ? safeText(row[col.waived])          : "";

    if (rawCode === "LM" && waivedRaw && (normalizeHeader(waivedRaw) === "yes" || normalizeHeader(waivedRaw).includes("waiv"))) {
      rawCode = "LMW";
    }

    const docSubmittedRaw = col.documentSubmitted >= 0 ? safeText(row[col.documentSubmitted]) : "";

    events.push({
      employeeCode,
      employeeName:    canonicalName,
      eventDate,
      leaveCode:       rawCode,
      leaveType:       allKnownTypes[rawCode] ?? rawCode,
      reason:          col.reason >= 0 ? safeText(row[col.reason]) : "",
      leaveCode2:      rawCode2 || null,
      leaveType2:      leaveType2Val || null,
      reason2:         reason2Val || null,
      documentSubmitted: docSubmittedRaw || null,
      lateTime:        lateTimeRaw || null,
      lateMinutes:     col.lateMinutes >= 0 ? parseLateMinutes(row[col.lateMinutes]) : 0,
      informedStatus:  informedRaw || null,
      managerApproved: managerRaw || null,
      waived:          waivedRaw || null,
      leaveUnits:      getLeaveUnitsFromCode(rawCode),
      weekLabel:       buildWeekLabel(eventDate),
    });
  }

  // Sort events datewise ascending
  events.sort((a, b) => {
    const d = a.eventDate.localeCompare(b.eventDate);
    if (d !== 0) return d;
    return a.employeeName.localeCompare(b.employeeName);
  });

  return events;
}

function parseEventSheets(
  sheets: Array<{ name: string; rows: unknown[][] }>,
  summaries: SummaryRowInput[],
  leaveTypes: Record<string, string>,
) {
  const employeeCodeByName = new Map(
    summaries.map((summary) => [normalizeHeader(summary.employeeName), summary.employeeCode]),
  );

  const knownCodes = new Set(Object.keys({ ...DEFAULT_LEAVE_TYPES, ...leaveTypes }));
  const events: EventRowInput[] = [];

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      const values = row.map((cell) => (typeof cell === "string" ? cell.trim() : cell));
      const dateIndex = values.findIndex((cell) => Boolean(parseDateCell(cell)));

      if (dateIndex < 1 || dateIndex >= values.length - 1) {
        continue;
      }

      const leaveCode = safeText(values[dateIndex + 1]).toUpperCase();
      if (!knownCodes.has(leaveCode)) {
        continue;
      }

      const eventDate = toIsoDate(values[dateIndex]);
      const employeeName = safeText(values[dateIndex - 1]);

      if (!eventDate || !employeeName) {
        continue;
      }

      const reason = safeText(values[dateIndex + 2]);
      const trailing = values.slice(dateIndex + 3).map((value) => safeText(value)).filter(Boolean);
      const lateTime = trailing.find((value) => /^\d{1,2}:\d{2}$/.test(value)) ?? null;
      const lateMinutes = trailing.find((value) => /^\d+$/.test(value));
      const statusValues = trailing.filter(looksLikeStatus);
      const informedStatus = statusValues[0] ?? null;
      const managerApproved = statusValues[1] ?? null;
      const waived = statusValues[2] ?? null;
      const normalizedEmployeeName = normalizeHeader(employeeName);
      const employeeCode =
        employeeCodeByName.get(normalizedEmployeeName) ?? safeText(values[dateIndex - 2]) ?? employeeName;

      events.push({
        employeeCode,
        employeeName,
        eventDate,
        leaveCode,
        leaveType: leaveTypes[leaveCode] ?? DEFAULT_LEAVE_TYPES[leaveCode] ?? leaveCode,
        reason,
        lateTime,
        lateMinutes: lateMinutes ? Number(lateMinutes) : 0,
        informedStatus,
        managerApproved,
        waived,
        leaveUnits: getLeaveUnitsFromCode(leaveCode),
        weekLabel: buildWeekLabel(eventDate),
      });
    }
  }

  // Sort events datewise ascending
  events.sort((a, b) => {
    const d = a.eventDate.localeCompare(b.eventDate);
    if (d !== 0) return d;
    return a.employeeName.localeCompare(b.employeeName);
  });

  return events;
}

export function parseDepartmentWiseLeavesSheet(
  rows: unknown[][],
  sheetName = "Department wise leaves",
): DepartmentLeaveRecord | null {
  if (!rows || rows.length === 0) return null;

  function getRowNumbers(row: unknown[]): number[] {
    const nums: number[] = [];
    for (let i = 1; i < row.length; i++) {
      const val = row[i];
      if (val !== null && val !== undefined && val !== "") {
        const n =
          typeof val === "number"
            ? val
            : parseFloat(String(val).replace(/[%,\s]/g, ""));
        if (!Number.isNaN(n)) nums.push(n);
      }
    }
    return nums;
  }

  const isMetricRow = (text: string) =>
    /total employee|leave balance|leave taken|half day|late mark|leave percentage|unpaid/i.test(
      text,
    );

  let title = "";
  let currentName = "";
  let currentData = {
    employeeCount: 0,
    totalBalanceLeaves: 0,
    totalAllocatedLeaves: undefined as number | undefined,
    totalLeaveTaken: 0,
    totalHalfDay: 0,
    totalLateMark: 0,
    leavePercentage: 0,
  };
  let hasData = false;
  let overall: DepartmentLeaveRecord["overall"] | null = null;
  const departments: DepartmentLeaveItem[] = [];

  function commitBlock() {
    if (!hasData) return;
    if (!overall) {
      overall = {
        totalEmployee: currentData.employeeCount,
        totalBalanceLeaves: currentData.totalBalanceLeaves,
        totalAllocatedLeaves: currentData.totalAllocatedLeaves,
        totalLeaveTaken: currentData.totalLeaveTaken,
        totalHalfDay: currentData.totalHalfDay,
        totalLateMark: currentData.totalLateMark,
        leavePercentage: currentData.leavePercentage,
      };
    } else {
      departments.push({
        department: currentName,
        employeeCount: currentData.employeeCount,
        totalBalanceLeaves: currentData.totalBalanceLeaves,
        totalAllocatedLeaves: currentData.totalAllocatedLeaves,
        totalLeaveTaken: currentData.totalLeaveTaken,
        totalHalfDay: currentData.totalHalfDay,
        totalLateMark: currentData.totalLateMark,
        leavePercentage: currentData.leavePercentage,
      });
    }
    currentData = {
      employeeCount: 0,
      totalBalanceLeaves: 0,
      totalAllocatedLeaves: undefined,
      totalLeaveTaken: 0,
      totalHalfDay: 0,
      totalLateMark: 0,
      leavePercentage: 0,
    };
    hasData = false;
  }

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const nonEmpties = row.filter(
      (c) => c !== null && c !== undefined && String(c).trim() !== "",
    );
    if (nonEmpties.length === 0) continue;
    const label = String(nonEmpties[0]).trim();

    if (!isMetricRow(label)) {
      commitBlock();
      currentName = label;
      if (!title) title = label;
    } else {
      const nums = getRowNumbers(row);
      hasData = true;
      if (/total employee|employee/i.test(label)) {
        currentData.employeeCount = nums[0] ?? 0;
      } else if (/leave balance|balance/i.test(label)) {
        currentData.totalBalanceLeaves = nums[0] ?? 0;
        if (nums.length > 1) currentData.totalAllocatedLeaves = nums[1];
      } else if (/leave taken|taken/i.test(label)) {
        currentData.totalLeaveTaken = nums[0] ?? 0;
      } else if (/half day/i.test(label)) {
        currentData.totalHalfDay = nums[0] ?? 0;
      } else if (/late mark/i.test(label)) {
        currentData.totalLateMark = nums[0] ?? 0;
      } else if (/leave percentage|percentage/i.test(label)) {
        let pct = nums[0] ?? 0;
        if (pct > 0 && pct <= 1) pct = pct * 100;
        currentData.leavePercentage = Math.round(pct * 100) / 100;
      }
    }
  }
  commitBlock();

  if (!overall && departments.length === 0) return null;

  // Extract monthKey & date from title or default to now
  let monthKey = "";
  let monthLabel = "";
  let recordDate = "";

  const dateMatch =
    title.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ||
    title.match(/([A-Za-z]+\s+\d{4})/i) ||
    title.match(/(\d{4}[-/]\d{2}[-/]\d{2})/i);

  if (dateMatch) {
    recordDate = dateMatch[0];
    const parsedDate = new Date(recordDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      monthKey = format(parsedDate, "yyyy-MM");
      monthLabel = format(parsedDate, "MMMM yyyy");
    }
  }

  if (!monthKey) {
    const now = new Date();
    monthKey = format(now, "yyyy-MM");
    monthLabel = format(now, "MMMM yyyy");
    recordDate = format(now, "dd MMMM yyyy");
  }

  return {
    id: `dept_${monthKey}_${Date.now()}`,
    title: title || sheetName,
    recordDate: recordDate || title,
    monthKey,
    monthLabel,
    overall: overall || {
      totalEmployee: departments.reduce((acc, d) => acc + d.employeeCount, 0),
      totalBalanceLeaves: departments.reduce((acc, d) => acc + d.totalBalanceLeaves, 0),
      totalLeaveTaken: departments.reduce((acc, d) => acc + d.totalLeaveTaken, 0),
      totalHalfDay: departments.reduce((acc, d) => acc + d.totalHalfDay, 0),
      totalLateMark: departments.reduce((acc, d) => acc + d.totalLateMark, 0),
      leavePercentage:
        departments.length > 0
          ? Math.round(
              (departments.reduce((acc, d) => acc + d.leavePercentage, 0) /
                departments.length) *
                100,
            ) / 100
          : 0,
    },
    departments,
    importedAt: new Date().toISOString(),
  };
}

export function parseWorkbook(fileName: string, buffer: ArrayBuffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
    }),
  }));

  // ── Locate the monthly summary sheet ─────────────────────────────────
  // Try progressively looser header combinations so we handle common
  // HR workbook variants without requiring exact column naming.
  const summarySheet =
    // Strict: original format
    findSheetByHeaders(sheets, ["EMP ID", "EMP Name", "Total Taken"]) ||
    // Variant: "Employee ID / Employee Name / Total Taken"
    findSheetByHeaders(sheets, ["Employee ID", "Employee Name", "Total Taken"]) ||
    // Variant: "Emp ID / Emp Name / Total Taken"
    findSheetByHeaders(sheets, ["Emp ID", "Emp Name", "Total Taken"]) ||
    // Variant: sheet has EMP Name + Department + Total (no "Taken" word)
    findSheetByHeaders(sheets, ["EMP Name", "Department", "Total"]) ||
    // Variant: Employee Name + Department + Total Taken
    findSheetByHeaders(sheets, ["Employee Name", "Department", "Total Taken"]) ||
    // Variant: Name + Department + Total
    findSheetByHeaders(sheets, ["Employee Name", "Department", "Total"]) ||
    // Variant: loose — just needs name + department columns (last resort)
    findSheetByHeaders(sheets, ["EMP Name", "Department"]) ||
    findSheetByHeaders(sheets, ["Employee Name", "Department"]);

  if (!summarySheet) {
    const sheetList = sheets.map((s) => `"${s.name}"`).join(", ");
    throw new Error(
      `Could not locate the monthly summary sheet in this workbook.\n\n` +
      `Sheets found: ${sheetList || "(none)"}.\n\n` +
      `The summary sheet must contain columns for Employee ID/Name, Department, and leave totals (e.g. "EMP ID", "EMP Name", "Total Taken"). ` +
      `Please check your workbook and ensure the headers appear within the first 12 rows.`
    );
  }

  const summaryData = parseSummarySheet(summarySheet.rows);
  const employeeSheet = findSheetByHeaders(sheets, ["Employee Code", "Employee Name", "Date Of Joining"]);
  const leaveTypeSheet = findSheetByHeaders(sheets, ["Leave Type", "Leave Code"]);
  const employees = employeeSheet ? parseEmployeeSheet(employeeSheet.rows) : [];
  const leaveTypes = leaveTypeSheet ? parseLeaveTypeSheet(leaveTypeSheet.rows) : { ...DEFAULT_LEAVE_TYPES };

  // ── Locate optional independent "Department wise leaves" sheet ───
  const deptSheet =
    sheets.find(
      (s) =>
        /department.*wise.*leave/i.test(s.name) ||
        /dept.*leave/i.test(s.name) ||
        /it.*department.*leave/i.test(s.name),
    ) ||
    sheets.find((s) => {
      const firstRows = s.rows.slice(0, 15);
      return firstRows.some(
        (r) =>
          Array.isArray(r) &&
          r.some((c) => /total employee/i.test(String(c))) &&
          r.some((c) => /leave balance|total leave/i.test(String(c))),
      );
    });
  const departmentRecord = deptSheet ? parseDepartmentWiseLeavesSheet(deptSheet.rows, deptSheet.name) : null;

  // ── Prefer the "Mark Leave" sheet as the primary event source.
  //    Match by sheet name or by presence of headers
  const markLeaveSheet =
    sheets.find((sheet) =>
      /mark\s*leave/i.test(sheet.name) ||
      /leave\s*detail/i.test(sheet.name) ||
      /leave\s*log/i.test(sheet.name) ||
      /daily\s*leave/i.test(sheet.name) ||
      /leave\s*records/i.test(sheet.name),
    ) ||
    findSheetByHeaders(sheets, ["EMP Name", "Date", "Leave Type"]) ||
    findSheetByHeaders(sheets, ["Employee Name", "Date", "Leave Code"]) ||
    findSheetByHeaders(sheets, ["EMP Name", "Date", "Leave"]) ||
    findSheetByHeaders(sheets, ["Name", "Date", "Reason"]);

  const rawEvents = markLeaveSheet
    ? parseMarkLeaveSheet(markLeaveSheet.rows, summaryData.summaries, leaveTypes)
    : parseEventSheets(
        sheets.filter((sheet) => sheet.name !== summarySheet.name),
        summaryData.summaries,
        leaveTypes,
      );

  const events = rawEvents
    .filter((event) => {
      if (!event.eventDate) return false;
      // Period-based filter (most precise)
      if (summaryData.periodStart && summaryData.periodEnd) {
        return event.eventDate >= summaryData.periodStart && event.eventDate <= summaryData.periodEnd;
      }
      // Month-key prefix fallback
      if (summaryData.monthKey && event.eventDate.startsWith(summaryData.monthKey)) return true;
      // No period info — keep all events
      return true;
    })
    .sort((a, b) => {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
      return a.employeeName.localeCompare(b.employeeName);
    });

  const employeeLookup = new Map(employees.map((employee) => [employee.employeeCode, employee]));
  const mergedEmployees = summaryData.summaries.map((summary) => {
    const employee = employeeLookup.get(summary.employeeCode);

    return {
      employeeCode: summary.employeeCode,
      employeeName: summary.employeeName,
      department: summary.department,
      team: summary.team,
      reportingManager: employee?.reportingManager ?? null,
      dateOfJoining: employee?.dateOfJoining ?? null,
      dateOfConfirmation: employee?.dateOfConfirmation ?? null,
      totalBalanceLeaves: summary.totalBalanceLeaves ?? employee?.totalBalanceLeaves ?? null,
    } satisfies EmployeeProfileInput;
  });

  // ── Back-fill totalTaken from events/summary fields when totalTaken is 0 ──
  // Sum leave units per employee (LM = 0.25, HD = 0.5, LMW = 0, PL/SL/etc = 1.0)
  const takenByCode = new Map<string, number>();
  for (const event of events) {
    const key = event.employeeCode.toLowerCase();
    takenByCode.set(key, (takenByCode.get(key) ?? 0) + event.leaveUnits);
  }
  for (const summary of summaryData.summaries) {
    const eventTaken = takenByCode.get(summary.employeeCode.toLowerCase()) ?? 0;
    const netLateMarks = Math.max(0, summary.lateMark - summary.lateMarkWaived);
    const summaryTaken =
      summary.approvedPaidLeave +
      summary.sickLeave +
      summary.approvedLeaveWithoutPay +
      summary.unapprovedLeaveWithoutPay +
      summary.halfDay * 0.5 +
      netLateMarks * 0.25;

    // Use event total if available, otherwise if summary.totalTaken is 0 or contains un-adjusted LMW, update to summaryTaken
    if (eventTaken > 0) {
      summary.totalTaken = eventTaken;
    } else if (summary.totalTaken === 0 || summary.lateMarkWaived > 0 || Math.abs(summary.totalTaken - summaryTaken) >= 0.25) {
      summary.totalTaken = summaryTaken;
    }

    // Re-evaluate leaveStatus rating based on closing balance (Balance - Total Taken)
    const closingBalance = (summary.totalBalanceLeaves ?? 0) - summary.totalTaken;
    summary.leaveStatus = getLeaveStatusRating(closingBalance);
  }

  return {
    fileName,
    monthKey: summaryData.monthKey,
    monthLabel: summaryData.monthLabel,
    periodStart: summaryData.periodStart,
    periodEnd: summaryData.periodEnd,
    sheetNames: workbook.SheetNames,
    employees: mergedEmployees,
    summaries: summaryData.summaries,
    events,
    leaveTypes,
    departmentRecord,
    notes: [
      `Detected ${summaryData.summaries.length} employee summary rows.`,
      `Detected ${events.length} detailed leave lines across ${workbook.SheetNames.length} sheet(s).`,
      ...(departmentRecord ? [`Detected independent "${departmentRecord.title}" sheet with ${departmentRecord.departments.length} departments.`] : []),
      `Review period: ${summaryData.periodStart} to ${summaryData.periodEnd}.`,
    ],
    preview: {
      summarySample: summaryData.summaries.slice(0, 12),
      eventSample: events.slice(0, 16),
      employeeSample: mergedEmployees.slice(0, 12),
    },
  };
}
