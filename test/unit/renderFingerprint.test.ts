import { describe, it, expect } from "vitest";

import { renderFingerprintMatches as renderAttributedMatches } from "../../src/tools/findByFingerprint.js";
import type {
  FingerprintMatch,
  FingerprintResult,
  FingerprintRow,
  SceneRecord,
  SourceReport,
} from "../../src/types.js";

/**
 * Every match in these fixtures carries the fingerprint it was found by, so no
 * scene here is one a catalogue answered with while returning none of the
 * hashes asked for.
 */
function renderFingerprintMatches(
  result: Omit<FingerprintResult, "unattributed" | "asked">,
  asked: readonly { hash: string; algorithm: string }[],
) {
  return renderAttributedMatches({ ...result, unattributed: 0, asked });
}

/**
 * Every fixture here is invented. Hashes, titles, studios and performers name
 * nothing that exists, so no third-party content lives in this repository.
 */

/* ------------------------------------------------------------------ helpers */

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function hasField(payload: unknown, key: string): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return toSnake(key) in obj || toCamel(key) in obj;
}

function field(payload: unknown, key: string): unknown {
  if (payload === null || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  return toSnake(key) in obj ? obj[toSnake(key)] : obj[toCamel(key)];
}

function linesMatching(text: string, pattern: RegExp): string[] {
  return text.split("\n").filter((line) => pattern.test(line));
}

/* ----------------------------------------------------------------- fixtures */

const MD5_HASH = "0badc0ffee1122334455667788990011";
const OSHASH_HASH = "1a2b3c4d5e6f7081";
const PHASH_HASH = "9f8e7d6c5b4a3928";

function scene(over: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: "stashdb:1f2e3d4c-5b6a-4978-8899-0a1b2c3d4e5f",
    source: "stashdb",
    sourceUrl: "https://stashdb.org/scenes/1f2e3d4c-5b6a-4978-8899-0a1b2c3d4e5f",
    // Pinned, so no test reads a clock.
    retrievedAt: "2026-08-11T00:00:00.000Z",
    status: "established",
    mergedInto: null,
    pendingEdits: 0,
    title: "Harbour Lights, Chapter Two",
    details: null,
    code: "NGP-114",
    director: null,
    durationSeconds: 2732,
    releaseDate: { value: "2019-04-12", precision: "day" },
    productionDate: null,
    studio: {
      id: "stashdb:2b3c4d5e-6f70-4812-9345-56789abcdef0",
      name: "Northgate Pictures",
      parent: null,
    },
    performers: [
      {
        id: "stashdb:6d7c8b9a-0e1f-4a2b-9c3d-4e5f6a7b8c9d",
        name: "Ilva Norrsken",
        creditedAs: null,
        disambiguation: null,
        status: "established",
      },
    ],
    tags: [],
    urls: [],
    created: "2019-05-02T09:14:00Z",
    updated: "2024-11-18T16:02:00Z",
    ...over,
  };
}

function row(over: Partial<FingerprintRow> = {}): FingerprintRow {
  return {
    algorithm: "PHASH",
    hash: PHASH_HASH,
    durationSeconds: 2732,
    submissions: 4,
    reports: 0,
    contested: false,
    ...over,
  };
}

function match(over: Partial<FingerprintMatch> = {}): FingerprintMatch {
  return {
    scene: scene(),
    algorithm: "PHASH",
    matchKind: "perceptual_similarity",
    fingerprint: row(),
    ...over,
  };
}

function answered(source: SourceReport["source"], count: number): SourceReport {
  return { source, state: "answered", count };
}

const ASKED = [
  { hash: MD5_HASH, algorithm: "MD5" },
  { hash: OSHASH_HASH, algorithm: "OSHASH" },
  { hash: PHASH_HASH, algorithm: "PHASH" },
] as const;

/* -------------------------------------------------------------------- tests */

