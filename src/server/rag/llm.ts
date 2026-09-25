import type { GameEvent, GameState } from "@/domain/types";
import { scandalWeight } from "./template";

export type RagProvider = "openai" | "anthropic" | "none";

export function ragProvider(): RagProvider {
  const explicit = process.env.RAG_PROVIDER;
  if (explicit === "openai" || explicit === "anthropic") return explicit;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

const SYSTEM_PROMPT = [
  "You are the night desk editor of a sensationalist broadsheet in a gilded industrial age that has just discovered microchips.",
  "You write short, concrete, dryly funny copy. You name names. You quote the numbers.",
  "Rules: no em dashes, no emojis, no bullet lists, no headings, no markdown tables.",
  "Three short paragraphs maximum. Never invent a player name or a figure that is not in the brief.",
].join(" ");

export function buildBrief(state: GameState, events: GameEvent[], turn: number): string {
  const ranked = events
    .map((event) => ({ event, weight: scandalWeight(event) }))
    .filter((entry) => entry.weight > 12)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);

  const lines = ranked.map((entry) => `- ${entry.event.kind}: ${JSON.stringify(entry.event)}`);
  const houses = state.players
    .map((p) => `${p.name} holds ${state.tiles.filter((t) => t.ownerId === p.id).length} plots`)
    .join(", ");

  return [
    `Turn ${turn}. Wind blowing ${state.game.wind.toLowerCase()}.`,
    `Houses: ${houses}`,
    "Events:",
    ...lines,
  ].join("\n");
}

interface LlmResult {
  headline: string;
  body: string;
}

async function callOpenAi(brief: string, key: string): Promise<LlmResult | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Write a headline in capitals on the first line, then the body.\n\n${brief}`,
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) return null;
  const [first, ...rest] = text.split("\n").filter((line) => line.trim().length > 0);
  return { headline: (first ?? "").replace(/^#+\s*/, ""), body: rest.join("\n\n") };
}

async function callAnthropic(brief: string, key: string): Promise<LlmResult | null> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write a headline in capitals on the first line, then the body.\n\n${brief}`,
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { content?: { text?: string }[] };
  const text = payload.content?.map((part) => part.text ?? "").join("").trim();
  if (!text) return null;
  const [first, ...rest] = text.split("\n").filter((line) => line.trim().length > 0);
  return { headline: (first ?? "").replace(/^#+\s*/, ""), body: rest.join("\n\n") };
}

/**
 * Best effort prose. Any failure at all returns null and the caller keeps the
 * deterministic copy, so a missing key or a slow provider never blocks a tick.
 */
export async function generateProse(
  state: GameState,
  events: GameEvent[],
  turn: number,
): Promise<LlmResult | null> {
  const provider = ragProvider();
  if (provider === "none") return null;
  const brief = buildBrief(state, events, turn);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000));
  try {
    const work =
      provider === "anthropic"
        ? callAnthropic(brief, process.env.ANTHROPIC_API_KEY ?? "")
        : callOpenAi(brief, process.env.OPENAI_API_KEY ?? "");
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
