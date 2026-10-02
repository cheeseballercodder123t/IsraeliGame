/**
 * End-to-end live check, with two desks at one table.
 *
 * The lobby flow is played first (host founds, a second human takes a chair,
 * the window opens). Then the live layer is read rather than assumed: the
 * status strip is checked for the push lamp, the guest puts a hand on the wire
 * three times and the wall clock is read from the keystroke to the host's
 * "working out a line", and the host's stream is closed from under it to time
 * how long the wire takes to rebuild itself with nobody touching the page.
 *
 * Usage: node tools/visual/e2e-live.mjs [baseUrl]
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
const log = (...parts) => console.log("LIVE:", ...parts);

function fail(message) {
  console.error("LIVE FAILED:", message);
  process.exitCode = 1;
}

async function clickWhenLive(page, selector, expect, tries = 25) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (expect && (await page.locator(expect).count()) > 0) return;
    const target = page.locator(selector).first();
    if ((await target.count()) > 0) {
      const ready = await target.isEnabled().catch(() => false);
      if (ready) await target.click({ timeout: 4_000 }).catch(() => {});
    }
    await page.waitForTimeout(500);
  }
}

/** The strip's lamp, which reads live, polled or stale. */
function lamp(page) {
  return page
    .locator('[data-tour="strip"] span')
    .filter({ hasText: /^(live|polled|stale)$/ })
    .first();
}

async function lampText(page) {
  const target = lamp(page);
  if ((await target.count()) === 0) return "";
  // The strip sets its small copy in caps, so the browser hands back an
  // uppercased string whatever the markup says.
  return (await target.innerText()).trim().toLowerCase();
}

async function waitForLamp(page, want, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await lampText(page)) === want) return Date.now() - started;
    await page.waitForTimeout(150);
  }
  return -1;
}

async function waitGone(page, selector, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await page.locator(selector).count()) === 0) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/** How many streams the page has called up, opened or not. */
async function streamCounts(page) {
  return page
    .evaluate(() => ({
      tried: window.__streamCount?.tried ?? -1,
      opened: window.__streamCount?.opened ?? -1,
    }))
    .catch(() => ({ tried: -1, opened: -1 }));
}

