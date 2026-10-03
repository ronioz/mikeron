import { useState } from "react";
import { Link } from "react-router";

import { api } from "../api";
import { Change, PriceNote, SalesStat, Stat, ValueHero } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { TradeItem } from "../components/TradeItem";
import { confirmAndDelete } from "../deleteTrade";
import { formatDate, formatMoney, formatShares, formatShortDate, formatSignedMoney } from "../format";
import type { Decimal, Summary, Trade, YearTotal } from "../types";
import { REFRESH_MS, useApi } from "../useApi";

export function Dashboard() {
  const state = useApi(() => Promise.all([api.getSummary(), api.listTrades()]), [], REFRESH_MS);
  return (
    <>
      <title>Trade Journal</title>
      {/* The tab in the header already says where this is; the heading is for screen readers. */}
      <h1 className="visually-hidden">Journal</h1>
      <Loadable state={state}>
        {([summary, trades]) =>
          trades.length === 0 ? (
            <NoTrades />
          ) : (
            <Journal summary={summary} trades={trades} reload={state.reload} />
          )
        }
      </Loadable>
    </>
  );
}

function NoTrades() {
  return (
    <section className="empty">
      <p>No trades yet.</p>
      <Link className="button" to="/trades/new">
        Add your first trade
      </Link>
    </section>
  );
}

function groupByYear(trades: Trade[]): Map<number, Trade[]> {
  const groups = new Map<number, Trade[]>();
  for (const trade of trades) {
    const year = Number(trade.trade_date.slice(0, 4));
    const group = groups.get(year);
    if (group) group.push(trade);
    else groups.set(year, [trade]);
  }
  return groups;
}

// Brings a message into view when it appears. Defined once so React calls it
// only when the message mounts, not on every re-render.
const scrollIntoView = (node: HTMLElement | null) => node?.scrollIntoView({ block: "nearest" });

interface JournalProps {
  summary: Summary;
  trades: Trade[];
  reload: () => void;
}

