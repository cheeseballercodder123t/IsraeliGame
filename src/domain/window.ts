/**
 * Reading the window clock.
 *
 * A window is either long enough to be read in hours or short enough that the
 * seconds matter, and the strip has to say which without knowing what mode it
 * was handed. These helpers keep that arithmetic out of the component, so the
 * ring, the paper and a test all read the same number.
 */
import { clock, countdown } from "./format";

/** Windows up to this length are read as a clock. Longer ones read as hours. */
export const SHORT_WINDOW_SECONDS = 3600;

/** How much of a window is spent, from 0 to 1. */
export function windowFraction(remaining: number, windowSeconds: number): number {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remaining / windowSeconds));
}

/** The readout: minutes and seconds for a short window, hours for a long one. */
export function windowClock(remaining: number, windowSeconds: number): string {
  const short = windowSeconds <= SHORT_WINDOW_SECONDS;
  if (remaining <= 0) return short ? "0:00" : "closed";
  return short ? clock(remaining) : countdown(remaining);
}

export type WindowPressure = "calm" | "late" | "imminent";

/** How loud the window should be about itself, off the fraction spent. */
export function windowPressure(remaining: number, windowSeconds: number): WindowPressure {
  const spent = windowFraction(remaining, windowSeconds);
  if (spent >= 0.9) return "imminent";
  if (spent >= 0.75) return "late";
  return "calm";
}

/** The fraction of the window a real time table would say is left. */
export function windowSecondsOf(tickIntervalHours: number): number {
  return Math.max(1, Math.round(tickIntervalHours * 3600));
}
