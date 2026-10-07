import type { ReactNode } from "react";
import { Link } from "react-router";

import { isMoney, reinvested } from "../cash";
import { formatMoney, formatShares, formatShortDate, formatSignedMoney } from "../format";
import type { Trade } from "../types";
import { BrokerBadge } from "./BrokerBadge";
import { Change } from "./figures";

interface Props {
  trade: Trade;
  onDelete: (trade: Trade) => void;
}

/**
 * One trade in the journal on narrow screens, in place of a table row: a line
 * with the essentials that opens to show the rest, so nothing needs sideways
 * scrolling. Built on <details>, which handles opening by tap or keyboard and
 * tells screen readers whether it is open.
 */
export function TradeItem({ trade, onDelete }: Props) {
  const sale = trade.side === "sell";
  return (
    <details className="trade-item">
      <summary>
        <span className="item-main">
          <span className="item-title">
            <span className="ticker">{trade.ticker}</span>{" "}
            <span className={`side-tag ${trade.side}`}>{sale ? "Sell" : "Buy"}</span>{" "}
            <BrokerBadge broker={trade.broker} />
          </span>
          {/* The year is in the heading over the list. */}
          <small>
            {formatShortDate(trade.trade_date)} · {sharesText(trade)}
          </small>
        </span>
        <span className="item-figure">
          <Headline trade={trade} />
        </span>
      </summary>

      <div className="item-body">
        <dl className="facts">{sale ? <SaleFacts trade={trade} /> : <PurchaseFacts trade={trade} />}</dl>
        {trade.thesis && (
          <>
            <h3>{sale ? "Why I sold" : "Why I bought"}</h3>
            <p className="prose">{trade.thesis}</p>
          </>
        )}
        <div className="actions">
          <Link className="button secondary small" to={`/trades/${trade.id}`}>
            Open
          </Link>
          <Link className="button secondary small" to={`/trades/${trade.id}/edit`} state={{ from: "/" }}>
            Edit
          </Link>
          <button className="button danger small" type="button" onClick={() => onDelete(trade)}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

/**
 * "2 shares", plus what later sales left of a purchase and whether it was paid
 * with cash from sales: "10 shares · 6 left · reinvested".
 */
function sharesText(trade: Trade): string {
  const parts = [`${formatShares(trade.shares)} ${Number(trade.shares) === 1 ? "share" : "shares"}`];
  const left = trade.remaining_shares;
  // Only purchases that have been sold from carry a realised gain.
  if (trade.side === "buy" && trade.realized_gain !== null && left !== null) {
    parts.push(Number(left) === 0 ? "all sold" : `${formatShares(left)} left`);
  }
  if (reinvested(trade)) parts.push("reinvested");
  return parts.join(" · ");
}

/** The figure on the right of the closed line: what a sale made, or what a purchase is worth. */
function Headline({ trade }: { trade: Trade }) {
  if (trade.side === "sell" && trade.realized_gain !== null && trade.realized_gain_pct !== null) {
    const gain = trade.realized_gain;
    return (
      <>
        <span className="item-amount">{formatSignedMoney(gain)}</span>
        <small>
          {Number(gain) >= 0 ? "gain" : "loss"} <Change percent={trade.realized_gain_pct} />
        </small>
      </>
    );
  }
  if (trade.current_value !== null && trade.gain_pct !== null) {
    return (
      <>
        <span className="item-amount">{formatMoney(trade.current_value)}</span>
        <Change percent={trade.gain_pct} />
      </>
    );
  }
  // No live price, or nothing left to value: show what was paid instead.
  const soldOut = trade.remaining_shares !== null && Number(trade.remaining_shares) === 0;
  return (
    <>
      <span className="item-amount">{formatMoney(trade.net_amount)}</span>
      <small>{soldOut ? "all sold" : "paid"}</small>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A price with its percentage change, or a muted placeholder when there is none. */
function PriceAndChange({ price, change, missing }: { price: string | null; change: string | null; missing: string }) {
  if (price === null || change === null) return <span className="muted">{missing}</span>;
  return (
    <>
      {formatMoney(price)} <Change percent={change} />
    </>
  );
}

function PurchaseFacts({ trade }: { trade: Trade }) {
  const left = trade.remaining_shares;
  const fromSales = reinvested(trade);
  return (
    <>
      <Fact label="Shares">
        {formatShares(trade.shares)}
        {trade.realized_gain !== null && left !== null && (
          <small> {Number(left) === 0 ? "all sold" : `${formatShares(left)} left`}</small>
        )}
      </Fact>
      <Fact label="Buy price">{formatMoney(trade.price)}</Fact>
      <Fact label="Cost">
        {formatMoney(trade.net_amount)}
        {isMoney(trade.fee) && <small> incl. {formatMoney(trade.fee)} fee</small>}
      </Fact>
      {fromSales && (
        <Fact label="Paid with">
          {fromSales.all
            ? "Cash from sales"
            : `${formatMoney(fromSales.amount)} from sales, the rest new money`}
        </Fact>
      )}
      <Fact label="Value now">
        <PriceAndChange price={trade.current_value} change={trade.gain_pct} missing="–" />
      </Fact>
      <Fact label="Take profit at">
        <PriceAndChange price={trade.take_profit} change={trade.take_profit_pct} missing="Not set" />
      </Fact>
      <Fact label="Stop loss at">
        <PriceAndChange price={trade.stop_loss} change={trade.stop_loss_pct} missing="Not set" />
      </Fact>
      {trade.realized_gain !== null && trade.realized_gain_pct !== null && (
        <Fact label="Gain from sales">
          {formatSignedMoney(trade.realized_gain)} <Change percent={trade.realized_gain_pct} />
        </Fact>
      )}
    </>
  );
}

function SaleFacts({ trade }: { trade: Trade }) {
  const { realized_gain: gain, realized_gain_pct: percent, cost_basis: cost } = trade;
  return (
    <>
      <Fact label="Shares sold">{formatShares(trade.shares)}</Fact>
      <Fact label="Sell price">{formatMoney(trade.price)}</Fact>
      <Fact label="Received">
        {formatMoney(trade.net_amount)}
        {isMoney(trade.fee) && <small> after {formatMoney(trade.fee)} fee</small>}
      </Fact>
      <Fact label="Those shares cost">{cost !== null ? formatMoney(cost) : "–"}</Fact>
      {gain !== null && percent !== null && (
        <Fact label={Number(gain) < 0 ? "Loss on sale" : "Gain on sale"}>
          {formatSignedMoney(gain)} <Change percent={percent} />
        </Fact>
      )}
    </>
  );
}
