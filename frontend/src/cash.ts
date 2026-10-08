import type { Decimal, Trade } from "./types";

// Costs worked out from fractional shares run to fractions of a cent (a $300
// purchase can cost $300.000319). Below half a cent an amount shows as $0.00,
// so it is treated as nothing rather than as cash left or a part not covered.
const HALF_CENT = 0.005;

/** Whether an amount of money comes to at least a cent once rounded for display. */
export function isMoney(value: Decimal): boolean {
  return Number(value) >= HALF_CENT;
}

// What a purchase can be paid with, as its switch names them.
export const FUNDING: { fromCash: boolean; label: string }[] = [
  { fromCash: false, label: "New money" },
  { fromCash: true, label: "Cash from sales" },
];

/** Part of a purchase's cost: all of it, or less with the amount. Null when it is nothing. */
type Part = { all: boolean; amount: Decimal } | null;

function partOf(trade: Trade, amount: Decimal | null): Part {
  if (amount === null || !isMoney(amount)) return null;
  return { all: Number(trade.net_amount) - Number(amount) < HALF_CENT, amount };
}

/**
 * How much of a purchase was paid with cash from sales: all of it, or part of
 * it with the amount. Null when it was all new money, or for a sale.
 */
export function reinvested(trade: Trade): Part {
  return partOf(trade, trade.cash_used);
}

/**
 * How much of a purchase cash from sales could pay on its date: what it would
 * use if it were paid from it. Null when there was none, or for a sale.
 */
export function payableFromCash(trade: Trade): Part {
  return partOf(trade, trade.cash_available);
}
