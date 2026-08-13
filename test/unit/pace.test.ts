/**
 * What is owed to a free public site, and what no caller can take back.
 *
 * These catalogues are read without paying them anything. One request at a
 * time, an interval a configuration may widen and never narrow, and a name
 * carrying an address where a person can be reached. This server publishes its
 * lower layer as a library, so every one of those has to hold on that path too:
 * an option that lets a caller past the floor is the floor not existing.
 */

import { describe, expect, it, vi } from "vitest";

import { MIN_ALLOWED_INTERVAL_MS } from "../../src/config.js";
import { StashboxClient } from "../../src/stashbox/client.js";

/** A transport a caller could supply, which records when each request went out. */
function timed() {
  const at: number[] = [];
  return {
    at,
    transport: {
      request: async () => {
        at.push(Date.now());
        // A shape the reading refuses, so nothing here depends on an answer.
        throw new Error("this test reads the pace and never an answer");
      },
    },
  };
}

describe("the pace a caller cannot take back", () => {
  it("holds when a caller supplies a transport of their own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { at, transport } = timed();
    const client = new StashboxClient({
      keys: { stashdb: "a key this test never sends anywhere" },
      transport,
    });

    const asked = [
      client.searchScenes({ title: "one" }),
      client.searchScenes({ title: "two" }),
      client.searchScenes({ title: "three" }),
    ];
    await vi.advanceTimersByTimeAsync(MIN_ALLOWED_INTERVAL_MS * 4);
    await Promise.all(asked);
    vi.useRealTimers();

    expect(at.length, "three questions reached the catalogue").toBe(3);
    for (let i = 1; i < at.length; i += 1) {
      const apart = (at[i] ?? 0) - (at[i - 1] ?? 0);
      expect(
        apart,
        `two requests to one catalogue were ${apart}ms apart, under the floor`,
      ).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    }
  });

  it("refuses an interval written under the floor, whichever way it is written", () => {
    for (const minIntervalMs of [0, 1, -5, 999]) {
      const client = new StashboxClient({
        keys: { stashdb: "x" },
        config: { minIntervalMs },
      });
      expect(client.pace, `an interval of ${minIntervalMs} was accepted`).toBeGreaterThanOrEqual(
        MIN_ALLOWED_INTERVAL_MS,
      );
    }
  });

  it("refuses a deadline or a count of retries outside what this client reads", () => {
    const client = new StashboxClient({
      keys: { stashdb: "x" },
      config: { timeoutMs: Number.MAX_SAFE_INTEGER, maxRetries: 1000, cacheMaxEntries: -1 },
    });
    // A retry budget nobody bounds turns one question into an afternoon of
    // requests to a site that is already saying no.
    expect(client.bounds.maxRetries).toBeLessThanOrEqual(10);
    expect(client.bounds.timeoutMs).toBeLessThanOrEqual(600_000);
    expect(client.bounds.cacheMaxEntries).toBeGreaterThan(0);
  });
});
