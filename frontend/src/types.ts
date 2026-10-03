// These mirror the response models in app/schemas.py.

/** Money and quantities travel as decimal strings so no precision is lost on the way. */
export type Decimal = string;

export type Side = "buy" | "sell";

/** What the trade form submits. Optional prices are sent as "" when left empty. */
export interface TradeInput {
  side: Side;
  ticker: string;
  /** Paid per share, or received for a sale. */
  price: string;
  shares: string;
  trade_date: string;
  /** Why the trade was made: the reason for buying, or for selling. */
  thesis: string;
  /** Purchases only, like the two target prices. A sale leaves them empty. */
  forecast: string;
  take_profit: string;
  stop_loss: string;
}

export interface Trade {
  id: number;
  side: Side;
  ticker: string;
  price: Decimal;
  shares: Decimal;
  trade_date: string;
  thesis: string;
  forecast: string;
  take_profit: Decimal | null;
  stop_loss: Decimal | null;
  /** Price times shares: the cost of a purchase or the proceeds of a sale. */
  amount: Decimal;
  take_profit_pct: Decimal | null;
  stop_loss_pct: Decimal | null;
  /** The latest price of the ticker, when one is known. */
  current_price: Decimal | null;
  price_at: string | null;
  /** Purchases only: how many of these shares are still held. Sales use up the oldest shares first. */
  remaining_shares: Decimal | null;
  /** Purchases only: what the shares still held are worth, and their gain so far. */
  current_value: Decimal | null;
  gain: Decimal | null;
  gain_pct: Decimal | null;
  /** The gain actually made: on a sale, or on the sold part of a purchase. */
  realized_gain: Decimal | null;
  realized_gain_pct: Decimal | null;
  /** Sales only: what the shares sold had cost to buy. */
  cost_basis: Decimal | null;
}

export interface Totals {
  /** What the shares still held cost to buy. */
  invested: Decimal;
  /** Null when live prices are off or nothing could be priced. */
  current_value: Decimal | null;
  gain: Decimal | null;
  gain_pct: Decimal | null;
  /** Gain made on every sale so far. */
  realized_gain: Decimal;
  sale_count: number;
  /** Tickers counted at cost because no live price is available for them. */
  unpriced: string[];
  price_at: string | null;
  prices_enabled: boolean;
}

/** The shares of one ticker that are still held. */
export interface Position {
  ticker: string;
  shares: Decimal;
  cost: Decimal;
  average_price: Decimal;
  first_trade_date: string;
  current_price: Decimal | null;
  /** Market value, or the cost when there is no live price. */
  value: Decimal;
  gain: Decimal | null;
  gain_pct: Decimal | null;
  share_pct: Decimal;
}

export interface Portfolio extends Totals {
  /** Largest holding first. */
  positions: Position[];
}

export interface YearTotal {
  year: number;
  trade_count: number;
  bought: Decimal;
  sold: Decimal;
}

export interface Summary extends Totals {
  trade_count: number;
  /** Purchases this month, to compare with the monthly budget. */
  this_month: Decimal;
  monthly_budget: Decimal;
  years: YearTotal[];
}
