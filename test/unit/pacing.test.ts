/**
 * The pace one instance is asked at: one request at a time, spaced by an
 * interval that widens when the instance pushes back and narrows only once it
 * has answered cleanly for a while.
 *
 * The clock is fake and pinned to a fixed instant, so every wait here is stated
 * as an exact number of milliseconds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, sleep } from "../../src/stashbox/rateLimiter.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The clock reading at the moment `promise` settles, whatever its outcome.
 *
 * Call it before advancing the clock: the reading is taken in the continuation,
 * so it names the instant the promise settled and never the instant the test
 * stopped advancing.
 */
function settlesAt(promise: Promise<unknown>): Promise<number> {
  return promise.then(
    () => Date.now(),
    () => Date.now(),
  );
}

/** A flag flipped when `promise` settles, read at an exact instant on the clock. */
function settledFlag(promise: Promise<unknown>): () => boolean {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return () => settled;
}

describe("RateLimiter spacing", () => {
  it("starts at the interval it was given", () => {
    expect(new RateLimiter({ intervalMs: 1000 }).currentIntervalMs).toBe(1000);
  });

  it("lets the first request through at once", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    const firstAt = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(0);

    expect(await firstAt).toBe(EPOCH.getTime());
  });

  it("spaces the request after it by one interval", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    await limiter.beforeRequest();
    const secondAt = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(1000);

    expect(await secondAt).toBe(EPOCH.getTime() + 1000);
  });

  /**
   * Callers that arrive together are released one at a time. Computing each wait
   * from the last request that went out releases the whole queue at the same
   * instant, which sends several requests at once to a single instance.
   */
  it("holds a queue of requests one interval apart", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    const first = settlesAt(limiter.beforeRequest());
    const second = settlesAt(limiter.beforeRequest());
    const third = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(5000);

    expect(await first).toBe(EPOCH.getTime());
    expect(await second).toBe(EPOCH.getTime() + 1000);
    expect(await third).toBe(EPOCH.getTime() + 2000);
  });

  it("asks for no wait when a full interval has already passed", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    await limiter.beforeRequest();
    await vi.advanceTimersByTimeAsync(4000);

    const nextAt = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(0);

    expect(await nextAt).toBe(EPOCH.getTime() + 4000);
  });

  it("waits the widened interval after a push-back", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    await limiter.beforeRequest();
    limiter.pushBack();

    const nextAt = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(2000);

    expect(await nextAt).toBe(EPOCH.getTime() + 2000);
  });

  /**
   * A clock that jumps backwards makes the previous request look like it happened
   * in the future, and a wait computed from that difference would park the client
   * for as long as the jump. One interval is the longest wait this can produce.
   */
  it("waits no longer than one interval when the clock has jumped backwards", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    await limiter.beforeRequest();
    vi.setSystemTime(new Date(EPOCH.getTime() - 60_000));

    const settled = settledFlag(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(1000);

    expect(settled()).toBe(true);
  });
});

describe("RateLimiter serialisation", () => {
  it("runs one task at a time", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    const order: string[] = [];

    const first = limiter.schedule(async () => {
      order.push("first in");
      await new Promise((resolve) => setTimeout(resolve, 500));
      order.push("first out");
    });
    const second = limiter.schedule(async () => {
      order.push("second in");
      order.push("second out");
    });

    await vi.advanceTimersByTimeAsync(5000);
    await first;
    await second;

    expect(order).toEqual(["first in", "first out", "second in", "second out"]);
  });

  it("hands back what the task returned", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    const result = limiter.schedule(async () => "a value");
    await vi.advanceTimersByTimeAsync(5000);

    expect(await result).toBe("a value");
  });

  it("lets the next task run after one has failed", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    const order: string[] = [];

    const failing = limiter.schedule(async () => {
      order.push("failing");
      throw new Error("the instance refused");
    });
    const held = failing.catch(() => undefined);
    const following = limiter.schedule(async () => {
      order.push("following");
      return "done";
    });

    await vi.advanceTimersByTimeAsync(5000);
    await held;

    expect(await following).toBe("done");
    expect(order).toEqual(["failing", "following"]);
    await expect(failing).rejects.toThrow("the instance refused");
  });
});

describe("RateLimiter widening", () => {
  it("doubles the interval on a push-back", () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(2000);

    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(4000);

    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(8000);
  });

  it("stops at the ceiling it was given", () => {
    const limiter = new RateLimiter({ intervalMs: 1000, maxIntervalMs: 4000 });

    for (let i = 0; i < 10; i += 1) {
      limiter.pushBack();
    }

    expect(limiter.currentIntervalMs).toBe(4000);
  });

  it("stops at sixteen times the base when no ceiling is given", () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    for (let i = 0; i < 10; i += 1) {
      limiter.pushBack();
    }

    expect(limiter.currentIntervalMs).toBe(16_000);
  });

  it("holds a ceiling that is not a multiple of the base", () => {
    const limiter = new RateLimiter({ intervalMs: 1000, maxIntervalMs: 3000 });

    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(2000);

    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(3000);
  });
});

describe("RateLimiter narrowing", () => {
  it("needs three clean answers in a row before halving back", () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(2000);

    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(2000);

    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(2000);

    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(1000);
  });

  it("halves once more after another three clean answers", () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    limiter.pushBack();
    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(4000);

    limiter.succeeded();
    limiter.succeeded();
    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(2000);

    limiter.succeeded();
    limiter.succeeded();
    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(1000);
  });

  it("never narrows below the base interval", () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });

    for (let i = 0; i < 30; i += 1) {
      limiter.succeeded();
    }

    expect(limiter.currentIntervalMs).toBe(1000);
  });

  /**
   * A push-back between clean answers means the run of clean answers ended, so
   * the count of them starts again from the push-back.
   */
  it("starts the run of clean answers again after a push-back", () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    limiter.pushBack();
    limiter.succeeded();
    limiter.succeeded();

    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBe(4000);

    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(4000);

    limiter.succeeded();
    limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(2000);
  });

  it("spaces the request after a narrowing by the narrowed interval", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    limiter.pushBack();
    limiter.succeeded();
    limiter.succeeded();
    limiter.succeeded();

    await limiter.beforeRequest();
    const nextAt = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(1000);

    expect(await nextAt).toBe(EPOCH.getTime() + 1000);
  });
});

describe("sleep", () => {
  it("resolves once exactly that many milliseconds have passed", async () => {
    const at = settlesAt(sleep(250));
    await vi.advanceTimersByTimeAsync(250);

    expect(await at).toBe(EPOCH.getTime() + 250);
  });

  it("resolves without waiting when asked for no time at all", async () => {
    const at = settlesAt(sleep(0));
    await vi.advanceTimersByTimeAsync(0);

    expect(await at).toBe(EPOCH.getTime());
  });
});
