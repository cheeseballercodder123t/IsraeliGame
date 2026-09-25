/**
 * One-off cell inspector. Prints what the board is actually painting for a few
 * plots, so a failing digest can be traced to the sampler or to the art.
 *
 * Usage: node tools/visual/inspect-cell.mjs [baseUrl] [x,y] [x,y] ...
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3111";
const wanted = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ["0,0", "4,4", "5,5", "3,3"];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.fill('input[name="name"]', "Cell Inspector");
await page.click("button:has-text('OPEN THE TABLE')");
await page.waitForURL(/\/table\//);
await page.waitForTimeout(1500);

const report = await page.evaluate(async (targets) => {
  const out = [];
  for (const target of targets) {
    const plot = document.querySelector(`button[title^="Plot ${target.replace(",", ", ")}"]`);
    if (!plot) {
      out.push({ target, error: "no plot element" });
      continue;
    }
    const spans = [...plot.querySelectorAll("span")];
    const entry = {
      target,
      title: plot.getAttribute("title"),
      children: spans.length,
      styles: spans.slice(0, 4).map((span) => (span.getAttribute("style") ?? "").slice(0, 220)),
    };
    const ground = spans.find((span) => (span.getAttribute("style") ?? "").includes("data:image"));
    if (!ground) {
      entry.error = "no background art";
      out.push(entry);
      continue;
    }
    const style = ground.getAttribute("style");
    const url = (style.match(/url\("([^"]+)"\)/) ?? [])[1];
    const pos = style.match(/background-position:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/);
    const size = style.match(/background-size:\s*(\d+)px\s+(\d+)px/);
    entry.position = pos ? [Number(pos[1]), Number(pos[2])] : null;
    entry.size = size ? [Number(size[1]), Number(size[2])] : null;
    if (url && pos && size) {
      const image = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
      if (!image) {
        entry.error = "sheet would not load";
      } else {
        const cellPx = size[1] / 4;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(
          Math.abs(Number(pos[1])),
          Math.abs(Number(pos[2])),
          Math.max(1, cellPx),
          Math.max(1, cellPx),
        );
        let opaque = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 40) continue;
          opaque += 1;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        entry.sheet = `${image.width}x${image.height}`;
        entry.opaquePixels = opaque;
        entry.totalPixels = data.length / 4;
        entry.sample = [];
        for (let i = 0; i < 12; i += 1) {
          const at = i * 4;
          entry.sample.push([data[at], data[at + 1], data[at + 2], data[at + 3]]);
        }
        entry.mean =
          opaque === 0
            ? null
            : `#${[r / opaque, g / opaque, b / opaque]
                .map((n) => Math.round(n).toString(16).padStart(2, "0"))
                .join("")}`;
      }
    }
    out.push(entry);
  }
  return out;
}, wanted);

console.log(JSON.stringify(report, null, 2));
await browser.close();
