import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api } from "../api";
import { Change, Delta, StatTile } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { formatMoney, formatShares, formatTime } from "../format";
import type { Trade } from "../types";
import { REFRESH_MS, useApi } from "../useApi";

export function TradeDetail() {
  const id = Number(useParams().id);
  const state = useApi(() => api.getTrade(id), [id], REFRESH_MS);
  return <Loadable state={state}>{(trade) => <Report trade={trade} />}</Loadable>;
}

function Report({ trade }: { trade: Trade }) {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string>();

  async function remove() {
    if (!window.confirm("Delete this trade? This cannot be undone.")) return;
    try {
      await api.deleteTrade(trade.id);
      navigate("/");
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : "Could not delete the trade.");
    }
  }

  return (
    <>
      <title>{`${trade.ticker} · Trade Journal`}</title>
      <div className="page-head">
        <h1>
          {trade.ticker} <small>{trade.trade_date}</small>
        </h1>
        <div className="actions">
          <Link className="button secondary" to={`/trades/${trade.id}/edit`}>
            Edit
          </Link>
          <button className="button danger" type="button" onClick={remove}>
            Delete
          </button>
        </div>
      </div>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}

      <section className="stats">
        <StatTile label="Shares">
          <span className="value">{formatShares(trade.shares)}</span>
        </StatTile>
        <StatTile label="Buy price">
          <span className="value">{formatMoney(trade.buy_price)}</span>
        </StatTile>
        <StatTile label="Cost">
          <span className="value">{formatMoney(trade.cost)}</span>
        </StatTile>
        <StatTile label="Price now">
          {trade.current_price !== null ? (
            <span className="value">{formatMoney(trade.current_price)}</span>
          ) : (
            <span className="value muted">–</span>
          )}
        </StatTile>
        <StatTile label="Value now">
          {trade.current_value !== null && trade.gain !== null && trade.gain_pct !== null ? (
            <>
              <span className="value">{formatMoney(trade.current_value)}</span>
              <Delta amount={trade.gain} percent={trade.gain_pct} />
            </>
          ) : (
            <span className="value muted">–</span>
          )}
        </StatTile>
        <StatTile label="Take profit at">
          {trade.take_profit !== null && trade.take_profit_pct !== null ? (
            <>
              <span className="value">{formatMoney(trade.take_profit)}</span>
              <span className="sub">
                <Change percent={trade.take_profit_pct} /> vs buy
              </span>
            </>
          ) : (
            <span className="value muted">Not set</span>
          )}
        </StatTile>
        <StatTile label="Stop loss at">
          {trade.stop_loss !== null && trade.stop_loss_pct !== null ? (
            <>
              <span className="value">{formatMoney(trade.stop_loss)}</span>
              <span className="sub">
                <Change percent={trade.stop_loss_pct} /> vs buy
              </span>
            </>
          ) : (
            <span className="value muted">Not set</span>
          )}
        </StatTile>
      </section>
      <p className="note-line">
        {trade.price_at !== null
          ? `Price as of ${formatTime(trade.price_at)}.`
          : `No live price is available for ${trade.ticker}.`}
      </p>

      <section className="card note">
        <h2>Why I bought</h2>
        <p className="prose">{trade.thesis}</p>
      </section>

      <section className="card note">
        <h2>Forecast</h2>
        {trade.forecast ? (
          <p className="prose">{trade.forecast}</p>
        ) : (
          <p className="muted">No forecast written.</p>
        )}
      </section>
    </>
  );
}
