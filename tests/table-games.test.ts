import { describe, expect, it } from "vitest";
import {
  CONTROL_SHARE,
  MEDIA_CONTROL_POINTS,
  MEDIA_POINT_COST,
  PACT_ESCROW_INTEREST,
  PACT_TERM_TURNS,
  REFORM_VOTE_PRESSURE,
  SUPPLY_CONTRACT_MAX_TURNS,
} from "@/domain/constants";
import { channelKey, inChannel, visibleWire } from "@/domain/channels";
import { botChatter, closingGloat, mentioned } from "@/domain/chatter";
import { dealLabel, dealLine, parseDealLine, sealDealOrder } from "@/domain/deals";
import { latestReadBy, markRead, readCount, seenBy } from "@/domain/receipts";
import {
  boardsControlledBy,
  controllerOf,
  familyRemaining,
  floatRemaining,
  holdingsIn,
  recordPurchase,
  runEquity,
  shareLine,
  sharesForMoney,
  sharesHeldBy,
} from "@/domain/equity";
import { applyEra, rankLadder, rankOf, unlockedTiers, type LadderEntry } from "@/domain/ladder";
import {
  canBias,
  mediaFree,
  mediaPoints,
  pointsForMoney,
  ragController,
  recordMediaPurchase,
  runMedia,
} from "@/domain/media";
import { cleanNoticeEmail, eraNotice, noticeable, noticeAddress, windowNotice } from "@/domain/notices";
import { betrayPact, formPact, fundPact, pactBetween, pactsOf, runPacts } from "@/domain/pacts";
import {
  airIsClean,
  boardSmog,
  cleanAirEnacted,
  fineMultiplier,
  reformProgress,
  runReform,
  voteOpen,
} from "@/domain/reform";
import { resolveTurnTick } from "@/domain/tick";
import type { ChatMessage, GameEvent } from "@/domain/types";
import { freshState, fund, hold, player, sweepBoard } from "./helpers";

function events(): GameEvent[] {
  return [];
}

function line(partial: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    playerId: "p1",
    name: "House 1",
    body: "a word",
    turn: 1,
    createdAt: "2026-09-24T00:00:00.000Z",
    channel: null,
    ...partial,
  };
}

// ------------------------------------------------------------------- the wire

describe("the wire's deal grammar", () => {
  it("reads a deal out of a line and leaves ordinary talk alone", () => {
    const deal = parseDealLine("/deal COAL 5 12.50 3");
    expect(deal).toEqual({ resource: "COAL", quantity: 5, price: 12.5, turns: 3 });

    expect(parseDealLine("the floor will not hold at that number")).toBeNull();
    expect(parseDealLine("/deal NOT_A_COMMODITY 5 12.50 3")).toBeNull();
    expect(parseDealLine("/deal COAL 5")).toBeNull();
    expect(parseDealLine("/deal COAL 0 12.50 3")).toBeNull();
    expect(parseDealLine("/deal COAL 5 0 3")).toBeNull();
  });

  it("caps a term at what a supply contract can run", () => {
    const deal = parseDealLine("/deal COAL 5 $9.25 400");
    expect(deal?.turns).toBe(SUPPLY_CONTRACT_MAX_TURNS);
    expect(deal?.price).toBe(9.25);
  });

  it("turns a line into the one press that signs it", () => {
    const deal = parseDealLine(dealLine({ resource: "COAL", quantity: 5, price: 12.5, turns: 3 }))!;
    expect(dealLabel(deal)).toContain("Coal");
    expect(dealLabel(deal)).toContain("12.50");
    const order = sealDealOrder("p2", deal);
    expect(order.type).toBe("SEAL_DEAL");
    if (order.type === "SEAL_DEAL") {
      expect(order.sellerId).toBe("p2");
      expect(order.quantity).toBe(5);
    }
  });
});

