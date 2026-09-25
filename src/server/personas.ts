import {
  BOT_ROSTER,
  CHARTER_LIST,
  MAX_SEATS,
  MIN_SEATS,
  charterOf,
  type Charter,
  type PersonaSeed,
} from "@/domain/constants";
import type { Archetype } from "@/domain/types";

export type { PersonaSeed } from "@/domain/constants";

export { BOT_ROSTER, MAX_SEATS, MIN_SEATS };

/** The charter table, as the lobby reads it. */
export const CHARTER_TABLE: Charter[] = CHARTER_LIST;

export function charter(id: Archetype): Charter {
  return charterOf(id);
}

export function clampSeats(value: number): number {
  if (!Number.isFinite(value)) return MIN_SEATS + 2;
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.round(value)));
}

/**
 * Opponents for a table of `seats` houses. Houses are drawn in roster order
 * and no charter is seated twice while an unused one is still on the bench,
 * so a twelve seat table shows twelve different doctrines.
 */
export function seatOpponents(seats: number, hostArchetype?: Archetype): PersonaSeed[] {
  const wanted = Math.max(0, seats - 1);
  const chosen: PersonaSeed[] = [];
  const charters = new Set<string>();
  if (hostArchetype) charters.add(hostArchetype);

  for (const persona of BOT_ROSTER) {
    if (chosen.length >= wanted) break;
    if (charters.has(persona.archetype)) continue;
    charters.add(persona.archetype);
    chosen.push(persona);
  }
  for (const persona of BOT_ROSTER) {
    if (chosen.length >= wanted) break;
    if (chosen.includes(persona)) continue;
    chosen.push(persona);
  }
  return chosen;
}
