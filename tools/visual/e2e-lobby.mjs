/**
 * End-to-end lobby check. Two browser contexts play the multiplayer handoff:
 * the host opens a gathering table, a second human takes a chair from the
 * lobby listing, the host opens the window, and both land on the live desk.
 *
 * Usage: node tools/visual/e2e-lobby.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";

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
const log = (...parts) => console.log("E2E:", ...parts);

function fail(message) {
  console.error("E2E FAILED:", message);
  process.exitCode = 1;
}

/**
 * Clicks a control that only becomes live once React has hydrated. A click
 * that lands on the server's markup before hydration is attached is dropped
 * by the browser, which is the one race a script hits and a person does not.
 * The click is retried until the panel it should open is on the page, so a
 * dropped first click is harmless; it stops as soon as the app answers.
 */
async function clickWhenLive(page, selector, expect, tries = 25) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (expect && (await page.locator(expect).count()) > 0) return;
    const target = page.locator(selector).first();
    if ((await target.count()) > 0) {
      // A control the server rendered as disabled has nothing to answer yet, so
      // waiting on it costs the whole budget: skip it and come back when the
      // room has caught up. An enabled control is clicked, because a click that
      // lands before hydration is dropped and needs the retry.
      const ready = await target.isEnabled().catch(() => false);
      if (ready) await target.click({ timeout: 4_000 }).catch(() => {});
    }
    await page.waitForTimeout(500);
  }
}

try {
  // ---- Host founds a gathering table.
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const hostNoise = [];
  host.on("pageerror", (error) => hostNoise.push(`page error: ${error.message}`));
  host.on("console", (message) => {
    if (message.type() === "error") hostNoise.push(`console: ${message.text()}`);
  });
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.fill('input[name="name"]', "Cornelius Hale");
  await host.selectOption('select[name="archetype"]', "ROBBER_BARON");
  await host.selectOption('select[name="seats"]', "4");
  await Promise.all([
    host.waitForURL(/\/table\//, { timeout: 30_000 }),
    host.click("button:has-text('Open the table')"),
  ]);
  const code = host.url().split("/table/")[1]?.split(/[?#]/)[0];
  if (!code) throw new Error("no table code in url after founding");
  await host.waitForSelector("text=The table is gathering", { timeout: 20_000 });
  const rosterAlone = await host.locator("li", { hasText: "Cornelius Hale" }).count();
  log(`host founded table ${code}; lobby shown (${rosterAlone} roster row)`);

  // ---- A second human takes a chair from the lobby listing.
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(BASE, { waitUntil: "domcontentloaded" });
  const listing = guest.locator(`a[href="/table/${code}"]`);
  if ((await listing.count()) === 0) throw new Error(`table ${code} missing from the open-chair listing`);
  await listing.first().click();
  await guest.waitForSelector("text=Take a chair", { timeout: 20_000 });
  await clickWhenLive(guest, "button:has-text('Take a chair')", "text=Your seat");
  await guest.waitForSelector("text=Your seat", { timeout: 20_000 });
  log("guest claimed a chair through the lobby");

  // ---- The host opens the window; the bench fills and the desk appears.
  // The start button only answers once the host's lobby has seen the second
  // chair, so the retry runs long enough to cover a slow stream or poll.
  await clickWhenLive(host, "button:has-text('Open the window')", "text=Operations desk", 60);
  const opened = await host
    .waitForSelector("text=Operations desk", { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    const room = (await host.locator("main").innerText().catch(() => "<no main>")) ?? "";
    const body = (await host.locator("body").innerText().catch(() => "<no body>")) ?? "";
    const start = host.locator("button:has-text('Open the window')").first();
    const state =
      (await start.count()) === 0
        ? "the start button is not on the page"
        : (await start.isEnabled())
          ? "the start button is on the page and enabled"
          : "the start button is on the page and still disabled";
    fail(
      `the host never reached the desk; ${state}.\n` +
        `  url: ${host.url()}\n` +
        `  title: ${await host.title()}\n` +
        `  main: ${room.slice(0, 700)}\n` +
        `  body: ${body.slice(0, 900)}\n` +
        `  noise: ${hostNoise.slice(0, 8).join(" | ") || "none"}`,
    );
    throw new Error("host desk failed");
  }
  await host.waitForSelector("text=Industrial grid", { timeout: 30_000 });
  log("host opened the window; dashboard rendered");

  // ---- The guest reloads into the same live table.
  await guest.reload({ waitUntil: "domcontentloaded" });
  await guest.waitForSelector("text=Operations desk", { timeout: 30_000 });
  const rivalRows = await guest.locator("td", { hasText: "Cornelius Hale" }).count();
  if (rivalRows === 0) throw new Error("guest cannot see the host on the register");
  log(`guest sees the live table (host on the register: ${rivalRows} row)`);

  if (process.exitCode) {
    console.log(`E2E: finished with failures at table ${code}`);
  } else {
    console.log(`E2E OK: lobby -> seats -> activation -> shared table (${code})`);
  }
} catch (error) {
  fail(error.message ?? String(error));
} finally {
  await browser.close();
}
