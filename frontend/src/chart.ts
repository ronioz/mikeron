import type { Position } from "./types";

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** Share of the whole portfolio, 0 to 100. */
  share: number;
  /** A CSS colour, taken from the --series-* variables in styles.css. */
  color: string;
}

// A ring stops being readable at a glance beyond about six slices.
const MAX_SLICES = 6;
export const OTHER = "other";

/**
 * Decides what the ring chart shows.
 *
 * Up to six holdings are drawn individually. With more, the five largest are
 * kept and the rest are combined into "Other".
 *
 * Colours are handed out in the order holdings were first bought, and slices
 * are drawn in that same order. That way a ticker keeps its colour when prices
 * move and its rank changes, and neighbouring slices are always a colour pair
 * that was checked to stay distinguishable for colour-blind viewers.
 *
 * `positions` must be sorted largest first, which is how the API returns them.
 */
export function buildSlices(positions: Position[]): Slice[] {
  const named = positions.length > MAX_SLICES ? positions.slice(0, MAX_SLICES - 1) : positions;
  const rest = positions.slice(named.length);

  const slices: Slice[] = [...named]
    .sort(
      (a, b) =>
        a.first_trade_date.localeCompare(b.first_trade_date) || a.ticker.localeCompare(b.ticker),
    )
    .map((position, index) => ({
      key: position.ticker,
      label: position.ticker,
      value: Number(position.value),
      share: Number(position.share_pct),
      color: `var(--series-${index + 1})`,
    }));

  if (rest.length > 0) {
    slices.push({
      key: OTHER,
      label: `Other (${rest.length})`,
      value: rest.reduce((sum, position) => sum + Number(position.value), 0),
      share: rest.reduce((sum, position) => sum + Number(position.share_pct), 0),
      color: "var(--series-other)",
    });
  }
  return slices;
}
