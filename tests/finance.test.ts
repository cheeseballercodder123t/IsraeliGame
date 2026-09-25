import { describe, expect, it } from "vitest";
import {
  auditRiskOf,
  buyShellLicense,
  commitArson,
  declareChapter11,
  insurancePayout,
  issueBond,
  issueConvertible,
  repayDebt,
  runDebt,
  runTaxation,
  sellEquity,
  settleAudit,
} from "@/domain/finance";
import { assetValueOf, netWorthOf } from "@/domain/valuation";
import {
  BOND_MAX_LEVERAGE,
  BOND_RATE_PER_TURN,
  DEBT_GRACE_TURNS,
  SHELL_LICENSE_COST,
} from "@/domain/constants";
import type { GameEvent } from "@/domain/types";
import { build, fixedRng, freshState, fund, player, sweepBoard } from "./helpers";

function events(): GameEvent[] {
  return [];
}

/** A house with one working extractor, which is what a lender looks at. */
function solventState() {
  const state = sweepBoard(freshState());
  const tile = state.tiles.find((t) => t.terrain === "DEPOSIT" && t.deposit)!;
  build(state, tile.x, tile.y, "p1", "IRON_MINE");
  return state;
}

describe("the revenue service", () => {
  it("watches offshore money and tips more closely than the shop floor", () => {
    const state = freshState();
    const owner = player(state, "p1");
    const clean = auditRiskOf(owner);

    owner.offshoreCash = 200_000;
    const hidden = auditRiskOf(owner);
    expect(hidden).toBeGreaterThan(clean);

    owner.tips = 2;
    const tipped = auditRiskOf(owner);
    expect(tipped).toBeGreaterThan(hidden);

    owner.shellLicenses += 3;
    expect(auditRiskOf(owner)).toBeLessThan(tipped);
    expect(auditRiskOf(owner)).toBeGreaterThanOrEqual(0.01);

    owner.offshoreCash = 0;
    owner.tips = 0;
    expect(auditRiskOf(owner)).toBeLessThanOrEqual(0.95);
  });

  it("charges tax on what is declared and hides the rest offshore", () => {
    const state = solventState();
    const owner = player(state, "p1");
    fund(state, "p1", 1_000_000);
    const log = events();

    const owed = runTaxation(state, owner, 500_000, log);
    expect(owed).toBeGreaterThan(0);
    expect(owner.cash).toBeLessThan(1_000_000);
    expect(log.some((event) => event.kind === "TAX")).toBe(true);
    // Without a license the money never leaves the building.
    expect(owner.offshoreCash).toBe(0);

    owner.shellLicenses = 1;
    owner.offshorePercent = 1;
    const before = owner.offshoreCash;
    runTaxation(state, owner, 200_000, log);
    expect(owner.offshoreCash).toBeGreaterThan(before);
  });

  it("takes nothing from a house that lost money", () => {
    const state = solventState();
    const owner = player(state, "p1");
    fund(state, "p1", 100_000);
    expect(runTaxation(state, owner, -50_000, events())).toBe(0);
    expect(owner.cash).toBe(100_000);
  });
});

describe("the capital markets", () => {
  it("lends against assets and refuses beyond the leverage limit", () => {
    const state = solventState();
    const owner = player(state, "p1");
    const assets = assetValueOf(state, "p1");
    expect(assets).toBeGreaterThan(0);

    const capacity = assets * BOND_MAX_LEVERAGE;
    const before = owner.cash;
    expect(issueBond(state, owner, capacity * 2, events())).toBe(false);
    expect(owner.cash).toBe(before);

    expect(issueBond(state, owner, capacity * 0.5, events())).toBe(true);
    expect(owner.cash).toBeCloseTo(before + capacity * 0.5, 6);
    expect(owner.debt).toBeCloseTo(capacity * 0.5, 6);
    expect(owner.debtAge).toBe(0);
  });

  it("accrues bond interest every turn", () => {
    const state = solventState();
    const owner = player(state, "p1");
    issueBond(state, owner, assetValueOf(state, "p1") * 0.3, events());
    const principal = owner.debt;

    runDebt(state, owner, events());
    expect(owner.debt).toBeCloseTo(principal * (1 + BOND_RATE_PER_TURN), 6);
    expect(owner.debtAge).toBe(1);

    runDebt(state, owner, events());
    expect(owner.debtAge).toBe(2);
    expect(DEBT_GRACE_TURNS).toBeGreaterThan(2);
  });

  it("clears a house that pays its paper down", () => {
    const state = solventState();
    const owner = player(state, "p1");
    issueBond(state, owner, assetValueOf(state, "p1") * 0.2, events());
    fund(state, "p1", owner.debt * 2);
    const debt = owner.debt;

    expect(repayDebt(owner, debt)).toBeCloseTo(debt, 6);
    expect(owner.debt).toBe(0);
    expect(owner.debtAge).toBe(0);

    issueBond(state, owner, assetValueOf(state, "p1") * 0.2, events());
    fund(state, "p1", 1000);
    const paid = repayDebt(owner, 10_000_000);
    expect(paid).toBe(1000);
    expect(owner.cash).toBe(0);
  });

  it("files a convertible note as a debt that matures later", () => {
    const state = solventState();
    const owner = player(state, "p1");
    const before = owner.cash;
    expect(issueConvertible(state, owner, assetValueOf(state, "p1") * 0.25, events())).toBe(true);
    expect(state.convertibles).toHaveLength(1);
    expect(state.convertibles[0].playerId).toBe("p1");
    expect(owner.cash).toBeGreaterThan(before);
    expect(issueConvertible(state, owner, assetValueOf(state, "p1") * 50, events())).toBe(false);
  });

  it("sells at most half the house", () => {
    const state = solventState();
    const owner = player(state, "p1");
    const worth = netWorthOf(state, "p1");
    const raised = sellEquity(state, owner, 0.3);
    expect(raised).toBeCloseTo(Math.max(0, worth) * 0.3, 6);
    expect(owner.equitySold).toBeCloseTo(0.3, 6);

    sellEquity(state, owner, 0.5);
    expect(owner.equitySold).toBeCloseTo(0.5, 6);
    expect(sellEquity(state, owner, 0.1)).toBe(0);
  });

  it("sells a shell license for cash", () => {
    const state = freshState();
    const owner = player(state, "p1");
    fund(state, "p1", SHELL_LICENSE_COST + 100);
    expect(buyShellLicense(owner)).toBe(true);
    expect(owner.shellLicenses).toBe(1);
    expect(owner.cash).toBeCloseTo(100, 6);
    expect(buyShellLicense(owner)).toBe(false);
  });

  it("buys an inspector's attention off the risk sheet", () => {
    const state = freshState();
    const owner = player(state, "p1");
    fund(state, "p1", 500_000);
    owner.offshoreCash = 400_000;
    const risk = auditRiskOf(owner);
    owner.auditRisk = risk;

    const spent = settleAudit(state, owner, 100_000);
    expect(spent).toBe(100_000);
    expect(owner.auditRisk).toBeLessThan(risk);
    expect(owner.lobbyRelief).toBeGreaterThan(0);
    expect(owner.cash).toBe(400_000);
  });
});

