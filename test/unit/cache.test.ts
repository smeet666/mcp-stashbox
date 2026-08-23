/**
 * The in-memory store that spares an instance a second identical question.
 *
 * The clock is fake and pinned to a fixed instant, so the moment an entry
 * expires is stated as an exact number of milliseconds rather than measured.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache } from "../../src/stashbox/cache.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Cache lifetime", () => {
  it("serves a value back for the whole of its lifetime", async () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("a", "one");

    expect(cache.get("a")).toBe("one");

    await vi.advanceTimersByTimeAsync(999);
    expect(cache.get("a")).toBe("one");
  });

  /**
   * The lifetime is how long a value stands, so an entry written at an instant
   * and read a lifetime later is out of date: the boundary belongs to the
   * expiry.
   */
  it("drops a value the instant its lifetime has elapsed", async () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("a", "one");

    await vi.advanceTimersByTimeAsync(1000);
    expect(cache.get("a")).toBeUndefined();
  });

  it("keeps a value gone once its lifetime has passed", async () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("a", "one");

    await vi.advanceTimersByTimeAsync(1001);
    expect(cache.get("a")).toBeUndefined();
  });

  it("gives a rewritten key a lifetime of its own", async () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("a", "one");

    await vi.advanceTimersByTimeAsync(600);
    cache.set("a", "two");

    await vi.advanceTimersByTimeAsync(600);
    expect(cache.get("a")).toBe("two");

    await vi.advanceTimersByTimeAsync(400);
    expect(cache.get("a")).toBeUndefined();
  });

  it("expires each key on its own schedule", async () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("a", "one");

    await vi.advanceTimersByTimeAsync(500);
    cache.set("b", "two");

    await vi.advanceTimersByTimeAsync(500);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("two");
  });

  it("stores nothing when the lifetime is zero", () => {
    const cache = new Cache<string>(0, 10);
    cache.set("a", "one");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("stores nothing over many writes when the lifetime is zero", () => {
    const cache = new Cache<string>(0, 10);
    for (let i = 0; i < 20; i += 1) {
      cache.set(`key-${i}`, `value-${i}`);
    }

    expect(cache.size).toBe(0);
    expect(cache.get("key-7")).toBeUndefined();
  });
});

describe("Cache eviction", () => {
  it("drops the least recently used entry when it is full", () => {
    const cache = new Cache<string>(10_000, 2);
    cache.set("a", "one");
    cache.set("b", "two");
    cache.set("c", "three");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("two");
    expect(cache.get("c")).toBe("three");
  });

  it("counts a read as a use", () => {
    const cache = new Cache<string>(10_000, 2);
    cache.set("a", "one");
    cache.set("b", "two");
    // Reading "a" leaves "b" as the entry nothing has touched for longest.
    cache.get("a");
    cache.set("c", "three");

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("one");
    expect(cache.get("c")).toBe("three");
  });

  it("counts a rewrite as a use", () => {
    const cache = new Cache<string>(10_000, 2);
    cache.set("a", "one");
    cache.set("b", "two");
    cache.set("a", "one again");
    cache.set("c", "three");

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("one again");
  });

  it("keeps the newest entry when it holds a single one", () => {
    const cache = new Cache<string>(10_000, 1);
    cache.set("a", "one");
    cache.set("b", "two");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("two");
    expect(cache.size).toBe(1);
  });

  it("evicts in order of use across a longer run", () => {
    const cache = new Cache<string>(10_000, 3);
    cache.set("a", "one");
    cache.set("b", "two");
    cache.set("c", "three");
    cache.get("a");
    cache.get("b");
    cache.set("d", "four");

    expect(cache.get("c")).toBeUndefined();
    expect(cache.get("a")).toBe("one");
    expect(cache.get("b")).toBe("two");
    expect(cache.get("d")).toBe("four");
  });
});

describe("Cache size", () => {
  it("counts what has been written", () => {
    const cache = new Cache<string>(10_000, 10);
    expect(cache.size).toBe(0);

    cache.set("a", "one");
    expect(cache.size).toBe(1);

    cache.set("b", "two");
    expect(cache.size).toBe(2);
  });

  it("counts a rewritten key once", () => {
    const cache = new Cache<string>(10_000, 10);
    cache.set("a", "one");
    cache.set("a", "two");

    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe("two");
  });

  it("never grows past the number of entries it was given", () => {
    const cache = new Cache<string>(10_000, 3);
    for (let i = 0; i < 20; i += 1) {
      cache.set(`key-${i}`, `value-${i}`);
    }

    expect(cache.size).toBe(3);
  });
});

describe("Cache misses", () => {
  it("returns nothing for a key it was never given", () => {
    const cache = new Cache<string>(10_000, 10);
    cache.set("a", "one");

    expect(cache.get("b")).toBeUndefined();
  });

  it("returns nothing from an empty store", () => {
    expect(new Cache<string>(10_000, 10).get("a")).toBeUndefined();
  });

  it("hands back the value it was given, unchanged", () => {
    const cache = new Cache<{ rows: number[] }>(10_000, 10);
    const value = { rows: [1, 2, 3] };
    cache.set("a", value);

    expect(cache.get("a")).toEqual({ rows: [1, 2, 3] });
  });

  it("holds a value that is falsy without reading it as a miss", () => {
    const cache = new Cache<number>(10_000, 10);
    cache.set("a", 0);

    expect(cache.get("a")).toBe(0);
    expect(cache.size).toBe(1);
  });
});
