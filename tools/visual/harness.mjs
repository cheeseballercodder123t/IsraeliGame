/**
 * Visual harness. Walks the running game in a real browser, writes screenshots
 * and a contact sheet for a human, and prints text digests of what actually got
 * painted so a terminal-only reader can judge the board, the palette and the
 * layout without looking at a single image.
 *
 * Usage: node tools/visual/harness.mjs [baseUrl]
 * Leaves everything under .screens/<timestamp>/.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  collectReport,
  collectSheets,
  countOverlays,
  digestAtlas,
  digestBoardArt,
  digestOverlays,
  digestMarket,
  digestPaper,
  digestSprites,
} from "./digests.mjs";
import { buildReport } from "./report.mjs";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3111";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join(".screens", stamp);
const LAUNCHERS = [{ channel: "chrome" }, { channel: "msedge" }, {}];

// Held out here so a failure part way through still shuts the browser down
// instead of leaving the process hanging with a window open.
let live = null;

async function launch() {
  const problems = [];
  for (const options of LAUNCHERS) {
    try {
      const browser = await chromium.launch({ ...options, args: ["--force-device-scale-factor=1"] });
      return { browser, label: options.channel ?? "bundled chromium" };
    } catch (error) {
      problems.push(`${options.channel ?? "chromium"}: ${error.message.split("\n")[0]}`);
    }
  }
  throw new Error(`No browser could be launched.\n${problems.join("\n")}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { browser, label } = await launch();
  live = browser;
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  const shots = [];
  const pages = [];
  const findings = [];
  let floorBook = null;
  let floorBookAfter = null;
  const note = (text) => findings.push(text);

  const shoot = async (name, options = {}) => {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), ...options });
    shots.push(name);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 60, fullPage: options.fullPage });
    pages.push({
      name,
      jpeg: jpeg.toString("base64"),
      width: page.viewportSize().width,
      height: options.fullPage ? null : page.viewportSize().height,
    });
  };
  const shootElement = async (name, selector) => {
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) {
      note(`missing element for ${name}: ${selector}`);
      return;
    }
    const jpeg = await target.screenshot({ type: "jpeg", quality: 72 });
    const box = await target.boundingBox();
    await target.screenshot({ path: path.join(OUT, `${name}.png`) });
    shots.push(name);
    pages.push({
      name,
      jpeg: jpeg.toString("base64"),
      width: Math.round(box?.width ?? 0),
      height: Math.round(box?.height ?? 0),
    });
  };
  const clickFirst = async (selector, wait = 400) => {
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) return false;
    await target.click();
    await page.waitForTimeout(wait);
    return true;
  };

  // ------------------------------------------------------------- the lobby
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("button:has-text('OPEN THE TABLE')", { timeout: 60_000 });
  await page.waitForTimeout(600);
  await shoot("01-lobby", { fullPage: true });

  const lobbyReport = await page.evaluate(collectReport);
  note(`lobby: ${lobbyReport.panels.length} panels, page ${lobbyReport.page.height}px tall`);
  for (const violation of lobbyReport.violations) note(`lobby style: ${violation}`);
  for (const clipped of lobbyReport.overflow) note(`lobby clipping: ${clipped}`);

  // ------------------------------------------------- open a table and play
  await page.fill('input[name="name"]', "Cornelius Hale");
  await page.selectOption('select[name="seats"]', "5").catch(() => {});
  await page.click("button:has-text('OPEN THE TABLE')");
  await page.waitForURL(/\/table\//, { timeout: 60_000 });
  await page.waitForTimeout(1200);

  // Tables gather in a lobby now; the host seats the bench and opens the
  // window before the rest of the pass can play a match.
  const openButton = page.locator("button:has-text('FILL THE EMPTY CHAIRS')");
  if ((await openButton.count()) > 0) {
    await shoot("02a-table-lobby");
    await openButton.click();
    await page.waitForTimeout(1800);
  }
  await shoot("02-table-desk");

  const tableReport = await page.evaluate(collectReport);
  note(`table: ${tableReport.panels.length} panels, page ${tableReport.page.height}px tall`);
  for (const violation of tableReport.violations) note(`table style: ${violation}`);
  for (const clipped of tableReport.overflow) note(`table clipping: ${clipped}`);

  const atlas = await page.evaluate(digestAtlas);
  const boardBefore = await page.evaluate(digestBoardArt);
  const grounds = await page.evaluate(digestSprites, { rings: [5, 4, 3, 2, 1, 0], plants: 0 });
  const plants = await page.evaluate(digestSprites, { rings: [], plants: 10 });

  await shootElement("03-board", "section:has-text('Industrial grid')");
  await shootElement("04-order-desk", "section:has-text('Operations desk')");
  await shootElement("05-book", "section:has-text('Your book')");

  // A plot, so the inspector has something specific to say.
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickFirst('button[title^="Plot 5, 5"]', 500);
  await shoot("06-inspector-open");
  await shootElement("07-inspector", "section:has-text('Plot')");

  // The order desk, expanded, which is the densest screen in the app.
  const orderRow = page
    .locator("section:has-text('Operations desk') li")
    .filter({ hasText: "Build or reconfigure plant" })
    .first();
  if ((await orderRow.count()) > 0) {
    await orderRow.locator("button").first().click();
    await page.waitForTimeout(400);
    await shoot("08-order-expanded");
    await shootElement("09-order-fields", "section:has-text('Operations desk')");
  }

  // ----------------------------------------------------------- paper check
  // A fresh table has no issue on the shelf, so the strip should say so
  // rather than offer a button that opens nothing.
  const hasRagButton = await page.locator("button:has-text('The Rag')").count();
  const saysNoPaper = await page.locator("span:has-text('No paper yet')").count();
  if (hasRagButton === 0 && saysNoPaper === 0) {
    note("status strip offers neither a paper button nor a no paper notice");
  }

  // --------------------------------------------------------- the exchange
  if (await clickFirst("button:has-text('Floor and register')", 500)) {
    await shoot("10-floor", { fullPage: true });
    const floorReport = await page.evaluate(collectReport);
    for (const violation of floorReport.violations) note(`floor style: ${violation}`);
    for (const clipped of floorReport.overflow) note(`floor clipping: ${clipped}`);
    floorBook = await page.evaluate(digestMarket);
  }
  await clickFirst("button:has-text('Desk and board')", 500);

  // ------------------------------------------------- play several windows
  // A table that has just been seated has no weather on it: the smog, the
  // stoppages, the wreckage and the fifteen lots only exist once the world has
  // run. So the window is closed repeatedly and the board is watched filling
  // up, rather than photographed cold in the one state that has no overlays.
  const WINDOWS = Number(process.env.WINDOWS ?? 6);
  const windowLog = [];
  const paperLog = [];
  let played = 0;
  for (let window = 1; window <= WINDOWS; window += 1) {
    const closed = await clickFirst("button:has-text('Close the window and resolve')", 5000);
    if (!closed) {
      note(`window ${window}: the resolve button is gone, so play stopped at ${played} windows`);
      break;
    }
    played = window;
    const opened = await page
      .waitForSelector("[role='dialog']", { timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await page.waitForTimeout(400);
      if (window === 1 || window === WINDOWS) {
        const label = window === 1 ? "first" : "last";
        await shootElement(`12-paper-${label}-window`, "[role='dialog']");
        const paper = await page.evaluate(digestPaper);
        paperLog.push(`the ${label} window:`, ...paper.text.map((line) => `  ${line}`));
      }
      await clickFirst("button:has-text('Fold it up')", 700);
    } else if (window === 1) {
      note("the paper did not open itself after the window closed");
    }
    const census = await page.evaluate(countOverlays);
    windowLog.push(`window ${window}: ${census.line}`);
    if (window === Math.ceil(WINDOWS / 2)) {
      await shoot("13-board-midway-through");
      await shootElement("14-board-midway-panel", "section:has-text('Industrial grid')");
    }
  }
  if (played > 0) await shoot("15-board-after-windows");

  const board = await page.evaluate(digestBoardArt);
  const overlays = await page.evaluate(digestOverlays);

  // The inspector on a plot that is carrying something, which is the screen
  // that explains the overlays rather than just wearing them.
  const wearing = await page.evaluate(() => {
    const plots = [...document.querySelectorAll('button[title^="Plot "]')];
    const pick =
      plots.find((plot) => Number(plot.dataset.pollution) > 1 && plot.dataset.recipe !== "NONE") ??
      plots.find((plot) => plot.dataset.tender === "true") ??
      plots[0];
    return pick ? pick.getAttribute("title") : null;
  });
  if (wearing) {
    await page.evaluate((title) => {
      const plot = [...document.querySelectorAll('button[title^="Plot "]')].find(
        (candidate) => candidate.getAttribute("title") === title,
      );
      plot?.scrollIntoView({ block: "center" });
      plot?.click();
    }, wearing);
    await page.waitForTimeout(600);
    await shoot("16-plot-under-load");
    await shootElement("17-plot-under-load-inspector", "section:has-text('Plot')");
  } else {
    note("no plot could be selected for the overlay inspector");
  }

  // The book once the world has been running: this is where the cost floor and
  // the board's own appetite for feedstock actually show up.
  if (await clickFirst("button:has-text('Floor and register')", 700)) {
    await shoot("18-floor-after-windows", { fullPage: true });
    floorBookAfter = await page.evaluate(digestMarket);
    await clickFirst("button:has-text('Desk and board')", 600);
  } else {
    note("the floor tab could not be opened after the windows closed");
  }

  // ------------------------------------------------------ a narrow viewport
  await page.setViewportSize({ width: 1180, height: 960 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await shoot("19-narrow", { fullPage: true });
  const narrowReport = await page.evaluate(collectReport);
  note(`narrow: page ${narrowReport.page.height}px, ${narrowReport.panels.length} panels`);
  for (const violation of narrowReport.violations) note(`narrow style: ${violation}`);
  for (const clipped of narrowReport.overflow) note(`narrow clipping: ${clipped}`);

  await page.setViewportSize({ width: 1600, height: 1000 });

  // ------------------------------------------------------------- artifacts
  const sheets = await page.evaluate(collectSheets);
  await writeFile(path.join(OUT, "windows.txt"), windowLog.join("\n"), "utf8");
  await writeFile(path.join(OUT, "overlays.txt"), overlays.text.join("\n"), "utf8");
  await writeFile(path.join(OUT, "paper.txt"), paperLog.join("\n"), "utf8");
  await writeFile(path.join(OUT, "atlas.txt"), atlas.text.join("\n"), "utf8");
  await writeFile(path.join(OUT, "board.txt"), board.text.join("\n"), "utf8");
  await writeFile(path.join(OUT, "grounds.txt"), grounds.text.join("\n"), "utf8");
  await writeFile(path.join(OUT, "plants.txt"), plants.text.join("\n"), "utf8");
  await writeFile(
    path.join(OUT, "report.json"),
    JSON.stringify(
      { base: BASE, browser: label, shots, findings, lobby: lobbyReport, table: tableReport, narrow: narrowReport },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(path.join(OUT, "index.html"), contactSheet(shots), "utf8");

  // Everything inlined into one page, so a reviewer can open it from anywhere
  // and look at the art, the screens and the pixels together.
  const reportHtml = buildReport({
    base: BASE,
    browser: label,
    stamp,
    findings,
    shots: pages,
    sheets,
    digests: {
      windows_played: windowLog,
      the_book_on_seating: floorBook ? floorBook.text : ["the floor tab did not open"],
      the_book_after_windows: floorBookAfter ? floorBookAfter.text : ["the floor tab did not open"],
      overlays_on_the_board: overlays.text,
      the_paper: paperLog,
      atlas: atlas.text,
      grounds: grounds.text,
      plants: plants.text,
      board_on_seating: boardBefore.text,
      board_after_windows: board.text,
    },
    panels: tableReport.panels,
    fonts: tableReport.fonts,
    palette: tableReport.palette,
  });
  await writeFile(path.join(OUT, "report.html"), reportHtml, "utf8");
  await writeFile(path.join(".screens", "report.html"), reportHtml, "utf8");
  await writeFile(path.join(OUT, "sheets.json"), JSON.stringify(sheets.map((s) => ({ ...s, url: undefined })), null, 2), "utf8");

  const lines = [];
  lines.push(`browser: ${label}`);
  lines.push(`base: ${BASE}`);
  lines.push(`artifacts: ${OUT}`);
  lines.push(`report: ${path.join(OUT, "report.html")} (also .screens/report.html)`);
  lines.push(
    `sheets: ${
      sheets.map((sheet) => `${sheet.name} ${sheet.width}x${sheet.height}`).join(", ") || "none"
    }`,
  );
  lines.push("");
  lines.push("--- findings ---");
  for (const finding of findings) lines.push(`  ${finding}`);
  lines.push("");
  lines.push("--- atlas ---");
  lines.push(...atlas.text);
  lines.push("");
  lines.push("--- windows played ---");
  lines.push(...windowLog);
  lines.push("");
  lines.push("--- the book after the windows ---");
  lines.push(...(floorBookAfter ? floorBookAfter.text : ["the floor tab did not open"]));
  lines.push("");
  lines.push("--- overlays on the board ---");
  lines.push(...overlays.text);
  lines.push("");
  lines.push("--- the paper ---");
  lines.push(...paperLog);
  lines.push("");
  lines.push("--- ground art per band, one character per pixel ---");
  lines.push("  (capital letters are the lighter pass of the same hue, W/S pale, d dark, k black)");
  lines.push(...grounds.text);
  lines.push("");
  lines.push("--- board before the window closed ---");
  lines.push(...boardBefore.text);
  lines.push("");
  lines.push("--- board after the window closed ---");
  lines.push(...board.text);
  lines.push("");
  lines.push("--- panels at 1600px ---");
  for (const panel of tableReport.panels) {
    lines.push(`  ${panel.title} @ ${panel.x},${panel.y} ${panel.w}x${panel.h}`);
  }
  lines.push(`  fonts: ${tableReport.fonts.join(", ")}`);
  lines.push(`  palette: ${tableReport.palette.join(" ")}`);
  const report = lines.join("\n");
  await writeFile(path.join(OUT, "report.txt"), report, "utf8");
  console.log(report);

  await browser.close();
}

function contactSheet(names) {
  const cells = names
    .map(
      (name) => `<figure>
      <figcaption>${name}</figcaption>
      <img src="${name}.png" alt="${name}" loading="lazy" />
    </figure>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Visual pass</title>
<style>
  body { background: #17140f; color: #d8d0be; font: 13px/1.5 "IBM Plex Mono", monospace; margin: 0; padding: 24px; }
  h1 { font-size: 18px; letter-spacing: 0.2em; text-transform: uppercase; }
  figure { margin: 0 0 28px; }
  figcaption { margin-bottom: 6px; color: #a08c5a; letter-spacing: 0.14em; text-transform: uppercase; }
  img { max-width: 100%; border: 1px solid #3a352b; display: block; }
</style>
</head>
<body>
<h1>Visual pass</h1>
${cells}
</body>
</html>
`;
}

main().catch(async (error) => {
  console.error(error);
  await live?.close().catch(() => {});
  process.exitCode = 1;
});
