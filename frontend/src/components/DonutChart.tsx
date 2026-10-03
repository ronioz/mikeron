import { useState } from "react";

import type { Slice } from "../chart";
import { formatMoney, formatPercent } from "../format";

const WIDTH = 320;
const HEIGHT = 230;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const OUTER = 84;
const INNER = 62;
const TURN = Math.PI * 2;

// Names are written next to the slices only when there are few enough, and
// each is big and short enough, for the text to fit without touching.
const MAX_LABELLED = 4;
const MIN_LABELLED_SHARE = 10;
const MAX_LABEL_LENGTH = 8;

function point(radius: number, angle: number): string {
  return `${(CX + radius * Math.cos(angle)).toFixed(2)} ${(CY + radius * Math.sin(angle)).toFixed(2)}`;
}

function ringSegment(start: number, end: number, inner: number, outer: number): string {
  // A full circle would start and end on the same point, which an SVG arc can't draw.
  const stop = Math.min(end, start + TURN - 0.0001);
  const large = stop - start > Math.PI ? 1 : 0;
  return [
    `M ${point(outer, start)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(outer, stop)}`,
    `L ${point(inner, stop)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)}`,
    "Z",
  ].join(" ");
}

interface Arc {
  slice: Slice;
  start: number;
  end: number;
}

/** Lays the slices out clockwise from twelve o'clock. */
function layOut(slices: Slice[]): Arc[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let angle = -Math.PI / 2;
  return slices.map((slice) => {
    const start = angle;
    angle += (slice.value / total) * TURN;
    return { slice, start, end: angle };
  });
}

function SliceLabel({ arc }: { arc: Arc }) {
  const middle = (arc.start + arc.end) / 2;
  const across = Math.cos(middle);
  const down = Math.sin(middle);
  return (
    <text
      className="donut-label"
      x={CX + (OUTER + 12) * across}
      y={CY + (OUTER + 12) * down}
      // Anchor the text on the side facing the ring so it grows away from it.
      textAnchor={across > 0.25 ? "start" : across < -0.25 ? "end" : "middle"}
      dy={down > 0.5 ? "0.8em" : down < -0.5 ? "0" : "0.35em"}
    >
      {arc.slice.label}
    </text>
  );
}

interface Props {
  slices: Slice[];
  /** What the slices measure, e.g. "current value". */
  basis: string;
  total: number;
}

export function DonutChart({ slices, basis, total }: Props) {
  const [activeKey, setActiveKey] = useState<string>();
  const arcs = layOut(slices);
  const active = slices.find((slice) => slice.key === activeKey);
  const labelled =
    slices.length >= 2 &&
    slices.length <= MAX_LABELLED &&
    slices.every(
      (slice) => slice.share >= MIN_LABELLED_SHARE && slice.label.length <= MAX_LABEL_LENGTH,
    );
  // Names beside the slices need room around the ring; without them, crop to the ring.
  const viewBox = labelled ? `0 0 ${WIDTH} ${HEIGHT}` : `${CX - 96} ${CY - 96} 192 192`;
  const description = `Share of portfolio by ${basis}: ${slices
    .map((slice) => `${slice.label} ${formatPercent(slice.share)}`)
    .join(", ")}`;

  // Pointing at or focusing a slice or its legend row shows its figures in the middle.
  const highlight = (key: string) => ({
    onPointerEnter: () => setActiveKey(key),
    onPointerLeave: () => setActiveKey(undefined),
  });

  return (
    <figure className={labelled ? "donut labelled" : "donut"}>
      <div className="donut-plot">
        <svg viewBox={viewBox} role="img" aria-label={description}>
          {arcs.map(({ slice, start, end }) => (
            <path
              key={slice.key}
              className={`slice${activeKey && activeKey !== slice.key ? " dimmed" : ""}`}
              d={ringSegment(start, end, INNER, OUTER)}
              fill={slice.color}
              // A thin line in the page colour separates touching slices.
              strokeWidth={slices.length > 1 ? 2 : 0}
            />
          ))}
          {labelled && arcs.map((arc) => <SliceLabel key={arc.slice.key} arc={arc} />)}
          {/* Invisible, wider versions of the slices so they are easy to point at. */}
          {arcs.map(({ slice, start, end }) => (
            <path
              key={slice.key}
              className="slice-target"
              d={ringSegment(start, end, INNER - 18, OUTER + 10)}
              {...highlight(slice.key)}
            />
          ))}
        </svg>
        <div className="donut-center" aria-hidden="true">
          <span className="donut-caption">{active ? active.label : "Total"}</span>
          <span className="donut-figure">{formatMoney(active ? active.value : total)}</span>
          {active && <span className="donut-caption">{formatPercent(active.share)}</span>}
        </div>
      </div>

      <ul className="legend">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className={activeKey === slice.key ? "active" : undefined}
            tabIndex={0}
            onFocus={() => setActiveKey(slice.key)}
            onBlur={() => setActiveKey(undefined)}
            {...highlight(slice.key)}
          >
            <span className="swatch" style={{ background: slice.color }} />
            <span className="legend-name">{slice.label}</span>
            <span className="legend-share">{formatPercent(slice.share)}</span>
            <span className="legend-value">{formatMoney(slice.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
