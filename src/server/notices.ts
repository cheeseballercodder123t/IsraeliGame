import { eraNotice, noticeAddress, noticeable, windowNotice } from "@/domain/notices";
import type { GameState } from "@/domain/types";
import { mailFrom, sendMail } from "@/server/mail";
import { present } from "@/server/presence";

/**
 * The desk notices, on the server.
 *
 * A window closes on the tick, and the houses that were not at the table are
 * the ones a notice is for: a director with the tab open has already seen the
 * paper, and mailing them is noise. So the roster of watchers decides it, read
 * at the moment the window closed, and a house whose browser was there gets
 * nothing.
 *
 * All of it is best effort. The notices ride along behind the write that
 * closed the window and are never awaited by the caller, so a table with no
 * key configured, or a provider that is slow, plays exactly the same game it
 * played before the post existed.
 */

/** Which houses at this table have left an address, and were not watching. */
export function absentHouseholds(state: GameState): string[] {
  const watching = new Set(present(state.game.id).map((who) => who.userId));
  return noticeable(state)
    .filter((player) => !watching.has(player.userId))
    .map((player) => player.id);
}

/** Writes to every absent house about the window that just closed. */
export async function sendWindowNotices(
  state: GameState,
  news: { turn: number; headline: string },
): Promise<number> {
  let sent = 0;
  for (const playerId of absentHouseholds(state)) {
    const player = state.players.find((row) => row.id === playerId);
    if (!player) continue;
    const to = noticeAddress(player);
    if (!to) continue;
    const notice = windowNotice(state, playerId, news);
    if (!notice) continue;
    if (await sendMail({ to, from: mailFrom(), subject: notice.subject, text: notice.body })) {
      sent += 1;
    }
  }
  return sent;
}

/**
 * The last letter of an era, which goes to every house that left an address:
 * the era is over whether or not anybody was watching when it ended.
 */
export async function sendEraNotices(
  state: GameState,
  news: { turn: number; headline: string },
): Promise<number> {
  let sent = 0;
  for (const player of noticeable(state)) {
    const to = noticeAddress(player);
    if (!to) continue;
    const notice = eraNotice(state, player.id, news);
    if (!notice) continue;
    if (await sendMail({ to, from: mailFrom(), subject: notice.subject, text: notice.body })) {
      sent += 1;
    }
  }
  return sent;
}
