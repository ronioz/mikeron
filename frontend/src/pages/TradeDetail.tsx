import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api } from "../api";
import { Change, Delta, StatTile } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { confirmAndDelete } from "../deleteTrade";
import { formatMoney, formatShares, formatSignedMoney, formatTime } from "../format";
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
  const sale = trade.side === "sell";
  const stillHeld = trade.remaining_shares !== null && Number(trade.remaining_shares) > 0;

  async function remove() {
    try {
      if (await confirmAndDelete(trade)) navigate("/");
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : "Could not delete the trade.");
    }
  }

  return (
    <>
      <title>{`${trade.ticker} ${sale ? "sale" : "purchase"} · Trade Journal`}</title>
      <div className="page-head">
        <h1>
          {trade.ticker} <span className={`side-tag ${trade.side}`}>{sale ? "Sell" : "Buy"}</span>{" "}
          <small>{trade.trade_date}</small>
        </h1>
        <div className="actions">
          {stillHeld && (
            <Link
              className="button secondary"
              to={`/trades/new?side=sell&ticker=${encodeURIComponent(trade.ticker)}`}
            >
              Sell
            </Link>
          )}
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

      {sale ? <SaleFigures trade={trade} /> : <PurchaseFigures trade={trade} />}
      <p className="note-line">
        {trade.price_at !== null
          ? `Price as of ${formatTime(trade.price_at)}.`
          : `No live price is available for ${trade.ticker}.`}
      </p>

      <section className="card note">
        <h2>{sale ? "Why I sold" : "Why I bought"}</h2>
        <p className="prose">{trade.thesis}</p>
      </section>

      {!sale && (
        <section className="card note">
          <h2>Forecast</h2>
          {trade.forecast ? (
            <p className="prose">{trade.forecast}</p>
          ) : (
            <p className="muted">No forecast written.</p>
          )}
        </section>
      )}
    </>
  );
}

function PriceNow({ trade }: { trade: Trade }) {
  return (
    <StatTile label="Price now">
      {trade.current_price !== null ? (
        <span className="value">{formatMoney(trade.current_price)}</span>
      ) : (
        <span className="value muted">–</span>
      )}
    </StatTile>
  );
}

function PurchaseFigures({ trade }: { trade: Trade }) {
  const left = trade.remaining_shares;
  // Purchases that sales have used up, in part or in full, carry a realised gain.
  const soldFrom = trade.realized_gain !== null && trade.realized_gain_pct !== null;
  const soldOut = left !== null && Number(left) === 0;

  return (
    <section className="stats">
      <StatTile label="Shares">
        <span className="value">{formatShares(trade.shares)}</span>
        {soldFrom && left !== null && (
          <span className="sub">{soldOut ? "All sold" : `${formatShares(left)} still held`}</span>
        )}
      </StatTile>
      <StatTile label="Buy price">
        <span className="value">{formatMoney(trade.price)}</span>
      </StatTile>
      <StatTile label="Cost">
        <span className="value">{formatMoney(trade.amount)}</span>
      </StatTile>
      <PriceNow trade={trade} />
      <StatTile label="Value now">
        {trade.current_value !== null && trade.gain !== null && trade.gain_pct !== null ? (
          <>
            <span className="value">{formatMoney(trade.current_value)}</span>
            <Delta amount={trade.gain} percent={trade.gain_pct} />
            {soldFrom && left !== null && (
              <span className="sub">of the {formatShares(left)} shares still held</span>
            )}
          </>
        ) : (
          <>
            <span className="value muted">–</span>
            {soldOut && <span className="sub">Nothing left to value</span>}
          </>
        )}
      </StatTile>
      {soldFrom && trade.realized_gain !== null && trade.realized_gain_pct !== null && (
        <StatTile label="Gain from sales">
          <span className={`value ${Number(trade.realized_gain) >= 0 ? "gain" : "loss"}`}>
            {formatSignedMoney(trade.realized_gain)}
          </span>
          <span className="sub">
            <Change percent={trade.realized_gain_pct} /> on the shares sold
          </span>
        </StatTile>
      )}
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
  );
}

function SaleFigures({ trade }: { trade: Trade }) {
  const { realized_gain: gain, realized_gain_pct: percent, cost_basis: cost } = trade;
  return (
    <section className="stats">
      <StatTile label="Shares sold">
        <span className="value">{formatShares(trade.shares)}</span>
      </StatTile>
      <StatTile label="Sell price">
        <span className="value">{formatMoney(trade.price)}</span>
      </StatTile>
      <StatTile label="Received">
        <span className="value">{formatMoney(trade.amount)}</span>
      </StatTile>
      <StatTile label="Those shares cost">
        <span className="value">{cost !== null ? formatMoney(cost) : "–"}</span>
        <span className="sub">Oldest shares are sold first</span>
      </StatTile>
      <StatTile label={gain !== null && Number(gain) < 0 ? "Loss on sale" : "Gain on sale"}>
        {gain !== null && percent !== null ? (
          <>
            <span className={`value ${Number(gain) >= 0 ? "gain" : "loss"}`}>
              {formatSignedMoney(gain)}
            </span>
            <span className="sub">
              <Change percent={percent} /> on what they cost
            </span>
          </>
        ) : (
          <span className="value muted">–</span>
        )}
      </StatTile>
      <PriceNow trade={trade} />
    </section>
  );
}
