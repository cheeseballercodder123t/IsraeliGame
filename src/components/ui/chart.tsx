"use client";

/**
 * Flat drawings for the desk.
 *
 * The house rule is rules and hairlines rather than fills, so a chart here is
 * one hairline path, a ruled frame, and a dotted line where a floor or a base
 * price actually sits. No gradient, no area, no legend boxes: the panel around
 * it names the figures, and the drawing only has to show the shape.
 *
 * Both drawings are pure functions of a number list, which is what lets the
 * same geometry serve a full price chart and the spark in a register row.
 */

function extent(series: readonly number[], extra: readonly number[] = []): { min: number; max: number } {
  const all = [...series, ...extra].filter((value) => Number.isFinite(value));
  if (all.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

/** The path for a series in a box, oldest value at the left. */
export function seriesPath(
  series: readonly number[],
  width: number,
  height: number,
  extra: readonly number[] = [],
): { path: string; yOf: (value: number) => number } {
  const { min, max } = extent(series, extra);
  const span = max - min || 1;
  const step = series.length > 1 ? width / (series.length - 1) : 0;
  const yOf = (value: number) => height - ((value - min) / span) * height;
  const path = series
    .map((value, index) => `${index === 0 ? "M" : "L"} ${(index * step).toFixed(2)} ${yOf(value).toFixed(2)}`)
    .join(" ");
  return { path, yOf };
}

/**
 * A book's own history. The floor is drawn where it really sits, so a price
 * sitting on the cost of making the good looks like what it is.
 */
export function LineChart({
  series,
  floor,
  tone = "var(--color-brass)",
  label,
  height = 132,
}: {
  series: number[];
  /** A base price or cost floor, drawn dotted and read off the same scale. */
  floor?: number | null;
  tone?: string;
  label: string;
  height?: number;
}) {
  const width = 520;
  const pad = 6;
  const box = height - pad * 2;
  const { path, yOf } = seriesPath(series, width, box, floor === null || floor === undefined ? [] : [floor]);
  const floorY = floor === null || floor === undefined ? null : yOf(floor) + pad;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      style={{ height }}
      role="img"
      aria-label={label}
    >
      <g transform={`translate(0, ${pad})`}>
        <line x1={0} y1={0} x2={width} y2={0} stroke="var(--color-rule)" strokeWidth="1" />
        <line x1={0} y1={box} x2={width} y2={box} stroke="var(--color-rule)" strokeWidth="1" />
        {floorY === null ? null : (
          <line
            x1={0}
            y1={floorY - pad}
            x2={width}
            y2={floorY - pad}
            stroke="var(--color-edge)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        )}
        <path d={path} fill="none" stroke={tone} strokeWidth="1" />
      </g>
    </svg>
  );
}

/**
 * The trend in a row: the same drawing at the size of a figure. A flat line
 * means nothing has moved, which is worth being able to see at a glance.
 */
export function Trend({
  series,
  tone = "var(--color-brass)",
  width = 46,
  height = 11,
}: {
  series: number[];
  tone?: string;
  width?: number;
  height?: number;
}) {
  if (series.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block" style={{ width, height }} aria-hidden>
        <line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke="var(--color-rule)" strokeWidth="1" />
      </svg>
    );
  }
  const { path } = seriesPath(series, width, height - 2);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block" style={{ width, height }} aria-hidden>
      <g transform="translate(0, 1)">
        <path d={path} fill="none" stroke={tone} strokeWidth="1" />
      </g>
    </svg>
  );
}

/** The fraction a series has moved over its own span, for a chip. */
export function seriesChange(series: readonly number[]): number {
  if (series.length < 2) return 0;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === 0) return 0;
  return (last - first) / Math.abs(first);
}
