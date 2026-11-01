import { useState } from "react";
import { View } from "react-native";

import { BrokerBadge } from "@/components/BrokerBadge";
import { DonutChart } from "@/components/DonutChart";
import {
  CashStat,
  Delta,
  FeesStat,
  Hero,
  MoneyInStat,
  PriceNote,
  SalesStat,
  Stat,
  StatSub,
  StatValue,
  Stats,
  ValueHero,
} from "@/components/figures";
import { Loadable } from "@/components/Loadable";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { T } from "@/components/T";
import { api } from "@/lib/api";
import { BROKER_IDS, BROKERS } from "@/lib/brokers";
import { isMoney } from "@/lib/cash";
import { buildSlices, OTHER } from "@/lib/chart";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Broker, BrokerPortfolio, Portfolio, Position } from "@/lib/types";
import { REFRESH_MS, useApi } from "@/lib/useApi";

/** What the screen shows: everything, one broker's part, or the trades naming no broker. */
type Part = "all" | Broker | "other";

export default function PortfolioScreen() {
  const state = useApi(api.getPortfolio, REFRESH_MS);
  const [shown, show] = useState<Part>("all");
  const parts = state.data?.by_broker ?? [];
  const other = parts.some((part) => part.broker === null);
  // With no broker on any trade there is nothing to tell apart, and the "Other"
  // part goes when its last trade does.
  const view = parts.length === 0 || (shown === "other" && !other) ? "all" : shown;
  const part = parts.find((each) => (each.broker ?? "other") === view);
  const totals = view === "all" ? state.data : part;
  return (
    <Screen
      refresh={state}
      // Its key starts each view afresh: a slice picked in one may not exist in the next.
      below={
        totals?.positions.length ? <Details key={view} totals={totals} whole={view === "all"} /> : undefined
      }
    >
      <Loadable state={state}>
        {(portfolio) => (
          <>
            {parts.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <BrokerSwitch view={view} other={other} onChange={show} />
              </View>
            )}
            {view === "all" ? (
              <Whole portfolio={portfolio} />
            ) : (
              // A broker with no trades yet has no part: it shows as an empty one.
              <BrokerPart broker={view === "other" ? null : view} part={part} />
            )}
          </>
        )}
      </Loadable>
    </Screen>
  );
}

/**
 * Everything under the dashboard, one swipe away: how fresh the prices are, the
 * ring and the table, of the whole portfolio or of one broker's part.
 */
function Details({ totals, whole }: { totals: Portfolio | BrokerPortfolio; whole: boolean }) {
  const { positions, current_value: value } = totals;
  return (
    <>
      <PriceNote totals={totals} />
      {!whole && (
        <T tone="muted" size={14} style={{ marginTop: 12 }}>
          Cash from sales and the money you put in are counted across all brokers together, under All.
        </T>
      )}
      <HoldingsDetail
        positions={positions}
        priced={value !== null}
        total={Number(value ?? totals.invested)}
      />
    </>
  );
}

interface SwitchProps {
  view: Part;
  /** Whether some trades name no broker, so there is an "Other" part to show. */
  other: boolean;
  onChange: (view: Part) => void;
}

/** All brokers together, or one at a time. */
function BrokerSwitch({ view, other, onChange }: SwitchProps) {
  const word = (text: string, chosen: boolean) => (
    <T size={15} tone={chosen ? "text" : "muted"}>
      {text}
    </T>
  );
  return (
    <Segmented<Part>
      label="Which broker's portfolio to show"
      value={view}
      onChange={onChange}
      options={[
        { id: "all", name: "All brokers together", content: word("All", view === "all") },
        ...BROKER_IDS.map((id) => ({
          id,
          name: BROKERS[id].name,
          content: <BrokerBadge broker={id} />,
        })),
        ...(other
          ? [
              {
                id: "other" as const,
                name: "Trades with no broker",
                content: word("Other", view === "other"),
              },
            ]
          : []),
      ]}
    />
  );
}

/** Everything, across brokers: the shares, the cash from sales and the money put in. */
function Whole({ portfolio }: { portfolio: Portfolio }) {
  return portfolio.positions.length === 0 ? (
    <NoHoldings portfolio={portfolio} />
  ) : (
    <Holdings portfolio={portfolio} />
  );
}

/**
 * One broker's part: what is left of the shares bought there, and the sales
 * and fees of the trades placed there. Cash isn't kept broker by broker, so
 * the headline is the shares alone, against what they cost.
 */
