/**
 * What the live transports are doing at a table, read from the browser.
 *
 * A solo table is founded and left alone while the probe watches. EventSource
 * is wrapped before the app loads, so every stream the desk opens is timed
 * from open to close or error, the summary polls underneath are stamped, and
 * every websocket the page opens is named. The summary printed at the end is
 * what the live layer actually did, not what it was supposed to do.
 *
 * Usage: node tools/visual/probe-live.mjs [baseUrl] [seconds]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WATCH_MS = (Number(process.argv[3]) || 45) * 1000;

async function launch() {
  const attempts = [{}, { channel: "chrome" }, { channel: "msedge" }];
  const problems = [];
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      problems.push(`${options.channel ?? "bundled chromium"}: ${error.message.split("\n")[0]}`);
    }
  }
  throw new Error(`No browser could be launched.\n${problems.join("\n")}`);
}

const browser = await launch();
const context = await browser.newContext();

// Wrapped before any app code runs, so the desk's own streams are the records.
await context.addInitScript(() => {
  const records = [];
  const Native = window.EventSource;
  class Watched extends Native {
    constructor(url, options) {
      super(url, options);
      const record = { url: String(url), opened: null, closed: null, errors: 0, frames: 0 };
      records.push(record);
      this.addEventListener("open", () => {
        record.opened = Date.now();
      });
      this.addEventListener("error", () => {
        record.errors += 1;
        if (this.readyState === 2) record.closed = Date.now();
      });
      this.addEventListener("message", () => {
        record.frames += 1;
      });
      const close = this.close.bind(this);
      this.close = () => {
        if (record.closed === null) record.closed = Date.now();
        close();
      };
    }
  }
  window.EventSource = Watched;
  window.__streamRecords = records;
});

const page = await context.newPage();
const polls = [];
const sockets = [];

page.on("websocket", (socket) => {
  const record = { url: socket.url(), frames: 0 };
  sockets.push(record);
  socket.on("framereceived", () => {
    record.frames += 1;
  });
});

page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.endsWith("/summary")) {
    polls.push({ at: Date.now(), composing: url.search.includes("composing=1") });
  }
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.fill('input[name="name"]', "Probe Hand");
await page.selectOption('select[name="seats"]', "4");
await Promise.all([
  page.waitForURL(/\/table\//, { timeout: 30_000 }),
  page.click("button:has-text('Open the table')"),
]);
const code = page.url().split("/table/")[1]?.split(/[?#]/)[0];
await page.waitForSelector("text=The table is gathering", { timeout: 20_000 });
await page.click("button:has-text('Fill the empty chairs')", { timeout: 30_000 });
await page.waitForSelector("text=Industrial grid", { timeout: 30_000 });
console.log(`PROBE: desk open at ${code}, watching ${WATCH_MS / 1000}s`);

const watchFrom = Date.now();
await page.waitForTimeout(WATCH_MS);
const records = await page.evaluate(() => window.__streamRecords);
const since = (value) => (value === null ? "never" : `${((value - watchFrom) / 1000).toFixed(1)}s`);
const span = (a, b) => (a === null || b === null ? "" : ` lived ${((b - a) / 1000).toFixed(1)}s`);

console.log(`PROBE: streams (${records.length}):`);
for (const record of records) {
  console.log(
    `  opened at ${since(record.opened)}, events ${record.frames}, errors ${record.errors}${span(record.opened, record.closed)}`,
  );
}
console.log(`PROBE: summary polls while watching: ${polls.filter((p) => p.at >= watchFrom).length}`);
console.log(`PROBE: websockets (${sockets.length}):`);
for (const socket of sockets) console.log(`  ${socket.url} frames=${socket.frames}`);

await browser.close();
