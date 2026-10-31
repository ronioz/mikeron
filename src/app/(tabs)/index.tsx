import { View } from "react-native";

import { CashStat, MoneyInStat, PriceNote, SalesStat, Stat, StatSub, StatValue, Stats, ValueHero } from "@/components/figures";
import { Loadable } from "@/components/Loadable";
import { Screen } from "@/components/Screen";
import { T } from "@/components/T";
import { TradeItem } from "@/components/TradeItem";
import { api } from "@/lib/api";
import { isMoney } from "@/lib/cash";
import { formatMoney } from "@/lib/format";
import { PERIODS } from "@/lib/plan";
import { useTheme } from "@/lib/theme";
import type { Summary, Trade, YearTotal } from "@/lib/types";
import { REFRESH_MS, useApi } from "@/lib/useApi";

export default function JournalScreen() {
  const state = useApi(() => Promise.all([api.getSummary(), api.listTrades()]), REFRESH_MS);
  return (
    <Screen refresh={state}>
      <Loadable state={state}>
        {([summary, trades]) =>
          trades.length === 0 ? <NoTrades /> : <Journal summary={summary} trades={trades} />
        }
      </Loadable>
    </Screen>
  );
}

function NoTrades() {
  const theme = useTheme();
  return (
    <View
      style={{
        marginTop: 32,
        paddingVertical: 56,
        paddingHorizontal: 16,
        gap: 12,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.line,
      }}
    >
      <T size={24} weight="medium" style={{ textAlign: "center" }}>
        No trades yet.
      </T>
      <T tone="muted" style={{ textAlign: "center" }}>
        Trades are added on the website for now.
      </T>
    </View>
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
  const theme = useTheme();
  const byYear = groupByYear(trades);
  const planned = Number(summary.plan_amount);
  const progress = planned > 0 ? Math.min(Number(summary.this_period) / planned, 1) : 0;

  return (
    <>
      <ValueHero totals={summary} />
      <Stats>
        <MoneyInStat totals={summary} />
        {summary.sale_count > 0 && <SalesStat totals={summary} />}
        {summary.sale_count > 0 && <CashStat totals={summary} />}
        <Stat label="Trades">
          <StatValue>{summary.trade_count}</StatValue>
          {isMoney(summary.fees) && <StatSub>{formatMoney(summary.fees)} in fees</StatSub>}
        </Stat>
        {/*
          The week, month or quarter going on now, whichever the plan runs by.
          New money only: buying with cash from sales doesn't spend the plan.
        */}
        <Stat label={PERIODS[summary.plan_period].current}>
          <StatValue>{formatMoney(summary.this_period)}</StatValue>
          <StatSub>of {formatMoney(summary.plan_amount)} planned</StatSub>
          {isMoney(summary.this_period_from_cash) && (
            <StatSub>plus {formatMoney(summary.this_period_from_cash)} reinvested</StatSub>
          )}
          {planned > 0 && (
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
              style={{
                height: 3,
                marginTop: 10,
                borderRadius: 2,
                overflow: "hidden",
                backgroundColor: theme.line,
              }}
            >
              <View
                style={{
                  width: `${progress * 100}%`,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: theme.text,
                }}
              />
            </View>
          )}
        </Stat>
      </Stats>
      <PriceNote totals={summary} />

      {summary.years.map((total) => (
        <View key={total.year} style={{ marginTop: 36 }}>
          <View style={{ marginBottom: 8 }}>
            <T size={24} weight="medium" style={{ letterSpacing: -0.24, lineHeight: 29 }}>
              {total.year}
            </T>
            <YearSummary total={total} />
          </View>
          {(byYear.get(total.year) ?? []).map((trade) => (
            <View key={trade.id} style={{ borderTopWidth: 1, borderColor: theme.lineSoft }}>
              <TradeItem trade={trade} />
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

/** "7 trades · $2,292.51 bought · $72.00 sold · $4.50 in fees". */
function YearSummary({ total }: { total: YearTotal }) {
  const { trade_count: count, bought, sold, fees } = total;
  return (
    <T tone="muted" size={14}>
      {count} {count === 1 ? "trade" : "trades"} · {formatMoney(bought)} bought
      {Number(sold) > 0 && ` · ${formatMoney(sold)} sold`}
      {isMoney(fees) && ` · ${formatMoney(fees)} in fees`}
    </T>
  );
}
