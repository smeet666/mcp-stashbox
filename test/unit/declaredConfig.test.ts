/**
 * What the shipped files announce about configuration, held to what the code
 * reads.
 *
 * `server.json` is what the official registry publishes and what an installer
 * shows an operator before they type a value, and the README is what they read
 * afterwards. A number announced there that the code does not use sends someone
 * to configure a server they believe they have configured, and a value listed
 * there that the code does not accept is a rule announced and never applied:
 * the setting falls back to the default, and the operator has no way to know.
 *
 * Nothing here is written from memory. Every expected value is read from
 * `loadConfig` on an empty environment, so this suite tracks the code rather
 * than a note somebody kept up to date.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LOG_LEVELS,
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  loadConfig,
} from "../../src/config.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (name: string) => readFileSync(`${root}${name}`, "utf8");

/** The settings a server with nothing set is running on. */
const standing = loadConfig({});

/** Every environment variable `server.json` declares, with what it says about it. */
function declaredInRegistry(): Map<string, string> {
  const manifest = JSON.parse(read("server.json")) as unknown;
  const said = new Map<string, string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value === null || typeof value !== "object") {
      return;
    }
    const object = value as Record<string, unknown>;
    if (typeof object.name === "string" && typeof object.description === "string") {
      said.set(object.name, object.description);
    }
    for (const item of Object.values(object)) {
      walk(item);
    }
  };
  walk(manifest);
  return said;
}

/** The number a sentence announces as a default, or nothing where it announces none. */
function announcedDefault(said: string): number | undefined {
  // The sentence may qualify the word before it reaches the number, as a floor
  // that doubles as the default does, so nothing between them is required.
  const found = /Default[^.\d]*(\d+)/.exec(said);
  return found?.[1] === undefined ? undefined : Number(found[1]);
}

/** What the README says about one setting, read across the line breaks it wraps on. */
function readmeSays(readme: string, name: string): string[] {
  // A setting is announced as a table row: its name, its default, and what it
  // does. What the row says is every cell after the name.
  return readme
    .split("\n")
    .filter((line) => line.startsWith(`| \`${name}\``))
    .map((line) => line.split("|").slice(2, -1).join(" ").trim());
}

describe("the registry entry announces the settings this client runs on", () => {
  const declared = declaredInRegistry();

  const cases: [string, number][] = [
    ["SB_MIN_INTERVAL_MS", standing.minIntervalMs],
    ["SB_TIMEOUT_MS", standing.timeoutMs],
    ["SB_MAX_RETRIES", standing.maxRetries],
    ["SB_CACHE_TTL_MS", standing.cacheTtlMs],
    ["SB_CACHE_MAX_ENTRIES", standing.cacheMaxEntries],
  ];

  for (const [name, running] of cases) {
    it(`announces the default this client runs ${name} on`, () => {
      const said = declared.get(name);
      expect(said, `server.json declares no ${name}`).toBeDefined();
      expect(
        announcedDefault(said ?? ""),
        `server.json announces a default for ${name} that this client does not use`,
      ).toBe(running);
    });
  }

  it("lists for the log level exactly the readings the code takes", () => {
    const said = declared.get("SB_LOG_LEVEL") ?? "";
    // A reading offered and not taken falls back to the default in silence, so
    // an operator runs on a level they believe they chose against.
    const offered = (said.split(".")[0] ?? "").split(/,| or /).map((one) => one.trim());
    expect(offered.filter((one) => one.length > 0).sort()).toEqual([...LOG_LEVELS].sort());
  });

  it("names the ceiling a pace cannot be widened past", () => {
    const said = declared.get("SB_MIN_INTERVAL_MS") ?? "";
    expect(said).toContain(String(MIN_ALLOWED_INTERVAL_MS));
    expect(said, "a value above the ceiling is refused, and nothing says where it is").toContain(
      String(MAX_ALLOWED_INTERVAL_MS),
    );
  });
});

describe("the README announces the settings this client runs on", () => {
  const readme = read("README.md");

  const cases: [string, number][] = [
    ["SB_TIMEOUT_MS", standing.timeoutMs],
    ["SB_MAX_RETRIES", standing.maxRetries],
    ["SB_CACHE_TTL_MS", standing.cacheTtlMs],
    ["SB_CACHE_MAX_ENTRIES", standing.cacheMaxEntries],
  ];

  for (const [name, running] of cases) {
    it(`states the default this client runs ${name} on`, () => {
      const said = readmeSays(readme, name);
      expect(said.length, `the README names no ${name}`).toBeGreaterThan(0);
      for (const one of said) {
        expect(one, `the README states a default for ${name} this client does not use`).toContain(
          String(running),
        );
      }
    });
  }

  it("names both ends of what a pace may be set to", () => {
    const said = readmeSays(readme, "SB_MIN_INTERVAL_MS");
    expect(said.length).toBeGreaterThan(0);
    for (const one of said) {
      expect(one).toContain(String(MIN_ALLOWED_INTERVAL_MS));
      expect(one, "a value above the ceiling is refused, and nothing says where it is").toContain(
        String(MAX_ALLOWED_INTERVAL_MS),
      );
    }
  });
});
