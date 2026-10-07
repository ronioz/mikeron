import { type FormEvent, type InputHTMLAttributes, type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";

import { ApiError } from "../api";
import { BROKER_IDS, BROKERS } from "../brokers";
import { formatMoney, formatShares, trimZeros } from "../format";
import type {
  Broker,
  BrokerPortfolio,
  Decimal,
  Position,
  Side,
  Trade,
  TradeInput,
  TradeReading,
} from "../types";
import { BrokerBadge } from "./BrokerBadge";
import { Field } from "./Field";
import { ReportReader } from "./ReportReader";

/** Every field typed into: all but the Paid with switch. */
type TextField = Exclude<keyof TradeInput, "paid_from_cash">;

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

const NUMBER_FIELDS = ["price", "shares", "take_profit", "stop_loss", "fee"] as const;

/** Keypads in comma-decimal regions only offer a comma, so "71,05" is accepted as 71.05. */
function withDecimalPoints(values: TradeInput): TradeInput {
  const result = { ...values };
  for (const field of NUMBER_FIELDS) result[field] = values[field].trim().replace(",", ".");
  return result;
}

/**
 * What gets sent. A sale has no plan and isn't paid for, so the hidden purchase
 * fields are cleared rather than sent along, where a leftover typo would fail
 * without a visible field.
 */
function toPayload(values: TradeInput): TradeInput {
  const input = withDecimalPoints(values);
  return input.side === "sell"
    ? { ...input, forecast: "", take_profit: "", stop_loss: "", paid_from_cash: false }
    : input;
}

/** What a broker's report said, as the form holds it. A field the report didn't show is left out. */
function fromReport(reading: TradeReading): Partial<TradeInput> {
  const found: Partial<TradeInput> = {};
  if (reading.side) found.side = reading.side;
  if (reading.ticker) found.ticker = reading.ticker;
  if (reading.trade_date) found.trade_date = reading.trade_date;
  if (reading.broker) found.broker = reading.broker;
  if (reading.price !== null) found.price = trimZeros(reading.price);
  if (reading.shares !== null) found.shares = trimZeros(reading.shares);
  // A report saying there was no fee leaves the field empty, like a saved trade without one.
  if (reading.fee !== null) found.fee = Number(reading.fee) === 0 ? "" : trimZeros(reading.fee);
  return found;
}

const SIDES: { side: Side; label: string }[] = [
  { side: "buy", label: "Buy" },
  { side: "sell", label: "Sell" },
];

const FUNDING: { fromCash: boolean; label: string }[] = [
  { fromCash: false, label: "New money" },
  { fromCash: true, label: "Cash from sales" },
];

// The brokers, then "Other" for one not listed (stored as no broker).
const BROKER_CHOICES: (Broker | "")[] = [...BROKER_IDS, ""];

interface Props {
  heading: string;
  initial: TradeInput;
  /** Where "Cancel" goes. */
  cancelTo: string;
  /** Where to go after saving. The saved trade's page when not given. */
  returnTo?: string;
  /** Offer to fill the form in from a screenshot of the broker's report. For a new trade. */
  readsReport?: boolean;
  /** What is held now, to help fill in a sale. Leave out when editing a saved trade. */
  holdings?: Position[];
  /** The same broker by broker, so a sale is filled in with what its own broker holds. */
  parts?: BrokerPortfolio[];
  /** Cash from sales right now, to say how much a new purchase can use. Leave out when editing. */
  cash?: Decimal;
  save: (input: TradeInput) => Promise<Trade>;
}

export function TradeForm({
  heading,
  initial,
  cancelTo,
  returnTo,
  readsReport,
  holdings,
  parts,
  cash,
  save,
}: Props) {
  const navigate = useNavigate();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [saving, setSaving] = useState(false);
  // Where each field a report filled in got its value, until it is changed by hand.
  const [read, setRead] = useState<Readonly<Record<string, string>>>({});
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

  const set = (name: TextField, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setRead(({ [name]: _changed, ...rest }) => rest);
  };

  const fill = (reading: TradeReading) => {
    const found = fromReport(reading);
    setValues((current) => ({ ...current, ...found }));
    const sources = Object.fromEntries(Object.keys(found).map((field) => [field, "from the report"]));
    // The banks' reports don't show the fee: it is what the bank's tariff makes it.
    if (reading.fee_worked_out) sources.fee = "by the bank's tariff";
    setRead(sources);
    setErrors({});
  };
  // Says beside its label where a value came from, so it gets checked.
  const noted = (name: TextField) => read[name];

  // Wires an input to its entry in `values`.
  const bind = (name: TextField) => ({
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
    // Once trades name brokers, a sale is of what its own broker holds, not of everything.
    const split = parts !== undefined && parts.length > 0;
    const here = split
      ? parts
          .find((part) => (part.broker ?? "") === values.broker)
          ?.positions.find((position) => position.ticker === ticker)
      : held;
    const where = !split
      ? ""
      : values.broker
        ? ` at ${BROKERS[values.broker].name}`
        : " with no broker recorded";
    if (held && here) {
      sharesHint = (
        <>
          You hold {formatShares(here.shares)} {here.ticker}
          {where}.{" "}
          <button className="link-button" type="button" onClick={() => set("shares", trimZeros(here.shares))}>
            Sell all
          </button>
          {Number(held.shares) !== Number(here.shares) &&
            ` (${formatShares(held.shares)} across all brokers)`}
        </>
      );
    } else if (held) {
      sharesHint = `You hold no ${ticker}${where}: your ${formatShares(held.shares)} are with another broker.`;
    } else if (ticker) {
      sharesHint = `You don't hold any ${ticker} right now.`;
    }
  }

  // For a purchase: what its money counts as, and how much cash from sales it can use.
  let fundingHint = "Counts toward your plan.";
  if (values.paid_from_cash) {
    if (cash === undefined) {
      fundingHint =
        "Uses the cash from sales made up to its date. Anything that cash can't cover counts as new money.";
    } else if (Number(cash) > 0) {
      fundingHint = `You have ${formatMoney(cash)} from sales. Anything above that counts as new money.`;
    } else {
      fundingHint = "You have no cash from sales right now, so this counts as new money.";
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{heading}</h1>
      </div>

      <form className="trade-form" onSubmit={submit}>
        {readsReport && <ReportReader onRead={fill} />}

        <fieldset className="segmented">
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
          <Field name="ticker" label="Ticker" note={noted("ticker")} error={errors.ticker}>
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
          <Field name="trade_date" label="Date" note={noted("trade_date")} error={errors.trade_date}>
            <input {...bind("trade_date")} type="date" required />
          </Field>
        </div>

        <fieldset className="field choice-field">
          <legend>
            Broker <small>optional</small>
          </legend>
          <div className="segmented broker-choice">
            {BROKER_CHOICES.map((broker) => (
              <label key={broker || "other"}>
                <input
                  type="radio"
                  name="broker"
                  value={broker}
                  checked={values.broker === broker}
                  onChange={() => set("broker", broker)}
                  aria-label={broker ? BROKERS[broker].name : "Other broker"}
                />
                <span>{broker ? <BrokerBadge broker={broker} /> : "Other"}</span>
              </label>
            ))}
          </div>
          {errors.broker && (
            <p className="error" role="alert">
              {errors.broker}
            </p>
          )}
        </fieldset>

        <div className="field-row">
          <Field
            name="price"
            label={selling ? "Sell price ($)" : "Buy price ($)"}
            note={noted("price")}
            error={errors.price}
          >
            <input {...bind("price")} {...NUMBER} required />
          </Field>
          <Field
            name="shares"
            label="Shares"
            note={noted("shares")}
            hint={sharesHint}
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
          <Field
            name="fee"
            label="Fee ($)"
            optional
            note={noted("fee")}
            hint={
              selling
                ? "Your broker's commission, taken from what the sale brings in"
                : "Your broker's commission, added to what the shares cost"
            }
            error={errors.fee}
          >
            <input {...bind("fee")} {...NUMBER} />
          </Field>
        </div>

        {!selling && (
          <fieldset className="field choice-field">
            <legend>Paid with</legend>
            <div className="segmented">
              {FUNDING.map(({ fromCash, label }) => (
                <label key={label}>
                  <input
                    type="radio"
                    name="paid_from_cash"
                    value={fromCash ? "cash" : "new"}
                    checked={values.paid_from_cash === fromCash}
                    onChange={() => setValues((current) => ({ ...current, paid_from_cash: fromCash }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="hint">{fundingHint}</p>
          </fieldset>
        )}

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
          optional
          error={errors.thesis}
        >
          <textarea {...bind("thesis")} rows={5} maxLength={5000} />
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
