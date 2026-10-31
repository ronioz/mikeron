import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";

import { isMoney, reinvested } from "@/lib/cash";
import { formatMoney, formatShares, formatShortDate, formatSignedMoney } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Trade } from "@/lib/types";

import { BrokerBadge } from "./BrokerBadge";
import { Change } from "./figures";
import { T } from "./T";

/**
 * One trade in the journal: a line with the essentials that opens to show the
 * rest, as on the website at phone width.
 */
export function TradeItem({ trade }: { trade: Trade }) {
  const [open, setOpen] = useState(false);
  const sale = trade.side === "sell";
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 64,
          paddingVertical: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T size={17} weight="semibold">
              {trade.ticker}
            </T>
            <T size={13} weight="semibold" tone={sale ? "loss" : "gain"}>
              {sale ? "Sell" : "Buy"}
            </T>
            <BrokerBadge broker={trade.broker} />
          </View>
          {/* The year is in the heading over the list. */}
          <T tone="muted" size={14}>
            {formatShortDate(trade.trade_date)} · {sharesText(trade)}
          </T>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Headline trade={trade} />
        </View>
        <Chevron open={open} />
      </Pressable>

      {open && (
        <View style={{ paddingTop: 4, paddingBottom: 24 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 12 }}>
            {sale ? <SaleFacts trade={trade} /> : <PurchaseFacts trade={trade} />}
          </View>
          {trade.thesis !== "" && (
            <View style={{ marginTop: 20, gap: 4 }}>
              <T tone="muted" size={13} weight="medium">
                {sale ? "Why I sold" : "Why I bought"}
              </T>
              <T tone="soft" style={{ lineHeight: 24 }}>
                {trade.thesis}
              </T>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Chevron({ open }: { open: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 8,
        height: 8,
        marginHorizontal: 4,
        borderRightWidth: 1.5,
        borderBottomWidth: 1.5,
        borderColor: theme.muted,
        transform: [{ translateY: open ? 2 : -2 }, { rotate: open ? "225deg" : "45deg" }],
      }}
    />
  );
}

/**
 * "2 shares", plus what later sales left of a purchase and whether it was paid
 * with cash from sales: "10 shares · 6 left · reinvested".
 */
function sharesText(trade: Trade): string {
  const parts = [`${formatShares(trade.shares)} ${Number(trade.shares) === 1 ? "share" : "shares"}`];
  const left = trade.remaining_shares;
  // Only purchases that have been sold from carry a realised gain.
  if (trade.side === "buy" && trade.realized_gain !== null && left !== null) {
    parts.push(Number(left) === 0 ? "all sold" : `${formatShares(left)} left`);
  }
  if (reinvested(trade)) parts.push("reinvested");
  return parts.join(" · ");
}

function Amount({ children }: { children: string }) {
  return (
    <T size={17} weight="semibold" tabular>
      {children}
    </T>
  );
}

/** The figure on the right of the closed line: what a sale made, or what a purchase is worth. */
function Headline({ trade }: { trade: Trade }) {
  if (trade.side === "sell" && trade.realized_gain !== null && trade.realized_gain_pct !== null) {
    const gain = trade.realized_gain;
    return (
      <>
        <Amount>{formatSignedMoney(gain)}</Amount>
        <T tone="muted" size={14} tabular>
          {Number(gain) >= 0 ? "gain" : "loss"} <Change percent={trade.realized_gain_pct} />
        </T>
      </>
    );
  }
  if (trade.current_value !== null && trade.gain_pct !== null) {
    return (
      <>
        <Amount>{formatMoney(trade.current_value)}</Amount>
        <Change percent={trade.gain_pct} />
      </>
    );
  }
  // No live price, or nothing left to value: show what was paid instead.
  const soldOut = trade.remaining_shares !== null && Number(trade.remaining_shares) === 0;
  return (
    <>
      <Amount>{formatMoney(trade.net_amount)}</Amount>
      <T tone="muted" size={14}>
        {soldOut ? "all sold" : "paid"}
      </T>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ width: "50%", paddingRight: 16 }}>
      <T tone="muted" size={13}>
        {label}
      </T>
      <T tabular>{children}</T>
    </View>
  );
}

function Small({ children }: { children: ReactNode }) {
  return (
    <T tone="muted" size={13}>
      {children}
    </T>
  );
}

interface PriceAndChangeProps {
  price: string | null;
  change: string | null;
  missing: string;
}

/** A price with its percentage change, or a muted placeholder when there is none. */
function PriceAndChange({ price, change, missing }: PriceAndChangeProps) {
  if (price === null || change === null) {
    return (
      <T tone="muted" size={16}>
        {missing}
      </T>
    );
  }
  return (
    <>
      {formatMoney(price)} <Change percent={change} />
    </>
  );
}

function PurchaseFacts({ trade }: { trade: Trade }) {
  const left = trade.remaining_shares;
  const fromSales = reinvested(trade);
  return (
    <>
      <Fact label="Shares">
        {formatShares(trade.shares)}
        {trade.realized_gain !== null && left !== null && (
          <Small> {Number(left) === 0 ? "all sold" : `${formatShares(left)} left`}</Small>
        )}
      </Fact>
      <Fact label="Buy price">{formatMoney(trade.price)}</Fact>
      <Fact label="Cost">
        {formatMoney(trade.net_amount)}
        {isMoney(trade.fee) && <Small> incl. {formatMoney(trade.fee)} fee</Small>}
      </Fact>
      {fromSales && (
        <Fact label="Paid with">
          {fromSales.all
            ? "Cash from sales"
            : `${formatMoney(fromSales.amount)} from sales, the rest new money`}
        </Fact>
      )}
      <Fact label="Value now">
        <PriceAndChange price={trade.current_value} change={trade.gain_pct} missing="–" />
      </Fact>
      <Fact label="Take profit at">
        <PriceAndChange price={trade.take_profit} change={trade.take_profit_pct} missing="Not set" />
      </Fact>
      <Fact label="Stop loss at">
        <PriceAndChange price={trade.stop_loss} change={trade.stop_loss_pct} missing="Not set" />
      </Fact>
      {trade.realized_gain !== null && trade.realized_gain_pct !== null && (
        <Fact label="Gain from sales">
          {formatSignedMoney(trade.realized_gain)} <Change percent={trade.realized_gain_pct} />
        </Fact>
      )}
    </>
  );
}

function SaleFacts({ trade }: { trade: Trade }) {
  const { realized_gain: gain, realized_gain_pct: percent, cost_basis: cost } = trade;
  return (
    <>
      <Fact label="Shares sold">{formatShares(trade.shares)}</Fact>
      <Fact label="Sell price">{formatMoney(trade.price)}</Fact>
      <Fact label="Received">
        {formatMoney(trade.net_amount)}
        {isMoney(trade.fee) && <Small> after {formatMoney(trade.fee)} fee</Small>}
      </Fact>
      <Fact label="Those shares cost">{cost !== null ? formatMoney(cost) : "–"}</Fact>
      {gain !== null && percent !== null && (
        <Fact label={Number(gain) < 0 ? "Loss on sale" : "Gain on sale"}>
          {formatSignedMoney(gain)} <Change percent={percent} />
        </Fact>
      )}
    </>
  );
}
