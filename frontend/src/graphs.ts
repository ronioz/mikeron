import type { Spacing } from "./types";

/**
 * How far apart the graph's points are, as Spacing in app/schemas.py lists
 * them. For each: the name of the choice and what the graph then shows. How
 * far back each one reaches is REACH in app/graphs.py.
 */
export const SPACINGS: Record<Spacing, { label: string; shows: string }> = {
  daily: {
    label: "Daily",
    shows: "What you held, at each day's closing prices. Up to 3 months back.",
  },
  weekly: {
    label: "Weekly",
    shows: "What you held, at each week's last closing prices. Up to 2 years back.",
  },
  monthly: {
    label: "Monthly",
    shows: "What you held, at each month's last closing prices. Up to 10 years back.",
  },
  yearly: {
    label: "Yearly",
    shows: "What you held, at each year's last closing prices. Back to your first trade.",
  },
};

export const SPACING_IDS = Object.keys(SPACINGS) as Spacing[];

export interface PriceScale {
  /** What the bottom and the top of the plot stand for. */
  low: number;
  high: number;
  /** Round amounts in between, each with a line across the plot. */
  ticks: { value: number; label: string }[];
}

/**
 * The scale for amounts between `min` and `max`: a little air above and
 * below, and about four round amounts to read the line against. It doesn't
 * start at zero, which would flatten every move into the top of the plot.
 */
export function priceScale(min: number, max: number): PriceScale {
  // For a flat line there is no range to take a share of: a hundredth of the amount instead.
  const air = (max - min) * 0.08 || max * 0.01 || 1;
  const low = Math.max(0, min - air);
  const high = max + air;
  // Steps of 1, 2 or 5 times a power of ten: whichever puts closest to four amounts on the scale.
  const power = 10 ** Math.floor(Math.log10((high - low) / 4));
  const lines = (step: number) => Math.floor(high / step) - Math.ceil(low / step) + 1;
  const step = [1, 2, 5, 10]
    .map((times) => times * power)
    .reduce((best, next) => (Math.abs(lines(next) - 4) < Math.abs(lines(best) - 4) ? next : best));
  // Whole dollars when the steps are; cents, or more for pennies, when they aren't.
  const places = step >= 1 ? 0 : Math.min(4, Math.max(2, Math.ceil(-Math.log10(step))));
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
  const ticks = [];
  // Counted in whole steps, so adding up fractions can't drift.
  for (let count = Math.ceil(low / step); count * step <= high; count++) {
    ticks.push({ value: count * step, label: money.format(count * step) });
  }
  return { low, high, ticks };
}

/** Anything with a calendar day, as YYYY-MM-DD. */
interface Dated {
  day: string;
}

export interface DateTick {
  /** Which point the date is written under. */
  index: number;
  label: string;
}

const monthName = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/**
 * The dates written under a plot `width` pixels wide: months for the daily and
 * weekly graphs, years for the monthly and yearly ones, each under the first
 * point of its month or year. When there isn't room for all of them, every
 * third month or second year is kept, and so on, so the ones left are evenly
 * apart and fall on round dates.
 */
export function dateTicks(points: Dated[], spacing: Spacing, width: number): DateTick[] {
  const year = (point: Dated | undefined) => Number(point?.day.slice(0, 4));
  // A journal begun in the last year or two has too few years to tell its months by.
  const young = year(points.at(-1)) - year(points[0]) < 2;
  const byMonth = spacing === "daily" || spacing === "weekly" || (spacing === "monthly" && young);
  // Months are counted from year 0, so every third one is January, April, July or October.
  const count = (point: Dated) =>
    byMonth ? year(point) * 12 + Number(point.day.slice(5, 7)) - 1 : year(point);
  const marks: { index: number; count: number }[] = [];
  points.forEach((point, index) => {
    const before = points[index - 1];
    // A yearly graph has a point per year, so every point starts one, the first too.
    if (before ? count(before) !== count(point) : spacing === "yearly") {
      marks.push({ index, count: count(point) });
    }
  });

  const apart = width / Math.max(1, points.length - 1);
  // Room for a label and the gap after it: "Jan 2026" is wider than "2026".
  const room = byMonth ? 56 : 44;
  const strides = byMonth ? [1, 3, 6, 12] : [1, 2, 5, 10, 20, 50];
  let kept = marks;
  for (const stride of strides) {
    kept = marks.filter((mark) => mark.count % stride === 0);
    const closest = Math.min(
      ...kept.slice(1).map((mark, at) => (mark.index - (kept[at]?.index ?? 0)) * apart),
    );
    if (closest >= room) break;
  }
  return kept.map(({ index, count: months }) => {
    if (!byMonth) return { index, label: String(months) };
    const month = months % 12;
    const name = monthName.format(new Date(Date.UTC(2000, month, 1)));
    // The year only where it begins, so the months between stay short.
    return { index, label: month === 0 ? `${name} ${months / 12}` : name };
  });
}
