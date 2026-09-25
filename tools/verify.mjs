#!/usr/bin/env node
// Browserless end-to-end check.
//
// The visual harness needs a real browser and system libraries, so it cannot
// run everywhere. This walks the same routes over HTTP instead and asserts the
// server rendered real content: the landing page, a table page, and the JSON
// the watching client polls. Point it at a running server with
//   node tools/verify.mjs [baseUrl]
// or SMOKE_BASE_URL. It exits non-zero on the first failure.

const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

let failures = 0;

function check(label, ok, detail = "") {
  const mark = ok ? "ok  " : "FAIL";
  console.log(`${mark} ${label}${detail ? ` ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function get(path) {
  const response = await fetch(`${base}${path}`);
  const text = await response.text();
  return { response, text };
}

async function main() {
  console.log(`verifying ${base}\n`);

  // The front of the envelope renders with the game's own figures.
  const root = await get("/");
  check("GET /", root.response.status === 200, `[${root.response.status}]`);
  check("landing names the game", root.text.includes("Conglomerate") && root.text.includes("Gilded Age"));
  check("landing links into a table", /href="\/table\/[A-Z0-9]+"/.test(root.text));

  // A table code is scraped off the landing so the check needs no fixture.
  const match = root.text.match(/href="\/table\/([A-Z0-9]+)"/);
  if (!match) {
    check("a table page is reachable", false, "(no table code on the landing page)");
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  const code = match[1];

  const table = await get(`/table/${code}`);
  check(`GET /table/${code}`, table.response.status === 200, `[${table.response.status}]`);
  check("table page renders the desk", /Conglomerate|table|lobby|House/i.test(table.text));

  // The heartbeat a watching client polls carries a real revision.
  const summary = await get(`/api/table/${code}/summary`);
  check(`GET /api/table/${code}/summary`, summary.response.status === 200, `[${summary.response.status}]`);
  let body = null;
  try {
    body = JSON.parse(summary.text);
  } catch {
    /* handled below */
  }
  check("summary is valid JSON with ok:true", body?.ok === true);
  check("summary reports a revision", typeof body?.revision === "number");
  check("summary reports the turn", typeof body?.currentTurn === "number");

  const tick = await get("/api/tick");
  check("GET /api/tick health", tick.response.status === 200);

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`verify failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
