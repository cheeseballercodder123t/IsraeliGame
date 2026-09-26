"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD,
  BAND_TIERS,
  PLOT_COUNT,
  RECIPES,
  bandCensus,
  spriteStyle,
} from "@/domain/constants";
import type { CSSProperties } from "react";
import type { GameState, Tile } from "@/domain/types";
import { RECIPE_ABBR, RESOURCE_ABBR } from "@/domain/constants";
import { ownerColor } from "@/lib/labels";
import { sheetUrl, useSpriteAtlas } from "./atlas";

/** Plot pitch in display pixels. Seven rows of these fill a desktop column. */
const CELL = 74;
const ART = 64;
const GAP = CELL - ART;

const BOARD_PX = BOARD * CELL;
/**
 * The drafting gutter. Coordinates are printed along the top and the left of
 * the drawn board, so a plot is named the same way on the screen as it is in
 * the inspector and on the wire.
 */
const AXIS = 20;
const TOTAL_PX = BOARD_PX + AXIS * 2;
/** Length of a corner mark on the drawn frame. */
const MARK = 16;

/**
 * Below this the tile labels stop being legible at their drawn size, so the
 * ones that only annotate a plot are dropped and the plot reads as a map.
 */
const COMPACT_AT = 0.86;
/** Below this even the abbreviation over a plot is noise, so a plot is art alone. */
const BARE_AT = 0.6;

interface ArtProps {
  keyName: string;
  scale: number;
  /** Where the cell's own top left corner sits, which crops a chip out of it. */
  left?: number;
  top?: number;
}

function Art({ keyName, scale, left = 0, top = 0 }: ArtProps) {
  const style = spriteStyle(keyName, scale, sheetUrl);
  if (!style) return null;
  return <span className="absolute" style={{ ...(style as CSSProperties), left, top }} aria-hidden />;
}

function smogOpacity(pollution: number): number {
  return Math.min(0.72, 0.16 + pollution / 90);
}

/** Fallback glyph for a plot whose art could not be painted. */
function Glyph({ tile, color }: { tile: Tile; color: string }) {
  const recipe = RECIPES[tile.recipeId];
  if (recipe.id === "NONE") {
    return (
      <span
        className="absolute top-1/2 left-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2"
        style={{ background: color, opacity: 0.4 }}
        aria-hidden
      />
    );
  }
  const height = 6 + recipe.tier * 4;
  return (
    <span className="absolute inset-x-4 bottom-3" aria-hidden>
      {Array.from({ length: Math.min(4, 1 + Math.floor(recipe.tier / 2)) }, (_, index) => (
        <span
          key={index}
          className="absolute bottom-0"
          style={{
            left: `${index * 34}%`,
            width: 8,
            height: `${height - index * 2}px`,
            background: color,
            opacity: 0.75,
          }}
        />
      ))}
    </span>
  );
}

/** One L shaped mark, so the board is framed the way a drawing is framed. */
function Corner({ x, y, at }: { x: number; y: number; at: "tl" | "tr" | "bl" | "br" }) {
  const brass = "2px solid var(--color-brass)";
  return (
    <span
      className="pointer-events-none absolute"
      style={{
        left: x,
        top: y,
        width: MARK,
        height: MARK,
        borderTop: at === "tl" || at === "tr" ? brass : undefined,
        borderBottom: at === "bl" || at === "br" ? brass : undefined,
        borderLeft: at === "tl" || at === "bl" ? brass : undefined,
        borderRight: at === "tr" || at === "br" ? brass : undefined,
      }}
      aria-hidden
    />
  );
}

export interface GridCanvasProps {
  state: GameState;
  selectedTileId: string | null;
  onSelect: (tileId: string) => void;
  highlightPlayerId?: string | null;
}

