import { useState } from "react";
import { Link } from "react-router";

import { api } from "../api";
import { isMoney, reinvested } from "../cash";
import {
  CashStat,
  Change,
  MoneyInStat,
  PriceNote,
  SalesStat,
  Stat,
  ValueHero,
} from "../components/figures";
import { BrokerBadge } from "../components/BrokerBadge";
import { Loadable } from "../components/Loadable";
import { TradeItem } from "../components/TradeItem";
import { confirmAndDelete } from "../deleteTrade";
import { formatDate, formatMoney, formatShares, formatShortDate, formatSignedMoney } from "../format";
import { PERIODS } from "../plan";
import type { Decimal, Summary, Trade, YearTotal } from "../types";
import { REFRESH_MS, useApi } from "../useApi";

export function Dashboard() {
  const state = useApi(() => Promise.all([api.getSummary(), api.listTrades()]), [], REFRESH_MS);
  return (
    <>
      <title>Mikeronn</title>
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
  const planned = Number(summary.plan_amount);

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
        <MoneyInStat totals={summary} />
        {summary.sale_count > 0 && <SalesStat totals={summary} />}
        {summary.sale_count > 0 && <CashStat totals={summary} />}
        <Stat label="Trades">
          <span className="value">{summary.trade_count}</span>
          {isMoney(summary.fees) && (
            <span className="sub">{formatMoney(summary.fees)} in fees</span>
          )}
        </Stat>
        {/*
          The week, month or quarter going on now, whichever the plan runs by.
          New money only: buying with cash from sales doesn't spend the plan.
        */}
        <Stat label={PERIODS[summary.plan_period].current}>
          <span className="value">{formatMoney(summary.this_period)}</span>
          <span className="sub">of {formatMoney(summary.plan_amount)} planned</span>
          {isMoney(summary.this_period_from_cash) && (
            <span className="sub">plus {formatMoney(summary.this_period_from_cash)} reinvested</span>
          )}
          {planned > 0 && <progress value={Number(summary.this_period)} max={planned} />}
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
          {summary.years.map((total) => (
            <tbody key={total.year}>
              <tr className="year">
                <th colSpan={9} scope="rowgroup">
                  <span className="year-number">{total.year}</span> <YearSummary total={total} />
                </th>
              </tr>
              <ColumnNames />
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

/** "7 trades · $2,292.51 bought · $72.00 sold · $4.50 in fees", after the year in both layouts. */
function YearSummary({ total }: { total: YearTotal }) {
  const { trade_count: count, bought, sold, fees } = total;
  return (
    <small>
      {count} {count === 1 ? "trade" : "trades"} · {formatMoney(bought)} bought
      {Number(sold) > 0 && ` · ${formatMoney(sold)} sold`}
      {isMoney(fees) && ` · ${formatMoney(fees)} in fees`}
    </small>
  );
}

/**
 * The column names, under each year's heading. A <thead> can't go there: a
 * table has only one, and it is drawn above the first year's heading.
 * Take profit and stop loss are left to each trade's own page.
 */
function ColumnNames() {
  return (
    <tr className="column-names">
      <th scope="col">Date</th>
      <th scope="col">Broker</th>
      <th scope="col">Ticker</th>
      <th scope="col" className="number">Shares</th>
      <th scope="col" className="number">Price</th>
      <th scope="col" className="number">Amount</th>
      <th scope="col" className="number">Value now</th>
      <th scope="col">Why</th>
      <th scope="col">
        <span className="visually-hidden">Actions</span>
      </th>
    </tr>
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

/**
 * Under a trade's amount: its fee (added to a purchase, taken from a sale), and
 * how much of a purchase was paid with cash from sales. One line each.
 */
function AmountNotes({ trade }: { trade: Trade }) {
  const part = reinvested(trade);
  return (
    <>
      {isMoney(trade.fee) && (
        <small className="second-line">
          {trade.side === "sell" ? "−" : "+"}
          {formatMoney(trade.fee)} fee
        </small>
      )}
      {part && (
        <small className="second-line">
          {part.all ? "reinvested" : `${formatMoney(part.amount)} reinvested`}
        </small>
      )}
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
      {/* "Other" stores no broker: a dash, like the table's other empty cells. */}
      <td>{trade.broker ? <BrokerBadge broker={trade.broker} /> : "–"}</td>
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
      <td className="number">
        {formatMoney(trade.amount)}
        <AmountNotes trade={trade} />
      </td>
      <td className="number">
        {sale ? (
          <SaleResult trade={trade} />
        ) : (
          <Amount value={trade.current_value} change={trade.gain_pct} />
        )}
      </td>
      {/* A trade can be saved without a reason: a dash, like the table's other empty cells. */}
      <td className="why">{trade.thesis ? <span>{trade.thesis}</span> : "–"}</td>
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
