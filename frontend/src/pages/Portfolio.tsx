import { Link, useSearchParams } from "react-router";

import { api } from "../api";
import { BROKER_IDS, BROKERS } from "../brokers";
import { buildSlices, OTHER } from "../chart";
import { BrokerBadge } from "../components/BrokerBadge";
import { DonutChart } from "../components/DonutChart";
import { isMoney } from "../cash";
import {
  CashStat,
  Delta,
  FeesStat,
  Hero,
  MoneyInStat,
  PriceNote,
  SalesStat,
  Stat,
  ValueHero,
} from "../components/figures";
import { Loadable } from "../components/Loadable";
import { formatMoney } from "../format";
import type { Broker, BrokerPortfolio, Portfolio, Position } from "../types";
import { REFRESH_MS, useApi } from "../useApi";

/** What the page shows: everything, one broker's part, or the trades naming no broker. */
type View = "all" | Broker | "other";

function viewOf(asked: string | null, parts: BrokerPortfolio[]): View {
  const broker = BROKER_IDS.find((id) => id === asked);
  if (broker) return broker;
  return asked === "other" && parts.some((part) => part.broker === null) ? "other" : "all";
}

export function PortfolioPage() {
  const state = useApi(api.getPortfolio, [], REFRESH_MS);
  // In the address, so a broker's portfolio survives a reload and can be linked to.
  const [params, setParams] = useSearchParams();
  const show = (view: View) => setParams(view === "all" ? {} : { broker: view }, { replace: true });
  return (
    <>
      <title>Portfolio · Mikeronn</title>
      {/* The tab in the header already says where this is; the heading is for screen readers. */}
      <h1 className="visually-hidden">Portfolio</h1>
      <Loadable state={state}>
        {(portfolio) => {
          const parts = portfolio.by_broker;
          // With no broker on any trade there is nothing to tell apart.
          if (parts.length === 0) return <Whole portfolio={portfolio} />;
          const view = viewOf(params.get("broker"), parts);
          const part = parts.find((each) => (each.broker ?? "other") === view);
          return (
            <>
              <BrokerSwitch
                view={view}
                other={parts.some((each) => each.broker === null)}
                onChange={show}
              />
              {view === "all" ? (
                <Whole portfolio={portfolio} />
              ) : (
                // A broker with no trades yet has no part: it shows as an empty one.
                <Part broker={view === "other" ? null : view} part={part} />
              )}
            </>
          );
        }}
      </Loadable>
    </>
  );
}

interface SwitchProps {
  view: View;
  /** Whether some trades name no broker, so there is an "Other" part to show. */
  other: boolean;
  onChange: (view: View) => void;
}

