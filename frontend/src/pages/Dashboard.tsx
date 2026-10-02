import { Link } from "react-router";

import { api } from "../api";
import { Change, PriceNote, StatTile, ValueTile } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { formatMoney, formatShares } from "../format";
import type { Decimal, Summary, Trade } from "../types";
import { REFRESH_MS, useApi } from "../useApi";

export function Dashboard() {
  const state = useApi(() => Promise.all([api.getSummary(), api.listTrades()]), [], REFRESH_MS);
  return (
    <>
      <title>Trade Journal</title>
      <Loadable state={state}>
        {([summary, trades]) =>
          trades.length === 0 ? <NoTrades /> : <Journal summary={summary} trades={trades} />
        }
      </Loadable>
    </>
  );
}

function NoTrades() {
  return (
    <section className="card empty">
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

function Journal({ summary, trades }: { summary: Summary; trades: Trade[] }) {
  const byYear = groupByYear(trades);
  const budget = Number(summary.monthly_budget);

  return (
    <>
      <section className="stats">
        <StatTile label="Total invested">
          <span className="value">{formatMoney(summary.invested)}</span>
        </StatTile>
        <ValueTile totals={summary} />
        <StatTile label="Trades">
          <span className="value">{summary.trade_count}</span>
        </StatTile>
        <StatTile label="This month">
          <span className="value">{formatMoney(summary.this_month)}</span>
          <span className="sub">of {formatMoney(summary.monthly_budget)} planned</span>
          {budget > 0 && <progress value={Number(summary.this_month)} max={budget} />}
        </StatTile>
      </section>
      <PriceNote totals={summary} />

      {/* One table for all years so the columns line up from one year to the next. */}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ticker</th>
              <th className="number">Shares</th>
              <th className="number">Buy price</th>
              <th className="number">Cost</th>
              <th className="number">Value now</th>
              <th className="number">Take profit</th>
              <th className="number">Stop loss</th>
              <th>Why</th>
            </tr>
          </thead>
          {summary.years.map(({ year, trade_count: count, invested }) => (
            <tbody key={year}>
              <tr className="year">
                <th colSpan={9} scope="rowgroup">
                  {year}{" "}
                  <small>
                    {count} {count === 1 ? "trade" : "trades"} · {formatMoney(invested)} invested
                  </small>
                </th>
              </tr>
              {(byYear.get(year) ?? []).map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </tbody>
          ))}
        </table>
      </section>
    </>
  );
}

/** A dollar amount with its percentage change from the buy price, or a dash when unknown. */
function Amount({ value, change }: { value: Decimal | null; change: Decimal | null }) {
  if (value === null || change === null) return <>–</>;
  return (
    <>
      {formatMoney(value)} <Change percent={change} />
    </>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  return (
    <tr>
      <td className="nowrap">{trade.trade_date}</td>
      <td>
        <Link className="ticker" to={`/trades/${trade.id}`}>
          {trade.ticker}
        </Link>
      </td>
      <td className="number">{formatShares(trade.shares)}</td>
      <td className="number">{formatMoney(trade.buy_price)}</td>
      <td className="number">{formatMoney(trade.cost)}</td>
      <td className="number">
        <Amount value={trade.current_value} change={trade.gain_pct} />
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
    </tr>
  );
}
