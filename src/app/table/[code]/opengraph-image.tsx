import { ImageResponse } from "next/og";
import { winConditionLabel } from "@/domain/endgame";
import { formatMoney } from "@/domain/format";
import { netWorthTable } from "@/domain/valuation";
import { loadGameByCode } from "@/server/game";
import type { GameState } from "@/domain/types";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Conglomerate table, with its code, clock and register";
export const dynamic = "force-dynamic";

const INK = "#ded4c3";
const DIM = "#9c9180";
const FAINT = "#6d6457";
const RULE = "#3a322a";
const BRASS = "#c19a3a";
const RUST = "#a9542a";
const VOID = "#14110d";
const BILE = "#8a9a4a";
const HAZARD = "#d99a1a";

/** Owner pigments, in the order the register reads them. */
const OWNER_COLORS = ["#a9542a", "#c19a3a", "#4a6b82", "#8a9a4a", "#b06a4a", "#3f7a72"];

/** Satori takes side specific rules; the shorthand with a double line is not it. */
const rule = (side: "Top" | "Bottom" | "Left" | "Right", width = 1, color = RULE) => ({
  [`border${side}Width`]: width,
  [`border${side}Style`]: "solid",
  [`border${side}Color`]: color,
});

function clockLine(state: GameState): string {
  if (state.game.mode === "REALTIME") {
    const seconds = Math.round(state.game.tickIntervalHours * 3600);
    return `real time, a window every ${seconds} seconds`;
  }
  return `turn based, a window every ${Math.round(state.game.tickIntervalHours)} hours`;
}

function Card({ code, state }: { code: string; state: GameState | null }) {
  const players = state ? netWorthTable(state).slice(0, 4) : [];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: VOID,
        padding: 46,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: 34,
          height: "100%",
          ...rule("Top"),
          ...rule("Bottom"),
          ...rule("Left"),
          ...rule("Right"),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", ...rule("Bottom") }}>
          <div style={{ display: "flex", ...rule("Bottom", 2, BRASS), paddingBottom: 3 }} />
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 34, color: INK, letterSpacing: 3 }}>
                CONGLOMERATE
              </div>
              <div style={{ display: "flex", fontSize: 16, color: BRASS, letterSpacing: 8, marginTop: 4 }}>
                GILDED AGE
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 15,
                color: FAINT,
                letterSpacing: 4,
                alignItems: "flex-end",
              }}
            >
              ONE TABLE, SEALED WINDOW BY WINDOW
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 26, marginTop: 30 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 15, color: FAINT, letterSpacing: 4 }}>TABLE</div>
            <div style={{ display: "flex", fontSize: 104, color: BRASS, letterSpacing: 10, lineHeight: 1 }}>
              {code}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 8 }}>
            {state ? (
              <>
                <div
                  style={{
                    display: "flex",
                    fontSize: 17,
                    color: state.game.status === "FINISHED" ? RUST : BILE,
                  }}
                >
                  {state.game.status === "FINISHED"
                    ? "the era is closed"
                    : state.game.status === "LOBBY"
                      ? "the table is gathering"
                      : "in play"}
                </div>
                <div style={{ display: "flex", fontSize: 16, color: DIM, marginTop: 4 }}>
                  {clockLine(state)}
                </div>
                <div style={{ display: "flex", fontSize: 16, color: DIM, marginTop: 2 }}>
                  win: {winConditionLabel(state.game.winCondition)}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", fontSize: 17, color: HAZARD }}>
                no table answers to this code
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 30, ...rule("Top"), paddingTop: 20 }}>
          <div style={{ display: "flex", fontSize: 14, color: FAINT, letterSpacing: 4, marginBottom: 12 }}>
            {state ? "THE REGISTER AT THE LAST CLOSE" : "A CODE IS SIX LETTERS"}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {players.map((row, index) => (
              <div
                key={row.playerId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 10,
                  paddingBottom: 10,
                  ...rule("Bottom"),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      width: 22,
                      height: 22,
                      background: OWNER_COLORS[index % OWNER_COLORS.length],
                    }}
                  />
                  <div style={{ display: "flex", fontSize: 26, color: INK }}>{row.name}</div>
                </div>
                <div style={{ display: "flex", fontSize: 24, color: BRASS }}>{formatMoney(row.value)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 18 }}>
          <div style={{ display: "flex", fontSize: 15, color: FAINT }}>
            {state
              ? `seed ${state.game.seed} · turn ${state.game.currentTurn} · ${state.players.length} houses`
              : "the paper, the board and the wire"}
          </div>
          <div style={{ display: "flex", fontSize: 15, color: DIM }}>
            plots, tenders, patents, night work
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function TableShareCard({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const upper = code.toUpperCase();
  const state = await loadGameByCode(upper);
  return new ImageResponse(<Card code={upper} state={state} />, size);
}
