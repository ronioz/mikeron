// These mirror the response models in app/schemas.py.

/** Money and quantities travel as decimal strings so no precision is lost on the way. */
export type Decimal = string;

export type Side = "buy" | "sell";

/** The broker a trade was placed with: TBC Bank or Bank of Georgia. See brokers.ts. */
export type Broker = "tbc" | "bog";

/** How often a plan's amount is put in. See plan.ts. */
export type PlanPeriod = "weekly" | "monthly" | "quarterly";

/** What the trade form submits. Optional prices are sent as "" when left empty. */
export interface TradeInput {
  side: Side;
  ticker: string;
  /** Paid per share, or received for a sale. */
  price: string;
  shares: string;
  trade_date: string;
  /** Why the trade was made: the reason for buying, or for selling; "" when not written. */
  thesis: string;
  /** Purchases only, like the two target prices. A sale leaves them empty. */
  forecast: string;
  take_profit: string;
  stop_loss: string;
  /** Purchases only: paid with cash from earlier sales rather than new money. */
  paid_from_cash: boolean;
  /** The broker's commission in dollars; "" when there was none. */
  fee: string;
  /** Where the trade was placed; "" when not recorded. */
  broker: Broker | "";
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
  /** Price times shares, before any fee. */
  amount: Decimal;
  /** The broker's commission: added to a purchase's cost, taken from a sale's proceeds. */
  fee: Decimal;
  /** The money the trade moved, fee included: a purchase's cost plus its fee, or what a sale brought in after it. */
  net_amount: Decimal;
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
  paid_from_cash: boolean;
  /**
   * Purchases only: how much of the cost came from cash from sales; the rest
   * was new money. Less than the cost when there wasn't that much cash.
   */
  cash_used: Decimal | null;
  /** Where the trade was placed. A sale uses the shares bought at its own broker first. */
  broker: Broker | null;
}

/**
 * What a broker's report says about one trade, read from a screenshot of it
 * (see ocr.ts). Null where the report shows nothing readable.
 */
export interface TradeReading {
  broker: Broker | null;
  side: Side | null;
  ticker: string | null;
  price: Decimal | null;
  shares: Decimal | null;
  fee: Decimal | null;
  trade_date: string | null;
  /** Whether price times shares comes to the amount the report shows. Null when it shows none. */
  adds_up: boolean | null;
  /** True when the report didn't show the fee and it was worked out from the bank's tariff. */
  fee_worked_out: boolean;
}

/** What is held, sold and paid in fees: of the whole portfolio, or of one broker's part. */
export interface ShareTotals {
  /** What the shares still held cost to buy, fees included. Grows when gains from sales are reinvested. */
  invested: Decimal;
  /** What the shares still held are worth. Null when live prices are off or nothing could be priced. */
  current_value: Decimal | null;
  gain: Decimal | null;
  gain_pct: Decimal | null;
  /** Gain made on every sale so far, after fees. */
  realized_gain: Decimal;
  sale_count: number;
  /** Every fee paid, and what share of the money traded (price times shares, all trades) that is. */
  fees: Decimal;
  fees_pct: Decimal | null;
  /** Tickers counted at cost because no live price is available for them. */
  unpriced: string[];
  price_at: string | null;
  prices_enabled: boolean;
}

export interface Totals extends ShareTotals {
  /** The user's own money: every purchase with its fee, less what cash from sales paid for. */
  money_in: Decimal;
  /** Cash from sales not spent on purchases yet. */
  cash: Decimal;
  /** The shares still held plus the cash: the headline. Null when the shares can't be valued. */
  total_value: Decimal | null;
  /** total_value against money_in: the gain still held plus every sale's. Null when total_value is. */
  total_gain: Decimal | null;
  total_gain_pct: Decimal | null;
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

/**
 * The part of the portfolio at one broker: what is left of the shares bought
 * there, and the sales and fees of the trades placed there. Cash and the money
 * put in aren't split: they are counted across brokers together.
 */
export interface BrokerPortfolio extends ShareTotals {
  /** Null gathers the trades that name no broker. */
  broker: Broker | null;
  /** Largest holding first. */
  positions: Position[];
}

export interface Portfolio extends Totals {
  /** Largest holding first. */
  positions: Position[];
  /** One part per broker with trades, then the trades naming none. Empty when no trade names a broker. */
  by_broker: BrokerPortfolio[];
}

export interface YearTotal {
  year: number;
  trade_count: number;
  bought: Decimal;
  sold: Decimal;
  fees: Decimal;
}

export interface Summary extends Totals {
  trade_count: number;
  /** The plan: how much new money is meant to go in every week, month or quarter. */
  plan_amount: Decimal;
  plan_period: PlanPeriod;
  /** New money put into purchases in the period going on now, to compare with the plan. */
  this_period: Decimal;
  /** That period's purchases paid with cash from sales, which the plan leaves out. */
  this_period_from_cash: Decimal;
  years: YearTotal[];
}

/** How far apart a graph's points are: a close per day, week, month or year. See graphs.ts. */
export type Spacing = "daily" | "weekly" | "monthly" | "yearly";

export interface ValuePoint {
  /** A calendar day, as YYYY-MM-DD. */
  day: string;
  /** Everything held that day at its closing prices, plus the cash from sales. */
  value: Decimal;
  /** The user's own money put in by then. */
  money_in: Decimal;
}

/** What the portfolio was worth over time, at one spacing. */
export interface Graph {
  /** Oldest first, from the first trade on: the last close of each day, week, month or year. */
  points: ValuePoint[];
}

export interface Graphs {
  /** False when closing prices aren't set up, so there is nothing to draw. */
  closes_enabled: boolean;
  trade_count: number;
  /** One for every spacing, all ending on the same point: the latest close. */
  graphs: Record<Spacing, Graph>;
  /** The last point's value against the money put in by then. Null without a point. */
  total_gain: Decimal | null;
  total_gain_pct: Decimal | null;
  /** Tickers held on the last day and counted at what they cost: no closing prices for them. */
  unpriced: string[];
  /** Trades dated after the last point, which join the graph with their day's close. */
  trades_after: number;
}

/** The signed-in person's account. */
export interface Account {
  email: string;
  /** Their plan, given when signing up: how much new money they mean to put in, and how often. */
  plan_amount: Decimal;
  plan_period: PlanPeriod;
  created_at: string;
  /** The broker of their most recently recorded trade; only from GET /api/me. */
  last_broker: Broker | null;
}

export interface SignedIn {
  account: Account;
  /** Only for the iOS app; a browser is signed in with a cookie instead. */
  token: string | null;
  expires_at: string | null;
}

/** The same answer whether or not the address has an account. */
export interface CodeSent {
  email: string;
}

export interface AuthOptions {
  sign_up_open: boolean;
}