export function GridCanvas({ state, selectedTileId, onSelect, highlightPlayerId }: GridCanvasProps) {
  const ready = useSpriteAtlas();
  const holder = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // The board is drawn at one pitch and scaled as a whole, so a laptop that
  // cannot give it the drawn frame still sees all one hundred and twenty one
  // plots instead of a strip of them.
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    // Fit, never crop: a phone gets the whole board at a third size rather
    // than a corner of it at full size.
    const fit = () => {
      const width = element.clientWidth;
      if (width < 1) return;
      const next = Math.min(1, width / TOTAL_PX);
      setScale((current) => (Math.abs(current - next) < 0.005 ? current : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const compact = scale < COMPACT_AT;
  const bare = scale < BARE_AT;
  const selected = state.tiles.find((tile) => tile.id === selectedTileId) ?? null;

  const rails = useMemo(
    () =>
      state.rails.map((rail) => {
        const horizontal = rail.ay === rail.by;
        const left = Math.min(rail.ax, rail.bx) * CELL + ART / 2;
        const top = Math.min(rail.ay, rail.by) * CELL + ART / 2;
        return {
          rail,
          style: {
            left: horizontal ? left + ART : left + ART / 2 - 1,
            top: horizontal ? top + ART / 2 - 1 : top + ART,
            width: horizontal ? CELL - ART : 3,
            height: horizontal ? 3 : CELL - ART,
          } as CSSProperties,
        };
      }),
    [state.rails],
  );

  return (
    <div ref={holder} className="w-full">
      <div className="relative border border-rule bg-void p-1.5">
        <div className="relative" style={{ width: TOTAL_PX * scale, height: TOTAL_PX * scale }}>
          <Corner at="tl" x={AXIS * scale - MARK} y={AXIS * scale - MARK} />
          <Corner at="tr" x={(AXIS + BOARD_PX) * scale} y={AXIS * scale - MARK} />
          <Corner at="bl" x={AXIS * scale - MARK} y={(AXIS + BOARD_PX) * scale} />
          <Corner at="br" x={(AXIS + BOARD_PX) * scale} y={(AXIS + BOARD_PX) * scale} />

          <div
            className="absolute top-0 left-0 bg-pit"
            style={{
              width: TOTAL_PX,
              height: TOTAL_PX,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            role="group"
            aria-label={`Industrial grid, eleven by eleven, ${PLOT_COUNT} plots`}
          >
            {/* Coordinates. The crown jewel is the middle of the frame either way. */}
            {Array.from({ length: BOARD }, (_, column) => (
              <span
                key={`x-${column}`}
                className="tabular absolute -translate-x-1/2 text-[9px] text-faint"
                style={{ left: AXIS + column * CELL + CELL / 2, top: 5 }}
              >
                {column}
              </span>
            ))}
            {Array.from({ length: BOARD }, (_, row) => (
              <span
                key={`y-${row}`}
                className="tabular absolute text-[9px] text-faint"
                style={{ left: 6, top: AXIS + row * CELL + CELL / 2 - 4.5 }}
              >
                {row}
              </span>
            ))}

            <div
              className="absolute"
              style={{ left: AXIS, top: AXIS, width: BOARD_PX, height: BOARD_PX }}
            >
              {/* The crosshair runs the row and column of the plot in hand. */}
              {selected ? (
                <>
                  <span
                    className="pointer-events-none absolute bg-edge/60"
                    style={{
                      left: 0,
                      top: selected.y * CELL + CELL / 2,
                      width: BOARD_PX,
                      height: 1,
                    }}
                    aria-hidden
                  />
                  <span
                    className="pointer-events-none absolute bg-edge/60"
                    style={{
                      left: selected.x * CELL + CELL / 2,
                      top: 0,
                      width: 1,
                      height: BOARD_PX,
                    }}
                    aria-hidden
                  />
                </>
              ) : null}

              {state.tiles.map((tile) => {
                const color = ownerColor(state, tile.ownerId);
                const mine = highlightPlayerId ? tile.ownerId === highlightPlayerId : false;
                const inHand = tile.id === selectedTileId;
                const recipe = RECIPES[tile.recipeId];
                const occupied = recipe.id !== "NONE";
                const groundKey =
                  tile.feature === "RIVER" ? "ground_refinery" : `ground_${tile.terrain.toLowerCase()}`;
                const label = tile.deposit ? RESOURCE_ABBR[tile.deposit] : RECIPE_ABBR[tile.recipeId];

                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => onSelect(tile.id)}
                    title={`Plot ${tile.x}, ${tile.y} · ${recipe.name}`}
                    // The plot's own record, readable by the inspector tools and by
                    // anyone auditing what the board actually painted.
                    data-ring={tile.ring}
                    data-terrain={tile.terrain}
                    data-feature={tile.feature ?? "OPEN"}
                    data-deposit={tile.deposit ?? ""}
                    data-recipe={tile.recipeId}
                    data-owner={tile.ownerId ?? ""}
                    data-condition={Math.round(tile.condition)}
                    data-pollution={Math.round(tile.pollution)}
                    data-scorched={tile.scorchedTurns}
                    data-stalled={tile.stalled ? "true" : "false"}
                    data-scrubber={tile.scrubber ? "true" : "false"}
                    data-tender={tile.onTender ? "true" : "false"}
                    className="plot absolute cursor-pointer text-left"
                    style={{
                      left: tile.x * CELL + GAP / 2,
                      top: tile.y * CELL + GAP / 2,
                      width: ART,
                      height: ART,
                      boxShadow: inHand
                        ? `inset 0 0 0 2px var(--color-ink)`
                        : `inset 0 0 0 1px ${tile.ownerId ? color : "var(--color-rule)"}`,
                    }}
                  >
                    {ready ? (
                      <>
                        <Art keyName={groundKey} scale={2} />
                        {occupied ? <Art keyName={recipe.sprite} scale={2} /> : null}
                      </>
                    ) : (
                      <>
                        <span
                          className="absolute inset-0"
                          style={{ background: "var(--color-plate)" }}
                          aria-hidden
                        />
                        <Glyph tile={tile} color={color} />
                      </>
                    )}

                    {occupied && tile.ownerId ? (
                      <span
                        className="absolute inset-x-0 bottom-0 h-[3px]"
                        style={{ background: color, opacity: mine ? 1 : 0.7 }}
                        aria-hidden
                      />
                    ) : null}

                    {ready && tile.pollution > 1 ? (
                      <span
                        className="absolute inset-0"
                        style={{ opacity: smogOpacity(tile.pollution) }}
                        data-overlay="smog"
                        aria-hidden
                      >
                        <Art keyName="over_smog" scale={2} />
                      </span>
                    ) : null}

                    {ready && tile.scorchedTurns > 0 ? (
                      <span className="absolute inset-0" data-overlay="wreck" aria-hidden>
                        <Art keyName="over_wreck" scale={2} />
                      </span>
                    ) : null}

                    {ready && tile.stalled ? (
                      <span className="absolute inset-0" data-overlay="picket" aria-hidden>
                        <Art keyName="over_picket" scale={2} />
                      </span>
                    ) : null}

                    {ready && tile.scrubber ? (
                      // A chip in the corner, cropped to the scrubber unit itself: the
                      // cell paints it at 12,20 and two pixels to the display pixel.
                      <span
                        className="absolute right-0 bottom-0 overflow-hidden"
                        style={{ width: 16, height: 16 }}
                        data-overlay="scrubber"
                        aria-hidden
                      >
                        <Art keyName="over_scrubber" scale={2} left={-24} top={-40} />
                      </span>
                    ) : null}

                    {ready && tile.onTender ? (
                      <span className="absolute inset-0" data-overlay="tender" aria-hidden>
                        <Art keyName="over_tender" scale={2} />
                      </span>
                    ) : null}

                    {bare ? null : (
                      <span className="absolute top-[3px] left-[4px] text-[8px] tracking-[0.1em] text-faint">
                        {label}
                      </span>
                    )}
                    {!compact && occupied && tile.condition < 100 ? (
                      <span className="tabular absolute top-[3px] right-[4px] text-[8px] text-dim">
                        {tile.condition.toFixed(0)}
                      </span>
                    ) : null}
                    {compact ? null : (
                      <span className="tabular absolute bottom-[3px] left-[4px] text-[8px] text-edge">
                        {tile.x},{tile.y}
                      </span>
                    )}

                    {/* The plot in hand is bracketed, not merely outlined. */}
                    {inHand ? (
                      <>
                        <span
                          className="pointer-events-none absolute top-0 left-0 h-2 w-2 border-t border-l border-brass"
                          aria-hidden
                        />
                        <span
                          className="pointer-events-none absolute top-0 right-0 h-2 w-2 border-t border-r border-brass"
                          aria-hidden
                        />
                        <span
                          className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-brass"
                          aria-hidden
                        />
                        <span
                          className="pointer-events-none absolute right-0 bottom-0 h-2 w-2 border-r border-b border-brass"
                          aria-hidden
                        />
                      </>
                    ) : null}
                  </button>
                );
              })}

              {rails.map(({ rail, style }) => (
                <span
                  key={rail.id}
                  className="pointer-events-none absolute"
                  style={{
                    ...style,
                    background: ownerColor(state, rail.ownerId),
                    opacity: rail.condition < 60 ? 0.55 : 0.9,
                  }}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The bands, outermost first, with what each one will take. */
export function ringLegend(): { ring: number; name: string; count: number; tiers: number[] }[] {
  return [...bandCensus()]
    .reverse()
    .map((band) => ({ ...band, tiers: BAND_TIERS[band.terrain] }));
}
