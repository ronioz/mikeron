import type { Decimal } from "./types";

const USD = { style: "currency", currency: "USD" } as const;
const ONE_PLACE = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

const money = new Intl.NumberFormat("en-US", USD);
const signedMoney = new Intl.NumberFormat("en-US", { ...USD, signDisplay: "always" });
const percent = new Intl.NumberFormat("en-US", ONE_PLACE);
const signedPercent = new Intl.NumberFormat("en-US", { ...ONE_PLACE, signDisplay: "always" });
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });

// Trade dates are calendar days, so they are read and written in UTC: no time
// zone can then move one to the day before.
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/**
 * Hands a value to Intl.NumberFormat as it is. A decimal string is read digit
 * for digit, so the long exact values the server sends are rounded as written
 * rather than first being squeezed into a floating-point number.
 */
function exact(value: Decimal | number): number | `${number}` {
  return value as number | `${number}`;
}

/**
 * Intl writes a negative number with a hyphen. A true minus sign is as wide as
 * "+", so signed figures stacked in a column line up.
 */
function withMinus(text: string): string {
  return text.replace("-", "−");
}

export function formatMoney(value: Decimal | number): string {
  return withMinus(money.format(exact(value)));
}

/** "+$4.80" or "−$1.20": the sign is always shown, so direction never depends on colour. */
export function formatSignedMoney(value: Decimal): string {
  return withMinus(signedMoney.format(exact(value)));
}

/** "+8.0%" or "−4.0%". */
export function formatSignedPercent(value: Decimal): string {
  return `${withMinus(signedPercent.format(exact(value)))}%`;
}

export function formatPercent(value: Decimal | number): string {
  return `${withMinus(percent.format(exact(value)))}%`;
}

function calendarDay(isoDate: string): Date {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Sep 23", for trades listed under their year. */
export function formatShortDate(isoDate: string): string {
  return shortDate.format(calendarDay(isoDate));
}

/** "Sep 23, 2026". */
export function formatDate(isoDate: string): string {
  return longDate.format(calendarDay(isoDate));
}

/** Share counts without padding zeros: "0.13304000" becomes "0.13304". */
export function formatShares(value: Decimal): string {
  return quantity.format(exact(value));
}

/** Exact removal of trailing zeros, for putting a stored number back into a form. */
export function trimZeros(value: Decimal): string {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

/** A time for today's timestamps, a date and time for older ones. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

/** Today's date in the browser's own time zone, as YYYY-MM-DD. */
export function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
