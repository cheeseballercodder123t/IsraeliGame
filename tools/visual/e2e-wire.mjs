/**
 * End-to-end wire check. Two browsers play a short exchange: the host founds a
 * real time table and opens the window, a guest takes a chair, then the guest
 * works out a line and says it. The host's side must show the rival composing,
 * the line landing in the wire log, and the tab title carrying the unread
 * feed — which is the part React's metadata refresh keeps trying to erase.
 *
 * Usage: node tools/visual/e2e-wire.mjs [baseUrl]
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
const log = (...parts) => console.log("WIRE:", ...parts);

/**
 * A real time table publishes an edition every window, and a new edition
 * opens the paper on its own. Escape closes it; it is only ever in the way.
 */
async function clearPaper(page) {
  const dialog = page.locator("[role='dialog']");
  for (let round = 0; round < 10 && (await dialog.count()) > 0; round += 1) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}

function fail(message) {
  console.error("WIRE FAILED:", message);
  process.exitCode = 1;
}

try {
  // ---- Host founds a real time table. Real time keeps the poll at 1.5s, so
  // ---- the composing stamp and the wire line land quickly.
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.fill('input[name="name"]', "Cornelius Hale");
  await host.selectOption('select[name="archetype"]', "ROBBER_BARON");
  await host.selectOption('select[name="seats"]', "2");
  await host.selectOption('select[name="mode"]', "REALTIME");
  await Promise.all([
    host.waitForURL(/\/table\//, { timeout: 30_000 }),
    host.click("button:has-text('Open the table')"),
  ]);
  const code = host.url().split("/table/")[1]?.split(/[?#]/)[0];
  if (!code) throw new Error("no table code in url after founding");
  await host.waitForSelector("text=The table is gathering", { timeout: 20_000 });
  log(`host founded table ${code} (real time, 2 chairs)`);

  // ---- A second human takes a chair.
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(`${BASE}/table/${code}`, { waitUntil: "domcontentloaded" });
  await guest.waitForSelector("text=Take a chair", { timeout: 20_000 });
  // The button only answers once React has hydrated, so give the page a beat
  // before touching it, and read the room if the chair never lands.
  await guest.waitForTimeout(1_500);
  await guest.selectOption("select", "PE_VULTURE");
  await guest.click("button:has-text('Take a chair')");
  const seated = await guest
    .waitForSelector("text=Your seat", { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!seated) {
    const body = (await guest.locator("main").innerText().catch(() => "<no main>")) ?? "";
    fail(`guest never got a seat. The lobby read:\n${body.slice(0, 600)}`);
    throw new Error("guest seat failed");
  }
  log("guest claimed a chair");
  await host.click("button:has-text('Open the window')");
  await host.waitForSelector("text=Industrial grid", { timeout: 30_000 });
  log("host opened the window; dashboard rendered");

  // ---- The guest lands on the live desk and works out a line.
  await guest.reload({ waitUntil: "domcontentloaded" });
  await guest.waitForSelector("text=Industrial grid", { timeout: 30_000 });
  // The composer is a controlled field, so a fill that lands before React
  // hydrates is silently erased on hydration. Fill, then insist the Say
  // button go live, trying again if the desk was not ready yet.
  let penDown = false;
  for (let attempt = 0; attempt < 5 && !penDown; attempt += 1) {
    await guest.fill('input[placeholder="A figure, a threat, a name"]', "The floor is yours, take it.");
    penDown = await guest
      .waitForSelector("button:has-text('Say'):not([disabled])", { timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!penDown) fail("the composer never took the line (field keeps emptying)");
  else log("guest put pen to paper (composing)");

  // ---- The host, who is watching, must see the rival composing within one
  // ---- composing TTL (6s) plus a poll. The guest sat through the lobby with
  // ---- no name field, so the house on the wire is the Unnamed Director.
  await host
    .waitForSelector("text=Unnamed Director is working out a line", { timeout: 15_000 })
    .then(() => log("host sees: rival is working out a line"))
    .catch(() => fail("host never saw the rival composing"));

  // ---- The guest seals the line, moving the paper out of the way first.
  await clearPaper(guest);
  await guest.click("button:has-text('Say')");
  log("guest said the line");

  // ---- The line lands in the host's wire log.
  await host
    .waitForSelector('div[data-wire-log] >> text=The floor is yours', { timeout: 15_000 })
    .then(() => log("host wire log shows the guest's line"))
    .catch(() => fail("host wire log never showed the guest's line"));

  // ---- Now the parked-tab reading. The host tab is sent to the background
  // ---- by hand (a headless browser parks every tab), the guest sends again,
  // ---- and the title must carry the latched unread feed: wire: Unnamed
  // ---- Director. Half-speed hidden polling is what makes this possible; the
  // ---- drift interval is what keeps the flag on the title at all.
  await host.evaluate(() => Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }));
  await host.evaluate(() => Object.defineProperty(document, "hidden", { value: true, configurable: true }));
  await guest.fill('input[placeholder="A figure, a threat, a name"]', "And the tender with it.");
  await clearPaper(guest);
  await guest.click("button:has-text('Say')");
  log("guest said the second line while the host tab was parked");

  let titled = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const title = await host.title();
    if (title.includes("wire:")) {
      log(`parked tab title carries the unread feed: "${title}"`);
      titled = true;
      break;
    }
    await host.waitForTimeout(2_500);
  }
  if (!titled) fail(`parked tab title never carried the unread feed (last: "${await host.title()}")`);

  // ---- Back at the desk, the latch clears: the title returns to the bare
  // ---- room, pressure aside, because the desk has now read the wire.
  await host.evaluate(() => Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }));
  await host.evaluate(() => Object.defineProperty(document, "hidden", { value: false, configurable: true }));
  host.evaluate(() => window.dispatchEvent(new Event("focus")));
  let cleared = false;
  for (let attempt = 0; attempt < 6 && titled; attempt += 1) {
    await host.waitForTimeout(3_000);
    const title = await host.title();
    if (!title.includes("wire:")) {
      log(`latch cleared on return: "${title}"`);
      cleared = true;
      break;
  }
  }
  if (titled && !cleared) fail(`unread latch never cleared after return (last: "${await host.title()}")`);

  if (process.exitCode) {
    console.log(`WIRE: finished with failures at table ${code}`);
  } else {
    console.log(`WIRE OK: composing -> line -> parked-title unread -> clear on return at table ${code}`);
  }
} catch (error) {
  fail(error.message ?? String(error));
} finally {
  await browser.close();
}
