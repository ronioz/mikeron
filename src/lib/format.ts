import type { Decimal } from "./types";

// The website rounds with Intl.NumberFormat, which reads a decimal string digit
// for digit. Android's JavaScript engine can't be relied on to do that, and a
// figure a cent off the website's would be a bug, so rounding is done here on
// the digits themselves. tests/format.test.ts holds this to the website's rules.

interface Digits {
  negative: boolean;
  whole: string;
  fraction: string;
}

/** Splits a value into its digits. The server can send "0E-8", so exponents are handled. */
function digitsOf(value: Decimal | number): Digits {
  const text = String(value).trim().toLowerCase();
  const negative = text.startsWith("-");
  const [mantissa = "0", exponent = "0"] = text.replace(/^[-+]/, "").split("e");
  const [whole = "", fraction = ""] = mantissa.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return { negative, whole: "0", fraction: "0".repeat(-point) + digits };
  if (point >= digits.length) return { negative, whole: digits.padEnd(point, "0"), fraction: "" };
  return { negative, whole: digits.slice(0, point), fraction: digits.slice(point) };
}

/** Rounds to a number of decimal places, halves away from zero, as Intl does by default. */
function rounded(value: Decimal | number, places: number): Digits {
  const { negative, whole, fraction } = digitsOf(value);
  const kept = whole + fraction.slice(0, places).padEnd(places, "0");
  const up = (fraction[places] ?? "0") >= "5";
  const digits = up ? (BigInt(kept) + BigInt(1)).toString().padStart(kept.length, "0") : kept;
  const split = digits.length - places;
  return {
    negative,
    whole: digits.slice(0, split).replace(/^0+(?=\d)/, ""),
    fraction: digits.slice(split),
  };
}

function grouped(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// A true minus sign is as wide as "+", so signed figures stacked in a column line up.
const MINUS = "−";

function dollars({ whole, fraction }: Digits): string {
  return `$${grouped(whole)}.${fraction}`;
}

function oneDecimal({ whole, fraction }: Digits): string {
  return `${grouped(whole)}.${fraction}`;
}

export function formatMoney(value: Decimal | number): string {
  const digits = rounded(value, 2);
  return `${digits.negative ? MINUS : ""}${dollars(digits)}`;
}

/** "+$4.80" or "−$1.20": the sign is always shown, so direction never depends on colour. */
export function formatSignedMoney(value: Decimal): string {
  const digits = rounded(value, 2);
  return `${digits.negative ? MINUS : "+"}${dollars(digits)}`;
}

/** "+8.0%" or "−4.0%". */
export function formatSignedPercent(value: Decimal): string {
  const digits = rounded(value, 1);
  return `${digits.negative ? MINUS : "+"}${oneDecimal(digits)}%`;
}

export function formatPercent(value: Decimal | number): string {
  const digits = rounded(value, 1);
  return `${digits.negative ? MINUS : ""}${oneDecimal(digits)}%`;
}

/** Share counts without padding zeros: "0.13304000" becomes "0.13304". */
export function formatShares(value: Decimal): string {
  const { whole, fraction } = rounded(value, 8);
  const kept = fraction.replace(/0+$/, "");
  return kept ? `${grouped(whole)}.${kept}` : grouped(whole);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Trade dates are calendar days. They are read straight from their digits, so
// no time zone can move one to the day before.
function calendarDay(isoDate: string): { year: number; month: string; day: number } {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return { year, month: MONTHS[month - 1] ?? "", day };
}

/** "Sep 23", for trades listed under their year. */
export function formatShortDate(isoDate: string): string {
  const { month, day } = calendarDay(isoDate);
  return `${month} ${day}`;
}

/** "Sep 23, 2026". */
export function formatDate(isoDate: string): string {
  const { year, month, day } = calendarDay(isoDate);
  return `${month} ${day}, ${year}`;
}

/** A time for today's timestamps, a date and time for older ones. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
