/**
 * End-to-end switchboard check. A solo table is opened, the switchboard is
 * called up from both of its keys, an order is found by name and opened on the
 * desk, and a plot is found by its two numbers and read back in the inspector.
 *
 * Usage: node tools/visual/e2e-switchboard.mjs [baseUrl]
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
const log = (...parts) => console.log("SWITCHBOARD:", ...parts);

function fail(message) {
  console.error("SWITCHBOARD FAILED:", message);
  process.exitCode = 1;
}

/**
 * Calls the switchboard up with a key. The handler is attached when React
 * hydrates, and a key pressed into the server's markup is dropped by the
 * browser, so the press is repeated until the board is on the page.
 */
async function openSwitchboard(page, key, tries = 20) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if ((await page.locator('[role="dialog"]').count()) > 0) return true;
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
  }
  return false;
}

/** Types a name into the board's field and opens the row that answers. */
async function callUp(page, query) {
  const field = page.locator('input[placeholder*="Sludge dump"]').first();
  await field.click();
  await field.fill(query);
  await page.waitForTimeout(200);
  await field.press("Enter");
}

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const noise = [];
  page.on("pageerror", (error) => noise.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") noise.push(`console: ${message.text()}`);
  });

  // ---- A solo table, played through the bench.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="name"]', "Cornelius Hale");
  await page.selectOption('select[name="seats"]', "4");
  await Promise.all([
    page.waitForURL(/\/table\//, { timeout: 30_000 }),
    page.click("button:has-text('Open the table')"),
  ]);
  const code = page.url().split("/table/")[1]?.split(/[?#]/)[0];
  if (!code) throw new Error("no table code in the url after founding");
  await page.waitForSelector("text=The table is gathering", { timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.click("button:has-text('Fill the empty chairs')", { timeout: 30_000 });
  await page.waitForSelector("text=Industrial grid", { timeout: 30_000 });
  await page.waitForTimeout(1_200);
  log(`desk open at table ${code}`);

  // ---- The slash key, on an empty query: the rooms are the menu.
  if (!(await openSwitchboard(page, "/"))) throw new Error("the slash key never opened the board");
  await page.waitForSelector('text=Operations desk', { timeout: 10_000 });
  const rows = await page.locator('[role="dialog"] li').count();
  log(`the board opened on ${rows} rows`);

  // ---- An order, by the name it is said with.
  await callUp(page, "sludge dump");
  await page.waitForSelector('[data-order="SLUDGE_DUMP"]', { timeout: 20_000 });
  const expanded = await page
    .locator('[data-order="SLUDGE_DUMP"] button')
    .first()
    .getAttribute("aria-expanded");
  if (expanded !== "true") fail(`the sludge dump row was not opened (aria-expanded ${expanded})`);
  else log("sludge dump found by name and opened on the desk");
  if ((await page.locator('[role="dialog"]').count()) > 0) fail("the board stayed up after a row was opened");

  // ---- A plot, by its two numbers, from the control key this time.
  await page.waitForTimeout(500);
  if (!(await openSwitchboard(page, "Control+k"))) {
    throw new Error("the control key never opened the board");
  }
  await callUp(page, "plot 4 5");
  await page.waitForSelector('[data-tour="inspector"]', { timeout: 20_000 });
  const inspector = (await page.locator('[data-tour="inspector"]').innerText()).replace(/\s+/g, "");
  if (!inspector.includes("4,5")) fail(`the inspector is not reading plot 4, 5: ${inspector.slice(0, 120)}`);
  else log("plot 4, 5 found by its numbers and read in the inspector");

  // ---- A house, by the name on its chair.
  await page.waitForTimeout(500);
  if (!(await openSwitchboard(page, "/"))) throw new Error("the board would not open a third time");
  await callUp(page, "house 2");
  await page.waitForTimeout(400);
  if ((await page.locator('[role="dialog"]').count()) > 0) fail("the house row did not close the board");
  else log("a house found by the name on its chair");

  log(`noise: ${noise.slice(0, 4).join(" | ") || "none"}`);
  if (process.exitCode) {
    log(`finished with failures at table ${code}`);
  } else {
    log(`OK: slash and control-k -> order by name -> plot by numbers -> house by name (${code})`);
  }
} catch (error) {
  fail(error.message ?? String(error));
} finally {
  await browser.close();
}
