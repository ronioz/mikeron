import type { Broker } from "./types";

/**
 * The brokers a trade can name, as Broker in app/schemas.py lists them. Each
 * is shown as a small tag in the bank's own colour (styles.css, .broker): the
 * name rather than the logo, which is the bank's trademark.
 */
export const BROKERS: Record<Broker, { short: string; name: string }> = {
  tbc: { short: "TBC", name: "TBC Bank" },
  bog: { short: "BOG", name: "Bank of Georgia" },
};

export const BROKER_IDS = Object.keys(BROKERS) as Broker[];
