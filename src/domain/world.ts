import {
  ALL_RESOURCES,
  BOARD,
  BASE_PRICES,
  DEPOSIT_POOL,
  DEPOSIT_RECIPE,
  TENDERS_PER_TURN,
  TRADEABLE,
  modifiersOf,
} from "./constants";
import { defaultWinCondition } from "./endgame";
import { featureAt, ringOf, terrainForRing } from "./grid";
import { Rng, hashSeed } from "./rng";
import type {
  Archetype,
  Game,
  GameMode,
  GameState,
  InventoryRow,
  MarketRow,
  Player,
  RailTrack,
  Resource,
  Tile,
  WindDirection,
  WinCondition,
} from "./types";

export { ALL_RESOURCES } from "./constants";

export interface NewPlayerSpec {
  id: string;
  userId: string;
  name: string;
  archetype: Archetype;
  isBot?: boolean;
  /** Chair count carried on the first seat of a gathering table. */
  lobbySeat?: number | null;
}

export interface NewGameSpec {
  id: string;
  code: string;
  seed: number;
  tickIntervalHours: number;
  nextTickAt: string;
  players: NewPlayerSpec[];
  /** Tables open as LOBBY when humans still have seats to take. Defaults to ACTIVE. */
  status?: Game["status"];
  /** A turn table unless the host asked for real time. */
  mode?: GameMode;
  /** What closes the era, chosen at founding. Defaults to a turn limit. */
  winCondition?: WinCondition;
}

export function makeGameCode(seed: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = seed >>> 0;
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length) + 7;
  }
  return out;
}

/**
 * What a seed actually lays down, cheap enough to print on a lobby card.
 *
 * The wind, the deposit draw and the opening plots are the first three things
 * the board generator does with a seed, so replaying those three draws names
 * the country a table will be played on without building it. Two tables with
 * the same fingerprint open on the same map.
 */
export interface BoardFingerprint {
  wind: WindDirection;
  /** The rim deposits in the order the generator lays them down. */
  deposits: Resource[];
  /** Where each opening extractor stands, seat by seat. */
  holdings: { x: number; y: number }[];
}

export function boardFingerprint(seed: number, seats = 4): BoardFingerprint {
  const rng = new Rng(hashSeed(`board:${seed}`));
  const wind = rng.pick(["NORTH", "SOUTH", "EAST", "WEST"] as WindDirection[]);
  const deposits = rng.shuffle(DEPOSIT_POOL);
  const rim: { x: number; y: number }[] = [];
  for (let x = 0; x < BOARD; x += 1) {
    for (let y = 0; y < BOARD; y += 1) {
      if (terrainForRing(ringOf(x, y)) === "DEPOSIT") rim.push({ x, y });
    }
  }
  const holdings = rng.shuffle(rim).slice(0, Math.max(1, seats));
  return { wind, deposits: deposits.slice(0, 8), holdings };
}

/** A house at the table. Charters set cash, standing and morale. */
export function newPlayer(
  spec: {
    id: string;
    gameId: string;
    userId: string;
    name: string;
    archetype: Archetype;
    isBot: boolean;
    lobbySeat?: number | null;
  },
  startingTurn = 1,
): Player {
  const mods = modifiersOf(spec.archetype);
  return {
    id: spec.id,
    gameId: spec.gameId,
    userId: spec.userId,
    name: spec.name,
    archetype: spec.archetype,
    isBot: spec.isBot,
    cash: mods.startingCash,
    offshoreCash: 0,
    debt: 0,
    debtAge: 0,
    auditRisk: 0.05,
    tips: 0,
    lobbyRelief: 0,
    pr: mods.startingPr,
    morale: mods.startMorale,
    baseMorale: mods.startMorale,
    isBankrupt: false,
    frozenTurns: 0,
    bidsFrozen: 0,
    defectPenalty: 0,
    offshorePercent: 0,
    insuranceActive: false,
    valuationBonus: 0,
    strikeImmunityTurn: startingTurn - 1,
    lobbySeat: spec.lobbySeat ?? null,
    pizzaPending: 0,
    companyTown: false,
    shellLicenses: mods.shellLicenses,
    equitySold: 0,
    wageScale: 1,
    safetyProgram: false,
    apprenticeshipTurns: 0,
    apprenticeshipBonus: 0,
    strikeBreakers: 0,
    unionContractUntil: 0,
    lastWageTurn: 0,
    lockout: false,
    milestonesPassed: [],
  };
}