function Journal({ summary, trades, reload }: JournalProps) {
  const [problem, setProblem] = useState<string>();
  const byYear = groupByYear(trades);
  const budget = Number(summary.monthly_budget);

  async function remove(trade: Trade) {
    setProblem(undefined);
    try {
      if (await confirmAndDelete(trade)) reload();
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : "Could not delete the trade.");
    }
  }

  return (
    <>
      <ValueHero totals={summary} />
      <section className="stats">
        <Stat label="Invested">
          <span className="value">{formatMoney(summary.invested)}</span>
        </Stat>
        {summary.sale_count > 0 && <SalesStat totals={summary} />}
        <Stat label="Trades">
          <span className="value">{summary.trade_count}</span>
        </Stat>
        <Stat label="This month">
          <span className="value">{formatMoney(summary.this_month)}</span>
          <span className="sub">of {formatMoney(summary.monthly_budget)} planned</span>
          {budget > 0 && <progress value={Number(summary.this_month)} max={budget} />}
        </Stat>
      </section>
      <PriceNote totals={summary} />

      {problem && (
        <p key={problem} ref={scrollIntoView} className="notice journal-notice" role="alert">
          {problem}
        </p>
      )}

      {/*
        Wide screens get one table for all years, so the columns line up from one
        year to the next. Narrower ones, where the table would need sideways
        scrolling, get the list below instead; styles.css decides which shows.
      */}
      <section className="table-wrap journal-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ticker</th>
              <th className="number">Shares</th>
              <th className="number">Price</th>
              <th className="number">Amount</th>
              <th className="number">Value now</th>
              <th className="number">Take profit</th>
              <th className="number">Stop loss</th>
              <th>Why</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          {summary.years.map((total) => (
            <tbody key={total.year}>
              <tr className="year">
                <th colSpan={10} scope="rowgroup">
                  <span className="year-number">{total.year}</span> <YearSummary total={total} />
                </th>
              </tr>
              {(byYear.get(total.year) ?? []).map((trade) => (
                <TradeRow key={trade.id} trade={trade} onDelete={remove} />
              ))}
            </tbody>
          ))}
        </table>
      </section>

      <div className="journal-list">
        {summary.years.map((total) => (
          <section key={total.year} className="year-group">
            <h2 className="year-heading">
              <span className="year-number">{total.year}</span> <YearSummary total={total} />
            </h2>
            <ul className="trade-list">
              {(byYear.get(total.year) ?? []).map((trade) => (
                <li key={trade.id}>
                  <TradeItem trade={trade} onDelete={remove} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** "7 trades · $2,292.51 bought · $72.00 sold", after the year in both layouts. */
function YearSummary({ total }: { total: YearTotal }) {
  const { trade_count: count, bought, sold } = total;
  return (
    <small>
      {count} {count === 1 ? "trade" : "trades"} · {formatMoney(bought)} bought
      {Number(sold) > 0 && ` · ${formatMoney(sold)} sold`}
    </small>
  );
}

// Cells keep to a main figure with a smaller second line under it (a percentage,
// what is left, the trade type), so the table stays narrow enough for the Edit
// and Delete buttons to fit on a laptop screen.

/** A dollar amount with its percentage change from the buy price under it, or a dash when unknown. */
function Amount({ value, change }: { value: Decimal | null; change: Decimal | null }) {
  if (value === null || change === null) return <>–</>;
  return (
    <>
      {formatMoney(value)}
      <span className="second-line">
        <Change percent={change} />
      </span>
    </>
  );
}

/** What a sale made or lost compared with what its shares cost. */
function SaleResult({ trade }: { trade: Trade }) {
  const { realized_gain: gain, realized_gain_pct: percent } = trade;
  if (gain === null || percent === null) return <>–</>;
  return (
    <>
      <small>{Number(gain) >= 0 ? "gain" : "loss"}</small> {formatSignedMoney(gain)}
      <span className="second-line">
        <Change percent={percent} />
      </span>
    </>
  );
}

/** Under a purchase's share count: how much of it later sales used up. */
function SharesLeft({ trade }: { trade: Trade }) {
  // Only purchases that have been sold from carry a realised gain.
  if (trade.realized_gain === null || trade.remaining_shares === null) return null;
  const left = trade.remaining_shares;
  return (
    <small className="second-line">
      {Number(left) === 0 ? "all sold" : `${formatShares(left)} left`}
    </small>
  );
}

function TradeRow({ trade, onDelete }: { trade: Trade; onDelete: (trade: Trade) => void }) {
  const sale = trade.side === "sell";
  // The row buttons only say "Edit" and "Delete"; this tells a screen reader which trade.
  const which = `${sale ? "sale" : "purchase"} of ${trade.ticker} on ${formatDate(trade.trade_date)}`;
  return (
    <tr>
      {/* The year is in the heading row above. */}
      <td className="nowrap">{formatShortDate(trade.trade_date)}</td>
      <td>
        <Link className="ticker" to={`/trades/${trade.id}`}>
          {trade.ticker}
        </Link>
        <span className="second-line">
          <span className={`side-tag ${trade.side}`}>{sale ? "Sell" : "Buy"}</span>
        </span>
      </td>
      <td className="number">
        {formatShares(trade.shares)}
        <SharesLeft trade={trade} />
      </td>
      <td className="number">{formatMoney(trade.price)}</td>
      <td className="number">{formatMoney(trade.amount)}</td>
      <td className="number">
        {sale ? (
          <SaleResult trade={trade} />
        ) : (
          <Amount value={trade.current_value} change={trade.gain_pct} />
        )}
      </td>
      <td className="number">
        <Amount value={trade.take_profit} change={trade.take_profit_pct} />
      </td>
      <td className="number">
        <Amount value={trade.stop_loss} change={trade.stop_loss_pct} />
      </td>
      <td className="why">
        <span>{trade.thesis}</span>
      </td>
      <td className="row-actions">
        <Link to={`/trades/${trade.id}/edit`} state={{ from: "/" }} aria-label={`Edit ${which}`}>
          Edit
        </Link>
        <button type="button" onClick={() => onDelete(trade)} aria-label={`Delete ${which}`}>
          Delete
        </button>
      </td>
    </tr>
  );
}