describe("distress", () => {
  it("clears the debt and surrenders the cheapest plant", () => {
    const state = solventState();
    const second = state.tiles.find(
      (t) => t.terrain === "DEPOSIT" && t.deposit && t.ownerId === null,
    )!;
    build(state, second.x, second.y, "p1", "COAL_FACE");
    const owner = player(state, "p1");
    owner.debt = 900_000;
    owner.isBankrupt = true;
    issueConvertible(state, owner, assetValueOf(state, "p1") * 0.1, events());

    const log = events();
    declareChapter11(state, owner, log);

    expect(owner.debt).toBe(0);
    expect(owner.debtAge).toBe(0);
    expect(owner.isBankrupt).toBe(false);
    expect(state.convertibles).toHaveLength(0);
    expect(log.some((event) => event.kind === "CHAPTER_11")).toBe(true);

    const surrendered = state.tiles.filter((t) => t.onTender && t.recipeId === "NONE");
    expect(surrendered.length).toBeGreaterThan(0);
    const mine = state.tiles.filter((t) => t.ownerId === "p1" && t.recipeId !== "NONE");
    expect(mine).toHaveLength(1);
  });

  it("pays a policy once and only to the house that bought it", () => {
    const state = solventState();
    const tile = state.tiles.find((t) => t.ownerId === "p1" && t.recipeId !== "NONE")!;
    state.insurance.push({
      id: "pol-1",
      playerId: "p1",
      tileId: tile.id,
      premium: 20_000,
      payout: 250_000,
      expiresTurn: 9,
    });
    const before = player(state, "p1").cash;
    const log = events();

    expect(insurancePayout(state, tile, log)).toBe(250_000);
    expect(player(state, "p1").cash).toBe(before + 250_000);
    expect(player(state, "p1").insuranceActive).toBe(true);
    expect(state.insurance).toHaveLength(0);
    expect(insurancePayout(state, tile, log)).toBe(0);
  });

  it("burns the plant for the payout and scorches the ground", () => {
    const state = solventState();
    const tile = state.tiles.find((t) => t.ownerId === "p1" && t.recipeId !== "NONE")!;
    const owner = player(state, "p1");
    const before = owner.cash;
    const log = events();

    // An honest adjuster: no audit on this roll.
    commitArson(state, owner, tile, fixedRng(false), log);

    expect(tile.recipeId).toBe("NONE");
    expect(tile.tier).toBe(0);
    expect(tile.scorchedTurns).toBe(2);
    expect(tile.condition).toBe(0);
    expect(owner.cash).toBeGreaterThan(before);
    expect(log.some((event) => event.kind === "ARSON")).toBe(true);
    expect(log.some((event) => event.kind === "SCORCHED_LAND")).toBe(true);
    expect(log.some((event) => event.kind === "AUDIT")).toBe(false);
  });

  it("catches the arsonist when the roll goes against them", () => {
    const state = solventState();
    const tile = state.tiles.find((t) => t.ownerId === "p1" && t.recipeId !== "NONE")!;
    const owner = player(state, "p1");
    const log = events();

    commitArson(state, owner, tile, fixedRng(true), log);
    expect(log.some((event) => event.kind === "AUDIT" && event.caught === true)).toBe(true);
    expect(owner.frozenTurns).toBeGreaterThan(0);
    expect(owner.pr).toBe(0);
  });

  it("refuses to burn a plot the house does not hold", () => {
    const state = solventState();
    const other = state.tiles.find((tile) => tile.ownerId === null && tile.recipeId === "NONE")!;
    const before = player(state, "p1").cash;
    commitArson(state, player(state, "p1"), other, fixedRng(true), events());
    expect(other.recipeId).toBe("NONE");
    expect(player(state, "p1").cash).toBe(before);
  });
});
