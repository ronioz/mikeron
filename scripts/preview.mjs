// Shows the app in a browser on this computer, signed in to the real server.
//
// A browser won't let a page on localhost call another site, and the server
// refuses cross-site requests, so `npx expo start --web` stops at the sign-in
// screen. This puts both on one address instead: it serves a web build of the
// app and passes /api on to the server, shaped the way a phone's requests are.
//
//   npm run preview
//   PREVIEW_SERVER=http://127.0.0.1:8000 npm run preview    # the copy on this computer

import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { extname, join, resolve, sep } from "node:path";

const PORT = Number(process.env.PREVIEW_PORT ?? 8090);
const HERE = `http://127.0.0.1:${PORT}`;
const SERVER = new URL(process.env.PREVIEW_SERVER ?? "https://mikeronn.onrender.com");
const BUILD = resolve("dist");

const TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

// A browser adds these and a phone doesn't. The server would read them as a
// request from another site.
const BROWSER_ONLY = ["cookie", "origin", "referer"];

function passOn(request, response) {
  const headers = { ...request.headers, host: SERVER.host };
  for (const name of Object.keys(headers)) {
    if (BROWSER_ONLY.includes(name) || name.startsWith("sec-fetch-")) delete headers[name];
  }
  const client = SERVER.protocol === "https:" ? https : http;
  const upstream = client.request(
    SERVER.origin + request.url,
    { method: request.method, headers },
    (answer) => {
      response.writeHead(answer.statusCode, answer.headers);
      answer.pipe(response);
    },
  );
  upstream.on("error", () => {
    response.writeHead(502, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ detail: `Could not reach ${SERVER.origin}` }));
  });
  request.pipe(upstream);
}

function serve(request, response) {
  const path = decodeURIComponent(new URL(request.url, HERE).pathname);
  let file = resolve(join(BUILD, path));
  // Anything that isn't a file is one of the app's own screens.
  if (!file.startsWith(BUILD + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(BUILD, "index.html");
  }
  response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}

console.log("Building the app for the browser...");
const built = spawnSync(
  "npx",
  ["expo", "export", "--platform", "web", "--output-dir", "dist", "--clear"],
  {
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      CI: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_API_URL: HERE,
      EXPO_PUBLIC_WEBSITE_URL: SERVER.origin,
    },
  },
);
if (built.status !== 0) process.exit(built.status ?? 1);

http
  .createServer((request, response) => {
    if (request.url.startsWith("/api/")) passOn(request, response);
    else serve(request, response);
  })
  // Only this computer: a password typed here shouldn't be reachable over the Wi-Fi.
  .listen(PORT, "127.0.0.1", () => {
    console.log(`\nOpen ${HERE}`);
    console.log(`It's talking to ${SERVER.origin}. Press Ctrl+C to stop.`);
  });
