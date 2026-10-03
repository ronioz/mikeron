import { api } from "./api";
import { formatShares } from "./format";
import type { Trade } from "./types";

/**
 * Deletes a trade after asking. Resolves to false when the user backs out.
 *
 * The server refuses (ApiError, 409) to delete a purchase that a later sale
 * needs, with a message saying which sale; callers show that message.
 */
export async function confirmAndDelete(trade: Trade): Promise<boolean> {
  const what = trade.side === "sell" ? "sale" : "purchase";
  const question = `Delete the ${what} of ${formatShares(trade.shares)} ${trade.ticker} on ${trade.trade_date}? This cannot be undone.`;
  if (!window.confirm(question)) return false;
  await api.deleteTrade(trade.id);
  return true;
}
