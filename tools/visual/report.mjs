/**
 * One self contained page with everything worth looking at: every screenshot,
 * every sprite sheet the atlas painted, and the text digests of the pixels.
 * Images are inlined as data URLs so the page works from any path, including
 * the preview tab.
 */

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    background: #17140f;
    color: #d8d0be;
    font: 13px/1.55 "IBM Plex Mono", "DejaVu Sans Mono", monospace;
    margin: 0;
    padding: 28px 32px 96px;
  }
  h1 { font-size: 17px; letter-spacing: 0.22em; text-transform: uppercase; margin: 0 0 4px; }
  h2 {
    font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase;
    border-bottom: 1px solid #3a352b; padding-bottom: 6px; margin: 44px 0 18px; color: #c8b273;
  }
  .meta { color: #8d8778; }
  .findings { list-style: none; margin: 0; padding: 0; }
  .findings li { border-top: 1px solid #2b271f; padding: 5px 0; }
  .findings li b { color: #c8b273; font-weight: normal; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
  .grid.wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  figure { margin: 0; }
  figcaption { color: #8d8778; letter-spacing: 0.1em; margin-bottom: 6px; }
  img { display: block; max-width: 100%; border: 1px solid #3a352b; background: #100e0b; }
  img.sheet {
    image-rendering: pixelated;
    background: #100e0b;
  }
  pre {
    background: #100e0b; border: 1px solid #2b271f; padding: 12px 14px;
    overflow-x: auto; margin: 0 0 18px; font-size: 11px; line-height: 1.18;
  }
  pre.ascii { font-family: "DejaVu Sans Mono", monospace; line-height: 1.05; font-size: 10px; }
  table { border-collapse: collapse; font-size: 12px; }
  td, th { border: 1px solid #2b271f; padding: 3px 9px; text-align: left; font-weight: normal; }
  th { color: #c8b273; }
  nav a { color: #c8b273; text-decoration: none; margin-right: 18px; border-bottom: 1px dotted #6b5f3f; }
`;

const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const bytes = (n) => `${(n / 1024).toFixed(0)} kB`;

/**
 * @param {object} run
 * @param {string} run.base
 * @param {string} run.browser
 * @param {string} run.stamp
 * @param {string[]} run.findings
 * @param {{name: string, jpeg: string, width: number, height: number}[]} run.shots
 * @param {{name: string, url: string, width: number, height: number, paintScale: number}[]} run.sheets
 * @param {Record<string, string[]>} run.digests
 * @param {{title: string, x: number, y: number, w: number, h: number}[]} run.panels
 * @param {string[]} run.fonts
 * @param {string[]} run.palette
 */
export function buildReport(run) {
  const outer = Math.min(3, 1600 / (run.sheets[0]?.width ?? 300));

  const sheetFigures = run.sheets
    .map(
      (sheet) => `
    <figure>
      <figcaption>${esc(sheet.name)} &middot; ${sheet.width}x${sheet.height} px &middot; ${bytes(
        sheet.url.length,
      )} &middot; ${sheet.paintScale}x on the board</figcaption>
      <img class="sheet" src="${sheet.url}" width="${sheet.width * outer}" height="${
        sheet.height * outer
      }" alt="${esc(sheet.name)}" />
    </figure>`,
    )
    .join("\n");

  const shotFigures = run.shots
    .map(
      (shot) => `
    <figure>
      <figcaption>${esc(shot.name)}${
        shot.width ? ` &middot; ${shot.width}${shot.height ? `x${shot.height}` : " wide"}` : ""
      }</figcaption>
      <img src="data:image/jpeg;base64,${shot.jpeg}"${shot.width ? ` width="${shot.width}"` : ""} alt="${esc(
        shot.name,
      )}" />
    </figure>`,
    )
    .join("\n");

  const digests = Object.entries(run.digests)
    .map(
      ([title, lines]) => `
  <h3 id="${esc(title)}">${esc(title)}</h3>
  <pre class="ascii">${esc(lines.join("\n"))}</pre>`,
    )
    .join("\n");

  const panels = run.panels
    .map(
      (panel) =>
        `<tr><td>${esc(panel.title)}</td><td>${panel.x},${panel.y}</td><td>${panel.w}x${panel.h}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Visual pass ${esc(run.stamp)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Visual pass</h1>
<p class="meta">${esc(run.base)} &middot; ${esc(run.browser)} &middot; ${esc(run.stamp)}</p>

<h2 id="findings">Findings</h2>
<ul class="findings">
${
  run.findings.length === 0
    ? "<li>nothing to report</li>"
    : run.findings.map((finding) => `<li>${esc(finding)}</li>`).join("\n")
}
</ul>

<h2 id="sheets">Every sheet the atlas painted</h2>
<p class="meta">Shown at ${outer}x with pixelated sampling, so one screen pixel is one drawn pixel.</p>
<div class="grid">${sheetFigures}</div>

<h2 id="screens">The screens</h2>
<div class="grid wide">${shotFigures}</div>

<h2 id="pixels">The pixels as text</h2>
${digests}

<h2 id="panels">Panels and paint</h2>
<table>
<tr><th>panel</th><th>at</th><th>size</th></tr>
${panels}
</table>
<p class="meta">fonts: ${esc(run.fonts.join(", "))}</p>
<p class="meta">most used colours: ${esc(run.palette.join(" "))}</p>
</body>
</html>
`;
}
