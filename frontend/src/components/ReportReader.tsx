import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { api, ApiError } from "../api";

/** What a trade's page is told when it was added from a screenshot a moment ago. See TradeDetail. */
export interface AddedFromReport {
  /** Which trade, as the page may go on to show another. */
  id: number;
  /** The report didn't show the fee: the trade's was worked out from the bank's tariff. */
  feeWorkedOut: boolean;
}

/**
 * Adds a trade from a screenshot of the broker's report of it, with nothing
 * to fill in. The picture is read on this device (ocr.ts) and only the words
 * found go to the server, which picks the trade out of them and saves it. The
 * trade's page opens and says so. A trade that can't be added leaves the
 * journal as it was, and the reason is said here.
 */
export function ReportReader() {
  const navigate = useNavigate();
  const picker = useRef<HTMLInputElement>(null);
  // How far along a reading is, from 0 to 1. Undefined when none is going on.
  const [progress, setProgress] = useState<number>();
  const [problem, setProblem] = useState<string>();
  const busy = progress !== undefined;

  async function add(picture: Blob) {
    setProgress(0);
    setProblem(undefined);
    try {
      // Fetched only now: the engine is many times the size of the rest of the app.
      const { readPicture } = await import("../ocr").catch(() => {
        // A page left open while the app was updated asks for a file the new
        // version no longer has. So does one that has lost its connection.
        throw new ApiError(0, "The reader couldn't be loaded. Reload the page, then try again.");
      });
      const seen = await readPicture(picture, setProgress);
      setProgress(1);
      const { trade, fee_worked_out: feeWorkedOut } = await api.addReport(seen);
      const added: AddedFromReport = { id: trade.id, feeWorkedOut };
      navigate(`/trades/${trade.id}`, { state: { added } });
    } catch (reason) {
      const said = reason instanceof ApiError && Object.keys(reason.fields).length === 0;
      setProblem(said ? reason.message : "That picture couldn't be read. Try a screenshot of the report.");
    } finally {
      setProgress(undefined);
    }
  }

  /** Adds the trade in the first picture among the files, and says whether there was one. */
  function take(files: FileList | null | undefined): boolean {
    const picture = [...(files ?? [])].find((file) => file.type.startsWith("image/"));
    if (picture && !busy) void add(picture);
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

  return (
    <div className="report-reader">
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
      >
        {!busy ? "Add from a screenshot" : progress < 1 ? `Reading… ${Math.round(progress * 100)}%` : "Adding…"}
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
      <p className="hint">
        A screenshot of the trade's page in your bank's app, with every line of it in view. The
        trade is added to your journal at once, with nothing to fill in. It is read on this device:
        the picture is sent nowhere.
      </p>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
