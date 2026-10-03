import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api } from "../api";
import { Change, Delta, Hero, Stat } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { confirmAndDelete } from "../deleteTrade";
import {
  formatDate,
  formatMoney,
  formatShares,
  formatSignedMoney,
  formatSignedPercent,
  formatTime,
} from "../format";
import type { Decimal, Trade } from "../types";
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
          {trade.ticker}{" "}
          <span className="title-meta">
            <span className={`side-tag ${trade.side}`}>{sale ? "Sell" : "Buy"}</span>{" "}
            <span>{formatDate(trade.trade_date)}</span>
          </span>
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

      <section className="note">
        <h2>{sale ? "Why I sold" : "Why I bought"}</h2>
        <p className="prose">{trade.thesis}</p>
      </section>

      {!sale && (
        <section className="note">
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

/** A gain or loss as a large figure in green or red, for a headline. */
function SignedFigure({ amount }: { amount: Decimal }) {
  return <span className={Number(amount) >= 0 ? "gain" : "loss"}>{formatSignedMoney(amount)}</span>;
}

/** A percentage in green or red, at the size of the line it sits in. */
function SignedPercent({ percent }: { percent: Decimal }) {
  return (
    <span className={`delta ${Number(percent) >= 0 ? "gain" : "loss"}`}>{formatSignedPercent(percent)}</span>
  );
}

function PriceNow({ trade }: { trade: Trade }) {
  return (
    <Stat label="Price now">
      {trade.current_price !== null ? (
        <span className="value">{formatMoney(trade.current_price)}</span>
      ) : (
        <span className="value muted">–</span>
      )}
    </Stat>
  );
}

function PurchaseFigures({ trade }: { trade: Trade }) {
  const { remaining_shares: left, realized_gain: realized, realized_gain_pct: realizedPct } = trade;
  // Purchases that sales have used up, in part or in full, carry a realised gain.
  const soldFrom = realized !== null && realizedPct !== null;
  const soldOut = left !== null && Number(left) === 0;

  return (
    <>
      {/* The headline: what the shares still held are worth, or once all are sold, what selling them made. */}
      {soldOut && soldFrom ? (
        <Hero label="Gain from sales" figure={<SignedFigure amount={realized} />}>
          <SignedPercent percent={realizedPct} />
          <span className="muted">on the shares sold</span>
        </Hero>
      ) : (
        <ValueNow trade={trade} />
      )}

      <section className="facts-grid">
        <Stat label="Shares">
          <span className="value">{formatShares(trade.shares)}</span>
          {soldFrom && left !== null && (
            <span className="sub">{soldOut ? "All sold" : `${formatShares(left)} still held`}</span>
          )}
        </Stat>
        <Stat label="Buy price">
          <span className="value">{formatMoney(trade.price)}</span>
        </Stat>
        <Stat label="Cost">
          <span className="value">{formatMoney(trade.amount)}</span>
        </Stat>
        <PriceNow trade={trade} />
        {soldFrom && !soldOut && (
          <Stat label="Gain from sales">
            <span className={`value ${Number(realized) >= 0 ? "gain" : "loss"}`}>
              {formatSignedMoney(realized)}
            </span>
            <span className="sub">
              <Change percent={realizedPct} /> on the shares sold
            </span>
          </Stat>
        )}
        <Stat label="Take profit at">
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
        </Stat>
        <Stat label="Stop loss at">
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
        </Stat>
      </section>
    </>
  );
}

/** What the shares of a purchase that are still held are worth, and their gain so far. */
function ValueNow({ trade }: { trade: Trade }) {
  const { current_value: value, gain, gain_pct: gainPct, remaining_shares: left } = trade;
  if (value === null || gain === null || gainPct === null) {
    return <Hero label="Value now" figure={<span className="muted">–</span>} />;
  }
  // Only worth saying when sales have taken some of the shares.
  const partlySold = trade.realized_gain !== null && left !== null;
  return (
    <Hero label="Value now" figure={formatMoney(value)}>
      <Delta amount={gain} percent={gainPct} />
      {partlySold && <span className="muted">of the {formatShares(left)} shares still held</span>}
    </Hero>
  );
}

function SaleFigures({ trade }: { trade: Trade }) {
  const { realized_gain: gain, realized_gain_pct: percent, cost_basis: cost } = trade;
  return (
    <>
      {gain !== null && percent !== null ? (
        <Hero label={Number(gain) < 0 ? "Loss on sale" : "Gain on sale"} figure={<SignedFigure amount={gain} />}>
          <SignedPercent percent={percent} />
          <span className="muted">on what they cost</span>
        </Hero>
      ) : (
        <Hero label="Gain on sale" figure={<span className="muted">–</span>} />
      )}

      <section className="facts-grid">
        <Stat label="Shares sold">
          <span className="value">{formatShares(trade.shares)}</span>
        </Stat>
        <Stat label="Sell price">
          <span className="value">{formatMoney(trade.price)}</span>
        </Stat>
        <Stat label="Received">
          <span className="value">{formatMoney(trade.amount)}</span>
        </Stat>
        <Stat label="Those shares cost">
          <span className="value">{cost !== null ? formatMoney(cost) : "–"}</span>
          <span className="sub">Oldest shares are sold first</span>
        </Stat>
        <PriceNow trade={trade} />
      </section>
    </>
  );
}
