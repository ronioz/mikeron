// These mirror the response models in app/schemas.py.

/** Money and quantities travel as decimal strings so no precision is lost on the way. */
export type Decimal = string;

/** What the trade form submits. Optional prices are sent as "" when left empty. */
export interface TradeInput {
  ticker: string;
  buy_price: string;
  shares: string;
  trade_date: string;
  thesis: string;
  forecast: string;
  take_profit: string;
  stop_loss: string;
}

export interface Trade {
  id: number;
  ticker: string;
  buy_price: Decimal;
  shares: Decimal;
  trade_date: string;
  thesis: string;
  forecast: string;
  take_profit: Decimal | null;
  stop_loss: Decimal | null;
  cost: Decimal;
  take_profit_pct: Decimal | null;
  stop_loss_pct: Decimal | null;
  /** Live valuation. All null when there is no price for the ticker. */
  current_price: Decimal | null;
  current_value: Decimal | null;
  gain: Decimal | null;
  gain_pct: Decimal | null;
  price_at: string | null;
}

export interface Totals {
  invested: Decimal;
  /** Null when live prices are off or nothing could be priced. */
  current_value: Decimal | null;
  gain: Decimal | null;
  gain_pct: Decimal | null;
  /** Tickers counted at cost because no live price is available for them. */
  unpriced: string[];
  price_at: string | null;
  prices_enabled: boolean;
}

/** Every trade in one ticker, added together. */
export interface Position {
  ticker: string;
  shares: Decimal;
  cost: Decimal;
  average_price: Decimal;
  trade_count: number;
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
  invested: Decimal;
}

export interface Summary extends Totals {
  trade_count: number;
  this_month: Decimal;
  monthly_budget: Decimal;
  years: YearTotal[];
}