describe("receipts on the wire", () => {
  it("keeps one high water mark per house and never moves it back", () => {
    const state = freshState();
    state.messages = [line({ id: "m1" }), line({ id: "m2" }), line({ id: "m3" })];

    state.reads = markRead(state.reads, "p1", "m2", "2026-09-24T00:00:00.000Z");
    expect(latestReadBy(state, "p1")).toBe("m2");
    state.reads = markRead(state.reads, "p1", "m3", "2026-09-24T00:01:00.000Z");
    expect(latestReadBy(state, "p1")).toBe("m3");
    expect(state.reads).toHaveLength(1);
    expect(readCount(state, "m1")).toBe(1);
    expect(seenBy(state, "m3")).toEqual(["House 1"]);
  });

  it("counts nobody as having read a line when nobody has filed a mark", () => {
    const state = freshState();
    state.messages = [line({ id: "m1" })];
    expect(seenBy(state, "m1")).toEqual([]);
  });
});

describe("side lines", () => {
  it("keeps a private room to its pair, and opens it to a tap", () => {
    const state = freshState();
    const key = channelKey("p1", "p2");
    state.messages = [
      line({ id: "open", playerId: "p3", name: "House 3", body: "the room hears this" }),
      line({ id: "private", playerId: "p1", name: "House 1", body: "five at twelve", channel: key }),
    ];

    expect(inChannel(key, "p2")).toBe(true);
    const third = visibleWire(state, "p3").map((entry) => entry.id);
    expect(third).toEqual(["open"]);

    const party = visibleWire(state, "p2").map((entry) => entry.id);
    expect(party).toEqual(["open", "private"]);

    // Night work buys the papers for one window, and the papers are the room.
    state.events = [{ kind: "ESPIONAGE", turn: 1, playerId: "p3", targetId: "p1" }];
    const tapped = visibleWire(state, "p3").map((entry) => entry.id);
    expect(tapped).toEqual(["open", "private"]);
    expect(visibleWire(state, "p3", { taps: false }).map((entry) => entry.id)).toEqual(["open"]);
  });
});

describe("the bench talks", () => {
  it("gives every automated house one line, deterministically", () => {
    const state = freshState();
    for (const row of state.players) row.isBot = true;
    const first = botChatter(state, 1);
    const again = botChatter(state, 1);
    expect(first.map((entry) => entry.id)).toEqual(again.map((entry) => entry.id));
    expect(new Set(first.map((entry) => entry.id)).size).toBe(first.length);
    expect(first.every((entry) => entry.channel === null)).toBe(true);
    expect(first.length).toBeLessThanOrEqual(state.players.length);
  });

  it("answers a house that was named, and gloat only for a bot", () => {
    const state = freshState();
    for (const row of state.players) row.isBot = true;
    state.messages = [line({ id: "called", playerId: "p3", name: "House 3", body: "House 1 will sell" })];
    const answers = botChatter(state, 2).filter((entry) => entry.playerId === "p1");
    expect(answers).toHaveLength(1);

    // Whole words only, so a house called Alpha is not named by Alphaville.
    expect(mentioned("Alpha will sell at that price", "Alpha Beta")).toBe(true);
    expect(mentioned("Alphaville will sell at that price", "Alpha Beta")).toBe(false);

    state.players[0].isBot = false;
    expect(closingGloat(state, "p1")).toBeNull();
    expect(closingGloat(state, "p2")).toBeTruthy();
  });
});

// ------------------------------------------------------------------ the table

