import type { TourStep } from "@/components/tour/Tour";

/**
 * Which walk to run.
 *
 * The full script is eleven stops, which is the right length once and too long
 * every time after that. So a director who has already been around the room
 * gets the reminder instead, and the whole script stays one click away on the
 * card itself. The choice is made here rather than in the engine so it can be
 * tested without a browser.
 */

export type TourMode = "auto" | "full";

export interface Walk {
  /** The stops to run, in order. */
  script: TourStep[];
  /** Whether this is the whole script rather than the reminder. */
  whole: boolean;
}

export function chooseWalk(
  steps: TourStep[],
  recap: TourStep[] | undefined,
  { full, seen }: { full: boolean; seen: boolean },
): Walk {
  if (!full && seen && recap && recap.length > 0) return { script: recap, whole: false };
  return { script: steps, whole: true };
}
