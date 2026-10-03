import { type FormEvent, type InputHTMLAttributes, type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";

import { ApiError } from "../api";
import { formatShares, trimZeros } from "../format";
import type { Position, Side, Trade, TradeInput } from "../types";

interface FieldProps {
  name: keyof TradeInput;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
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

const NUMBER_FIELDS = ["price", "shares", "take_profit", "stop_loss"] as const;

/** Keypads in comma-decimal regions only offer a comma, so "71,05" is accepted as 71.05. */
function withDecimalPoints(values: TradeInput): TradeInput {
  const result = { ...values };
  for (const field of NUMBER_FIELDS) result[field] = values[field].trim().replace(",", ".");
  return result;
}

/**
 * What gets sent. A sale has no plan, so the hidden plan fields are cleared
 * rather than sent along, where a leftover typo would fail without a visible field.
 */
function toPayload(values: TradeInput): TradeInput {
  const input = withDecimalPoints(values);
  return input.side === "sell" ? { ...input, forecast: "", take_profit: "", stop_loss: "" } : input;
}

const SIDES: { side: Side; label: string }[] = [
  { side: "buy", label: "Buy" },
  { side: "sell", label: "Sell" },
];

interface Props {
  heading: string;
  initial: TradeInput;
  /** Where "Cancel" goes. */
  cancelTo: string;
  /** Where to go after saving. The saved trade's page when not given. */
  returnTo?: string;
  /** What is held now, to help fill in a sale. Leave out when editing a saved trade. */
  holdings?: Position[];
  save: (input: TradeInput) => Promise<Trade>;
}

export function TradeForm({ heading, initial, cancelTo, returnTo, holdings, save }: Props) {
  const navigate = useNavigate();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [saving, setSaving] = useState(false);
  const selling = values.side === "sell";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProblem(undefined);
    try {
      const trade = await save(toPayload(values));
      navigate(returnTo ?? `/trades/${trade.id}`);
    } catch (reason) {
      if (!(reason instanceof ApiError)) throw reason;
      setErrors(reason.fields);
      // A field-level problem is shown next to its field; anything else goes above the buttons.
      if (Object.keys(reason.fields).length === 0) setProblem(reason.message);
      setSaving(false);
    }
  }

  const set = (name: keyof TradeInput, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  // Wires an input to its entry in `values`.
  const bind = (name: keyof TradeInput) => ({
    id: name,
    name,
    value: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    onChange: (event: { target: { value: string } }) => set(name, event.target.value),
  });

  // For a new sale: how many shares of the typed ticker are held, with a way to sell them all.
  let sharesHint: ReactNode = "Fractional shares are fine, e.g. 0.1348";
  if (selling && holdings) {
    const ticker = values.ticker.trim().toUpperCase();
    const held = holdings.find((position) => position.ticker === ticker);
    if (held) {
      sharesHint = (
        <>
          You hold {formatShares(held.shares)} {held.ticker}.{" "}
          <button className="link-button" type="button" onClick={() => set("shares", trimZeros(held.shares))}>
            Sell all
          </button>
        </>
      );
    } else if (ticker) {
      sharesHint = `You don't hold any ${ticker} right now.`;
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{heading}</h1>
      </div>

      <form className="card trade-form" onSubmit={submit}>
        <fieldset className="side-choice">
          <legend className="visually-hidden">Buy or sell</legend>
          {SIDES.map(({ side, label }) => (
            <label key={side}>
              <input
                type="radio"
                name="side"
                value={side}
                checked={values.side === side}
                onChange={() => set("side", side)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

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
              list={selling && holdings ? "held-tickers" : undefined}
            />
            {selling && holdings && (
              <datalist id="held-tickers">
                {holdings.map((position) => (
                  <option key={position.ticker} value={position.ticker} />
                ))}
              </datalist>
            )}
          </Field>
          <Field name="trade_date" label="Date" error={errors.trade_date}>
            <input {...bind("trade_date")} type="date" required />
          </Field>
        </div>

        <div className="field-row">
          <Field name="price" label={selling ? "Sell price ($)" : "Buy price ($)"} error={errors.price}>
            <input {...bind("price")} {...NUMBER} required />
          </Field>
          <Field name="shares" label="Shares" hint={sharesHint} error={errors.shares}>
            <input
              {...bind("shares")}
              {...NUMBER}
              title="A number such as 0.1348"
              placeholder="0"
              required
            />
          </Field>
        </div>

        {!selling && (
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
        )}

        <Field
          name="thesis"
          label={selling ? "Why did you sell?" : "Why did you buy?"}
          error={errors.thesis}
        >
          <textarea {...bind("thesis")} rows={5} maxLength={5000} required />
        </Field>

        {!selling && (
          <Field
            name="forecast"
            label="Forecast"
            optional
            hint="What do you expect to happen, and by when?"
            error={errors.forecast}
          >
            <textarea {...bind("forecast")} rows={4} maxLength={5000} />
          </Field>
        )}

        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}

        <div className="actions">
          <button className="button" type="submit" disabled={saving}>
            {saving ? "Saving…" : selling ? "Save sale" : "Save trade"}
          </button>
          <Link className="button secondary" to={cancelTo}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
