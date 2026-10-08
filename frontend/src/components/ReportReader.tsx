import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Link } from "react-router";

import { api, ApiError } from "../api";
import { BROKERS } from "../brokers";
import { FUNDING, isMoney, payableFromCash, reinvested } from "../cash";
import { formatDate, formatMoney, formatShares } from "../format";
import type { Seen } from "../ocr";
import type { ReportOutcome, Trade } from "../types";
import { BrokerBadge } from "./BrokerBadge";

/** One of the pictures chosen, with what became of it. */
type Result = ReportOutcome & {
  /** The picture's file name. */
  name: string;
  /** A small copy of it, to tell it from the others. None if the browser couldn't draw it. */
  thumbnail?: string;
  /**
   * Whether there was cash from sales for its purchase when it was added. Its
   * "Paid with" is then offered, and stays if another line uses that cash up.
   */
  cashOffered: boolean;
};

// As many as the server takes at once: MAX_REPORTS in app/schemas.py.
const MOST_AT_ONCE = 30;
// How wide a picture's small copy is, in dots: three times the width it is
// shown at, so it stays sharp on a phone's screen.
const THUMBNAIL_WIDTH = 108;
const UNREADABLE = "That picture couldn't be read. Try a screenshot of the report.";

/** A purchase's "Paid with" on its way to being saved, or that couldn't be. */
interface Paying {
  /** Which trade. */
  id: number;
  /** What was asked for, while it is being saved. */
  fromCash?: boolean;
  /** Why it couldn't be saved. */
  problem?: string;
}

/**
 * Adds trades from screenshots of the broker's reports of them, one trade to
 * a picture, with nothing to fill in. The pictures are read on this device
 * (ocr.ts) and only the words found go to the server, which picks the trades
 * out of them and saves them. Every picture is then told about by itself:
 * its trade was added, or it wasn't and why, which leaves the journal as it
 * was. A report doesn't show what paid for a purchase, so that is said here
 * afterwards, on its line. `onChanged` is told when the journal changed.
 */
