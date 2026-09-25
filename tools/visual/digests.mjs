/**
 * In page probes for the visual harness. Each one is serialised by Playwright
 * and runs in the browser, so they must be self contained: no imports, no
 * closure over anything outside themselves.
 */

/**
 * Layout and style audit. Reports clipping, the panel map, and any element that
 * breaks the house style: rounded corners, drop shadows, gradients, filters,
 * banned fonts, pure white, purple or neon fills.
 */
export function collectReport() {
  const round = (value) => Math.round(value);
  const panels = [...document.querySelectorAll("section, aside, header")]
    .map((element) => {
      const box = element.getBoundingClientRect();
      const title = element.querySelector("h1, h2, h3");
      return {
        title: title ? title.textContent.trim().slice(0, 48) : "(untitled)",
        w: round(box.width),
        h: round(box.height),
        x: round(box.x),
        y: round(box.y),
      };
    })
    .filter((panel) => panel.w > 0 && panel.h > 0);

  const overflow = [];
  for (const element of document.querySelectorAll("div, main, section, aside, table, p, span")) {
    const box = element.getBoundingClientRect();
    if (box.width < 40 || box.height < 20) continue;
    if (element.scrollWidth - element.clientWidth > 2 && element.clientWidth > 0) {
      const style = getComputedStyle(element);
      if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
      overflow.push(
        `${element.tagName.toLowerCase()} clips ${element.scrollWidth}px into ${element.clientWidth}px [${element.className.toString().slice(0, 60)}]`,
      );
    }
    if (overflow.length >= 8) break;
  }

  const toHsl = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(",").map((n) => Number.parseFloat(n.trim()));
    const [r, g, b] = parts.map((n) => n / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s, l, a: parts[3] ?? 1 };
  };

  const violations = new Set();
  const fonts = new Map();
  const palette = new Map();

  for (const element of document.querySelectorAll("*")) {
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const style = getComputedStyle(element);
    const tag = element.tagName.toLowerCase();

    const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    fonts.set(family, (fonts.get(family) ?? 0) + 1);

    if (style.borderTopLeftRadius !== "0px") {
      violations.add(`${tag} has rounded corners (${style.borderTopLeftRadius})`);
    }
    // An inset ring is the house style: a hairline drawn inside the box.
    if (style.boxShadow && style.boxShadow !== "none" && !style.boxShadow.includes("inset")) {
      violations.add(`${tag} has a drop shadow (${style.boxShadow.slice(0, 44)})`);
    }
    if (style.backgroundImage && style.backgroundImage.includes("gradient")) {
      violations.add(`${tag} paints a gradient`);
    }
    if (style.filter && style.filter !== "none" && /drop-shadow|blur/.test(style.filter)) {
      violations.add(`${tag} has a filter (${style.filter.slice(0, 30)})`);
    }

    for (const [role, color] of [
      ["background", style.backgroundColor],
      ["text", style.color],
      ["border", style.borderTopColor],
    ]) {
      const hsl = toHsl(color);
      if (!hsl || hsl.a === 0) continue;
      const key = color.replace(/\s/g, "");
      palette.set(key, (palette.get(key) ?? 0) + 1);
      if (hsl.h >= 258 && hsl.h <= 330 && hsl.s > 0.18 && hsl.l > 0.15) {
        violations.add(`${tag} paints purple ${role} (${color})`);
      }
      if (hsl.s > 0.75 && hsl.l > 0.72) {
        violations.add(`${tag} paints neon ${role} (${color})`);
      }
      if (role === "background" && hsl.l > 0.97 && hsl.s < 0.05) {
        violations.add(`${tag} paints pure white`);
      }
    }
  }

  return {
    page: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
    },
    panels,
    overflow,
    violations: [...violations].slice(0, 20),
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} x${n}`),
    palette: [...palette.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([color, count]) => `${color} x${count}`),
  };
}

/**
 * What the board actually paints. Reads the ground cell behind every plot, so
 * the six bands can be compared as colours, prints the board as a grid, and
 * draws the plants standing on it as text.
 */
export async function digestBoardArt() {
  const text = [];
  const plots = [...document.querySelectorAll('button[title^="Plot "]')];
  const sheets = new Map();
  const cells = new Map();

  const load = (src) =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });

  const sheetOf = async (url) => {
    if (!sheets.has(url)) sheets.set(url, await load(url));
    return sheets.get(url);
  };

  const styleOf = (element) => {
    const style = element.getAttribute("style") ?? "";
    const url = (style.match(/url\("([^"]+)"\)/) ?? [])[1];
    const pos = style.match(/background-position:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/);
    const box = style.match(/background-size:\s*(\d+)px\s+(\d+)px/);
    if (!url || !pos) return null;
    return { url, left: Number(pos[1]), top: Number(pos[2]), boxed: box ? Number(box[1]) : 0 };
  };

  const cellPixels = async (spec, cellSize) => {
    const image = await sheetOf(spec.url);
    if (!image) return null;
    const scale = spec.boxed > 0 ? Math.max(1, Math.round(spec.boxed / image.width)) : 1;
    const x = Math.round(Math.abs(spec.left) / scale);
    const y = Math.round(Math.abs(spec.top) / scale);
    if (x >= image.width || y >= image.height) return null;
    const size = Math.min(cellSize, image.width - x, image.height - y);
    const key = `${spec.url}|${x},${y},${size}`;
    if (cells.has(key)) return cells.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(x, y, size, size);
    const result = { data, size, key };
    cells.set(key, result);
    return result;
  };

  const meanOf = (cell) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let n = 0;
    for (let i = 0; i < cell.data.length; i += 4) {
      a += cell.data[i + 3];
      if (cell.data[i + 3] < 40) continue;
      r += cell.data[i];
      g += cell.data[i + 1];
      b += cell.data[i + 2];
      n += 1;
    }
    if (n === 0) return { hex: null, coverage: 0 };
    const hex = `#${[r / n, g / n, b / n]
      .map((value) => Math.round(value).toString(16).padStart(2, "0"))
      .join("")}`;
    return { hex, coverage: a / (255 * (cell.data.length / 4)), rgb: [r / n, g / n, b / n] };
  };

  const toHsl = ([r, g, b]) => {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: 0, s, l, max, min, d, rr, gg, bb };
  };

  const letter = (mean) => {
    if (!mean.hex) return " ";
    if (mean.coverage < 0.4) return ".";
    const { rr, gg, bb, max, min, l, d } = toHsl(mean.rgb);
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
      if (max === rr) h = 60 * (((gg - bb) / d) % 6);
      else if (max === gg) h = 60 * ((bb - rr) / d + 2);
      else h = 60 * ((rr - gg) / d + 4);
    }
    if (h < 0) h += 360;
    if (l < 0.16) return "k";
    if (s < 0.12) return l > 0.5 ? "s" : "d";
    if (h < 25 || h >= 335) return "r";
    if (h < 60) return "o";
    if (h < 100) return "y";
    if (h < 175) return "g";
    if (h < 250) return "b";
    return "p";
  };

  // One character per two pixels of a thirty two pixel cell.
  const characters = " .:-=+*#%@";
  const draw = (cell) => {
    const lines = [];
    const step = 2;
    for (let y = 0; y < cell.size; y += step) {
      let row = "";
      for (let x = 0; x < cell.size; x += step) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let dy = 0; dy < step; dy += 1) {
          for (let dx = 0; dx < step; dx += 1) {
            const px = x + dx;
            const py = y + dy;
            if (px >= cell.size || py >= cell.size) continue;
            const i = (py * cell.size + px) * 4;
            r += cell.data[i];
            g += cell.data[i + 1];
            b += cell.data[i + 2];
            a += cell.data[i + 3];
            n += 1;
          }
        }
        if (a / n < 40) {
          row += " ";
          continue;
        }
        const hex = `#${[r / n, g / n, b / n]
          .map((value) => Math.round(value).toString(16).padStart(2, "0"))
          .join("")}`;
        const mean = { hex, coverage: 1, rgb: [r / n, g / n, b / n] };
        const { l, s } = toHsl(mean.rgb);
        const tint = letter(mean);
        const glyph = characters[Math.min(characters.length - 1, Math.floor(l * characters.length))];
        row += s > 0.3 ? tint : glyph;
      }
      lines.push(row);
    }
    return lines;
  };

  const rings = new Map();
  const ringSpots = new Map();
  const grid = Array.from({ length: 11 }, () => Array.from({ length: 11 }, () => "?"));
  const built = new Map();
  const mismatches = [];

  for (const plot of plots) {
    const title = plot.getAttribute("title") ?? "";
    const match = title.match(/Plot (\d+), (\d+)/);
    if (!match) continue;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const ring = Number(plot.dataset.ring ?? Math.max(Math.abs(x - 5), Math.abs(y - 5)));
    const geometryRing = Math.max(Math.abs(x - 5), Math.abs(y - 5));
    if (ring !== geometryRing) mismatches.push(`${x},${y} claims ring ${ring} but sits at ${geometryRing}`);
    const arts = [...plot.querySelectorAll("span[style*='data:image']")];
    const groundSpec = arts[0] ? styleOf(arts[0]) : null;
    if (!groundSpec) {
      grid[y][x] = "x";
      continue;
    }
    const groundCell = await cellPixels(groundSpec, 32);
    if (!groundCell) {
      grid[y][x] = "x";
      continue;
    }
    const mean = meanOf(groundCell);
    grid[y][x] = letter(mean);
    const bucket = rings.get(ring) ?? new Map();
    const key = mean.hex ?? "none";
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
    rings.set(ring, bucket);
    mean.spot = `${x},${y}`;
    mean.title = plot.dataset.feature && plot.dataset.feature !== "OPEN"
      ? `${plot.dataset.feature.toLowerCase()} ${ring}`
      : `${plot.dataset.terrain ? plot.dataset.terrain.toLowerCase() : "open"}`;
    const spots = ringSpots.get(ring) ?? [];
    spots.push(mean);
    ringSpots.set(ring, spots);

    // The second art element is the plant, the smog or the wreck on the plot.
    const named = title.split("·")[1] ? title.split("·")[1].trim() : "";
    const plantName = `${named} [${plot.dataset.recipe ?? "NONE"}]`;
    if (arts[1] && named && named !== "Vacant plot" && !built.has(plantName)) {
      const spec = styleOf(arts[1]);
      const cell = spec ? await cellPixels(spec, 32) : null;
      if (cell) built.set(plantName, cell);
    }
  }

  text.push(`${plots.length} plots read`);
  if (mismatches.length > 0) {
    text.push(`  ring mismatches: ${mismatches.slice(0, 6).join("; ")}`);
  }
  text.push("");
  text.push("bands, as painted:");
  const bandNames = {
    0: "crown",
    1: "campus",
    2: "advanced",
    3: "works",
    4: "refinery",
    5: "deposit",
  };
  for (const ring of [5, 4, 3, 2, 1, 0]) {
    const bucket = rings.get(ring);
    if (!bucket) continue;
    const total = [...bucket.values()].reduce((sum, n) => sum + n, 0);
    const top = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
    text.push(
      `  ring ${ring} ${bandNames[ring].padEnd(8)} ${String(total).padStart(3)} plots, ${top
        .slice(0, 3)
        .map(([hex, n]) => `${hex} x${n}`)
        .join("  ")}`,
    );
    // A band that paints more than one tone is worth knowing about: either the
    // art varies inside the band or the digest is reading the wrong cell.
    if (top.length > 1) {
      for (const [hex] of top.slice(1)) {
        const where = (ringSpots.get(ring) ?? []).filter((spot) => spot.hex === hex);
        const features = [...new Set(where.map((spot) => spot.title))];
        text.push(
          `    also ${hex}: ${where.length} plots, ${features.join(", ")} (${where
            .slice(0, 4)
            .map((spot) => spot.spot)
            .join(" ")})`,
        );
      }
    }
  }
  text.push("");
  text.push("board:");
  for (const row of grid) text.push(`  ${row.join(" ")}`);
  text.push("  legend: r rust  o orange  y yellow  g green  b blue  p purple  k black  s pale  d dark  . sparse  x no art");

  text.push("");
  text.push(`plants standing, drawn from the atlas (${built.size} distinct):`);
  let shown = 0;
  for (const [name, cell] of built) {
    if (shown >= 6) break;
    shown += 1;
    text.push(`  ${name} (${cell.size}px cell, mean ${meanOf(cell).hex ?? "transparent"})`);
    for (const line of draw(cell)) text.push(`    ${line}`);
  }

  return { text };
}

/**
 * Every sheet the atlas compiled, decoded for dimensions and handed back as a
 * data URL so the report can display the art on its own.
 */
export async function collectSheets() {
  const load = (src) =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });

  const found = new Map();
  const scope = window;
  const exposed = scope.__atlasSheets ?? {};
  for (const [name, url] of Object.entries(exposed)) found.set(name, url);

  // Fallback for a page that rendered sheets without leaving them on the
  // window: harvest whichever sheets the board actually painted.
  if (found.size === 0) {
    let index = 0;
    for (const element of document.querySelectorAll("*") ) {
      const match = (element.getAttribute("style") ?? "").match(/url\("(data:image\/png;base64,[^"]+)"\)/);
      if (!match || found.has(`sheet_${index}`)) continue;
      if ([...found.values()].includes(match[1])) continue;
      found.set(`sheet_${index}`, match[1]);
      index += 1;
    }
  }

  const sheets = [];
  for (const [name, url] of found) {
    const image = await load(url);
    sheets.push({
      name,
      url,
      width: image ? image.naturalWidth : 0,
      height: image ? image.naturalHeight : 0,
      // What the board scales the sheet to. Sprites are drawn at whole number
      // multiples so the pixels stay square.
      paintScale: 0,
    });
  }
  sheets.sort((a, b) => a.name.localeCompare(b.name));

  // The board asks for the whole sheet scaled, so the factor is the width it
  // asked for over the sheet's own width. This is the multiplier the player
  // actually sees, and whole numbers are what keeps the pixels square.
  const first = document.querySelector('button[title^="Plot "] span[style*="data:image"]');
  const style = first ? first.getAttribute("style") ?? "" : "";
  const url = (style.match(/url\("([^"]+)"\)/) ?? [])[1];
  const box = style.match(/background-size:\s*(\d+)px\s+(\d+)px/);
  const painted = sheets.find((sheet) => sheet.url === url);
  if (box && painted) {
    const factor = Math.round((Number(box[1]) / painted.width) * 10) / 10;
    for (const sheet of sheets) sheet.paintScale = factor;
  }
  return sheets;
}

/**
 * Pixel art, one character per pixel. Reads the ground under a sample of each
 * ring and the plant standing on it, and draws both as text so the art can be
 * judged without an image.
 */
export async function digestSprites(options = {}) {
  const rings = options.rings ?? [5, 4, 3, 2, 1, 0];
  const plantLimit = options.plants ?? 0;
  const cell = options.cell ?? 32;
  const text = [];

  const load = (src) =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });

  const spec = (element) => {
    const style = element.getAttribute("style") ?? "";
    const url = (style.match(/url\("([^"]+)"\)/) ?? [])[1];
    const pos = style.match(/background-position:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/);
    const box = style.match(/background-size:\s*(\d+)px\s+(\d+)px/);
    if (!url || !pos) return null;
    return { url, left: Number(pos[1]), top: Number(pos[2]), boxed: box ? Number(box[1]) : 0 };
  };

  const read = async (art) => {
    const where = spec(art);
    if (!where) return null;
    const image = await load(where.url);
    if (!image) return null;
    const scale = where.boxed > 0 ? Math.max(1, Math.round(where.boxed / image.width)) : 1;
    const x = Math.round(Math.abs(where.left) / scale);
    const y = Math.round(Math.abs(where.top) / scale);
    const size = Math.min(cell, image.width - x, image.height - y);
    if (size <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    // The buffer, not the ImageData wrapper: indexing the wrapper yields
    // undefined and every pixel then reads as an untinted blur.
    return { data: ctx.getImageData(x, y, size, size).data, size, url: where.url, x, y };
  };

  const tintOf = (r, g, b) => {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { l, s };
  };

  const ramp = " .:-=+*#%@";

  const draw = (image, tone = "hue") => {
    const lines = [];
    for (let y = 0; y < image.size; y += 1) {
      let row = "";
      for (let x = 0; x < image.size; x += 1) {
        const i = (y * image.size + x) * 4;
        const a = image.data[i + 3];
        if (a < 40) {
          row += " ";
          continue;
        }
        const r = image.data[i];
        const g = image.data[i + 1];
        const b = image.data[i + 2];
        const { l, s } = tintOf(r, g, b);
        if (tone === "value") {
          row += ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
          continue;
        }
        let h = 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        if (d !== 0) {
          if (max === r) h = 60 * (((g - b) / d) % 6);
          else if (max === g) h = 60 * ((b - r) / d + 2);
          else h = 60 * ((r - g) / d + 4);
        }
        if (h < 0) h += 360;
        if (s < 0.14) {
          row += l > 0.75 ? "W" : l > 0.5 ? "S" : l > 0.25 ? "d" : "k";
          continue;
        }
        const letter = h < 25 || h >= 335 ? "r" : h < 60 ? "o" : h < 100 ? "y" : h < 175 ? "g" : h < 250 ? "b" : "p";
        row += l > 0.6 ? letter.toUpperCase() : letter;
      }
      lines.push(row);
    }
    return lines;
  };

  const plots = [...document.querySelectorAll('button[title^="Plot "]')];
  for (const ring of rings) {
    const plot = plots.find(
      (candidate) => Number(candidate.dataset.ring) === ring && candidate.dataset.feature === "OPEN",
    );
    if (!plot) continue;
    const arts = [...plot.querySelectorAll("span[style*='data:image']")];
    const image = arts[0] ? await read(arts[0]) : null;
    if (!image) continue;
    text.push(`ground ${plot.dataset.terrain} (ring ${ring}), cell ${image.x},${image.y}, hue:`);
    for (const line of draw(image)) text.push(`  ${line}`);
    text.push("  value:");
    for (const line of draw(image, "value")) text.push(`  ${line}`);
    text.push("");
  }

  if (plantLimit > 0) {
    const seen = new Set();
    for (const plot of plots) {
      const recipe = plot.dataset.recipe;
      if (!recipe || recipe === "NONE" || seen.has(recipe)) continue;
      const arts = [...plot.querySelectorAll("span[style*='data:image']")];
      const image = arts[1] ? await read(arts[1]) : null;
      if (!image) continue;
      seen.add(recipe);
      const title = (plot.getAttribute("title") ?? "").split("·")[1]
        ? (plot.getAttribute("title") ?? "").split("·")[1].trim()
        : recipe;
      // What decides whether a plot reads at board scale is the value gap
      // between the building, the plinth it stands on, and the band beneath it.
      const levelOf = (source, from, to) => {
        if (!source) return null;
        let sum = 0;
        let count = 0;
        for (let y = from; y < to; y += 1) {
          for (let x = 0; x < source.size; x += 1) {
            const i = (y * source.size + x) * 4;
            if (!(source.data[i + 3] >= 40)) continue;
            sum +=
              (0.299 * source.data[i] + 0.587 * source.data[i + 1] + 0.114 * source.data[i + 2]) / 255;
            count += 1;
          }
        }
        return count > 0 ? sum / count : null;
      };
      const structureLevel = levelOf(image, 0, 24);
      const apronLevel = levelOf(image, 24, image.size);
      const ground = arts[0] ? await read(arts[0]) : null;
      const groundLevel = ground ? levelOf(ground, 0, ground.size) : null;
      const show = (value) => (value === null ? "none" : value.toFixed(2));
      text.push(
        `${title} [${recipe}] at ${plot.dataset.ring === "5" ? "deposit" : `ring ${plot.dataset.ring}`}, ` +
          `structure ${show(structureLevel)} over apron ${show(apronLevel)} over ground ${show(groundLevel)} ` +
          `(${
            structureLevel !== null && groundLevel !== null
              ? `${(structureLevel - groundLevel).toFixed(2)} clear of the band`
              : "unmeasured"
          }), hue:`,
      );
      for (const line of draw(image)) text.push(`  ${line}`);
      text.push("  value:");
      for (const line of draw(image, "value")) text.push(`  ${line}`);
      text.push("");
      if (seen.size >= plantLimit) break;
    }
  }

  return { text };
}

/** Every atlas sheet the page is painting, labelled by how the DOM uses it. */
export async function digestAtlas() {
  const text = [];
  const byUrl = new Map();
  const groundUrls = new Set();

  for (const plot of document.querySelectorAll('button[title^="Plot "]')) {
    const arts = [...plot.querySelectorAll("span[style*='data:image']")];
    const url = arts[0] && (arts[0].getAttribute("style") ?? "").match(/url\("([^"]+)"\)/);
    if (url) groundUrls.add(url[1]);
  }

  for (const element of document.querySelectorAll("*")) {
    const match = getComputedStyle(element).backgroundImage.match(/url\("([^"]+)"\)/);
    if (!match || !match[1].startsWith("data:image/png")) continue;
    const entry = byUrl.get(match[1]) ?? { count: 0, ground: 0, roles: 0 };
    entry.count += 1;
    if (groundUrls.has(match[1])) entry.ground += 1;
    const parent = element.parentElement;
    entry.roles = parent && parent.tagName === "BUTTON" ? entry.roles + 1 : entry.roles;
    byUrl.set(match[1], entry);
  }

  const load = (src) =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });

  text.push(`${byUrl.size} distinct sheets painted on this screen`);
  let index = 0;
  for (const [url, entry] of byUrl) {
    index += 1;
    const image = await load(url);
    if (!image) continue;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const histogram = new Map();
    let opaque = 0;
    const bands = { nearBlack: 0, dark: 0, mid: 0, light: 0 };
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      opaque += 1;
      const hex = `#${[data[i], data[i + 1], data[i + 2]]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")}`;
      histogram.set(hex, (histogram.get(hex) ?? 0) + 1);
      const level = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      if (level < 0.16) bands.nearBlack += 1;
      else if (level < 0.3) bands.dark += 1;
      else if (level < 0.65) bands.mid += 1;
      else bands.light += 1;
    }
    const cellsAcross = Math.round(image.width / 32) || Math.round(image.width / 16);
    const cellPx = Math.round(image.width / cellsAcross);
    text.push("");
    text.push(
      `sheet ${index}: ${image.width}x${image.height}, ${cellsAcross} cells of ${cellPx}px, ` +
        `${histogram.size} colours, ${Math.round((opaque / (image.width * image.height)) * 100)}% opaque, ` +
        `${entry.ground} plot grounds, ${entry.count} uses`,
    );
    text.push(
      `  top: ${[...histogram.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([hex, n]) => `${hex}(${n})`)
        .join(" ")}`,
    );
    const percent = (n) => `${Math.round((n / Math.max(1, opaque)) * 100)}%`;
    text.push(
      `  value: near black ${percent(bands.nearBlack)}, dark ${percent(bands.dark)}, mid ${percent(bands.mid)}, light ${percent(bands.light)}`,
    );

    // How much texture each cell carries. A cell painted in one flat tone
    // reads as a hole in the board, so this is the flatness measure.
    const rows = Math.round(image.height / cellPx);
    const cellCounts = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cellsAcross; col += 1) {
        const seenCells = new Set();
        let lit = 0;
        for (let y = 0; y < cellPx; y += 1) {
          for (let x = 0; x < cellPx; x += 1) {
            const px = col * cellPx + x;
            const py = row * cellPx + y;
            const i = (py * image.width + px) * 4;
            if (data[i + 3] < 8) continue;
            lit += 1;
            seenCells.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
          }
        }
        if (lit === 0) continue;
        cellCounts.push(`${col * cellPx},${row * cellPx}:${seenCells.size}`);
      }
    }
    text.push(`  colours per cell: ${cellCounts.join(" ")}`);
  }
  return { text };
}

