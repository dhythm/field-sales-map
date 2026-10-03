/* global fetch, AbortSignal, URL, setTimeout, document */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import process from "node:process";
import { Buffer } from "node:buffer";
import { log } from "node:console";

// Deliberately fixed, public coordinates and endpoints. No customer data or secrets.
const origin = "http://127.0.0.1:4173";
const apiHost = "https://api.openpoiapi.com";
const output = "live-smoke-results";
const enabled = process.env.CONFIRM_LIVE_REQUESTS === "true";
const report = {
  checkedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || "local",
  limits: { apiRequests: 2, tileRequests: 1, retries: 0 },
  http: { outcome: "not_run" },
  browser: { outcome: "not_run" },
  tile: { outcome: "not_run" },
  caveats: [
    "This is an observational smoke check; upstream failures do not mean the code tests failed.",
    "Browser map tile requests are blocked: a full live background map is NOT visually verified.",
    "The single tile HTTP check proves only that one tile was returned; no prefetch, scan, or map movement occurs.",
    "No notes, status changes, customer information, API body dump, credentials, or private coordinates are recorded.",
  ],
};
await mkdir(output, { recursive: true });
if (!enabled) {
  throw new Error(
    "Set CONFIRM_LIVE_REQUESTS=true only for an explicitly approved manual smoke check.",
  );
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

// Request 1: HTTP shape and CORS headers, at most two facilities, no retry.
try {
  const url = `${apiHost}/v1/search?center=139.767052,35.681236&radius=300&limit=2`;
  const response = await fetch(url, {
    headers: {
      Origin: origin,
      "User-Agent":
        "field-sales-map-live-smoke/1.0 (+https://github.com/dhythm/field-sales-map)",
    },
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const cors = response.headers.get("access-control-allow-origin");
  report.http = {
    outcome: response.ok ? "response_received" : "upstream_http_error",
    status: response.status,
    allowOrigin: cors,
    corsHeaderMatches: cors === "*" || cors === origin,
  };
  if (response.ok) {
    const body = await response.json();
    const valid = Array.isArray(body.results) && body.results.length <= 2;
    report.http.schemaValid = valid;
    report.http.returned = valid ? body.results.length : null;
    report.http.outcome = valid ? "success" : "unexpected_response_schema";
  }
} catch (error) {
  report.http = {
    ...report.http,
    outcome: "connection_or_response_error",
    error: message(error),
  };
}

// Exactly one tile, normal HTTP cache semantics, identifiable UA and Referer.
// No browser tile loading, grid traversal, retries, or screenshots of OSM tiles.
if (process.env.CHECK_SINGLE_TILE === "true") {
  try {
    const zoom = 15,
      lat = 35.681236,
      lng = 139.767052;
    const x = Math.floor(((lng + 180) / 360) * 2 ** zoom);
    const y = Math.floor(
      ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) *
        2 ** zoom,
    );
    const url = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "field-sales-map-live-smoke/1.0 (+https://github.com/dhythm/field-sales-map)",
        Referer: origin + "/",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    report.tile = {
      outcome: response.ok ? "response_received" : "upstream_http_error",
      status: response.status,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
      requestCount: 1,
    };
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      report.tile.pngSignatureValid = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      report.tile.bytes = bytes.length;
      report.tile.outcome = report.tile.pngSignatureValid
        ? "success"
        : "unexpected_image_format";
    }
  } catch (error) {
    report.tile = {
      ...report.tile,
      outcome: "connection_or_response_error",
      error: message(error),
    };
  }
}

// Request 2: the real app performs one real cross-origin search in Chromium.
// The browser's CORS enforcement is kept enabled. All tile requests are blocked.
let server, browser;
try {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "4173",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Local server startup only. */
    }
    if (i === 39) throw new Error("Local preview did not start.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  let requests = 0,
    blockedTiles = 0,
    received = null,
    failed = null;
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(message(error)));
  page.on("response", (response) => {
    if (response.url().startsWith(apiHost + "/v1/search"))
      received = {
        status: response.status(),
        allowOrigin: response.headers()["access-control-allow-origin"] || null,
      };
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(apiHost + "/v1/search"))
      failed = request.failure()?.errorText || "request failed";
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (
      url.origin === apiHost &&
      url.pathname === "/v1/search" &&
      requests === 0
    ) {
      requests++;
      return route.continue();
    }
    if (url.hostname === "tile.openstreetmap.org") blockedTiles++;
    return route.abort();
  });
  await page.goto(origin);
  await page.selectOption("#mode", "live");
  await page.selectOption("#radius", "500");
  await page.fill("#query", "カフェ");
  await page.getByRole("button", { name: "このエリアで探す" }).click();
  await page.waitForFunction(
    () => {
      const text = document.querySelector("#message")?.textContent;
      return !!text && text !== "検索中…";
    },
    {},
    { timeout: 20000 },
  );
  const text = await page.locator("#message").innerText();
  const resultCount = await page.locator(".card").count();
  const renderedSuccess = text.includes("件の候補を取得");
  report.browser = {
    outcome: renderedSuccess
      ? "success"
      : received && received.status >= 400
        ? "upstream_http_error"
        : failed
          ? "connection_or_cors_error"
          : "app_or_response_error",
    requestCount: requests,
    response: received,
    networkError: failed,
    message: text,
    renderedCandidates: resultCount,
    pageErrors,
    blockedTileRequests: blockedTiles,
    liveBackgroundMapVerified: false,
  };
  await page.screenshot({
    path: `${output}/app-live-response.png`,
    fullPage: true,
  });
} catch (error) {
  report.browser = {
    ...report.browser,
    outcome: "harness_or_browser_error",
    error: message(error),
  };
} finally {
  await browser?.close();
  server?.kill();
}

const summary = `# Manual live smoke\n\nCommit: \`${report.commit}\`\n\n| Observation | Outcome |\n| --- | --- |\n| API HTTP (max 2 returned records) | ${report.http.outcome} |\n| Real browser CORS + app search | ${report.browser.outcome} |\n| Single tile HTTP (no map traversal) | ${report.tile.outcome} |\n\nUpstream failures are observations, not code test failures. A green workflow means the report was collected; inspect the outcomes. Browser background tiles are blocked, so a full live map was not visually verified.\n`;
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
await writeFile(`${output}/SUMMARY.md`, summary);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
log(JSON.stringify(report, null, 2));
