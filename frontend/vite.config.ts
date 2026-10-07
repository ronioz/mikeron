import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);
// tesseract.js brings the engine along as a package of its own.
const fromTesseract = createRequire(require.resolve("tesseract.js/package.json"));

/**
 * The text recognition that reads a trade screenshot (src/ocr.ts) fetches its
 * parts by name while it runs: a worker script, the engine and what it knows
 * of each language. The app serves them itself rather than leaving them to the
 * library's default, a public CDN. Their folder carries the library's version,
 * so a browser never pairs a new library with an engine it cached earlier.
 */
function ocrFiles(): Plugin {
  const { version } = require("tesseract.js/package.json") as { version: string };
  const folder = `ocr/${version}`;
  const files: Record<string, string> = {
    "worker.min.js": require.resolve("tesseract.js/dist/worker.min.js"),
    "eng.traineddata.gz": require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"),
    "kat.traineddata.gz": require.resolve("@tesseract.js-data/kat/4.0.0_best_int/kat.traineddata.gz"),
  };
  // One engine per kind of processor; the library picks the fastest a browser can run.
  for (const kind of ["relaxedsimd-lstm", "simd-lstm", "lstm"]) {
    const name = `tesseract-core-${kind}.wasm.js`;
    files[name] = fromTesseract.resolve(`tesseract.js-core/${name}`);
  }
  return {
    name: "ocr-files",
    config: () => ({ define: { "import.meta.env.VITE_OCR_FILES": JSON.stringify(`/${folder}`) } }),
    // In development they are read from node_modules as they are asked for.
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [, name] = request.url?.split("?")[0]?.split(`/${folder}/`) ?? [];
        const file = name === undefined ? undefined : files[name];
        if (file === undefined) return next();
        response.setHeader(
          "Content-Type",
          file.endsWith(".js") ? "text/javascript" : "application/octet-stream",
        );
        response.end(readFileSync(file));
      });
    },
    // A build copies them in beside the pages.
    generateBundle() {
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: "asset", fileName: `${folder}/${name}`, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), ocrFiles()],
  server: {
    // In development the page comes from Vite and API calls go to FastAPI.
    proxy: { "/api": "http://localhost:8000" },
  },
});