describe("renderFingerprintMatches match kinds", () => {
  it("carries an exact-file kind for a byte-for-byte hash", () => {
    const result = {
      matches: [
        match({
          algorithm: "MD5",
          matchKind: "exact_file",
          fingerprint: row({
            algorithm: "MD5",
            hash: MD5_HASH,
            submissions: 3,
            reports: 0,
            contested: false,
          }),
        }),
      ],
      perSource: [answered("stashdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[0]]);

    const matches = field(structured, "matches") as unknown[];
    expect(field(matches[0], "algorithm")).toBe("MD5");
    expect(field(matches[0], "matchKind")).toBe("exact_file");
    expect(text).toContain("MD5");
    expect(text).toMatch(/exact/i);
  });

  it("carries an exact-file kind for a partial hash of a file's size and ends", () => {
    const result = {
      matches: [
        match({
          algorithm: "OSHASH",
          matchKind: "exact_file",
          fingerprint: row({
            algorithm: "OSHASH",
            hash: OSHASH_HASH,
            submissions: 6,
            reports: 1,
            contested: false,
          }),
        }),
      ],
      perSource: [answered("stashdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[1]]);

    const matches = field(structured, "matches") as unknown[];
    expect(field(matches[0], "algorithm")).toBe("OSHASH");
    expect(field(matches[0], "matchKind")).toBe("exact_file");
    expect(text).toContain("OSHASH");
  });

  it("describes a perceptual match as a resemblance and never as one file", () => {
    const result = {
      matches: [match({ algorithm: "PHASH", matchKind: "perceptual_similarity" })],
      perSource: [answered("stashdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[2]]);

    const matches = field(structured, "matches") as unknown[];
    expect(field(matches[0], "matchKind")).toBe("perceptual_similarity");

    // A perceptual hash covers a re-encode, a crop, and a different scene from
    // the same shoot. Presenting that as an identity is a claim the data does
    // not carry.
    expect(text).toMatch(/resembl|similar/i);
    expect(text).not.toMatch(/same file/i);
    expect(text).not.toMatch(/same video/i);
    expect(text).not.toMatch(/\bidentical\b/i);
    expect(text).not.toMatch(/\bexact\b/i);
    expect(text).not.toMatch(/\bis the same\b/i);
    expect(text).not.toMatch(/\bthe same scene\b/i);
    expect(text).not.toMatch(/byte for byte/i);
  });

  it("keeps the three algorithms apart in one answer", () => {
    const result = {
      matches: [
        match({
          algorithm: "MD5",
          matchKind: "exact_file",
          fingerprint: row({ algorithm: "MD5", hash: MD5_HASH }),
        }),
        match({ algorithm: "PHASH", matchKind: "perceptual_similarity" }),
      ],
      perSource: [answered("stashdb", 2)],
    };

    const { structured } = renderFingerprintMatches(result, ASKED);

    const matches = field(structured, "matches") as unknown[];
    expect(matches).toHaveLength(2);
    expect(field(matches[0], "matchKind")).toBe("exact_file");
    expect(field(matches[1], "matchKind")).toBe("perceptual_similarity");
  });

  it("says which fingerprints were asked", () => {
    const result = { matches: [], perSource: [answered("stashdb", 0)] };

    const { text } = renderFingerprintMatches(result, ASKED);

    // What an instance was asked and what the answer says it was asked are the
    // same thing.
    for (const asked of ASKED) expect(text).toContain(asked.hash);
    for (const asked of ASKED) expect(text).toContain(asked.algorithm);
  });
});

describe("renderFingerprintMatches counters", () => {
  it("carries the submissions and the reports of every match", () => {
    const result = {
      matches: [
        match({ fingerprint: row({ submissions: 9, reports: 0, contested: false }) }),
        match({
          algorithm: "OSHASH",
          matchKind: "exact_file",
          fingerprint: row({
            algorithm: "OSHASH",
            hash: OSHASH_HASH,
            submissions: 2,
            reports: 1,
            contested: false,
          }),
        }),
      ],
      perSource: [answered("stashdb", 2)],
    };

    const { text, structured } = renderFingerprintMatches(result, ASKED);

    const matches = field(structured, "matches") as unknown[];
    for (const row_ of matches) {
      const print = field(row_, "fingerprint");
      expect(hasField(print, "submissions")).toBe(true);
      expect(hasField(print, "reports")).toBe(true);
      expect(hasField(print, "contested")).toBe(true);
    }
    // Dropping the counters makes a doubtful match indistinguishable from a
    // solid one, so they reach the text block as well.
    expect(text).toMatch(/\b9\b/);
    expect(text).toMatch(/submission/i);
    expect(text).toMatch(/report/i);
  });

  it("flags a fingerprint reported more often than it was submitted", () => {
    const result = {
      matches: [match({ fingerprint: row({ submissions: 1, reports: 3, contested: true }) })],
      perSource: [answered("stashdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[2]]);

    const matches = field(structured, "matches") as unknown[];
    expect(field(field(matches[0], "fingerprint"), "contested")).toBe(true);
    expect(text).toMatch(/contested|disputed/i);
  });

  it("flags a fingerprint reported as often as it was submitted", () => {
    // The threshold sits at equality: reports at least submissions is contested.
    const result = {
      matches: [match({ fingerprint: row({ submissions: 3, reports: 3, contested: true }) })],
      perSource: [answered("stashdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[2]]);

    const matches = field(structured, "matches") as unknown[];
    expect(field(field(matches[0], "fingerprint"), "contested")).toBe(true);
    expect(text).toMatch(/contested|disputed/i);
  });

  it("carries a fingerprint nobody disputed as one nobody disputed", () => {
    const result = {
      matches: [match({ fingerprint: row({ submissions: 5, reports: 0, contested: false }) })],
      perSource: [answered("stashdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[2]]);

    const matches = field(structured, "matches") as unknown[];
    expect(field(field(matches[0], "fingerprint"), "contested")).toBe(false);
    expect(text).toMatch(/\b5\b/);
    expect(text).toMatch(/\b0\b/);
  });

  it("reports an unknown contest as unknown and names the instance that publishes none", () => {
    const tpdbScene = scene({
      id: "tpdb:4d5e6f70-8192-43a4-b5c6-d7e8f9a0b1c2",
      source: "tpdb",
      sourceUrl: "https://theporndb.net/scenes/4d5e6f70-8192-43a4-b5c6-d7e8f9a0b1c2",
    });
    const result = {
      matches: [
        match({
          scene: tpdbScene,
          fingerprint: row({ submissions: 4, reports: null, contested: null }),
        }),
      ],
      perSource: [answered("tpdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[2]]);

    const print = field((field(structured, "matches") as unknown[])[0], "fingerprint");
    expect(field(print, "reports")).toBeNull();
    expect(field(print, "contested")).toBeNull();

    // A match nobody disputed and a match on an instance that records no
    // disputes are different things, and the answer names which instance could
    // not be asked.
    expect(text).toMatch(/tpdb|ThePornDB/);
    expect(text).toMatch(/unknown|does not publish|no report count|could not be asked|records no/i);
    expect(text).not.toMatch(/\buncontested\b/i);
    expect(text).not.toMatch(/\bnot contested\b/i);
    expect(text).not.toMatch(/\bno disputes\b/i);
    expect(text).not.toMatch(/contested[:=]?\s*(false|no)\b/i);
    expect(text).not.toMatch(/\b0 reports?\b/i);
  });
});

describe("renderFingerprintMatches per-source reporting", () => {
  const perSource: SourceReport[] = [
    { source: "stashdb", state: "answered", count: 2 },
    { source: "fansdb", state: "answered", count: 0 },
    {
      source: "pmv",
      state: "failed",
      reason: "the instance did not answer in time",
      moment: "search",
      error: "timeout",
    },
    { source: "javstash", state: "absent", reason: "no key configured" },
  ];

  function result() {
    return {
      matches: [
        match({
          algorithm: "MD5",
          matchKind: "exact_file",
          fingerprint: row({ algorithm: "MD5", hash: MD5_HASH }),
        }),
        match(),
      ],
      perSource,
    };
  }

  it("passes every source's state through the structured payload", () => {
    const { structured } = renderFingerprintMatches(result(), ASKED);

    const reports = field(structured, "perSource") as unknown[];
    expect(reports).toHaveLength(4);
    expect(field(reports[0], "state")).toBe("answered");
    expect(field(reports[0], "count")).toBe(2);
    expect(field(reports[1], "state")).toBe("answered");
    expect(field(reports[1], "count")).toBe(0);
    expect(field(reports[2], "state")).toBe("failed");
    expect(field(reports[2], "moment")).toBe("search");
    expect(field(reports[3], "state")).toBe("absent");
    expect(field(reports[3], "reason")).toBe("no key configured");
  });

  it("reads an instance that matched nothing as an instance that answered", () => {
    const { text } = renderFingerprintMatches(result(), ASKED);

    const fansdbLines = linesMatching(text, /fansdb|FansDB/i);
    expect(fansdbLines.length).toBeGreaterThan(0);
    for (const line of fansdbLines) {
      expect(line).toMatch(/answered/i);
      expect(line).not.toMatch(/failed|error|could not|absent|not asked/i);
    }
  });

  it("names an instance that failed, with the moment that failed", () => {
    const { text } = renderFingerprintMatches(result(), ASKED);

    const pmvLines = linesMatching(text, /pmv/i);
    expect(pmvLines.length).toBeGreaterThan(0);
    expect(pmvLines.join("\n")).toMatch(/failed/i);
    expect(pmvLines.join("\n")).toMatch(/search/i);
  });

  it("names an instance that was never asked, with the reason", () => {
    const { text } = renderFingerprintMatches(result(), ASKED);

    const javstashLines = linesMatching(text, /javstash|JAVStash/i);
    expect(javstashLines.length).toBeGreaterThan(0);
    expect(javstashLines.join("\n")).toMatch(/no key configured/i);
    expect(javstashLines.join("\n")).not.toMatch(/\bfailed\b/i);
  });

  it("states that rows from some instances say nothing about the others", () => {
    const { text } = renderFingerprintMatches(result(), ASKED);

    expect(text).toMatch(
      /no evidence about the others|says nothing about the others|is no evidence|not evidence/i,
    );
  });

  it("adds no count across instances", () => {
    const { text } = renderFingerprintMatches(result(), ASKED);

    // The instances index overlapping corpora, so a total across them would
    // count one scene twice.
    expect(text).not.toMatch(/\btotal\b/i);
    expect(text).not.toMatch(/\bacross (all )?instances\b/i);
  });

  it("keeps an empty answer apart from an answer nobody gave", () => {
    const empty = {
      matches: [],
      perSource: [
        { source: "stashdb", state: "answered", count: 0 } as SourceReport,
        { source: "javstash", state: "absent", reason: "no key configured" } as SourceReport,
      ],
    };

    const { text, structured } = renderFingerprintMatches(empty, ASKED);

    expect(field(structured, "matches")).toEqual([]);
    expect(text).toMatch(/stashdb|StashDB/);
    expect(text).toMatch(/javstash|JAVStash/);
    expect(text).toMatch(/no key configured/i);
    // An instance that was never asked is never folded into the absence of a
    // match.
    expect(text).not.toMatch(/\bnowhere\b/i);
    expect(text).not.toMatch(/\bno instance holds\b/i);
    expect(text).not.toMatch(/\bnot in the catalogues\b/i);
  });
});

describe("renderFingerprintMatches namespacing", () => {
  it("returns one row per instance when one hash matches on two of them", () => {
    const stashdbScene = scene();
    const fansdbScene = scene({
      id: "fansdb:8c9d0e1f-2a3b-44c5-9d6e-7f8a9b0c1d2e",
      source: "fansdb",
      sourceUrl: "https://fansdb.cc/scenes/8c9d0e1f-2a3b-44c5-9d6e-7f8a9b0c1d2e",
      title: "Harbour Lights 2",
    });

    const result = {
      matches: [
        match({
          scene: stashdbScene,
          fingerprint: row({ hash: PHASH_HASH, submissions: 4, reports: 0, contested: false }),
        }),
        match({
          scene: fansdbScene,
          fingerprint: row({ hash: PHASH_HASH, submissions: 1, reports: 0, contested: false }),
        }),
      ],
      perSource: [answered("stashdb", 1), answered("fansdb", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[2]]);

    // The same UUID can exist on two instances describing two different things,
    // so identifiers are namespaced and two rows stay two rows.
    const matches = field(structured, "matches") as unknown[];
    expect(matches).toHaveLength(2);

    const ids = matches.map((m) => field(field(m, "scene"), "id"));
    expect(ids).toEqual([
      "stashdb:1f2e3d4c-5b6a-4978-8899-0a1b2c3d4e5f",
      "fansdb:8c9d0e1f-2a3b-44c5-9d6e-7f8a9b0c1d2e",
    ]);
    expect(new Set(ids).size).toBe(2);

    expect(text).toContain("stashdb:1f2e3d4c-5b6a-4978-8899-0a1b2c3d4e5f");
    expect(text).toContain("fansdb:8c9d0e1f-2a3b-44c5-9d6e-7f8a9b0c1d2e");
    expect(text).toContain("Harbour Lights, Chapter Two");
    expect(text).toContain("Harbour Lights 2");
  });

  it("names the instance every row came from", () => {
    const result = {
      matches: [
        match({
          scene: scene({
            id: "pmv:3a4b5c6d-7e8f-4901-a2b3-c4d5e6f7a8b9",
            source: "pmv",
            sourceUrl: "https://pmvstash.org/scenes/3a4b5c6d-7e8f-4901-a2b3-c4d5e6f7a8b9",
          }),
        }),
      ],
      perSource: [answered("pmv", 1)],
    };

    const { text, structured } = renderFingerprintMatches(result, [ASKED[2]]);

    // How a row was made is what the instance behind it tells a reader, so it
    // travels on the row rather than once in the documentation.
    expect(field(field((field(structured, "matches") as unknown[])[0], "scene"), "source")).toBe(
      "pmv",
    );
    expect(text).toMatch(/pmv/i);
  });

  it("orders rows by the source that was asked rather than by a shared score", () => {
    const result = {
      matches: [
        match({ scene: scene() }),
        match({
          scene: scene({ id: "fansdb:8c9d0e1f-2a3b-44c5-9d6e-7f8a9b0c1d2e", source: "fansdb" }),
        }),
      ],
      perSource: [answered("stashdb", 1), answered("fansdb", 1)],
    };

    const { text } = renderFingerprintMatches(result, [ASKED[2]]);

    // No score is shared between instances, so nothing is ranked across them.
    expect(text).not.toMatch(/\bbest match\b/i);
    expect(text).not.toMatch(/\bclosest match\b/i);
    expect(text).not.toMatch(/\branked\b/i);
    expect(text).not.toMatch(/\bconfidence\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
  });
});