/** All brokers together, or one at a time. */
function BrokerSwitch({ view, other, onChange }: SwitchProps) {
  const views: View[] = ["all", ...BROKER_IDS, ...(other ? (["other"] as const) : [])];
  const name = (id: View) =>
    id === "all" ? "All brokers together" : id === "other" ? "Trades with no broker" : BROKERS[id].name;
  return (
    <fieldset className="segmented even broker-choice portfolio-switch">
      <legend className="visually-hidden">Which broker's portfolio to show</legend>
      {views.map((id) => (
        <label key={id}>
          <input
            type="radio"
            name="portfolio"
            value={id}
            checked={view === id}
            onChange={() => onChange(id)}
            aria-label={name(id)}
          />
          <span>{id === "all" ? "All" : id === "other" ? "Other" : <BrokerBadge broker={id} />}</span>
        </label>
      ))}
    </fieldset>
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
function Part({ broker, part }: { broker: Broker | null; part: BrokerPortfolio | undefined }) {
  const label = broker ? `Held at ${BROKERS[broker].name}` : "Held with no broker recorded";
  if (!part || part.positions.length === 0) {
    return (
      <>
        <Hero label={label} figure={formatMoney(0)}>
          <span className="muted">
            {part ? "Nothing held here right now" : "No trades recorded here yet"}
          </span>
        </Hero>
        {part && (part.sale_count > 0 || isMoney(part.fees)) && (
          <section className="stats">
            {part.sale_count > 0 && <SalesStat totals={part} />}
            {isMoney(part.fees) && <FeesStat totals={part} />}
          </section>
        )}
      </>
    );
  }
  const { positions, current_value: value, gain, gain_pct: gainPct } = part;
  return (
    <>
      {value === null ? (
        <Hero label={label} figure={<span className="muted">–</span>}>
          <span className="muted">
            {part.prices_enabled ? "No live prices right now" : "Live prices are off"}
          </span>
        </Hero>
      ) : (
        <Hero label={label} figure={formatMoney(value)}>
          {gain !== null && gainPct !== null && <Delta amount={gain} percent={gainPct} />}
          <span className="muted">on the {formatMoney(part.invested)} these shares cost</span>
        </Hero>
      )}
      <section className="stats">
        <Stat label="Cost">
          <span className="value">{formatMoney(part.invested)}</span>
          <span className="sub">of the shares held, fees included</span>
        </Stat>
        {part.sale_count > 0 && <SalesStat totals={part} />}
        {isMoney(part.fees) && <FeesStat totals={part} />}
        <Stat label="Holdings">
          <span className="value">{positions.length}</span>
        </Stat>
      </section>
      <PriceNote totals={part} />
      <p className="hint part-note">
        Cash from sales and the money you put in are counted across all brokers together, under All.
      </p>
      <HoldingsDetail
        positions={positions}
        priced={value !== null}
        total={Number(value ?? part.invested)}
        broker={broker}
      />
    </>
  );
}

function NoHoldings({ portfolio }: { portfolio: Portfolio }) {
  if (portfolio.sale_count > 0) {
    return (
      <>
        <section className="stats">
          <SalesStat totals={portfolio} />
          <CashStat totals={portfolio} />
          {isMoney(portfolio.fees) && <FeesStat totals={portfolio} />}
        </section>
        <section className="empty">
          <p>You don't hold anything right now. Everything you bought has been sold.</p>
          <Link className="button" to="/trades/new">
            Add a trade
          </Link>
        </section>
      </>
    );
  }
  return (
    <section className="empty">
      <p>Nothing here yet. Your holdings appear once you add a trade.</p>
      <Link className="button" to="/trades/new">
        Add your first trade
      </Link>
    </section>
  );
}

function Holdings({ portfolio }: { portfolio: Portfolio }) {
  const { positions } = portfolio;
  return (
    <>
      <ValueHero totals={portfolio} />
      <section className="stats">
        <MoneyInStat totals={portfolio} />
        {portfolio.sale_count > 0 && <SalesStat totals={portfolio} />}
        {portfolio.sale_count > 0 && <CashStat totals={portfolio} />}
        {isMoney(portfolio.fees) && <FeesStat totals={portfolio} />}
        <Stat label="Holdings">
          <span className="value">{positions.length}</span>
        </Stat>
      </section>
      <PriceNote totals={portfolio} />
      <HoldingsDetail
        positions={positions}
        priced={portfolio.current_value !== null}
        total={Number(portfolio.current_value ?? portfolio.invested)}
      />
    </>
  );
}

interface DetailProps {
  positions: Position[];
  /** Whether the holdings are counted at live prices rather than at what they cost. */
  priced: boolean;
  /** What the ring's slices add up to. */
  total: number;
  /** In one broker's part: where a sale started from here is placed. */
  broker?: Broker | null;
}

/** The ring and the table of holdings: of the whole portfolio, or of one broker's part. */
function HoldingsDetail({ positions, priced, total, broker }: DetailProps) {
  const slices = buildSlices(positions);
  const colors = new Map(slices.map((slice) => [slice.key, slice.color]));
  const basis = priced ? "current value" : "amount invested";
  const at = broker ? `&broker=${broker}` : "";

  return (
    <>
      {/* The shares only: the cash in the headline isn't part of the ring. */}
      <section className="page-section">
        <h2 className="section-heading">Share of holdings by {basis}</h2>
        <DonutChart slices={slices} basis={basis} total={total} />
      </section>

      <section className="page-section">
        <h2 className="section-heading">Holdings</h2>
        <div className="table-wrap holdings-table">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                {/* One share's price, then what all the shares held are worth at it. */}
                <th className="number">Price now</th>
                <th className="number">Value now</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.ticker}>
                  <td className="nowrap">
                    <span
                      className="swatch"
                      style={{ background: colors.get(position.ticker) ?? colors.get(OTHER) }}
                    />{" "}
                    <span className="ticker">{position.ticker}</span>
                  </td>
                  <td className="number">
                    {position.current_price !== null ? formatMoney(position.current_price) : "–"}
                  </td>
                  <td className="number">
                    {formatMoney(position.value)}
                    {priced && position.current_price === null && <small> at cost</small>}
                  </td>
                  <td className="row-actions">
                    <Link
                      to={`/trades/new?side=sell&ticker=${encodeURIComponent(position.ticker)}${at}`}
                      aria-label={`Sell ${position.ticker}`}
                    >
                      Sell
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
