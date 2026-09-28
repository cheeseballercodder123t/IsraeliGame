/**
 * The games played on top of the board.
 *
 * Everything the table itself runs on: the paper a house floats when it sells
 * its own stock, the premium a raider pays for the family's shares, the joint
 * funds a pact holds, the price of a slice of the Rag, and the arithmetic the
 * clean air movement builds on. One place, so the engine, the orders desk and
 * the panels all quote the same figure.
 */

// ---------------------------------------------------------------- equity

/** No house is appraised below this, whatever its books say. */
export const MIN_APPRAISAL = 250_000;
/** What a raider pays over the book for the family's own shares. */
export const SHARE_RAID_PREMIUM = 1.5;
/** Holding this much of a rival is control of its board. */
export const CONTROL_SHARE = 0.5;
/** What a controlled board pays its controller each window. */
export const CONTROL_TRIBUTE = 0.12;
/** A tribute never takes more than this much cash in one window. */
export const CONTROL_TRIBUTE_CAP = 2_000_000;
/** Rival boards under control that close the era, on a boards table. */
export const DEFAULT_BOARDS_TO_WIN = 2;

// ---------------------------------------------------------------- pacts

/** How many windows a pact runs before it lapses on its own. */
export const PACT_TERM_TURNS = 8;
/** The joint fund earns this much a window while the pact holds. */
export const PACT_ESCROW_INTEREST = 0.02;
/** Standing and morale a house keeps while the pact holds. */
export const PACT_BOND_PR = 2;
/** What a betrayer loses in standing when they walk off with the fund. */
export const PACT_BETRAYAL_PR = 14;

// ---------------------------------------------------------------- media

/** The Rag is cut into this many points, and every point is a tenth of it. */
export const MEDIA_POINTS = 10;
/** What one point of the Rag costs. */
export const MEDIA_POINT_COST = 400_000;
/** Points that amount to control of the paper. */
export const MEDIA_CONTROL_POINTS = 5;
/** Points of the Rag a house needs before it can place a story at all. */
export const MEDIA_BIAS_MIN_POINTS = 2;
/** What planting a story against a rival costs. */
export const BIAS_PAPER_COST = 250_000;

// ---------------------------------------------------------------- reform

/** Public pressure a window's smoke adds to the clean air movement. */
export const REFORM_PRESSURE_PER_SMOG = 0.06;
/** Pressure at which the movement forces a vote on the table. */
export const REFORM_VOTE_PRESSURE = 100;
/** A carried ordinance doubles every pollution fine on the board. */
export const CLEAN_AIR_FINE_MULTIPLIER = 2;
/** Total particulate on the board that a clean era is read against. */
export const CLEAN_AIR_TARGET = 150;
/** Smoke above this is what the ordinance makes a plant answerable for. */
export const CLEAN_AIR_PLANT_LIMIT = 60;
