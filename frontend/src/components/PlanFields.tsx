import type { ReactNode } from "react";

import { PERIOD_IDS, PERIODS } from "../plan";
import type { PlanPeriod } from "../types";
import { Field } from "./Field";

interface Props {
  amount: string;
  /** Undefined while none is chosen, as when signing up: no period is assumed for anyone. */
  period: PlanPeriod | undefined;
  onAmount: (amount: string) => void;
  onPeriod: (period: PlanPeriod) => void;
  /** The server's complaints, by field name. */
  errors: Record<string, string>;
  amountLabel: string;
  amountHint?: ReactNode;
  periodHint?: ReactNode;
}

/** A plan's two fields: how much new money, and how often. Both have to be filled in. */
export function PlanFields({
  amount,
  period,
  onAmount,
  onPeriod,
  errors,
  amountLabel,
  amountHint,
  periodHint,
}: Props) {
  return (
    <>
      <Field name="plan_amount" label={amountLabel} hint={amountHint} error={errors.plan_amount}>
        <input
          id="plan_amount"
          name="plan_amount"
          value={amount}
          onChange={(event) => onAmount(event.target.value)}
          aria-invalid={errors.plan_amount ? true : undefined}
          type="text"
          inputMode="decimal"
          pattern="\s*[0-9]*[.,]?[0-9]+\s*"
          title="An amount such as 50"
          autoComplete="off"
          required
        />
      </Field>
      <fieldset className="field choice-field">
        <legend>How often</legend>
        <div className="segmented even period-choice">
          {PERIOD_IDS.map((id) => (
            <label key={id}>
              <input
                type="radio"
                name="plan_period"
                value={id}
                checked={period === id}
                onChange={() => onPeriod(id)}
                required
              />
              <span>{PERIODS[id].label}</span>
            </label>
          ))}
        </div>
        {periodHint && <p className="hint">{periodHint}</p>}
        {errors.plan_period && (
          <p className="error" role="alert">
            {errors.plan_period}
          </p>
        )}
      </fieldset>
    </>
  );
}
