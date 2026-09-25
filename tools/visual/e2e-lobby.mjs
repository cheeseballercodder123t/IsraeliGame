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

try {
  // ---- Host founds a gathering table.
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
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
  await guest.click("button:has-text('Take a chair')");
  await guest.waitForSelector("text=Your seat", { timeout: 20_000 });
  log("guest claimed a chair through the lobby");

  // ---- The host opens the window; the bench fills and the desk appears.
  await host.click("button:has-text('Open the window')");
  await host.waitForSelector("text=Operations desk", { timeout: 30_000 });
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