try {
  // ---- The lobby handoff, the same as the lobby check.
  const hostCtx = await browser.newContext();
  // Every stream the host calls up is counted, so the run can say whether the
  // wire held, and whether it put itself back after it was taken away.
  await hostCtx.addInitScript(() => {
    const count = { tried: 0, opened: 0 };
    const streams = [];
    const Native = window.EventSource;
    class Watched extends Native {
      constructor(url, options) {
        super(url, options);
        count.tried += 1;
        streams.push(this);
        this.addEventListener("open", () => {
          count.opened += 1;
        });
      }
    }
    window.EventSource = Watched;
    window.__streamCount = count;
    window.__streams = streams;
  });
  const host = await hostCtx.newPage();
  const noise = [];
  host.on("pageerror", (error) => noise.push(`page error: ${error.message}`));
  host.on("console", (message) => {
    if (message.type() === "error") noise.push(`console: ${message.text()}`);
  });
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.fill('input[name="name"]', "Cornelius Hale");
  await host.selectOption('select[name="seats"]', "4");
  await Promise.all([
    host.waitForURL(/\/table\//, { timeout: 30_000 }),
    host.click("button:has-text('Open the table')"),
  ]);
  const code = host.url().split("/table/")[1]?.split(/[?#]/)[0];
  if (!code) throw new Error("no table code in url after founding");
  await host.waitForSelector("text=The table is gathering", { timeout: 20_000 });

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  guest.on("pageerror", (error) => noise.push(`guest page error: ${error.message}`));
  // The front of the house reads every open table on the server before it can
  // print the listing, and a workspace carrying a backlog of test tables can
  // take a moment to get there, so the arrival is given a few tries.
  const listing = guest.locator(`a[href="/table/${code}"]`);
  let listed = false;
  for (let attempt = 0; attempt < 4 && !listed; attempt += 1) {
    await guest.goto(BASE, { waitUntil: "domcontentloaded" });
    listed = await listing
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!listed) {
    const body = (await guest.locator("body").innerText().catch(() => "<no body>")) ?? "";
    throw new Error(`table ${code} missing from the listing; front page: ${body.slice(0, 400)}`);
  }
  await listing.first().click();
  await guest.waitForSelector("text=Take a chair", { timeout: 20_000 });
  await clickWhenLive(guest, "button:has-text('Take a chair')", "text=Your seat");
  await guest.waitForSelector("text=Your seat", { timeout: 20_000 });

  await clickWhenLive(host, "button:has-text('Open the window')", "text=Operations desk", 60);
  await host.waitForSelector("text=Industrial grid", { timeout: 30_000 });
  await guest.reload({ waitUntil: "domcontentloaded" });
  await guest.waitForSelector("text=Operations desk", { timeout: 30_000 });
  log(`two desks at table ${code}`);

  // ---- The strip says which transport is carrying the table.
  const lampNow = await waitForLamp(host, "live", 20_000);
  if (lampNow < 0) fail(`the host's strip never read live (reads ${await lampText(host)})`);
  else log(`the strip reads live ${lampNow}ms after the desk settled`);

  // ---- A hand on the wire, timed from the keystroke to the other desk.
  // Scoped to the composer's own form rather than by placeholder: several
  // fields around the desk talk about figures, and only one of them is the
  // wire.
  const composer = guest.locator('form:has(button:has-text("Say")) input').first();
  if ((await composer.count()) === 0) throw new Error("the guest has no composer to type into");
  const trials = [];
  for (let trial = 0; trial < 3; trial += 1) {
    // A trial only means something with the host on the wire, so the lamp is
    // waited on first: a stalled stream would be a net poll, not the push.
    const wired = await waitForLamp(host, "live", 10_000);
    if (wired < 0) fail(`trial ${trial + 1}: the host was not on the wire (reads ${await lampText(host)})`);
    await waitGone(host, "text=is working out a line", 12_000);
    // The composer is a controlled field, so a fill that lands before React
    // hydrates is silently erased and would be reported as a slow hand rather
    // than a lost one. The Say button waking is the page's own receipt that
    // the draft is really in the field, so the line is typed until it wakes;
    // the clock is only kept from the fill that did.
    const line = trial === 0 ? "a" : `take ${trial}`;
    let started = -1;
    for (let attempt = 0; attempt < 6 && started < 0; attempt += 1) {
      await composer.click();
      started = Date.now();
      await composer.fill(line);
      const woke = await guest
        .waitForSelector("button:has-text('Say'):not([disabled])", { timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (!woke) started = -1;
    }
    if (started < 0) {
      fail(`trial ${trial + 1}: the guest's draft was never really in the field`);
      break;
    }
    const readback = await composer.inputValue().catch(() => "<unreadable>");
    log(`trial ${trial + 1}: typed ${JSON.stringify(readback)}`);
    let arrived = -1;
    for (let tick = 0; tick < 30; tick += 1) {
      if ((await host.locator("text=is working out a line").count()) > 0) {
        arrived = Date.now() - started;
        break;
      }
      if (tick % 4 === 0) {
        const watching = await composer.inputValue().catch(() => "<gone>");
        log(`  t+${(tick / 2).toFixed(0)}s draft=${JSON.stringify(watching)} page=${guest.url()} `);
      }
      await guest.waitForTimeout(500);
    }
    if (arrived < 0) {
      const wire = await host
        .locator("[data-wire-log]")
        .first()
        .innerText()
        .catch(() => "<no wire panel>");
      const draft = await composer.inputValue().catch(() => "<no composer>");
      const known = await host
        .evaluate(async (table) => {
          const res = await fetch(`/api/table/${table}/summary`);
          const json = await res.json();
          return json.composers ?? null;
        }, code)
        .catch(() => null);
      fail(
        `trial ${trial + 1}: the host never saw the hand on the wire.` +
          `\n  guest draft: ${JSON.stringify(draft)}` +
          `\n  the server says composers: ${JSON.stringify(known)}` +
          `\n  host wire: ${wire.slice(0, 300).replace(/\s+/g, " ")}`,
      );
      break;
    }
    trials.push(arrived);
    log(`hand on the wire reached the host in ${arrived}ms (trial ${trial + 1})`);
    await composer.fill("");
    await guest.waitForTimeout(200);
  }
  if (trials.length === 3) {
    const sorted = [...trials].sort((a, b) => a - b);
    const median = sorted[1];
    if (median > 2_500) fail(`the median hand took ${median}ms to reach the host`);
    else log(`median hand on the wire: ${median}ms`);
  }

  // ---- The wire is taken away and has to put itself back, with nobody
  // touching the page: the watchdog notices the silence, the retry schedule
  // calls the stream up again, and the count of streams says it happened.
  const before = await streamCounts(host);
  const dropped = await host.evaluate(() => {
    // Close every stream without the app being told, exactly like a proxy
    // dropping a socket that never errors: nothing but silence reaches the
    // page, so only the watchdog can find it.
    const streams = window.__streams ?? [];
    for (const source of streams) {
      try {
        source.close();
      } catch {
        // Already closed.
      }
    }
    return streams.length;
  });
  log(`streams closed from the page: ${dropped}`);
  const startedHeal = Date.now();
  const healed = await host
    .waitForFunction((seen) => (window.__streamCount?.opened ?? 0) > seen, before.opened, {
      timeout: 30_000,
    })
    .then(() => true)
    .catch(() => false);
  const after = await streamCounts(host);
  if (!healed) {
    fail(`the wire never rebuilt itself (opened ${before.opened} -> ${after.opened})`);
  } else {
    log(
      `wire rebuilt itself with nobody touching the page after ${Date.now() - startedHeal}ms ` +
        `(opened ${before.opened} -> ${after.opened})`,
    );
  }

  log(`host streams tried/opened over the run: ${after.tried}/${after.opened}`);
  log(`noise: ${noise.slice(0, 4).join(" | ") || "none"}`);
  if (process.exitCode) {
    log(`finished with failures at table ${code}`);
  } else {
    log(`OK: push transport live, hand on the wire inside the tick, wire heals itself (${code})`);
  }
} catch (error) {
  fail(error.message ?? String(error));
} finally {
  await browser.close();
}