describe("the share book", () => {
  it("buys the float at the book and the family at a premium", () => {
    const state = sweepBoard(freshState());
    const target = player(state, "p2");
    target.cash = 0;
    target.equitySold = 0.5;

    const appraisal = 250_000;
    const purchase = sharesForMoney(state, "p1", "p2", appraisal * 0.5);
    expect(purchase.shares).toBeCloseTo(0.5, 6);
    expect(purchase.spent).toBeCloseTo(appraisal * 0.5, 6);
    expect(purchase.fromFamily).toBe(0);

    // Past the float every share comes off the family at half again the book,
    // so the same money buys fewer of them.
    const raid = sharesForMoney(state, "p1", "p2", appraisal * 0.9);
    expect(raid.fromFloat).toBeCloseTo(0.5, 6);
    expect(raid.shares).toBeCloseTo(0.5 + 0.4 / 1.5, 6);
    expect(raid.spent).toBeCloseTo(appraisal * 0.9, 6);
  });

  it("hands a board over once half of it is held", () => {
    const state = sweepBoard(freshState());
    const target = player(state, "p2");
    target.cash = 0;
    target.equitySold = 0.6;
    fund(state, "p1", 1_000_000);

    hold(state, "p1", { type: "BUY_SHARES", playerId: "p2", amount: 1_000_000 });
    const { state: after, events: tape } = resolveTurnTick(state);

    expect(sharesHeldBy(after, "p1", "p2")).toBeCloseTo(1, 6);
    expect(controllerOf(after, "p2")).toBe("p1");
    expect(player(after, "p2").controlledBy).toBe("p1");
    expect(boardsControlledBy(after, "p1")).toEqual(["p2"]);
    expect(tape.some((event) => event.kind === "CONTROL_TAKEN")).toBe(true);
    expect(holdingsIn(after, "p2")).toHaveLength(1);
    expect(shareLine(after, "p2")).toContain("100%");
    expect(floatRemaining(after, "p2")).toBe(0);
    expect(familyRemaining(after, "p2")).toBe(0);
    expect(CONTROL_SHARE).toBe(0.5);
  });

  it("pays the controller a tribute out of the till", () => {
    const state = sweepBoard(freshState());
    const target = player(state, "p2");
    target.cash = 1_000_000;
    target.equitySold = 0.6;
    recordPurchase(
      state,
      "p1",
      "p2",
      { shares: 0.6, spent: 0, fromFloat: 0.6, fromFamily: 0 },
      1,
    );

    const tape = events();
    runEquity(state, 1, tape);
    expect(tape.some((event) => event.kind === "CONTROL_TAKEN")).toBe(true);
    expect(tape.find((event) => event.kind === "SHARES_BOUGHT")?.amount).toBeCloseTo(120_000, 6);
    expect(player(state, "p2").cash).toBeCloseTo(880_000, 6);
    expect(player(state, "p2").controlledBy).toBe("p1");

    // The board is only reorganised once: the next window is a tribute window.
    const next = events();
    runEquity(state, 2, next);
    expect(next.some((event) => event.kind === "CONTROL_TAKEN")).toBe(false);
    expect(next.find((event) => event.kind === "SHARES_BOUGHT")?.amount).toBeCloseTo(105_600, 6);
  });
});

describe("pacts and their fund", () => {
  it("signs, earns interest and splits the fund when the term runs out", () => {
    const state = freshState();
    fund(state, "p1", 1_000_000);
    const pact = formPact(state, "p1", "p2", 1)!;
    expect(pact.expiresTurn).toBe(1 + PACT_TERM_TURNS);
    expect(pactBetween(state, "p2", "p1")).toBe(pact);
    expect(formPact(state, "p1", "p2", 2)).toBe(pact);

    expect(fundPact(state, "p1", "p2", 500_000)).toBe(500_000);
    expect(pact.escrow).toBe(500_000);
    expect(player(state, "p1").cash).toBe(500_000);
    expect(pactsOf(state, "p2")).toHaveLength(1);

    const pr = player(state, "p2").pr;
    runPacts(state, 2, events());
    expect(pact.escrow).toBeCloseTo(500_000 * (1 + PACT_ESCROW_INTEREST), 6);
    expect(player(state, "p1").pr).toBeGreaterThanOrEqual(pr);

    const before = player(state, "p1").cash;
    const tape = events();
    runPacts(state, pact.expiresTurn, tape);
    expect(pact.escrow).toBe(0);
    expect(pact.betrayedTurn).toBe(pact.expiresTurn);
    expect(player(state, "p1").cash).toBeGreaterThan(before);
    expect(pactBetween(state, "p1", "p2")).toBeNull();
    expect(tape.some((event) => event.note === "lapsed")).toBe(true);
  });

  it("empties the fund into the hands of whoever walks off", () => {
    const state = freshState();
    fund(state, "p1", 400_000);
    formPact(state, "p1", "p2", 1);
    fundPact(state, "p1", "p2", 400_000);

    const before = player(state, "p2").cash;
    expect(betrayPact(state, "p2", "p1", 3)).toBe(400_000);
    expect(player(state, "p2").cash - before).toBeCloseTo(400_000, 6);
    expect(pactBetween(state, "p1", "p2")).toBeNull();
    expect(betrayPact(state, "p2", "p1", 4)).toBe(0);
  });
});

