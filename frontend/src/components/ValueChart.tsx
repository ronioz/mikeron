import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";

import { formatDate, formatMoney } from "../format";
import { dateTicks, priceScale } from "../graphs";
import type { Spacing, ValuePoint } from "../types";

// Room around the plot: for the dot on the latest close, and for the dates underneath.
const EDGE = 8;
const DATES = 28;

/** The width an element is drawn at, kept up to date as the page changes size. */
function useWidth() {
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    // Measured before the first paint, so the graph never flashes in a moment late.
    setWidth(Math.round(node.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [element, width] as const;
}

/** A point as a screen reader says it: "Oct 5, 2026: $2,114.27, with $1,695.51 put in". */
function spoken(point: ValuePoint): string {
  const value = formatMoney(point.value);
  return `${formatDate(point.day)}: ${value}, with ${formatMoney(point.money_in)} put in`;
}

interface Props {
  spacing: Spacing;
  /** Oldest first, and at least two: one point makes no line. */
  points: ValuePoint[];
}

/**
 * What the portfolio was worth at each close, as a line. It is drawn at the
 * width it is given rather than stretched to it, so the line and the text are
 * as large on a phone as on a wide screen.
 *
 * Pointing at it, dragging a finger along it or pressing the arrow keys picks
 * a point and shows that day's value and the money put in by then. To a screen
 * reader it is a slider through the days, which reads out the same.
 */
export function ValueChart({ spacing, points }: Props) {
  const [frame, width] = useWidth();
  const [chosen, setChosen] = useState<number>();
  const values = points.map((point) => Number(point.value));
  const scale = priceScale(Math.min(...values), Math.max(...values));
  const last = points.length - 1;
  // About a third as tall as it is wide, within what reads well on a phone and a wide screen.
  const height = Math.round(Math.min(340, Math.max(220, width * 0.32)));

  // The amounts take the room the longest of them needs, and so begin where the
  // figures above the graph do. Digits are about 7.25px wide at this size, and
  // a comma or a point about 3.
  const widest = Math.max(
    0,
    ...scale.ticks.map(
      ({ label }) => label.length * 7.25 - (label.match(/[.,]/g)?.length ?? 0) * 4.2,
    ),
  );
  const left = Math.ceil(widest) + 8;
  const right = width - EDGE;
  const bottom = height - DATES;
  const across = (index: number) => left + (index / last) * (right - left);
  const down = (value: number) =>
    bottom - ((value - scale.low) / (scale.high - scale.low)) * (bottom - EDGE);
  const line = values
    .map((value, index) => {
      const to = `${across(index).toFixed(1)} ${down(value).toFixed(1)}`;
      return index ? `L${to}` : `M${to}`;
    })
    .join("");

  const within = (index: number) => Math.min(last, Math.max(0, index));
  const nearest = (event: PointerEvent<HTMLDivElement>) => {
    const from = event.clientX - event.currentTarget.getBoundingClientRect().left;
    return within(Math.round(((from - left) / (right - left)) * last));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const from = chosen ?? last;
    const stride = Math.max(1, Math.round(points.length / 10));
    const moves: Record<string, number> = {
      ArrowLeft: from - 1,
      ArrowDown: from - 1,
      ArrowRight: from + 1,
      ArrowUp: from + 1,
      PageDown: from - stride,
      PageUp: from + stride,
      Home: 0,
      End: last,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    setChosen(within(to));
  };

  const picked = chosen === undefined ? undefined : points[chosen];
  const told = picked ?? points[last];
  const latest = values[last];
  return (
    <div
      className="value-chart"
      ref={frame}
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label="Portfolio value at each close"
      aria-roledescription="graph"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={picked ? chosen : last}
      aria-valuetext={told && spoken(told)}
      onPointerDown={(event) => setChosen(nearest(event))}
      onPointerMove={(event) => setChosen(nearest(event))}
      onPointerLeave={() => setChosen(undefined)}
      onPointerCancel={() => setChosen(undefined)}
      // Reached with the keyboard, it starts on the latest close, as the arrow keys do.
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) setChosen(last);
      }}
      onBlur={() => setChosen(undefined)}
      onKeyDown={onKeyDown}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true">
          {scale.ticks.map((tick) => {
            const y = down(tick.value);
            return (
              <g key={tick.value}>
                <line className="value-grid" x1={left} x2={right} y1={y} y2={y} />
                <text className="value-amount" x={left - 8} y={y} dy="0.32em" textAnchor="end">
                  {tick.label}
                </text>
              </g>
            );
          })}
          {dateTicks(points, spacing, right - left).map((tick) => {
            // About half of the label: at either end it moves in just enough to stay in the graph.
            const half = tick.label.length * 3.7;
            const x = Math.min(width - half, Math.max(half, across(tick.index)));
            return (
              <text
                key={tick.index}
                className="value-date"
                x={x}
                y={height - 8}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            );
          })}
          <path className="value-area" d={`${line}L${right} ${bottom}L${left} ${bottom}Z`} />
          <path className="value-line" d={line} />
          {latest !== undefined && (
            <circle className="value-dot" cx={right} cy={down(latest)} r={5} />
          )}
          {picked && chosen !== undefined && (
            <>
              <line
                className="value-crosshair"
                x1={across(chosen)}
                x2={across(chosen)}
                y1={EDGE}
                y2={bottom}
              />
              <circle
                className="value-dot"
                cx={across(chosen)}
                cy={down(Number(picked.value))}
                r={5}
              />
            </>
          )}
        </svg>
      )}
      {picked && chosen !== undefined && width > 0 && (
        <div
          className={across(chosen) > width / 2 ? "value-readout before" : "value-readout"}
          style={{ left: across(chosen) }}
        >
          <strong>{formatMoney(picked.value)}</strong>
          <span>{formatDate(picked.day)}</span>
          <span>Put in {formatMoney(picked.money_in)}</span>
        </div>
      )}
    </div>
  );
}