/**
 * The book, read off the exchange rows. Says whether the floor is holding, how
 * far the widest movers have run, and whether the board's own appetite is
 * visible in the demand column.
 */
export function digestMarket() {
  const rows = [...document.querySelectorAll("tr[data-resource]")].map((row) => ({
    resource: row.dataset.resource,
    price: Number(row.dataset.price),
    base: Number(row.dataset.base),
    supply: Number(row.dataset.supply),
    demand: Number(row.dataset.demand),
  }));
  if (rows.length === 0) return { text: ["no book is on this screen"] };
  const text = [];
  const round = (value) => Math.round(value * 100) / 100;
  let atFloor = 0;
  let below = 0;
  let overBase = 0;
  let supply = 0;
  let demand = 0;
  for (const row of rows) {
    const floor = row.base * 0.45;
    if (row.price < floor - 0.005) below += 1;
    else if (row.price <= floor * 1.02) atFloor += 1;
    if (row.price > row.base) overBase += 1;
    supply += row.supply;
    demand += row.demand;
  }
  text.push(
    `${rows.length} books, ${atFloor} sitting on the cost floor, ${below} under it, ${overBase} above base`,
  );
  text.push(`board appetite ${Math.round(demand)} units against ${Math.round(supply)} offered`);
  const scored = rows
    .map((row) => ({ ...row, wild: (row.price - row.base) / Math.max(row.base, 0.01) }))
    .sort((a, b) => b.wild - a.wild);
  text.push(
    `strongest: ${scored
      .slice(0, 4)
      .map((row) => `${row.resource} ${round(row.price)} on a base of ${round(row.base)}`)
      .join(", ")}`,
  );
  text.push(
    `weakest: ${scored
      .slice(-4)
      .map((row) => `${row.resource} ${round(row.price)} on a base of ${round(row.base)}`)
      .join(", ")}`,
  );
  const wanted = rows
    .map((row) => ({ ...row, pull: row.demand - row.supply }))
    .sort((a, b) => b.pull - a.pull);
  text.push(
    `most wanted: ${wanted
      .slice(0, 4)
      .map((row) => `${row.resource} ${Math.round(row.demand)} against ${Math.round(row.supply)}`)
      .join(", ")}`,
  );
  return { text };
}