describe("the Rag", () => {
  it("sells the paper in ten points and reads control off the book", () => {
    const state = freshState();
    expect(mediaFree(state)).toBe(10);
    const { points, spent } = pointsForMoney(state, MEDIA_POINT_COST * 3);
    expect(points).toBe(3);
    expect(spent).toBe(MEDIA_POINT_COST * 3);

    recordMediaPurchase(state, "p1", MEDIA_POINT_COST > 0 ? 2 : 0, 1);
    recordMediaPurchase(state, "p1", 1, 1);
    expect(mediaPoints(state, "p1")).toBe(3);
    expect(canBias(state, "p1")).toBe(true);
    expect(ragController(state)).toBeNull();

    recordMediaPurchase(state, "p1", MEDIA_CONTROL_POINTS, 1);
    expect(mediaPoints(state, "p1")).toBe(MEDIA_CONTROL_POINTS + 3);
    expect(ragController(state)).toBe("p1");
    expect(mediaFree(state)).toBe(10 - (MEDIA_CONTROL_POINTS + 3));
  });

  it("prints a story against the strongest rival every window", () => {
    const state = freshState();
    recordMediaPurchase(state, "p1", MEDIA_CONTROL_POINTS, 1);
    fund(state, "p3", 50_000_000);

    const tape = events();
    runMedia(state, 1, tape);
    expect(state.scandals).toHaveLength(1);
    expect(state.scandals[0]).toContain("House 3");
    const story = tape.find((event) => event.kind === "PAPER_BIASED");
    expect(story?.targetId).toBe("p3");
    expect(story?.playerId).toBe("p1");
  });
});

describe("the clean air movement", () => {
  it("counts the smoke on the board and carries the ordinance by weight", () => {
    const state = sweepBoard(freshState());
    state.tiles[0].pollution = 90;
    state.tiles[1].pollution = 40;
    expect(boardSmog(state)).toBe(130);

    state.reform.pressure = REFORM_VOTE_PRESSURE;
    expect(voteOpen(state)).toBe(true);
    expect(reformProgress(state)).toBe(1);

    // Two thirds of the table's worth decides the question, not head count.
    fund(state, "p1", 50_000_000);
    state.reform.votes = [
      { playerId: "p1", support: true, turn: 1 },
      { playerId: "p2", support: false, turn: 1 },
    ];
    const tape = events();
    runReform(state, 1, tape);

    expect(cleanAirEnacted(state)).toBe(true);
    expect(state.reform.ordinanceTurn).toBe(1);
    expect(fineMultiplier(state)).toBe(2);
    expect(tape.some((event) => event.kind === "CLEAN_AIR_ACT")).toBe(true);
    expect(airIsClean(state)).toBe(true);

    state.tiles[0].pollution = 400;
    expect(airIsClean(state)).toBe(false);
  });

  it("settles nothing when the movement has not opened the question", () => {
    const state = sweepBoard(freshState());
    state.reform.votes = [{ playerId: "p1", support: true, turn: 1 }];
    const tape = events();
    runReform(state, 1, tape);
    expect(cleanAirEnacted(state)).toBe(false);
    expect(tape.some((event) => event.kind === "CLEAN_AIR_ACT")).toBe(false);

    // And a ballot filed before the movement is loud enough does not count.
    hold(state, "p1", { type: "CLEAN_AIR_VOTE", support: true });
    const { state: after, events: ledger } = resolveTurnTick(state);
    expect(after.reform.ordinanceTurn).toBeNull();
    expect(ledger.some((event) => event.kind === "REFORM_VOTE")).toBe(false);
  });

  it("reads the pressure the smoke is feeding", () => {
    const state = sweepBoard(freshState());
    state.tiles[0].pollution = 100;
    const tape = events();
    runReform(state, 1, tape);
    expect(state.reform.smog).toBe(100);
    expect(state.reform.pressure).toBeCloseTo(6, 6);
    expect(tape.some((event) => event.kind === "REFORM_PRESSURE")).toBe(false);
  });
});

