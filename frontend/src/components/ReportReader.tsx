import { useEffect, useEffectEvent, useRef, useState } from "react";

import { api, ApiError } from "../api";
import { BROKERS } from "../brokers";
import { formatMoney } from "../format";
import type { TradeReading } from "../types";

// What a report is expected to show, as the note names anything it didn't.
const EXPECTED: [keyof TradeReading, string][] = [
  ["side", "buy or sell"],
  ["ticker", "ticker"],
  ["trade_date", "date"],
  ["price", "price"],
  ["shares", "shares"],
  ["fee", "fee"],
];

function listed(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

interface Props {
  /** Told what the report said, to put it into the form. */
  onRead: (reading: TradeReading) => void;
}

/**
 * Starts a trade from a screenshot of the broker's report of it. The picture
 * is read on this device (ocr.ts) and only the words found go to the server,
 * which picks the trade out of them. Nothing is saved: the form still is.
 */
export function ReportReader({ onRead }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  // How far along a reading is, from 0 to 1. Undefined when none is going on.
  const [progress, setProgress] = useState<number>();
  const [reading, setReading] = useState<TradeReading>();
  const [problem, setProblem] = useState<string>();
  const busy = progress !== undefined;

  async function read(picture: Blob) {
    setProgress(0);
    setProblem(undefined);
    setReading(undefined);
    try {
      // Fetched only now: the engine is many times the size of the rest of the app.
      const { readPicture } = await import("../ocr").catch(() => {
        // A page left open while the app was updated asks for a file the new
        // version no longer has. So does one that has lost its connection.
        throw new ApiError(0, "The reader couldn't be loaded. Reload the page, then try again.");
      });
      const found = await api.readReport(await readPicture(picture, setProgress));
      setReading(found);
      onRead(found);
    } catch (reason) {
      const said = reason instanceof ApiError && Object.keys(reason.fields).length === 0;
      setProblem(said ? reason.message : "That picture couldn't be read. Try a screenshot of the report.");
    } finally {
      setProgress(undefined);
    }
  }

  /** Reads the first picture among the files, and says whether there was one. */
  function take(files: FileList | null | undefined): boolean {
    const picture = [...(files ?? [])].find((file) => file.type.startsWith("image/"));
    if (picture && !busy) void read(picture);
    return picture !== undefined;
  }

  // On a computer the screenshot can also be pasted, or dropped anywhere on the page.
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

  let note =
    "A screenshot of the trade's page in your bank's app, with every line of it in view. It is read on this device: the picture is sent nowhere.";
  if (reading) {
    const missing = EXPECTED.filter(([field]) => reading[field] === null).map(([, name]) => name);
    note = reading.broker ? `Filled in from the ${BROKERS[reading.broker].name} report.` : "Filled in from the report.";
    if (reading.fee_worked_out && reading.fee !== null) {
      // Neither bank's report of a trade shows what it charged for it.
      const fee = Number(reading.fee) === 0 ? "there is none" : `it is ${formatMoney(reading.fee)}`;
      note += ` The fee isn't on it: by the bank's tariff ${fee}, so check that against what the bank took.`;
    } else if (missing.join() === "fee") {
      note += " It doesn't show the fee: enter that yourself.";
    }
    const unread = missing.filter((name) => name !== "fee" || missing.length > 1);
    if (unread.length) {
      note += ` It showed no readable ${listed(unread)}: enter ${unread.length > 1 ? "those" : "that"} yourself.`;
    }
    note += " Check each figure against the report before saving.";
  }

  return (
    <div className="report-reader">
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
      >
        {busy ? `Reading… ${Math.round(progress * 100)}%` : "Fill from a screenshot"}
      </button>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        aria-label="Screenshot of the trade's report"
        onChange={(event) => {
          take(event.target.files);
          // So choosing the same picture again reads it again.
          event.target.value = "";
        }}
      />
      <div role="status">
        {problem ? <p className="error">{problem}</p> : <p className="hint">{note}</p>}
        {reading?.adds_up === false && (
          <p className="error">
            The price times the shares doesn't come to the amount on the report, so a figure was
            probably misread.
          </p>
        )}
      </div>
    </div>
  );
}
