import type { GameEvent, GameState } from "@/domain/types";
import { generateProse, ragProvider } from "./llm";
import { generateClosingIssue, generateIssue, type NewspaperIssue } from "./template";

export type { NewspaperIssue } from "./template";
export { generateClosingIssue, generateIssue } from "./template";

/** The heading the deterministic writer puts above its market tables. */
const TABLES_HEADING = "### Prices at the close";

/**
 * The deterministic writer always runs. When a provider key is present the
 * LLM copy replaces the headline and the body copy, and the tables are kept
 * from the deterministic issue whichever writer won, so the numbers in the
 * paper are always the numbers the tick produced.
 */
export async function composeIssue(
  state: GameState,
  events: GameEvent[],
  turn: number,
): Promise<NewspaperIssue> {
  const issue = generateIssue(state, events, turn);
  if (ragProvider() === "none") return issue;

  const prose = await generateProse(state, events, turn);
  if (!prose || prose.body.trim().length < 60) return issue;

  const at = issue.contentMarkdown.indexOf(TABLES_HEADING);
  const tables = at >= 0 ? issue.contentMarkdown.slice(at).trim() : "";

  return {
    ...issue,
    headline: prose.headline || issue.headline,
    contentMarkdown: tables ? `${prose.body.trim()}\n\n${tables}` : prose.body.trim(),
  };
}

/**
 * The closing edition is written off the finished ledger and is deliberately
 * not handed to a language model: the ranking it prints is the result of the
 * era, and the paper should not be able to paraphrase a placing.
 */
export async function composeClosingIssue(
  state: GameState,
  turn: number,
): Promise<NewspaperIssue> {
  return generateClosingIssue(state, turn);
}
