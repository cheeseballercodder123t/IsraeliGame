import { describe, expect, it } from "vitest";
import { secretAccepted } from "@/server/tick";

/**
 * The rule the turn sweep is judged by, pinned.
 *
 * The sweep closes a window while nobody is looking, so it is the one caller
 * that cannot present a session. The rule has to let the cron job in, keep
 * everyone else out, and stay open for a local app that has been armed with
 * nothing at all, which is the cases below.
 */
describe("the turn sweep's secret", () => {
  it("accepts any secret the deployment has been told to hold", () => {
    expect(secretAccepted(["alpha"], "alpha", true)).toBe(true);
    expect(secretAccepted(["alpha", "beta"], "beta", true)).toBe(true);
  });

  it("refuses the wrong secret, and a missing one, in production", () => {
    expect(secretAccepted(["alpha"], "omega", true)).toBe(false);
    expect(secretAccepted(["alpha"], null, true)).toBe(false);
  });

  it("refuses an unconfigured endpoint in production", () => {
    expect(secretAccepted([], null, true)).toBe(false);
  });

  it("leaves an unconfigured endpoint open outside production", () => {
    expect(secretAccepted([], null, false)).toBe(true);
  });
});
