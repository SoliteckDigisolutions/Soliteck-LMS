export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function safeText(value: unknown) {
  return String(value ?? "").trim();
}

export function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatMetric(value: unknown, digits = 2) {
  const amount = toNumber(value, 0);
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : Math.min(1, digits),
    maximumFractionDigits: digits,
  });
}

export function formatDisplayDate(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  if (!year || !month) {
    return monthKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function sentenceCase(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function percentage(part: number, total: number) {
  if (!total) {
    return 0;
  }

  return (part / total) * 100;
}

export function formatTimeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const str = String(value).trim();
  const num = Number(str);

  // If Excel decimal time fraction (0 < num < 1, e.g. 0.40208333333333335)
  if (!Number.isNaN(num) && num > 0 && num < 1) {
    const totalSeconds = Math.round(num * 24 * 3600);
    const hours24 = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(hours12)}:${pad(minutes)} ${period}`;
  }

  return str;
}

export function formatMinutes(value: unknown): string {
  if (value === null || value === undefined || value === "" || value === 0 || value === "0") {
    return "—";
  }
  const num = Number(value);
  if (Number.isNaN(num) || num === 0) {
    return "—";
  }
  return `${Math.round(num)} mins`;
}
