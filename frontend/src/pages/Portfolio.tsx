import { Link } from "react-router";

import { api } from "../api";
import { buildSlices, OTHER } from "../chart";
import { DonutChart } from "../components/DonutChart";
import { Change, PriceNote, SalesTile, StatTile, ValueTile } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { formatMoney, formatPercent, formatShares, formatSignedMoney } from "../format";
import type { Portfolio } from "../types";
import { REFRESH_MS, useApi } from "../useApi";

export function PortfolioPage() {
  const state = useApi(api.getPortfolio, [], REFRESH_MS);
  return (
    <>
      <title>Portfolio · Trade Journal</title>
      <div className="page-head">
        <h1>Portfolio</h1>
      </div>
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
          <SalesTile totals={portfolio} />
        </section>
        <section className="card empty">
          <p>You don't hold anything right now. Everything you bought has been sold.</p>
          <Link className="button" to="/trades/new">
            Add a trade
          </Link>
        </section>
      </>
    );
  }
  return (
    <section className="card empty">
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
      <section className="stats">
        <StatTile label="Invested">
          <span className="value">{formatMoney(portfolio.invested)}</span>
        </StatTile>
        <ValueTile totals={portfolio} />
        {portfolio.sale_count > 0 && <SalesTile totals={portfolio} />}
        <StatTile label="Holdings">
          <span className="value">{positions.length}</span>
        </StatTile>
      </section>
      <PriceNote totals={portfolio} />

      <section className="card chart-card">
        <h2>Share of portfolio by {basis}</h2>
        <DonutChart
          slices={slices}
          basis={basis}
          total={Number(portfolio.current_value ?? portfolio.invested)}
        />
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="number">Shares</th>
              <th className="number">Avg buy price</th>
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
      </section>
    </>
  );
}