function BrokerPart({ broker, part }: { broker: Broker | null; part: BrokerPortfolio | undefined }) {
  const label = broker ? `Held at ${BROKERS[broker].name}` : "Held with no broker recorded";
  if (!part || part.positions.length === 0) {
    return (
      <>
        <Hero label={label} figure={formatMoney(0)}>
          <T tone="muted">{part ? "Nothing held here right now" : "No trades recorded here yet"}</T>
        </Hero>
        {part && (part.sale_count > 0 || isMoney(part.fees)) && (
          <Stats>
            {part.sale_count > 0 && <SalesStat totals={part} />}
            {isMoney(part.fees) && <FeesStat totals={part} />}
          </Stats>
        )}
      </>
    );
  }
  const { positions, current_value: value, gain, gain_pct: gainPct } = part;
  return (
    <>
      {value === null ? (
        <Hero label={label} figure="–" quiet>
          <T tone="muted">
            {part.prices_enabled ? "No live prices right now" : "Live prices are off"}
          </T>
        </Hero>
      ) : (
        <Hero label={label} figure={formatMoney(value)}>
          {gain !== null && gainPct !== null && <Delta amount={gain} percent={gainPct} />}
          <T tone="muted">on the {formatMoney(part.invested)} these shares cost</T>
        </Hero>
      )}
      <Stats>
        <Stat label="Cost">
          <StatValue>{formatMoney(part.invested)}</StatValue>
          <StatSub>of the shares held, fees included</StatSub>
        </Stat>
        {part.sale_count > 0 && <SalesStat totals={part} />}
        {isMoney(part.fees) && <FeesStat totals={part} />}
        <Stat label="Holdings">
          <StatValue>{positions.length}</StatValue>
        </Stat>
      </Stats>
    </>
  );
}

function Empty({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginTop: 32,
        paddingVertical: 56,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.line,
      }}
    >
      <T size={24} weight="medium" style={{ textAlign: "center" }}>
        {children}
      </T>
    </View>
  );
}

function NoHoldings({ portfolio }: { portfolio: Portfolio }) {
  if (portfolio.sale_count > 0) {
    return (
      <>
        <View style={{ marginTop: 20 }}>
          <Stats>
            <SalesStat totals={portfolio} />
            <CashStat totals={portfolio} />
            {isMoney(portfolio.fees) && <FeesStat totals={portfolio} />}
          </Stats>
        </View>
        <Empty>You don't hold anything right now. Everything you bought has been sold.</Empty>
      </>
    );
  }
  return <Empty>Nothing here yet. Your holdings appear once you add a trade.</Empty>;
}

function Holdings({ portfolio }: { portfolio: Portfolio }) {
  return (
    <>
      <ValueHero totals={portfolio} />
      <Stats>
        <MoneyInStat totals={portfolio} />
        {portfolio.sale_count > 0 && <SalesStat totals={portfolio} />}
        {portfolio.sale_count > 0 && <CashStat totals={portfolio} />}
        {isMoney(portfolio.fees) && <FeesStat totals={portfolio} />}
        <Stat label="Holdings">
          <StatValue>{portfolio.positions.length}</StatValue>
        </Stat>
      </Stats>
    </>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <T
      accessibilityRole="header"
      size={28}
      weight="medium"
      style={{ marginBottom: 16, letterSpacing: -0.28, lineHeight: 32 }}
    >
      {children}
    </T>
  );
}

interface DetailProps {
  positions: Position[];
  /** Whether the holdings are counted at live prices rather than at what they cost. */
  priced: boolean;
  /** What the ring's slices add up to. */
  total: number;
}

/** The ring and the table of holdings: of the whole portfolio, or of one broker's part. */
function HoldingsDetail({ positions, priced, total }: DetailProps) {
  const theme = useTheme();
  const slices = buildSlices(positions, theme.series);
  const colors = new Map(slices.map((slice) => [slice.key, slice.color]));
  const basis = priced ? "current value" : "amount invested";

  return (
    <>
      {/* The shares only: the cash in the headline isn't part of the ring. */}
      <View style={{ marginTop: 36 }}>
        <Heading>{`Share of holdings by ${basis}`}</Heading>
        <DonutChart slices={slices} basis={basis} total={total} />
      </View>

      <View style={{ marginTop: 36 }}>
        <Heading>Holdings</Heading>
        <View style={{ flexDirection: "row", paddingBottom: 8 }}>
          <T tone="muted" size={13} weight="medium" style={{ flex: 1 }}>
            Ticker
          </T>
          <T tone="muted" size={13} weight="medium" style={{ flex: 1, textAlign: "right" }}>
            Price now
          </T>
          <T tone="muted" size={13} weight="medium" style={{ flex: 1, textAlign: "right" }}>
            Value now
          </T>
        </View>
        {positions.map((position) => (
          <View
            key={position.ticker}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              borderTopWidth: 1,
              borderColor: theme.lineSoft,
            }}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: colors.get(position.ticker) ?? colors.get(OTHER),
                }}
              />
              <T weight="semibold">{position.ticker}</T>
            </View>
            <T tabular style={{ flex: 1, textAlign: "right" }}>
              {position.current_price !== null ? formatMoney(position.current_price) : "–"}
            </T>
            <T tabular style={{ flex: 1, textAlign: "right" }}>
              {formatMoney(position.value)}
              {priced && position.current_price === null && (
                <T tone="muted" size={13}>
                  {" "}
                  at cost
                </T>
              )}
            </T>
          </View>
        ))}
      </View>
    </>
  );
}
