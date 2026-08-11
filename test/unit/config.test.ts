import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LOG_LEVELS,
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  loadConfig,
} from "../../src/config.js";
import { INSTANCES } from "../../src/stashbox/instances.js";

/**
 * Every call passes an explicit environment object, so the machine running the
 * suite cannot decide what a default is.
 */
const EMPTY: NodeJS.ProcessEnv = {};

/** The configuration a caller gets when the environment says nothing. */
function defaults() {
  return loadConfig(EMPTY);
}

/** Collect what a call writes to stderr. */
function captureStderr(run: () => void): string {
  const written: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  run();
  return written.join("");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadConfig keys", () => {
  it("reads the key of each instance from its own variable", () => {
    const config = loadConfig({
      STASHBOX_STASHDB_KEY: "key-stashdb",
      STASHBOX_TPDB_KEY: "key-tpdb",
      STASHBOX_FANSDB_KEY: "key-fansdb",
      STASHBOX_PMV_KEY: "key-pmv",
      STASHBOX_JAVSTASH_KEY: "key-javstash",
    });
    expect(config.keys).toEqual({
      stashdb: "key-stashdb",
      tpdb: "key-tpdb",
      fansdb: "key-fansdb",
      pmv: "key-pmv",
      javstash: "key-javstash",
    });
  });

  it("reads the key of every instance the registry declares", () => {
    for (const spec of INSTANCES) {
      const config = loadConfig({ [spec.envVar]: `key-for-${spec.id}` });
      expect(config.keys[spec.id]).toBe(`key-for-${spec.id}`);
    }
  });

  it("leaves an instance unconfigured when its variable is unset", () => {
    // An instance with no key is named as absent further up. That naming needs
    // the absence to survive here rather than becoming an empty string.
    const config = loadConfig({ STASHBOX_STASHDB_KEY: "key-stashdb" });
    expect(config.keys.stashdb).toBe("key-stashdb");
    expect(config.keys.tpdb).toBeUndefined();
    expect(config.keys.fansdb).toBeUndefined();
    expect(config.keys.pmv).toBeUndefined();
    expect(config.keys.javstash).toBeUndefined();
  });

  it("configures nothing when no key variable is set", () => {
    expect(Object.values(defaults().keys).filter((value) => value !== undefined)).toEqual([]);
  });

  it("treats a blank key as no key at all", () => {
    // A blank variable would otherwise send an empty ApiKey header and make an
    // instance that cannot be asked look like an instance that refused.
    const config = loadConfig({ STASHBOX_FANSDB_KEY: "", STASHBOX_PMV_KEY: "   " });
    expect(config.keys.fansdb).toBeUndefined();
    expect(config.keys.pmv).toBeUndefined();
  });

  it("trims the whitespace around a key", () => {
    // A key pasted into a shell profile carries a trailing newline often enough
    // that keeping it would send a header the instance rejects.
    expect(loadConfig({ STASHBOX_STASHDB_KEY: "  key-stashdb\n" }).keys.stashdb).toBe(
      "key-stashdb",
    );
  });
});

describe("loadConfig pacing", () => {
  it("spaces requests by one second when nothing is configured", () => {
    expect(MIN_ALLOWED_INTERVAL_MS).toBe(1000);
    expect(defaults().minIntervalMs).toBe(MIN_ALLOWED_INTERVAL_MS);
  });

  it("accepts a spacing at the floor", () => {
    expect(loadConfig({ SB_MIN_INTERVAL_MS: String(MIN_ALLOWED_INTERVAL_MS) }).minIntervalMs).toBe(
      MIN_ALLOWED_INTERVAL_MS,
    );
  });

  it("accepts a spacing wider than the floor", () => {
    expect(loadConfig({ SB_MIN_INTERVAL_MS: "2500" }).minIntervalMs).toBe(2500);
  });

  it("accepts a spacing at the ceiling", () => {
    expect(loadConfig({ SB_MIN_INTERVAL_MS: String(MAX_ALLOWED_INTERVAL_MS) }).minIntervalMs).toBe(
      MAX_ALLOWED_INTERVAL_MS,
    );
  });

  it("refuses a spacing under the floor and keeps the default", () => {
    // These instances are donation-funded and publish no limit of their own,
    // so the floor is the one setting configuration cannot move downward.
    for (const raw of ["999", "500", "1", "0", "-1000"]) {
      expect(loadConfig({ SB_MIN_INTERVAL_MS: raw }).minIntervalMs).toBe(defaults().minIntervalMs);
      expect(loadConfig({ SB_MIN_INTERVAL_MS: raw }).minIntervalMs).toBeGreaterThanOrEqual(
        MIN_ALLOWED_INTERVAL_MS,
      );
    }
  });

  it("refuses a spacing above the ceiling and keeps the default", () => {
    const config = loadConfig({ SB_MIN_INTERVAL_MS: String(MAX_ALLOWED_INTERVAL_MS + 1) });
    expect(config.minIntervalMs).toBe(defaults().minIntervalMs);
    // Silently clamping would answer with the ceiling and hide that the value
    // was refused; the default standing is what makes the refusal visible.
    expect(config.minIntervalMs).not.toBe(MAX_ALLOWED_INTERVAL_MS);
  });

  it("refuses a spacing that is not a number and keeps the default", () => {
    for (const raw of ["soon", "", "1e3ms", "1,000", "NaN", "Infinity", "1000ms"]) {
      expect(loadConfig({ SB_MIN_INTERVAL_MS: raw }).minIntervalMs).toBe(defaults().minIntervalMs);
    }
  });

  it("names the variable it refused on stderr", () => {
    const written = captureStderr(() => loadConfig({ SB_MIN_INTERVAL_MS: "10" }));
    expect(written).toContain("SB_MIN_INTERVAL_MS");
  });

  it("writes nothing to stderr when every value is readable", () => {
    const written = captureStderr(() => loadConfig({ SB_MIN_INTERVAL_MS: "3000" }));
    expect(written).toBe("");
  });
});