// ------------------------------------------------------------------ the record

describe("the ladder", () => {
  it("pays places rather than money and breaks a tie on the best era", () => {
    const entries: LadderEntry[] = [];
    const ranked = applyEra(
      entries,
      [
        { playerId: "p1", userId: "u1", name: "House 1", placing: 1, value: 4_000_000, houses: 3 },
        { playerId: "p2", userId: "u2", name: "House 2", placing: 2, value: 9_000_000, houses: 3 },
        { playerId: "p3", userId: "u3", name: "House 3", placing: 3, value: 10_000, houses: 3 },
      ],
      "2026-09-24T00:00:00.000Z",
    );

    expect(ranked.map((entry) => entry.userId)).toEqual(["u1", "u2", "u3"]);
    expect(ranked[0].points).toBe(3);
    expect(ranked[1].points).toBe(2);
    expect(ranked[2].points).toBe(1);
    expect(ranked[1].best).toBe(9_000_000);
    expect(rankOf(ranked, "u3")).toBe(3);
    expect(rankOf(ranked, "nobody")).toBeNull();

    const settled = rankLadder([
      { ...ranked[0], points: 10, best: 1 },
      { ...ranked[1], points: 10, best: 500 },
    ]);
    expect(settled[0].userId).toBe("u2");
    expect(unlockedTiers(ranked[0])).toBe(1);
    expect(unlockedTiers(null)).toBe(0);
  });
});

describe("the desk notices", () => {
  it("takes an address that reads as one and refuses the rest", () => {
    expect(cleanNoticeEmail("  director@example.com ")).toBe("director@example.com");
    expect(cleanNoticeEmail("director@example")).toBeNull();
    expect(cleanNoticeEmail("no-at-sign")).toBeNull();
    expect(cleanNoticeEmail("")).toBeNull();
    expect(cleanNoticeEmail(undefined)).toBeNull();
  });

  it("writes to people who left an address, and never to the bench", () => {
    const state = freshState();
    state.players[0].noticeEmail = "one@example.com";
    state.players[1].noticeEmail = "not an address";
    state.players[2].isBot = true;
    state.players[2].noticeEmail = "bot@example.com";

    expect(noticeAddress(player(state, "p1"))).toBe("one@example.com");
    expect(noticeAddress(player(state, "p2"))).toBeNull();
    expect(noticeable(state).map((row) => row.id)).toEqual(["p1"]);
  });

  it("says what the window did and where the book stands", () => {
    const state = freshState();
    state.messages = [line({ id: "m1", turn: 1, playerId: "p1", name: "House 1" })];
    state.seals = [{ playerId: "p1", turn: 1, at: "2026-09-24T00:00:01.000Z" }];
    state.events = [
      { kind: "MILESTONE", turn: 1, playerId: "p1", amount: 10_000_000 },
      { kind: "TURN_END", turn: 1, count: 4 },
    ];
    fund(state, "p2", 500_000);

    const notice = windowNotice(state, "p2", { turn: 1, headline: "COAL GOES UP" })!;
    expect(notice.subject).toContain(state.game.code);
    expect(notice.subject).toContain("window 1");
    expect(notice.body).toContain("COAL GOES UP");
    expect(notice.body).toContain("Filed before the bell: House 1.");
    expect(notice.body).toContain("Your book stands at");
    expect(notice.body).toContain("windows");

    const era = eraNotice(state, "p2", { turn: 1, headline: "THE ERA CLOSES" })!;
    expect(era.subject).toContain("the era closed");
    expect(era.body).toContain("You finished");
    expect(era.body).toContain("THE ERA CLOSES");
  });
});
