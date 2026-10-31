import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";

import type { Slice } from "@/lib/chart";
import { formatMoney, formatPercent } from "@/lib/format";
import { font, useTheme } from "@/lib/theme";

import { T } from "./T";

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

function SliceLabel({ arc, color }: { arc: Arc; color: string }) {
  const middle = (arc.start + arc.end) / 2;
  const across = Math.cos(middle);
  const down = Math.sin(middle);
  return (
    <SvgText
      x={CX + (OUTER + 12) * across}
      y={CY + (OUTER + 12) * down}
      // Anchor the text on the side facing the ring so it grows away from it.
      textAnchor={across > 0.25 ? "start" : across < -0.25 ? "end" : "middle"}
      dy={down > 0.5 ? 9.6 : down < -0.5 ? 0 : 4.2}
      fill={color}
      fontFamily={font.semibold}
      fontSize={12}
    >
      {arc.slice.label}
    </SvgText>
  );
}

interface Props {
  slices: Slice[];
  /** What the slices measure, e.g. "current value". */
  basis: string;
  total: number;
}

/** The ring of holdings. Tapping a slice or its row shows its figures in the middle. */
export function DonutChart({ slices, basis, total }: Props) {
  const theme = useTheme();
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
  const description = `Share of holdings by ${basis}: ${slices
    .map((slice) => `${slice.label} ${formatPercent(slice.share)}`)
    .join(", ")}`;
  const toggle = (key: string) => setActiveKey((current) => (current === key ? undefined : key));

  return (
    <View style={{ gap: 16 }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={description}
        style={{
          alignSelf: "center",
          width: "100%",
          maxWidth: labelled ? 340 : 220,
          aspectRatio: labelled ? WIDTH / HEIGHT : 1,
        }}
      >
        <Svg width="100%" height="100%" viewBox={viewBox}>
          {arcs.map(({ slice, start, end }) => (
            <Path
              key={slice.key}
              d={ringSegment(start, end, INNER, OUTER)}
              fill={slice.color}
              opacity={activeKey && activeKey !== slice.key ? 0.35 : 1}
              // A thin line in the page colour separates touching slices.
              stroke={theme.bg}
              strokeWidth={slices.length > 1 ? 2 : 0}
              onPress={() => toggle(slice.key)}
            />
          ))}
          {labelled && arcs.map((arc) => <SliceLabel key={arc.slice.key} arc={arc} color={theme.text} />)}
        </Svg>
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <T tone="muted" size={13}>
            {active ? active.label : "Total"}
          </T>
          <T size={20} weight="medium" style={{ letterSpacing: -0.2 }}>
            {formatMoney(active ? active.value : total)}
          </T>
          {active && (
            <T tone="muted" size={13}>
              {formatPercent(active.share)}
            </T>
          )}
        </View>
      </View>

      <View>
        {slices.map((slice, index) => (
          <Pressable
            key={slice.key}
            accessibilityRole="button"
            onPress={() => toggle(slice.key)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 10,
              paddingHorizontal: 8,
              borderTopWidth: index === 0 ? 0 : 1,
              borderColor: theme.lineSoft,
              backgroundColor: activeKey === slice.key ? theme.raised : "transparent",
            }}
          >
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: slice.color }} />
            <T size={15} weight="semibold" style={{ flex: 1 }}>
              {slice.label}
            </T>
            <T size={15} tone="muted" tabular style={{ minWidth: 56, textAlign: "right" }}>
              {formatPercent(slice.share)}
            </T>
            <T size={15} tabular style={{ minWidth: 88, textAlign: "right" }}>
              {formatMoney(slice.value)}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
