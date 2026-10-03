import type { ReactNode } from "react";

import { formatMoney, formatSignedMoney, formatSignedPercent, formatTime } from "../format";
import type { Decimal, Totals } from "../types";

export function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

/** A small signed percentage, e.g. how far a target price is from the buy price. */
export function Change({ percent }: { percent: Decimal }) {
  return (
    <small className={Number(percent) >= 0 ? "gain" : "loss"}>{formatSignedPercent(percent)}</small>
  );
}

/**
 * What a holding has gained or lost so far. The sign and arrow carry the
 * direction; the colour only reinforces it.
 */
export function Delta({ amount, percent }: { amount: Decimal; percent: Decimal }) {
  const up = Number(amount) >= 0;
  return (
    <span className={`delta ${up ? "gain" : "loss"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>{" "}
      {`${formatSignedMoney(amount)} (${formatSignedPercent(percent)})`}
    </span>
  );
}

/** False once everything bought has been sold, or before anything was bought. */
function holdsAnything(totals: Totals): boolean {
  return Number(totals.invested) > 0;
}

/** The "Current value" tile shared by the journal and the portfolio. */
export function ValueTile({ totals }: { totals: Totals }) {
  const { current_value: value, gain, gain_pct: gainPct } = totals;
  if (!holdsAnything(totals)) {
    return (
      <StatTile label="Current value">
        <span className="value">{formatMoney(0)}</span>
        <span className="sub">Nothing held right now</span>
      </StatTile>
    );
  }
  return (
    <StatTile label="Current value">
      {value !== null && gain !== null && gainPct !== null ? (
        <>
          <span className="value">{formatMoney(value)}</span>
          <Delta amount={gain} percent={gainPct} />
        </>
      ) : (
        <>
          <span className="value muted">–</span>
          <span className="sub">
            {totals.prices_enabled ? "No live prices right now" : "Live prices are off"}
          </span>
        </>
      )}
    </StatTile>
  );
}

/** What all sales so far have gained or lost, compared with what the shares cost. */
export function SalesTile({ totals }: { totals: Totals }) {
  const gain = totals.realized_gain;
  const count = totals.sale_count;
  return (
    <StatTile label="Gain from sales">
      <span className={`value ${Number(gain) >= 0 ? "gain" : "loss"}`}>{formatSignedMoney(gain)}</span>
      <span className="sub">
        from {count} {count === 1 ? "sale" : "sales"}
      </span>
    </StatTile>
  );
}

/** Says how fresh the prices are and which holdings have none. */
export function PriceNote({ totals }: { totals: Totals }) {
  // With nothing held there are no prices to talk about.
  if (!holdsAnything(totals)) return null;
  if (!totals.prices_enabled) {
    return (
      <p className="note-line">
        Live prices are off. Add a Finnhub API key to turn them on (see the README).
      </p>
    );
  }
  if (totals.price_at === null) {
    return <p className="note-line">No live prices are available right now.</p>;
  }
  const missing = totals.unpriced;
  return (
    <p className="note-line">
      Prices as of {formatTime(totals.price_at)}.
      {missing.length > 0 &&
        ` No live price for ${missing.join(", ")}, so ${
          missing.length === 1 ? "it is" : "they are"
        } counted at what you paid.`}
    </p>
  );
}