export function ReportReader({ onChanged }: { onChanged?: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  // What is going on, as the button says it. Undefined when nothing is.
  const [doing, setDoing] = useState<string>();
  // What became of each picture chosen last.
  const [results, setResults] = useState<Result[]>();
  // Why none of them was tried.
  const [problem, setProblem] = useState<string>();
  const [paying, setPaying] = useState<Paying>();
  const busy = doing !== undefined;

  async function add(pictures: File[]) {
    setResults(undefined);
    setPaying(undefined);
    if (pictures.length > MOST_AT_ONCE) {
      setProblem(`That is ${pictures.length} pictures. Choose up to ${MOST_AT_ONCE} at a time.`);
      return;
    }
    setProblem(undefined);
    setDoing("Reading…");
    try {
      // Fetched only now: the engine is many times the size of the rest of the app.
      const { readPicture } = await import("../ocr").catch(() => {
        // A page left open while the app was updated asks for a file the new
        // version no longer has. So does one that has lost its connection.
        throw new ApiError(0, "The reader couldn't be loaded. Reload the page, then try again.");
      });
      // One after another: the engine is heavy, and a phone has little memory to spare.
      const read: { name: string; thumbnail?: string; seen?: Seen }[] = [];
      for (const [at, picture] of pictures.entries()) {
        const which = pictures.length > 1 ? ` ${at + 1} of ${pictures.length}` : "";
        const say = (fraction: number) => setDoing(`Reading${which}… ${Math.round(fraction * 100)}%`);
        say(0);
        read.push({
          name: picture.name,
          thumbnail: await thumbnail(picture),
          // One that can't be read is said so in its own line, and the rest go on.
          seen: await readPicture(picture, say).catch(() => undefined),
        });
      }
      // Sent together, as the server adds the oldest trade first: a sale then
      // finds the shares bought in another of the pictures.
      const seen = read.flatMap((picture) => (picture.seen ? [picture.seen] : []));
      setDoing("Adding…");
      const answers = (seen.length > 0 ? await api.addReports(seen) : []).values();
      const told = read.map(({ name, thumbnail, seen }): Result => {
        // The answers come in the order sent, which left out the unreadable ones.
        const outcome: ReportOutcome | undefined = seen && answers.next().value;
        const cashOffered = Boolean(outcome?.added && payableFromCash(outcome.added.trade));
        return { name, thumbnail, cashOffered, ...(outcome ?? { added: null, problem: UNREADABLE }) };
      });

      setResults(told);
      if (told.some(({ added }) => added)) onChanged?.();
    } catch (reason) {
      const said = reason instanceof ApiError && Object.keys(reason.fields).length === 0;
      setProblem(said ? reason.message : "The pictures couldn't be added. Try again.");
    } finally {
      setDoing(undefined);
    }
  }

  /** Saves what a purchase added here was paid with. */
  async function payWith(trade: Trade, fromCash: boolean) {
    setPaying({ id: trade.id, fromCash });
    try {
      const saved = await api.payWith(trade.id, fromCash);
      // Cash is spent once, the oldest purchase first: what one of these uses
      // another can't. So every line is told anew, or failing that, this one.
      const journal = await api.listTrades().catch(() => [saved]);
      const now = new Map(journal.map((fresh) => [fresh.id, fresh]));
      setResults((shown) =>
        shown?.map((result) => {
          const fresh = result.added && now.get(result.added.trade.id);
          return fresh ? { ...result, added: { ...result.added, trade: fresh } } : result;
        }),
      );
      setPaying(undefined);
      onChanged?.();
    } catch (reason) {
      const problem = reason instanceof ApiError ? reason.message : "That couldn't be saved. Try again.";
      setPaying({ id: trade.id, problem });
    }
  }

  /** Adds the trades in the pictures among the files, and says whether there were any. */
  function take(files: FileList | null | undefined): boolean {
    const pictures = [...(files ?? [])].filter((file) => file.type.startsWith("image/"));
    if (pictures.length > 0 && !busy) void add(pictures);
    return pictures.length > 0;
  }

  // On a computer the screenshots can also be pasted, or dropped anywhere on the page.
  const offered = useEffectEvent(take);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (offered(event.clipboardData?.files)) event.preventDefault();
    };
    // Without this the browser would leave the page to show the dropped picture.
    const over = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      offered(event.dataTransfer.files);
    };
    document.addEventListener("paste", paste);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("paste", paste);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div className="report-reader">
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
      >
        {doing ?? "Add from screenshots"}
      </button>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Screenshots of the trades' reports"
        onChange={(event) => {
          take(event.target.files);
          // So choosing the same pictures again reads them again.
          event.target.value = "";
        }}
      />
      <p className="hint">
        Screenshots of trades' pages in your bank's app, one trade to a picture, with every line of
        it in view. Choose one or several: each trade is added to your journal at once, with
        nothing to fill in. They are read on this device: the pictures are sent nowhere.
      </p>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      {results && <Results results={results} paying={paying} onPayWith={payWith} />}
    </div>
  );
}

interface Paid {
  paying: Paying | undefined;
  onPayWith: (trade: Trade, fromCash: boolean) => void;
}

/** What became of each picture, in the order they were chosen. */
function Results({ results, ...paid }: { results: Result[] } & Paid) {
  const added = results.filter((result) => result.added).length;
  return (
    <div className="report-results" role="status">
      {results.length > 1 && (
        <p className="tally">
          {added === 0 ? "No" : added} {added === 1 ? "trade" : "trades"} added from {results.length}{" "}
          screenshots.
        </p>
      )}
      <ul>
        {results.map((result, at) => (
          <li key={at}>
            {/* Beside its own words, so it isn't read out as well. */}
            {result.thumbnail ? <img src={result.thumbnail} alt="" /> : <span className="no-picture" />}
            {result.added ? (
              <AddedLine {...result.added} cashOffered={result.cashOffered} {...paid} />
            ) : (
              <RefusedLine {...result} />
            )}
          </li>
        ))}
      </ul>
      {results.some(({ added }) => added?.fee_worked_out && added.trade.broker) && (
        <p className="hint">
          The reports don't show the fee, so it is worked out from the bank's tariff: check it
          against what the bank took. Open a trade to say why you made it, or to change anything.
        </p>
      )}
    </div>
  );
}

