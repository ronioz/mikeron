import { Link, useSearchParams } from "react-router";

import { api } from "../api";
import { Delta, Hero } from "../components/figures";
import { Loadable } from "../components/Loadable";
import { ValueChart } from "../components/ValueChart";
import { formatDate, formatMoney } from "../format";
import { SPACING_IDS, SPACINGS } from "../graphs";
import type { Graphs, Spacing, ValuePoint } from "../types";
import { useApi } from "../useApi";

export function GraphsPage() {
  // Closing prices change once a day, so this page doesn't re-load on a timer
  // as the ones with live prices do. Every spacing arrives together, which is
  // why switching between them needs no loading.
  const state = useApi(api.getGraphs, []);
  // In the address, so the spacing survives a reload and can be linked to.
  const [params, setParams] = useSearchParams();
  const spacing = SPACING_IDS.find((id) => id === params.get("spacing")) ?? "daily";
  const show = (next: Spacing) =>
    setParams(next === "daily" ? {} : { spacing: next }, { replace: true });
  return (
    <>
      <title>Graphs · Mikeronn</title>
      {/* The tab in the header already says where this is; the heading is for screen readers. */}
      <h1 className="visually-hidden">Graphs</h1>
      <Loadable state={state}>
        {(graphs) => {
          const points = graphs.graphs[spacing].points;
          const latest = points.at(-1);
          if (latest === undefined) return <NothingToDraw graphs={graphs} />;
          return (
            <>
              <Total graphs={graphs} latest={latest} />
              <SpacingSwitch spacing={spacing} onChange={show} />
              <p className="hint graphs-note">{SPACINGS[spacing].shows}</p>
              {points.length > 1 ? (
                // A new graph for each spacing, so a point picked on one isn't carried over.
                <ValueChart key={spacing} spacing={spacing} points={points} />
              ) : (
                <p className="graphs-note muted">
                  One close so far, so there is no line to draw yet.
                </p>
              )}
              <ValuesTable points={points} />
            </>
          );
        }}
      </Loadable>
    </>
  );
}

/** Why there is no graph: nothing traded, closing prices off, or no close since the first trade. */
function NothingToDraw({ graphs }: { graphs: Graphs }) {
  if (graphs.trade_count === 0) {
    return (
      <section className="empty">
        <p>Nothing to draw yet. What you hold is graphed here from your first trade on.</p>
        <Link className="button" to="/trades/new">
          Add a trade
        </Link>
      </section>
    );
  }
  return (
    <section className="empty">
      <p>
        {graphs.closes_enabled
          ? "No closing prices since your first trade yet. The graph begins with the first one."
          : "Closing prices are off, so there is no graph to draw."}
      </p>
    </section>
  );
}

/**
 * The page's headline: everything held at the latest closing prices plus the
 * cash from sales, against the user's own money put in by then. The journal's
 * headline says the same at live prices.
 */
function Total({ graphs, latest }: { graphs: Graphs; latest: ValuePoint }) {
  const { total_gain: gain, total_gain_pct: gainPct, unpriced, trades_after: after } = graphs;
  return (
    <>
      <Hero
        label={`Portfolio value at the close on ${formatDate(latest.day)}`}
        figure={formatMoney(latest.value)}
      >
        {gain !== null && gainPct !== null && <Delta amount={gain} percent={gainPct} />}
        <span className="muted">on the {formatMoney(latest.money_in)} you put in</span>
      </Hero>
      {(unpriced.length > 0 || after > 0) && (
        <p className="hint graphs-caveat">
          {unpriced.length > 0 &&
            `No closing prices for ${unpriced.join(", ")}, so ${
              unpriced.length === 1 ? "it is" : "they are"
            } counted at what you paid. `}
          {after > 0 &&
            `${after === 1 ? "A trade" : `${after} trades`} made after that close ${
              after === 1 ? "joins" : "join"
            } the graph with the next one.`}
        </p>
      )}
    </>
  );
}

interface SwitchProps {
  spacing: Spacing;
  onChange: (spacing: Spacing) => void;
}

/** A point per day, week, month or year. */
function SpacingSwitch({ spacing, onChange }: SwitchProps) {
  return (
    <fieldset className="segmented even graphs-switch">
      <legend className="visually-hidden">How far apart the points of the graph are</legend>
      {SPACING_IDS.map((id) => (
        <label key={id}>
          <input
            type="radio"
            name="spacing"
            value={id}
            checked={spacing === id}
            onChange={() => onChange(id)}
          />
          <span>{SPACINGS[id].label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The same points as figures, newest first, for reading an exact amount or for
 * anyone a line is no use to. Closed until asked for.
 */
function ValuesTable({ points }: { points: ValuePoint[] }) {
  return (
    <details className="values-table">
      <summary>The graph as a table</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Close on</th>
              <th className="number">Portfolio value</th>
              <th className="number">Put in by then</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.day}>
                <td className="nowrap">{formatDate(point.day)}</td>
                <td className="number">{formatMoney(point.value)}</td>
                <td className="number">{formatMoney(point.money_in)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
