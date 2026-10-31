import type { ReactNode } from "react";
import { View } from "react-native";

import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  formatSignedPercent,
  formatTime,
} from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Decimal, ShareTotals, Totals } from "@/lib/types";

import { ClockIcon } from "./icons";
import { T } from "./T";

/** The row of figures under a page's headline figure, two by two. */
export function Stats({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        rowGap: 20,
        paddingVertical: 20,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.line,
      }}
    >
      {children}
    </View>
  );
}

/** One figure with its label, in that row. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ width: "50%", paddingRight: 16, gap: 2 }}>
      <T tone="muted" size={14} weight="medium">
        {label}
      </T>
      {children}
    </View>
  );
}

export function StatValue({ tone, children }: { tone?: "gain" | "loss"; children: ReactNode }) {
  return (
    <T size={24} weight="medium" tone={tone} style={{ letterSpacing: -0.24, lineHeight: 29 }}>
      {children}
    </T>
  );
}

export function StatSub({ children }: { children: ReactNode }) {
  return (
    <T tone="muted" size={14}>
      {children}
    </T>
  );
}

interface HeroProps {
  label: string;
  figure: string;
  /** The figure itself is a placeholder, shown quietly. */
  quiet?: boolean;
  /** A line under the figure: how it has changed, or why it is missing. */
  children?: ReactNode;
}

/** The one large figure a page leads with. It shrinks to stay on one line. */
export function Hero({ label, figure, quiet, children }: HeroProps) {
  return (
    <View style={{ paddingTop: 20, paddingBottom: 24 }}>
      <T tone="muted" weight="medium">
        {label}
      </T>
      <T
        size={60}
        weight="medium"
        tone={quiet ? "muted" : "text"}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ marginTop: 4, letterSpacing: -1.8, lineHeight: 66 }}
      >
        {figure}
      </T>
      {children && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "baseline",
            columnGap: 10,
            rowGap: 4,
            marginTop: 14,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

/** A small signed percentage, e.g. how far a target price is from the buy price. */
export function Change({ percent, size = 14 }: { percent: Decimal; size?: number }) {
  return (
    <T size={size} tone={Number(percent) >= 0 ? "gain" : "loss"}>
      {formatSignedPercent(percent)}
    </T>
  );
}

/**
 * What a holding has gained or lost so far. The sign and arrow carry the
 * direction; the colour only reinforces it.
 */
export function Delta({ amount, percent }: { amount: Decimal; percent: Decimal }) {
  const up = Number(amount) >= 0;
  const text = `${formatSignedMoney(amount)} (${formatSignedPercent(percent)})`;
  return (
    <T weight="semibold" tone={up ? "gain" : "loss"} accessibilityLabel={text}>
      {up ? "▲" : "▼"} {text}
    </T>
  );
}

/** False once everything bought has been sold, or before anything was bought. */
function holdsAnything(totals: ShareTotals): boolean {
  return Number(totals.invested) > 0;
}

/**
 * Everything there is now (the shares held plus the cash from sales) against
 * the person's own money put in: the headline of the journal and the portfolio.
 */
export function ValueHero({ totals }: { totals: Totals }) {
  const { total_value: value, total_gain: gain, total_gain_pct: gainPct } = totals;
  if (Number(totals.money_in) === 0) {
    return (
      <Hero label="Portfolio value" figure={formatMoney(0)}>
        <T tone="muted">Nothing held right now</T>
      </Hero>
    );
  }
  if (value === null) {
    return (
      <Hero label="Portfolio value" figure="–" quiet>
        <T tone="muted">
          {totals.prices_enabled ? "No live prices right now" : "Live prices are off"}
        </T>
      </Hero>
    );
  }
  return (
    <Hero label="Portfolio value" figure={formatMoney(value)}>
      {gain !== null && gainPct !== null && <Delta amount={gain} percent={gainPct} />}
      <T tone="muted">on the {formatMoney(totals.money_in)} you put in</T>
    </Hero>
  );
}

/** The person's own money put into purchases; reinvested cash isn't counted twice. */
export function MoneyInStat({ totals }: { totals: Totals }) {
  return (
    <Stat label="Put in">
      <StatValue>{formatMoney(totals.money_in)}</StatValue>
      <StatSub>your own money</StatSub>
    </Stat>
  );
}

/** Every fee paid so far, and what share of the money traded that is. */
export function FeesStat({ totals }: { totals: ShareTotals }) {
  return (
    <Stat label="Fees">
      <StatValue>{formatMoney(totals.fees)}</StatValue>
      {totals.fees_pct !== null && (
        <StatSub>{formatPercent(totals.fees_pct)} of what you traded</StatSub>
      )}
    </Stat>
  );
}

/** Cash from sales that hasn't been spent on purchases yet. */
export function CashStat({ totals }: { totals: Totals }) {
  return (
    <Stat label="Cash">
      <StatValue>{formatMoney(totals.cash)}</StatValue>
      <StatSub>from sales, not reinvested</StatSub>
    </Stat>
  );
}

/** What all sales so far have gained or lost, compared with what the shares cost. */
export function SalesStat({ totals }: { totals: ShareTotals }) {
  const gain = totals.realized_gain;
  const count = totals.sale_count;
  return (
    <Stat label="Gain from sales">
      <StatValue tone={Number(gain) >= 0 ? "gain" : "loss"}>{formatSignedMoney(gain)}</StatValue>
      <StatSub>
        from {count} {count === 1 ? "sale" : "sales"}
      </StatSub>
    </Stat>
  );
}

/**
 * The line saying how fresh the prices are, or why there are none. It has a
 * clock and is brighter than the notes elsewhere, so it's seen at a glance:
 * every figure above it depends on it.
 */
function PriceLine({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
      <ClockIcon color={theme.text} size={20} />
      <T tone="soft" size={15} style={{ flex: 1, lineHeight: 21 }}>
        {children}
      </T>
    </View>
  );
}

/** Says how fresh the prices are and which holdings have none. */
export function PriceNote({ totals }: { totals: ShareTotals }) {
  // With nothing held there are no prices to talk about.
  if (!holdsAnything(totals)) return null;
  if (!totals.prices_enabled) return <PriceLine>Live prices are off.</PriceLine>;
  if (totals.price_at === null) {
    return <PriceLine>No live prices are available right now.</PriceLine>;
  }
  const missing = totals.unpriced;
  return (
    <PriceLine>
      Prices as of{" "}
      <T size={15} weight="semibold">
        {formatTime(totals.price_at)}
      </T>
      .
      {missing.length > 0 && (
        <T tone="muted" size={15}>
          {` No live price for ${missing.join(", ")}, so ${
            missing.length === 1 ? "it is" : "they are"
          } counted at what you paid.`}
        </T>
      )}
    </PriceLine>
  );
}
