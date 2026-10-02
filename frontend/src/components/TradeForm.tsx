import { type FormEvent, type InputHTMLAttributes, type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";

import { ApiError } from "../api";
import type { Trade, TradeInput } from "../types";

interface FieldProps {
  name: keyof TradeInput;
  label: string;
  optional?: boolean;
  hint?: string;
  error: string | undefined;
  children: ReactNode;
}

function Field({ name, label, optional, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {optional && <small> optional</small>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// A text field with a numeric keypad rather than type="number": no spinner, no
// value changing when the page is scrolled over it, and the number is shown
// exactly as stored instead of in the browser's regional format.
const NUMBER: InputHTMLAttributes<HTMLInputElement> = {
  type: "text",
  inputMode: "decimal",
  pattern: "\\s*[0-9]*[.,]?[0-9]+\\s*",
  title: "A number such as 225.50",
  placeholder: "0.00",
  autoComplete: "off",
};

const NUMBER_FIELDS = ["buy_price", "shares", "take_profit", "stop_loss"] as const;

/** Keypads in comma-decimal regions only offer a comma, so "71,05" is accepted as 71.05. */
function withDecimalPoints(values: TradeInput): TradeInput {
  const result = { ...values };
  for (const field of NUMBER_FIELDS) result[field] = values[field].trim().replace(",", ".");
  return result;
}

interface Props {
  heading: string;
  initial: TradeInput;
  /** Where "Cancel" goes. */
  cancelTo: string;
  save: (input: TradeInput) => Promise<Trade>;
}

export function TradeForm({ heading, initial, cancelTo, save }: Props) {
  const navigate = useNavigate();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProblem(undefined);
    try {
      const trade = await save(withDecimalPoints(values));
      navigate(`/trades/${trade.id}`);
    } catch (reason) {
      if (!(reason instanceof ApiError)) throw reason;
      setErrors(reason.fields);
      // A field-level problem is shown next to its field; anything else goes above the buttons.
      if (Object.keys(reason.fields).length === 0) setProblem(reason.message);
      setSaving(false);
    }
  }

  // Wires an input to its entry in `values`.
  const bind = (name: keyof TradeInput) => ({
    id: name,
    name,
    value: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });

  return (
    <>
      <div className="page-head">
        <h1>{heading}</h1>
      </div>

      <form className="card trade-form" onSubmit={submit}>
        <div className="field-row">
          <Field name="ticker" label="Ticker" error={errors.ticker}>
            <input
              {...bind("ticker")}
              className="upper"
              required
              maxLength={12}
              pattern="[A-Za-z0-9.\-]+"
              title="Letters, digits, dots and dashes only"
              placeholder="AAPL"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </Field>
          <Field name="trade_date" label="Date" error={errors.trade_date}>
            <input {...bind("trade_date")} type="date" required />
          </Field>
        </div>

        <div className="field-row">
          <Field name="buy_price" label="Buy price ($)" error={errors.buy_price}>
            <input {...bind("buy_price")} {...NUMBER} required />
          </Field>
          <Field
            name="shares"
            label="Shares"
            hint="Fractional shares are fine, e.g. 0.1348"
            error={errors.shares}
          >
            <input
              {...bind("shares")}
              {...NUMBER}
              title="A number such as 0.1348"
              placeholder="0"
              required
            />
          </Field>
        </div>

        <div className="field-row">
          <Field
            name="take_profit"
            label="Take profit at ($)"
            optional
            hint="Price where you plan to sell for a gain"
            error={errors.take_profit}
          >
            <input {...bind("take_profit")} {...NUMBER} />
          </Field>
          <Field
            name="stop_loss"
            label="Stop loss at ($)"
            optional
            hint="Price where you plan to sell to limit a loss"
            error={errors.stop_loss}
          >
            <input {...bind("stop_loss")} {...NUMBER} />
          </Field>
        </div>

        <Field name="thesis" label="Why did you buy?" error={errors.thesis}>
          <textarea {...bind("thesis")} rows={5} maxLength={5000} required />
        </Field>

        <Field
          name="forecast"
          label="Forecast"
          optional
          hint="What do you expect to happen, and by when?"
          error={errors.forecast}
        >
          <textarea {...bind("forecast")} rows={4} maxLength={5000} />
        </Field>

        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}

        <div className="actions">
          <button className="button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save trade"}
          </button>
          <Link className="button secondary" to={cancelTo}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