/**
 * The front page as text: the masthead, the standing heads, and enough of the
 * copy to tell whether the paper is reporting the window that just closed.
 */
export function digestPaper() {
  const dialog = document.querySelector("[role='dialog']");
  if (!dialog) return { text: [] };
  const text = [];
  const lines = (dialog.innerText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const heads = [...dialog.querySelectorAll("h1, h2, h3, h4")].map((head) =>
    head.textContent.trim().slice(0, 80),
  );
  if (heads.length > 0) {
    text.push(`masthead and heads: ${heads.join(" | ")}`);
  }
  text.push(`front page is ${lines.length} lines and ${dialog.innerText.length} characters`);
  const body = lines.filter((line) => line.length > 40).slice(0, 6);
  for (const line of body) text.push(`  ${line.slice(0, 150)}`);
  const items = dialog.querySelectorAll("li, p").length;
  text.push(`  ${items} blocks of copy, ${dialog.querySelectorAll("svg, img").length} plates`);
  return { text };
}

/**
 * A one line census of what the world is holding, read straight off the plots.
 * Cheap enough to run after every window, which is how the board is watched
 * filling up with smog, stoppages and lots rather than only being looked at
 * cold.
 */
export function countOverlays() {
  const tally = {
    plants: 0,
    smog: 0,
    worst: 0,
    wreck: 0,
    picket: 0,
    scrubber: 0,
    tender: 0,
    worn: 0,
    arts: 0,
    dialogs: 0,
  };
  for (const plot of document.querySelectorAll('button[title^="Plot "]')) {
    const data = plot.dataset;
    const pollution = Number(data.pollution ?? 0);
    if (pollution > 1) tally.smog += 1;
    if (pollution > tally.worst) tally.worst = pollution;
    if (Number(data.scorched ?? 0) > 0) tally.wreck += 1;
    if (data.stalled === "true") tally.picket += 1;
    if (data.scrubber === "true") tally.scrubber += 1;
    if (data.tender === "true") tally.tender += 1;
    if (data.recipe && data.recipe !== "NONE") {
      tally.plants += 1;
      if (Number(data.condition ?? 100) < 60) tally.worn += 1;
    }
  }
  tally.arts = document.querySelectorAll('span[style*="data:image"]').length;
  tally.dialogs = document.querySelectorAll("[role='dialog']").length;
  const line =
    `plants ${tally.plants}, smog ${tally.smog} (worst ${tally.worst}), wrecks ${tally.wreck}, ` +
    `pickets ${tally.picket}, scrubbers ${tally.scrubber}, tenders ${tally.tender}, ` +
    `worn ${tally.worn}, ${tally.arts} sprite elements`;
  return { ...tally, line };
}

/**
 * The overlays the board is actually wearing: how many of each, whether each
 * one stays inside the plot it belongs to, and the sprite itself as text with
 * one character per pixel.
 */
export async function digestOverlays() {
  const CELL_PX = 32;
  const text = [];

  // The census is repeated here rather than imported: a probe is serialised
  // and run inside the page, so it can only call itself.
  const census = {
    plants: 0,
    smog: 0,
    worst: 0,
    wreck: 0,
    picket: 0,
    scrubber: 0,
    tender: 0,
    worn: 0,
  };
  for (const plot of document.querySelectorAll('button[title^="Plot "]')) {
    const data = plot.dataset;
    const pollution = Number(data.pollution ?? 0);
    if (pollution > 1) census.smog += 1;
    if (pollution > census.worst) census.worst = pollution;
    if (Number(data.scorched ?? 0) > 0) census.wreck += 1;
    if (data.stalled === "true") census.picket += 1;
    if (data.scrubber === "true") census.scrubber += 1;
    if (data.tender === "true") census.tender += 1;
    if (data.recipe && data.recipe !== "NONE") census.plants += 1;
    if (Number(data.condition ?? 100) < 60) census.worn += 1;
  }
  text.push(
    `plants ${census.plants}, smog ${census.smog} (worst ${census.worst}), wrecks ${census.wreck}, ` +
      `pickets ${census.picket}, scrubbers ${census.scrubber}, tenders ${census.tender}, ` +
      `worn ${census.worn}, ${document.querySelectorAll('span[style*="data:image"]').length} sprite elements`,
  );
  text.push("");

  const load = (src) =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });

  const whereabouts = (art) => {
    const style = art.getAttribute("style") ?? "";
    const url = (style.match(/url\("([^"]+)"\)/) ?? [])[1];
    const pos = style.match(/background-position:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/);
    const box = style.match(/background-size:\s*(\d+)px\s+(\d+)px/);
    if (!url || !pos || !box) return null;
    return { url, left: Number(pos[1]), top: Number(pos[2]), boxed: Number(box[1]) };
  };

  const readCell = async (art) => {
    const where = whereabouts(art);
    if (!where) return null;
    const image = await load(where.url);
    if (!image) return null;
    // The background is the whole sheet scaled, so the factor is the box over
    // the sheet, and the cell is snapped to the atlas grid from there.
    const factor = Math.max(1, Math.round(where.boxed / image.width));
    const x = Math.floor(Math.abs(where.left) / factor / CELL_PX) * CELL_PX;
    const y = Math.floor(Math.abs(where.top) / factor / CELL_PX) * CELL_PX;
    const size = Math.min(CELL_PX, image.width - x, image.height - y);
    if (size <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const { data } = canvas.getContext("2d").getImageData(x, y, size, size);
    return { data, size, x, y, factor };
  };

  const kinds = new Map();
  const spills = [];
  for (const plot of document.querySelectorAll('button[title^="Plot "]')) {
    const box = plot.getBoundingClientRect();
    for (const overlay of plot.querySelectorAll("[data-overlay]")) {
      const kind = overlay.dataset.overlay;
      const rect = overlay.getBoundingClientRect();
      if (
        rect.left < box.left - 0.5 ||
        rect.top < box.top - 0.5 ||
        rect.right > box.right + 0.5 ||
        rect.bottom > box.bottom + 0.5
      ) {
        spills.push(
          `${kind} on plot ${plot.dataset.ring}/${plot.dataset.terrain} spills to ${Math.round(rect.right - box.right)}px past the right and ${Math.round(rect.bottom - box.bottom)}px past the bottom`,
        );
      }
      const entry = kinds.get(kind) ?? {
        count: 0,
        sample: null,
        places: [],
        width: rect.width,
        height: rect.height,
        plot: box.width,
      };
      entry.count += 1;
      if (!entry.sample) entry.sample = overlay.querySelector('span[style*="data:image"]');
      if (entry.places.length < 3) {
        entry.places.push(`${plot.dataset.ring}/${plot.dataset.terrain}/${plot.dataset.recipe}`);
      }
      kinds.set(kind, entry);
    }
  }

  text.push(
    kinds.size === 0
      ? "no overlay is on the board"
      : [...kinds]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([kind, entry]) => `${kind} ${entry.count} (eg ${entry.places[0]})`)
          .join(", "),
  );
  for (const spill of spills.slice(0, 6)) text.push(`  spills: ${spill}`);
  text.push("");

  for (const [kind, entry] of kinds) {
    const cell = entry.sample ? await readCell(entry.sample) : null;
    if (!cell) {
      text.push(`${kind}: wrapper without art`);
      continue;
    }
    text.push(`${kind}: cell ${cell.x},${cell.y} of a ${cell.size}px sprite at ${cell.factor}x, hue:`);
    let lit = 0;
    const rows = [];
    for (let y = 0; y < cell.size; y += 1) {
      let row = "";
      for (let x = 0; x < cell.size; x += 1) {
        const i = (y * cell.size + x) * 4;
        if (cell.data[i + 3] < 40) {
          row += " ";
          continue;
        }
        lit += 1;
        const r = cell.data[i] / 255;
        const g = cell.data[i + 1] / 255;
        const b = cell.data[i + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        row += l > 0.6 ? "#" : l > 0.35 ? "+" : l > 0.18 ? ":" : ".";
      }
      rows.push(`  ${row}`);
    }
    // Coverage is what decides whether an overlay is visible at all once the
    // plot's opacity is applied: a sprite of lone specks is a no-op.
    text.push(
      `  ${lit} of ${cell.size * cell.size} pixels lit (${Math.round(
        (lit / (cell.size * cell.size)) * 100,
      )}%), the wrapper sits ${Math.round(entry.width)}x${Math.round(entry.height)} in a ${Math.round(entry.plot)}px plot`,
    );
    text.push(...rows);
    text.push("");
  }

  return { text };
}