function AddedLine({
  trade,
  fee_worked_out: feeWorkedOut,
  cashOffered,
  ...paid
}: NonNullable<Result["added"]> & Pick<Result, "cashOffered"> & Paid) {
  return (
    <div>
      <p className="what">
        <Link className="ticker" to={`/trades/${trade.id}`}>
          {trade.ticker}
        </Link>{" "}
        <span className={`side-tag ${trade.side}`}>{trade.side === "sell" ? "Sell" : "Buy"}</span>{" "}
        <BrokerBadge broker={trade.broker} />{" "}
        <small>
          {formatDate(trade.trade_date)} · {formatShares(trade.shares)} shares at{" "}
          {formatMoney(trade.price)}
        </small>
      </p>
      <p>
        <strong>Trade has been successfully added.</strong>
        {feeWorkedOut &&
          trade.broker &&
          (isMoney(trade.fee)
            ? ` Fee by ${BROKERS[trade.broker].name}'s tariff: ${formatMoney(trade.fee)}.`
            : ` No fee by ${BROKERS[trade.broker].name}'s tariff.`)}
        {!trade.broker && " The report doesn't say which bank it is from, so no broker is recorded."}
      </p>
      {/* Only where there is something to choose: cash from sales on the purchase's date. */}
      {cashOffered && <PaidWith trade={trade} {...paid} />}
    </div>
  );
}

/**
 * Whether a purchase was paid with new money or with cash from sales, to be
 * chosen: its report doesn't say, so it was saved as new money. Cash pays
 * what there was of it on the purchase's date, and the rest is new money.
 */
function PaidWith({ trade, paying, onPayWith }: { trade: Trade } & Paid) {
  const mine = paying?.id === trade.id ? paying : undefined;
  const fromCash = mine?.fromCash ?? trade.paid_from_cash;
  const cost = formatMoney(trade.net_amount);
  return (
    <fieldset className="paid-with">
      <legend className="visually-hidden">What the {trade.ticker} purchase was paid with</legend>
      <div className="segmented">
        {FUNDING.map((choice) => (
          <label key={choice.label}>
            <input
              type="radio"
              name={`paid-with-${trade.id}`}
              checked={fromCash === choice.fromCash}
              // One at a time: what one purchase uses changes what there is for the next.
              disabled={paying?.fromCash !== undefined}
              onChange={() => onPayWith(trade, choice.fromCash)}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
      {mine?.problem ? (
        <p className="error" role="alert">
          {mine.problem}
        </p>
      ) : (
        <p className="hint">{trade.paid_from_cash ? paidHow(trade, cost) : payableHow(trade, cost)}</p>
      )}
    </fieldset>
  );
}

/** How a purchase paid with cash from sales came to be paid. */
function paidHow(trade: Trade, cost: string): string {
  const used = reinvested(trade);
  if (!used) return "No cash from earlier sales was left for it, so all of it is new money.";
  if (used.all) return `All ${cost} from sales.`;
  const rest = Number(trade.net_amount) - Number(used.amount);
  return `${formatMoney(used.amount)} from sales, ${formatMoney(rest)} new money.`;
}

/** What cash from sales could pay of a purchase paid with new money. */
function payableHow(trade: Trade, cost: string): string {
  const there = payableFromCash(trade);
  if (!there) return "No cash from earlier sales is left for it.";
  return there.all
    ? `Cash from sales can pay all ${cost}.`
    : `Cash from sales can pay ${formatMoney(there.amount)} of the ${cost}.`;
}

function RefusedLine({ name, problem }: Result) {
  return (
    <div>
      <p className="what">
        <strong>Not added</strong> <small>{name}</small>
      </p>
      <p className="error">{problem}</p>
    </div>
  );
}

/** A small copy of a picture. Nothing when the browser can't draw it, which the reading then says. */
async function thumbnail(picture: Blob): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(picture);
    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = Math.round((bitmap.height / bitmap.width) * THUMBNAIL_WIDTH);
    const pen = canvas.getContext("2d");
    if (!pen) return undefined;
    // A screenshot is many times this size, and shrinks to a blur of dots otherwise.
    pen.imageSmoothingQuality = "high";
    pen.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}
