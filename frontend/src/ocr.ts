/**
 * Text recognition: finds the words in a picture, on this device. The picture
 * is sent nowhere. The engine (tesseract.js) is large, so it is only fetched
 * when a picture is first read, and from this app (see ocrFiles in
 * vite.config.ts).
 */
import type { Worker } from "tesseract.js";

/** A word as it was read, and where: in pixels from the picture's top left corner. */
export interface SeenWord {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * One picture read twice. Knowing Georgian and English at once, the engine
 * gets Georgian right but now and then spoils a Latin letter or a digit;
 * knowing English only, it gets every figure right and no Georgian. The rules
 * that find the trade (app/reports.py) take from each what it is good at.
 */
export interface Seen {
  /** Read knowing Georgian and English. */
  words: SeenWord[];
  /** Read knowing English only. */
  latin: SeenWord[];
}

// The two readings, as the engine names the languages.
const GEORGIAN_AND_ENGLISH = ["eng", "kat"];
const ENGLISH = "eng";
// A photo from a camera has far more pixels than reading needs. Past this
// length the longer side is scaled down, which keeps a phone from running out
// of memory. A screenshot is smaller and is read as it is: enlarging or
// shrinking one made the reading worse when tried.
const LONGEST_SIDE = 3200;

const FILES: string = import.meta.env.VITE_OCR_FILES;

/**
 * Reads a picture. `onProgress` is told how far along it is, from 0 to 1: the
 * first read also fetches the engine, a few megabytes.
 */
export async function readPicture(
  picture: Blob,
  onProgress?: (fraction: number) => void,
): Promise<Seen> {
  const { createWorker, OEM } = await import("tesseract.js");
  const canvas = await draw(picture);
  // How many of the two readings are finished.
  let done = 0;
  const worker = await createWorker(GEORGIAN_AND_ENGLISH, OEM.LSTM_ONLY, {
    workerPath: `${FILES}/worker.min.js`,
    corePath: FILES,
    langPath: FILES,
    logger: ({ status, progress }) => {
      // Getting ready is quick once the engine is in the browser's cache, so
      // the count is given to the reading itself.
      if (status === "recognizing text") onProgress?.((done + progress) / 2);
    },
  });
  try {
    const words = await wordsIn(worker, canvas);
    done = 1;
    await worker.reinitialize(ENGLISH, OEM.LSTM_ONLY);
    return { words, latin: await wordsIn(worker, canvas) };
  } finally {
    await worker.terminate();
  }
}

async function wordsIn(worker: Worker, canvas: HTMLCanvasElement): Promise<SeenWord[]> {
  const { data } = await worker.recognize(canvas, {}, { text: false, blocks: true });
  const words: SeenWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          const text = word.text.trim();
          if (!text) continue;
          const { x0, y0, x1, y1 } = word.bbox;
          words.push({ text, left: x0, top: y0, right: x1, bottom: y1 });
        }
      }
    }
  }
  return words;
}

/**
 * The picture on a canvas as dark writing on a light ground, scaled down if it
 * is very large. A bank app in its dark colours shows light writing on a dark
 * ground, which the engine misreads far more often: one report's price came
 * out wrong in both readings until the picture was turned into its negative.
 */
async function draw(picture: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(picture);
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("This browser can't draw the picture to read it.");
  pen.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  if (isDark(canvas)) {
    // The difference from white is the negative: black becomes white, and so on.
    pen.globalCompositeOperation = "difference";
    pen.fillStyle = "#fff";
    pen.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** Whether the picture is dark on the whole. A thumbnail of it is enough to tell. */
function isDark(canvas: HTMLCanvasElement): boolean {
  const thumbnail = document.createElement("canvas");
  thumbnail.width = thumbnail.height = 32;
  const pen = thumbnail.getContext("2d");
  if (!pen) return false;
  pen.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  const { data } = pen.getImageData(0, 0, thumbnail.width, thumbnail.height);
  // Red, green and blue of every dot; each fourth number is how see-through it is.
  let light = 0;
  data.forEach((value, index) => {
    if (index % 4 !== 3) light += value;
  });
  return light / (data.length * 0.75) < 128;
}
