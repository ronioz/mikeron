import { Link } from "react-router";

import { api } from "../api";
import { buildSlices, OTHER } from "../chart";
import { DonutChart } from "../components/DonutChart";
import { isMoney } from "../cash";
import { CashStat, Change, FeesStat, PriceNote, SalesStat, Stat, ValueHero } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { formatMoney, formatPercent, formatShares, formatSignedMoney } from "../format";
import type { Portfolio } from "../types";
import { REFRESH_MS, useApi } from "../useApi";

export function PortfolioPage() {
  const state = useApi(api.getPortfolio, [], REFRESH_MS);
  return (
    <>
      <title>Portfolio · Mikeron</title>
      {/* The tab in the header already says where this is; the heading is for screen readers. */}
      <h1 className="visually-hidden">Portfolio</h1>
      <Loadable state={state}>
        {(portfolio) =>
          portfolio.positions.length === 0 ? (
            <NoHoldings portfolio={portfolio} />
          ) : (
            <Holdings portfolio={portfolio} />
          )
        }
      </Loadable>
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
  const slices = buildSlices(positions);
  const colors = new Map(slices.map((slice) => [slice.key, slice.color]));
  const priced = portfolio.current_value !== null;
  const basis = priced ? "current value" : "amount invested";

  return (
    <>
      <ValueHero totals={portfolio} />
      <section className="stats">
        <Stat label="Invested">
          <span className="value">{formatMoney(portfolio.invested)}</span>
        </Stat>
        {portfolio.sale_count > 0 && <SalesStat totals={portfolio} />}
        {portfolio.sale_count > 0 && <CashStat totals={portfolio} />}
        {isMoney(portfolio.fees) && <FeesStat totals={portfolio} />}
        <Stat label="Holdings">
          <span className="value">{positions.length}</span>
        </Stat>
      </section>
      <PriceNote totals={portfolio} />

      {/* The shares only: the cash in the headline isn't part of the ring. */}
      <section className="page-section">
        <h2 className="section-heading">Share of holdings by {basis}</h2>
        <DonutChart
          slices={slices}
          basis={basis}
          total={Number(portfolio.current_value ?? portfolio.invested)}
        />
      </section>

      <section className="page-section">
        <h2 className="section-heading">Holdings</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="number">Shares</th>
                {/* Per share, fees included, like Invested beside it. */}
                <th className="number">Avg cost</th>
                <th className="number">Invested</th>
                <th className="number">Price now</th>
                <th className="number">Value</th>
                <th className="number">Gain</th>
                <th className="number">Share</th>
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
                  <td className="number">{formatShares(position.shares)}</td>
                  <td className="number">{formatMoney(position.average_price)}</td>
                  <td className="number">{formatMoney(position.cost)}</td>
                  <td className="number">
                    {position.current_price !== null ? formatMoney(position.current_price) : "–"}
                  </td>
                  <td className="number">
                    {formatMoney(position.value)}
                    {priced && position.current_price === null && <small> at cost</small>}
                  </td>
                  <td className="number">
                    {position.gain !== null && position.gain_pct !== null ? (
                      <>
                        {formatSignedMoney(position.gain)} <Change percent={position.gain_pct} />
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="number">{formatPercent(position.share_pct)}</td>
                  <td className="row-actions">
                    <Link
                      to={`/trades/new?side=sell&ticker=${encodeURIComponent(position.ticker)}`}
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
