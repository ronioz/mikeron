import { BROKERS } from "../brokers";
import type { Broker } from "../types";

/** "TBC" or "BOG" in the bank's colour, with the full name on hover. Nothing when not recorded. */
export function BrokerBadge({ broker }: { broker: Broker | null | "" }) {
  if (!broker) return null;
  const { short, name } = BROKERS[broker];
  return (
    <span className={`broker ${broker}`} title={name}>
      {short}
    </span>
  );
}
