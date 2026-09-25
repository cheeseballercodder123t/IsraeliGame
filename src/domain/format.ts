/**
 * Formatting with no dependencies, so the engine, the wire templates and the
 * interface all print the same number the same way.
 */

export function formatMoney(value: number, signed = false): string {
  const sign = value < 0 ? "-" : signed ? "+" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** Money quoted to the cent, for a pit ticket or a price column. */
export function formatPrice(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Prices carry fractions of a cent out of the market pass. Forms step in cents. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatUnits(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatTurns(value: number): string {
  if (value <= 0) return "expired";
  return value === 1 ? "1 turn" : `${value} turns`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function countdown(seconds: number): string {
  if (seconds <= 0) return "window closed";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

/** Ordinal for a turn number in prose, kept away from the currency helpers. */
export function turnLabel(turn: number): string {
  return `Turn ${turn}`;
}
