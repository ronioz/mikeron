import type { ReactNode } from "react";

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
 * Everything there is now (the shares held plus the cash from sales) against
 * the user's own money put in: the headline of the journal and the portfolio.
 * The gain covers the shares still held and every sale, after fees.
 */
export function ValueHero({ totals }: { totals: Totals }) {
  const { total_value: value, total_gain: gain, total_gain_pct: gainPct } = totals;
  if (Number(totals.money_in) === 0) {
    return (
      <Hero label="Portfolio value" figure={formatMoney(0)}>
        <span className="muted">Nothing held right now</span>
      </Hero>
    );
  }
  if (value === null) {
    return (
      <Hero label="Portfolio value" figure={<span className="muted">–</span>}>
        <span className="muted">
          {totals.prices_enabled ? "No live prices right now" : "Live prices are off"}
        </span>
      </Hero>
    );
  }
  return (
    <Hero label="Portfolio value" figure={formatMoney(value)}>
      {gain !== null && gainPct !== null && <Delta amount={gain} percent={gainPct} />}
      <span className="muted">on the {formatMoney(totals.money_in)} you put in</span>
    </Hero>
  );
}

/** The user's own money put into purchases; reinvested cash from sales isn't counted twice. */
export function MoneyInStat({ totals }: { totals: Totals }) {
  return (
    <Stat label="Put in">
      <span className="value">{formatMoney(totals.money_in)}</span>
      <span className="sub">your own money</span>
    </Stat>
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

/**
 * The line saying how fresh the prices are, or why there are none. It has a
 * clock and is brighter than the notes elsewhere, so it's seen at a glance:
 * every figure above it depends on it.
 */
export function PriceLine({ children }: { children: ReactNode }) {
  return (
    <p className="price-line">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** "Prices as of 03:17 PM.", with the time standing out. */
export function AsOf({ what, at }: { what: string; at: string }) {
  return (
    <>
      {what} as of <strong>{formatTime(at)}</strong>.
    </>
  );
}

/** Says how fresh the prices are and which holdings have none. */
export function PriceNote({ totals }: { totals: Totals }) {
  // With nothing held there are no prices to talk about.
  if (!holdsAnything(totals)) return null;
  if (!totals.prices_enabled) {
    return (
      <PriceLine>Live prices are off. Add a Finnhub API key to turn them on (see the README).</PriceLine>
    );
  }
  if (totals.price_at === null) {
    return <PriceLine>No live prices are available right now.</PriceLine>;
  }
  const missing = totals.unpriced;
  return (
    <PriceLine>
      <AsOf what="Prices" at={totals.price_at} />
      {missing.length > 0 && (
        <span className="muted">
          {` No live price for ${missing.join(", ")}, so ${
            missing.length === 1 ? "it is" : "they are"
          } counted at what you paid.`}
        </span>
      )}
    </PriceLine>
  );
}
