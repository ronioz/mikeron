import type { ReactNode } from "react";

import { isMoney } from "../cash";
import { formatMoney, formatPercent, formatSignedMoney, formatSignedPercent, formatTime } from "../format";
import type { Decimal, Totals } from "../types";

/** One figure with its label, in the row under a page's headline figure. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

interface HeroProps {
  label: string;
  figure: ReactNode;
  /** A line under the figure: how it has changed, or why it is missing. */
  children?: ReactNode;
}

/** The one large figure a page leads with. */
export function Hero({ label, figure, children }: HeroProps) {
  return (
    <section className="hero">
      <p className="hero-label">{label}</p>
      <p className="hero-figure">{figure}</p>
      {children && <p className="hero-line">{children}</p>}
    </section>
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

/**
 * What everything held is worth now plus the cash from sales: the headline of
 * the journal and the portfolio.
 */
export function ValueHero({ totals }: { totals: Totals }) {
  const { total_value: value, gain, gain_pct: gainPct } = totals;
  const hasCash = isMoney(totals.cash);
  if (!holdsAnything(totals)) {
    return (
      <Hero label="Portfolio value" figure={formatMoney(totals.cash)}>
        <span className="muted">{hasCash ? "All of it is cash from sales" : "Nothing held right now"}</span>
      </Hero>
    );
  }
  if (value === null || gain === null || gainPct === null) {
    return (
      <Hero label="Portfolio value" figure={<span className="muted">–</span>}>
        <span className="muted">
          {totals.prices_enabled ? "No live prices right now" : "Live prices are off"}
        </span>
      </Hero>
    );
  }
  // The gain is the shares' own; the cash is in the figure but has no gain, so say it's there.
  return (
    <Hero label="Portfolio value" figure={formatMoney(value)}>
      <Delta amount={gain} percent={gainPct} />
      <span className="muted">
        vs what you paid{hasCash && `, plus ${formatMoney(totals.cash)} in cash`}
      </span>
    </Hero>
  );
}

/** Every fee paid so far, and what share of the money traded that is. */
export function FeesStat({ totals }: { totals: Totals }) {
  return (
    <Stat label="Fees">
      <span className="value">{formatMoney(totals.fees)}</span>
      {totals.fees_pct !== null && (
        <span className="sub">{formatPercent(totals.fees_pct)} of what you traded</span>
      )}
    </Stat>
  );
}

/** Cash from sales that hasn't been spent on purchases yet. */
export function CashStat({ totals }: { totals: Totals }) {
  return (
    <Stat label="Cash">
      <span className="value">{formatMoney(totals.cash)}</span>
      <span className="sub">from sales, not reinvested</span>
    </Stat>
  );
}

/** What all sales so far have gained or lost, compared with what the shares cost. */
export function SalesStat({ totals }: { totals: Totals }) {
  const gain = totals.realized_gain;
  const count = totals.sale_count;
  return (
    <Stat label="Gain from sales">
      <span className={`value ${Number(gain) >= 0 ? "gain" : "loss"}`}>{formatSignedMoney(gain)}</span>
      <span className="sub">
        from {count} {count === 1 ? "sale" : "sales"}
      </span>
    </Stat>
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
