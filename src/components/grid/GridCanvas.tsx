"use client";

import { useMemo } from "react";
import {
  BOARD,
  BAND_TIERS,
  PLOT_COUNT,
  RECIPES,
  TERRAIN_BANDS,
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

export interface GridCanvasProps {
  state: GameState;
  selectedTileId: string | null;
  onSelect: (tileId: string) => void;
  highlightPlayerId?: string | null;
}

export function GridCanvas({ state, selectedTileId, onSelect, highlightPlayerId }: GridCanvasProps) {
  const ready = useSpriteAtlas();

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
    <div
      className="relative border border-rule bg-pit"
      style={{ width: BOARD_PX, height: BOARD_PX }}
      role="group"
      aria-label={`Industrial grid, eleven by eleven, ${PLOT_COUNT} plots`}
    >
      {state.tiles.map((tile) => {
        const color = ownerColor(state, tile.ownerId);
        const mine = highlightPlayerId ? tile.ownerId === highlightPlayerId : false;
        const selected = tile.id === selectedTileId;
        const recipe = RECIPES[tile.recipeId];
        const occupied = recipe.id !== "NONE";
        const groundKey = tile.feature === "RIVER" ? "ground_refinery" : `ground_${tile.terrain.toLowerCase()}`;
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
            className="absolute cursor-pointer text-left outline-offset-[-2px]"
            style={{
              left: tile.x * CELL + GAP / 2,
              top: tile.y * CELL + GAP / 2,
              width: ART,
              height: ART,
              boxShadow: selected
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

            <span className="absolute top-[3px] left-[4px] text-[8px] tracking-[0.1em] text-faint">
              {label}
            </span>
            {occupied && tile.condition < 100 ? (
              <span className="tabular absolute top-[3px] right-[4px] text-[8px] text-dim">
                {tile.condition.toFixed(0)}
              </span>
            ) : null}
            <span className="tabular absolute bottom-[3px] left-[4px] text-[8px] text-edge">
              {tile.x},{tile.y}
            </span>
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
  );
}

/** The bands, outermost first, with what each one will take. */
export function ringLegend(): { ring: number; name: string; count: number; tiers: number[] }[] {
  const counts = new Map<number, number>();
  for (let x = 0; x < BOARD; x += 1) {
    for (let y = 0; y < BOARD; y += 1) {
      const ring = Math.min(Math.max(Math.abs(x - 5), Math.abs(y - 5)), 5);
      counts.set(ring, (counts.get(ring) ?? 0) + 1);
    }
  }
  return [...TERRAIN_BANDS]
    .reverse()
    .map((band) => ({
      ring: band.ring,
      name: band.name,
      count: counts.get(band.ring) ?? 0,
      tiers: BAND_TIERS[band.terrain],
    }));
}
