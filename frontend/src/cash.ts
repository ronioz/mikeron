import type { Decimal, Trade } from "./types";

// Costs worked out from fractional shares run to fractions of a cent (a $300
// purchase can cost $300.000319). Below half a cent an amount shows as $0.00,
// so it is treated as nothing rather than as cash left or a part not covered.
const HALF_CENT = 0.005;

/** Whether an amount of money comes to at least a cent once rounded for display. */
export function isMoney(value: Decimal): boolean {
  return Number(value) >= HALF_CENT;
}

/**
 * How much of a purchase was paid with cash from sales: all of it, or part of
 * it with the amount. Null when it was all new money, or for a sale.
 */
export function reinvested(trade: Trade): { all: boolean; amount: Decimal } | null {
  const used = trade.cash_used;
  if (used === null || !isMoney(used)) return null;
  return { all: Number(trade.net_amount) - Number(used) < HALF_CENT, amount: used };
}