describe("loadConfig numbers", () => {
  it("reads a timeout, a retry count and cache settings", () => {
    const config = loadConfig({
      SB_TIMEOUT_MS: "12000",
      SB_MAX_RETRIES: "4",
      SB_CACHE_TTL_MS: "60000",
      SB_CACHE_MAX_ENTRIES: "250",
    });
    expect(config.timeoutMs).toBe(12_000);
    expect(config.maxRetries).toBe(4);
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.cacheMaxEntries).toBe(250);
  });

  it("carries a usable default for every number", () => {
    const config = defaults();
    expect(config.timeoutMs).toBeGreaterThan(0);
    expect(config.maxRetries).toBeGreaterThanOrEqual(0);
    expect(config.cacheTtlMs).toBeGreaterThanOrEqual(0);
    expect(config.cacheMaxEntries).toBeGreaterThan(0);
  });

  it("keeps the default when a number cannot be read", () => {
    const config = loadConfig({
      SB_TIMEOUT_MS: "soon",
      SB_MAX_RETRIES: "twice",
      SB_CACHE_TTL_MS: "a while",
      SB_CACHE_MAX_ENTRIES: "many",
    });
    expect(config.timeoutMs).toBe(defaults().timeoutMs);
    expect(config.maxRetries).toBe(defaults().maxRetries);
    expect(config.cacheTtlMs).toBe(defaults().cacheTtlMs);
    expect(config.cacheMaxEntries).toBe(defaults().cacheMaxEntries);
  });

  it("keeps the default when a number is negative", () => {
    const config = loadConfig({
      SB_TIMEOUT_MS: "-1",
      SB_MAX_RETRIES: "-2",
      SB_CACHE_TTL_MS: "-3",
      SB_CACHE_MAX_ENTRIES: "-4",
    });
    expect(config.timeoutMs).toBe(defaults().timeoutMs);
    expect(config.maxRetries).toBe(defaults().maxRetries);
    expect(config.cacheTtlMs).toBe(defaults().cacheTtlMs);
    expect(config.cacheMaxEntries).toBe(defaults().cacheMaxEntries);
  });

  it("reads a cache lifetime of zero as the value it is", () => {
    // Zero is how a caller turns the cache off, so it has to survive the read
    // rather than fall back to the default lifetime.
    expect(loadConfig({ SB_CACHE_TTL_MS: "0" }).cacheTtlMs).toBe(0);
  });

  it("reads a retry count of zero as the value it is", () => {
    expect(loadConfig({ SB_MAX_RETRIES: "0" }).maxRetries).toBe(0);
  });

  it("reads one variable independently of another that was refused", () => {
    const config = loadConfig({ SB_TIMEOUT_MS: "soon", SB_MAX_RETRIES: "2" });
    expect(config.timeoutMs).toBe(defaults().timeoutMs);
    expect(config.maxRetries).toBe(2);
  });
});

describe("loadConfig user agent", () => {
  it("names the project and a place to reach a person", () => {
    const agent = defaults().userAgent;
    expect(agent).toContain("mcp-stashbox");
    expect(agent).toMatch(/https?:\/\/\S+|\S+@\S+\.\S+/);
  });

  it("prefixes a caller's agent to the default", () => {
    // The project identifier and the contact address travel whatever the caller
    // sets, which is what lets an instance's operator find someone to write to.
    const config = loadConfig({ SB_USER_AGENT: "catalogue-bot/3" });
    expect(config.userAgent.startsWith("catalogue-bot/3 ")).toBe(true);
    expect(config.userAgent.endsWith(defaults().userAgent)).toBe(true);
  });

  it("keeps the default whole when a caller names itself", () => {
    const config = loadConfig({ SB_USER_AGENT: "catalogue-bot/3" });
    expect(config.userAgent).toContain("mcp-stashbox");
    expect(config.userAgent).toMatch(/https?:\/\/\S+|\S+@\S+\.\S+/);
    expect(config.userAgent.length).toBeGreaterThan(defaults().userAgent.length);
  });

  it("keeps the default alone when the caller's agent is blank", () => {
    expect(loadConfig({ SB_USER_AGENT: "" }).userAgent).toBe(defaults().userAgent);
    expect(loadConfig({ SB_USER_AGENT: "   " }).userAgent).toBe(defaults().userAgent);
  });
});

describe("loadConfig log level", () => {
  it("reports errors and stays quiet otherwise when nothing is configured", () => {
    expect(defaults().logLevel).toBe("error");
  });

  it("reads each level the module publishes", () => {
    for (const level of LOG_LEVELS) {
      expect(loadConfig({ SB_LOG_LEVEL: level }).logLevel).toBe(level);
    }
  });

  it("falls back on a level it does not know", () => {
    for (const raw of ["loud", "verbose", "warn", "", "trace"]) {
      expect(loadConfig({ SB_LOG_LEVEL: raw }).logLevel).toBe("error");
    }
  });
});