function emptyInventory(playerId: string): InventoryRow[] {
  return ALL_RESOURCES.map((resource) => ({ playerId, resource, quantity: 0 }));
}

export function createGameState(spec: NewGameSpec): GameState {
  const rng = new Rng(hashSeed(`board:${spec.seed}`));

  const game: Game = {
    id: spec.id,
    code: spec.code,
    status: spec.status ?? "ACTIVE",
    mode: spec.mode ?? "TURN",
    currentTurn: 1,
    tickIntervalHours: spec.tickIntervalHours,
    nextTickAt: spec.nextTickAt,
    wind: rng.pick(["NORTH", "SOUTH", "EAST", "WEST"] as WindDirection[]),
    seed: spec.seed,
    gridLoad: 0,
    powerTariff: 1,
    lastLeaderId: null,
    revision: 0,
    winCondition: spec.winCondition ?? defaultWinCondition(),
    lastSealAt: null,
    holdsUsed: 0,
  };

  const deposits = rng.shuffle(DEPOSIT_POOL);
  const tiles: Tile[] = [];
  let depositCursor = 0;

  for (let x = 0; x < BOARD; x += 1) {
    for (let y = 0; y < BOARD; y += 1) {
      const ring = ringOf(x, y);
      const terrain = terrainForRing(ring);
      const deposit = terrain === "DEPOSIT" ? (deposits[depositCursor++] ?? null) : null;
      tiles.push({
        id: `tile-${x}-${y}`,
        gameId: spec.id,
        x,
        y,
        ring,
        terrain,
        feature: featureAt(x, y),
        deposit,
        ownerId: null,
        recipeId: "NONE",
        tier: 0,
        labor: "DOMESTIC_UNION",
        condition: 100,
        pollution: 0,
        autoRepair: false,
        scrubber: false,
        defenseEscrow: 0,
        onTender: false,
        scorchedTurns: 0,
        stalled: false,
        lastDefectRate: 0,
        lastOutputValue: 0,
        lastIdle: null,
      });
    }
  }

  const players: Player[] = spec.players.map((p) =>
    newPlayer({
      id: p.id,
      gameId: spec.id,
      userId: p.userId,
      name: p.name,
      archetype: p.archetype,
      isBot: p.isBot ?? false,
      lobbySeat: p.lobbySeat ?? null,
    }),
  );

  const inventory: InventoryRow[] = players.flatMap((p) => emptyInventory(p.id));

  // Every founder opens with one working extractor so turn one has a ledger.
  const rim = rng.shuffle(tiles.filter((t) => t.terrain === "DEPOSIT"));
  players.forEach((player, index) => {
    const plot = rim[index];
    if (!plot) return;
    plot.ownerId = player.id;
    plot.recipeId = plot.deposit ? (DEPOSIT_RECIPE[plot.deposit] ?? "NONE") : "NONE";
    plot.tier = 1;
    plot.condition = 100;
  });

  const market: MarketRow[] = TRADEABLE.map((resource: Resource) => ({
    resource,
    price: BASE_PRICES[resource],
    basePrice: BASE_PRICES[resource],
    supply: 0,
    demand: 0,
    volume: 0,
  }));

  const tenderPool = rng.shuffle(tiles.filter((t) => t.ownerId === null));
  tenderPool.slice(0, TENDERS_PER_TURN).forEach((t) => {
    t.onTender = true;
  });

  const rails: RailTrack[] = [];

  return {
    game,
    players,
    tiles,
    rails,
    inventory,
    market,
    history: market.map((row) => ({ turn: 1, resource: row.resource, price: row.price })),
    shorts: [],
    futures: [],
    supplies: [],
    offers: [],
    lots: [],
    patents: [],
    insurance: [],
    cartels: [],
    tariffs: [],
    injunctions: [],
    municipal: [],
    convertibles: [],
    events: [],
    queue: [],
    seals: [],
    messages: [],
    scandals: [],
  };
}
