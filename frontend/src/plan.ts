import type { PlanPeriod } from "./types";

/**
 * How often a plan's amount is put in, as PlanPeriod in app/schemas.py lists
 * them. For each: the name of the choice, how an amount reads with it ("$30 a
 * month"), and what the journal calls the period going on now.
 */
export const PERIODS: Record<PlanPeriod, { label: string; each: string; current: string }> = {
  weekly: { label: "Weekly", each: "a week", current: "This week" },
  monthly: { label: "Monthly", each: "a month", current: "This month" },
  quarterly: { label: "Quarterly", each: "a quarter", current: "This quarter" },
};

export const PERIOD_IDS = Object.keys(PERIODS) as PlanPeriod[];

/** A typed amount, ready to send. Keypads in comma-decimal regions only offer a comma. */
export function typedAmount(text: string): string {
  return text.trim().replace(",", ".");
}
