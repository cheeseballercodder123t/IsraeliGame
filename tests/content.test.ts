import { describe, expect, it } from "vitest";
import {
  ALL_RESOURCES,
  ART_PLATES,
  BAND_TIERS,
  BOARD,
  CHARTERS,
  CHARTER_LIST,
  COMMODITIES,
  EVENT_KINDS,
  EVENT_SPECS,
  FAMILY_ORDER,
  PLOT_COUNT,
  RECIPES,
  RECIPE_LIST,
  RESOURCE_ICON,
  RESOURCE_IDS,
  SECTIONS,
  SECTION_TITLE,
  SPRITES,
  SPRITE_SHEETS,
  TENDERS_PER_TURN,
  TRADEABLE,
  WASTE_RESOURCES,
  bandCensus,
  commoditiesOfFamily,
  sectionOf,
} from "@/domain/constants";
import { spriteStyle } from "@/domain/content/sprites";
import { ORDER_SPECS, ORDER_SPEC_LIST } from "@/domain/orders/catalog";

const PLANT_IDS = (Object.keys(RECIPES) as (keyof typeof RECIPES)[]).filter((id) => id !== "NONE");

describe("the commodity board", () => {
  it("carries seventy five commodities", () => {
    expect(RESOURCE_IDS.length).toBe(75);
    expect(ALL_RESOURCES.length).toBe(75);
    expect(Object.keys(COMMODITIES).length).toBe(75);
  });

  it("fills every family the board trades in", () => {
    expect(commoditiesOfFamily("RAW").length).toBe(15);
    expect(commoditiesOfFamily("REFINED").length).toBe(15);
    expect(commoditiesOfFamily("COMPONENT").length).toBe(15);
    expect(commoditiesOfFamily("DEVICE").length).toBe(12);
    expect(commoditiesOfFamily("SYSTEM").length).toBe(9);
    expect(commoditiesOfFamily("CROWN").length).toBe(4);
    expect(commoditiesOfFamily("WASTE").length).toBe(4);
    expect(commoditiesOfFamily("UTILITY").length).toBe(1);
    expect(commoditiesOfFamily("RAW").length + commoditiesOfFamily("REFINED").length).toBe(30);
  });

  it("labels and tints every commodity, and gives each one an order book", () => {
    for (const id of RESOURCE_IDS) {
      const row = COMMODITIES[id];
      expect(row.name.length).toBeGreaterThan(1);
      expect(row.abbr.length).toBeGreaterThan(0);
      expect(row.blurb.length).toBeGreaterThan(10);
      expect(row.tint).toMatch(/^#[0-9a-f]{6}$/);
      const isWaste = row.family === "WASTE";
      expect(TRADEABLE.includes(id)).toBe(!isWaste);
      expect(WASTE_RESOURCES.includes(id)).toBe(isWaste);
    }
    expect(FAMILY_ORDER.length).toBe(8);
  });

  it("draws an icon for every commodity and a plant for every recipe", () => {
    for (const id of RESOURCE_IDS) {
      const icon = RESOURCE_ICON[id];
      expect(SPRITES[icon], `no sprite placement for ${icon}`).toBeTruthy();
      expect(spriteStyle(icon)).toBeTruthy();
    }
    for (const id of PLANT_IDS) {
      const sprite = RECIPES[id].sprite;
      expect(SPRITES[sprite], `no sprite placement for ${sprite}`).toBeTruthy();
    }
  });
});

describe("the plant book", () => {
  it("carries seventy five plants beside the empty recipe", () => {
    expect(PLANT_IDS.length).toBe(75);
    expect(RECIPE_LIST.length).toBeGreaterThanOrEqual(75);
  });

  it("spreads the plants over six tiers, and only deposits carry raw output", () => {
    const byTier: Record<number, number> = {};
    for (const id of PLANT_IDS) {
      const recipe = RECIPES[id];
      byTier[recipe.tier] = (byTier[recipe.tier] ?? 0) + 1;
      expect(recipe.buildCost).toBeGreaterThan(0);
      expect(recipe.baseValue).toBeGreaterThan(0);
      expect(recipe.terrains.length).toBeGreaterThan(0);
      const outputs = Object.keys(recipe.output);
      // Depots, yards and power houses sell an advantage rather than a good.
      const useful = outputs.length > 0 || recipe.buff !== undefined || recipe.power !== 0;
      expect(useful, `${id} makes nothing and does nothing`).toBe(true);
      for (const resource of outputs) {
        expect(COMMODITIES[resource as keyof typeof COMMODITIES]).toBeTruthy();
      }
    }
    expect(byTier).toEqual({ 1: 15, 2: 15, 3: 20, 4: 12, 5: 9, 6: 4 });
  });

  it("charges every extractor a deposit and every plant a band", () => {
    for (const id of PLANT_IDS) {
      const recipe = RECIPES[id];
      if (recipe.deposit) {
        expect(recipe.terrains.includes("DEPOSIT"), `${id} digests a deposit off the rim`).toBe(true);
      }
      for (const terrain of recipe.terrains) {
        const tiers = BAND_TIERS[terrain];
        expect(tiers.includes(recipe.tier), `${id} at tier ${recipe.tier} cannot stand on ${terrain}`).toBe(
          true,
        );
      }
    }
  });
});

describe("the board", () => {
  it("is eleven by eleven with six bands", () => {
    expect(BOARD).toBe(11);
    expect(PLOT_COUNT).toBe(121);
    const census = bandCensus();
    expect(census.map((entry) => entry.count)).toEqual([1, 8, 16, 24, 32, 40]);
    expect(census.reduce((sum, entry) => sum + entry.count, 0)).toBe(121);
  });

  it("puts every tier in a band that will take it", () => {
    const all = Object.values(BAND_TIERS).flat();
    for (let tier = 1; tier <= 6; tier += 1) {
      expect(all.includes(tier), `tier ${tier} has no home`).toBe(true);
    }
  });
});

describe("the order card", () => {
  it("lists sixty seven orders across six categories", () => {
    expect(Object.keys(ORDER_SPECS).length).toBe(67);
    expect(ORDER_SPEC_LIST.length).toBe(67);
    const byCategory: Record<string, number> = {};
    for (const spec of ORDER_SPEC_LIST) {
      byCategory[spec.category] = (byCategory[spec.category] ?? 0) + 1;
      expect(spec.name.length).toBeGreaterThan(1);
      expect(spec.blurb.length).toBeGreaterThan(20);
      expect(typeof spec.handler).toBe("function");
      for (const field of spec.fields) {
        expect(field.label.length).toBeGreaterThan(0);
      }
    }
    expect(byCategory).toEqual({
      PLANNING: 15,
      COMMERCE: 14,
      CAPITAL: 10,
      LABOR: 9,
      POLITICS: 8,
      COVERT: 11,
    });
  });

  it("reserves the last place powers for the laggard", () => {
    const lastResort = ORDER_SPEC_LIST.filter((spec) => spec.lastResort);
    expect(lastResort.length).toBeGreaterThan(0);
    expect(lastResort.every((spec) => spec.category === "COVERT" || spec.category === "POLITICS")).toBe(
      true,
    );
  });
});

describe("the register and the wire", () => {
  it("keeps twenty six charters, each with a distinct name and three perks", () => {
    expect(CHARTER_LIST.length).toBe(26);
    expect(Object.keys(CHARTERS).length).toBe(26);
    const names = new Set<string>();
    for (const charter of CHARTER_LIST) {
      expect(charter.perks.length).toBeGreaterThanOrEqual(3);
      expect(names.has(charter.name)).toBe(false);
      names.add(charter.name);
    }
  });

  it("names only real processes in a charter's yield table", () => {
    for (const charter of CHARTER_LIST) {
      for (const id of Object.keys(charter.modifiers.yieldByRecipe ?? {})) {
        expect(RECIPES[id as keyof typeof RECIPES], `${charter.id} yields from nothing`).toBeTruthy();
        expect(id).not.toBe("NONE");
      }
    }
  });

  it("knows a hundred and seventeen events and files each one under a section", () => {
    expect(EVENT_KINDS.length).toBe(117);
    expect(Object.keys(EVENT_SPECS).length).toBe(117);
    expect(SECTIONS.length).toBe(14);
    expect(Object.keys(SECTION_TITLE).length).toBe(14);
    for (const kind of EVENT_KINDS) {
      const section = sectionOf(kind);
      expect(SECTIONS.includes(section), `${kind} has no section`).toBe(true);
      expect(EVENT_SPECS[kind].wire).toBeTruthy();
    }
  });

  it("opens fifteen lots a window, which the board can supply", () => {
    expect(TENDERS_PER_TURN).toBe(15);
    expect(PLOT_COUNT).toBeGreaterThan(TENDERS_PER_TURN * 4);
  });
});

describe("the art manifest", () => {
  it("points every sheet at a file with room for its cells", () => {
    for (const [name, sheet] of Object.entries(SPRITE_SHEETS)) {
      expect(sheet.file.startsWith("/sprites/"), `${name} has no file`).toBe(true);
      expect(sheet.cols * sheet.rows).toBeGreaterThan(0);
      expect(sheet.px).toBeGreaterThan(0);
    }
  });

  it("fits every placement inside its sheet", () => {
    for (const placement of Object.values(SPRITES)) {
      const sheet = SPRITE_SHEETS[placement.sheet];
      expect(placement.col).toBeLessThan(sheet.cols);
      expect(placement.row).toBeLessThan(sheet.rows);
      expect(placement.px).toBe(sheet.px);
    }
  });

  it("ships baked plates for the seal and the masthead rule", () => {
    expect(Object.keys(ART_PLATES).length).toBeGreaterThanOrEqual(2);
    for (const plate of Object.values(ART_PLATES)) {
      expect(plate.file.startsWith("/sprites/")).toBe(true);
      expect(plate.w).toBeGreaterThan(0);
      expect(plate.h).toBeGreaterThan(0);
      expect(plate.alt.length).toBeGreaterThan(0);
    }
  });

  it("resolves a style block for every sprite it publishes", () => {
    for (const key of Object.keys(SPRITES)) {
      const style = spriteStyle(key, 2);
      expect(style, `${key} has no style`).toBeTruthy();
      expect(style!.backgroundSize).toContain("px");
      expect(style!.imageRendering).toBe("pixelated");
    }
  });
});
