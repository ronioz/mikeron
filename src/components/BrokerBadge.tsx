import { View } from "react-native";

import { BROKERS } from "@/lib/brokers";
import { BROKER_COLORS, font } from "@/lib/theme";
import type { Broker } from "@/lib/types";

import { T } from "./T";

/** "TBC" or "BOG" in the bank's colour. Nothing when not recorded. */
export function BrokerBadge({ broker }: { broker: Broker | null }) {
  if (!broker) return null;
  const { short, name } = BROKERS[broker];
  return (
    <View
      accessibilityLabel={name}
      style={{ paddingHorizontal: 5, borderRadius: 4, backgroundColor: BROKER_COLORS[broker] }}
    >
      <T
        size={11}
        style={{
          color: BROKER_COLORS.text,
          fontFamily: font.semibold,
          letterSpacing: 0.44,
          lineHeight: 17,
        }}
      >
        {short}
      </T>
    </View>
  );
}
