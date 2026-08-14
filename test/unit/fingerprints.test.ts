/**
 * What a hash lookup is allowed to state.
 *
 * The whole answer is a mapping from a hash a caller computed to a record a
 * catalogue holds, so every line of it is read as an identity claim. Four
 * claims are cheap to make and false: that two records of one catalogue are one
 * record, that a hash nobody searched reached nothing, that a count of matches
 * is a count of files, and that a block belongs to whichever hash the reader
 * assumes.
 *
 * Each case here drives the lookup with hand-built answers, so what is under
 * test is what the client concludes from them rather than what any catalogue
 * holds today.
 */

import { describe, expect, it } from "vitest";

import { StashboxClient } from "../../src/stashbox/client.js";
import { fingerprintRows, renderMatches } from "../../src/answer/render.js";

const OSHASH = "cc2fed05aa9ab4a8";
const PHASH = "e276686d35b2c94c";
const CHAPTER_THREE = "2975e03c-1bb1-7383-8782-ea0e678f6de0";
const CHAPTER_TWO = "e134b8f5-1bb1-7383-8782-ea0e678f6de1";
const ELSEWHERE = "72f107f0-1bb1-7383-8782-ea0e678f6de2";

/** One scene as a catalogue answers it, carrying the hashes it was matched on. */
function scene(
  id: string,
  title: string,
  prints: readonly { hash: string; algorithm: string }[],
): Record<string, unknown> {
  return {
    id,
    title,
    deleted: false,
    urls: [],
    performers: [],
    tags: [],
    fingerprints: prints.map((one) => ({
      hash: one.hash,
      algorithm: one.algorithm,
      duration: 1500,
      submissions: 12,
      reports: 0,
    })),
  };
}

/**
 * A client whose catalogues answer what a case hands them.
 *
 * Keys are held for two catalogues and for no other, so the rest stand as
 * unasked and the answer has to say so.
 */
function reading(answers: Partial<Record<string, Record<string, unknown>[][]>>) {
  return new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere", tpdb: "another" },
    transport: {
      request: async (spec) => ({ findScenesBySceneFingerprints: answers[spec.id] ?? [] }) as never,
    },
  });
}

/* ------------------------------------- the blocks a card carries per match */

describe("the heavy blocks of a card a hash reached", () => {
  const answers = {
    stashdb: [
      [scene(CHAPTER_THREE, "Being Riley Chapter 3", [{ hash: OSHASH, algorithm: "OSHASH" }])],
    ],
    tpdb: [[]],
  };

  it("are left out where nothing named them", async () => {
    const read = await reading(answers).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
    });
    // One answer holds a card per record reached, and a scene carries hundreds
    // of fingerprints. Written whole per match, the same block reaches a
    // reader four times over and the answer is a run of hashes.
    expect(read.data.matches[0]?.scene.fields.fingerprints).toBeUndefined();
  });

  it("are carried where a caller named them", async () => {
    const read = await reading(answers).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
      sections: ["basic", "fingerprints"],
    });
    expect(read.data.matches[0]?.scene.fields.fingerprints).toBeDefined();
  });

  it("attribute a match to the hash that reached it whatever was named", async () => {
    const read = await reading(answers).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
    });
    // The hashes a record carries are what tells which of the hashes asked
    // reached it. Read only where a caller names the block, every match would
    // stand as a record carrying none of them.
    expect(read.data.matches).toHaveLength(1);
    expect(read.data.unattributed).toBe(0);
  });
});

/* --------------------------------- two records of one catalogue, one hash */

describe("two records of one catalogue carrying one hash", () => {
  const answers = {
    stashdb: [
      [
        scene(CHAPTER_THREE, "Being Riley Chapter 3", [{ hash: OSHASH, algorithm: "OSHASH" }]),
        scene(CHAPTER_TWO, "Being Riley Chapter 2", [{ hash: OSHASH, algorithm: "OSHASH" }]),
      ],
    ],
    tpdb: [[]],
  };

  it("are two matches, each visible with the identifier its catalogue minted", async () => {
    const read = await reading(answers).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
    });
    expect(read.data.matches).toHaveLength(2);
    const held = read.data.matches.flatMap((one) =>
      one.scene.held_by.filter((who) => who.state === "answered").map((who) => who.id),
    );
    expect(held).toContain(`stashdb:${CHAPTER_THREE}`);
    expect(held).toContain(`stashdb:${CHAPTER_TWO}`);
  });

  it("never share a card, since a card holds one reading per catalogue", async () => {
    const read = await reading(answers).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
    });
    for (const one of read.data.matches) {
      const sources = one.scene.held_by
        .filter((who) => who.state === "answered")
        .map((who) => who.source);
      expect(new Set(sources).size).toBe(sources.length);
    }
  });

  it("are counted as the two records they are", async () => {
    const read = await reading(answers).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
    });
    expect(read.data.records_named).toBe(2);
  });

  it("are named as several where a reader reads, since which is the file is unsettled", async () => {
    const read = await reading(answers).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
    });
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain("Being Riley Chapter 3");
    expect(said).toContain("Being Riley Chapter 2");
  });
});

/* --------------------------------------- one hash held by two catalogues */

describe("one exact hash two catalogues answer with", () => {
  it("is one card holding both readings", async () => {
    const read = await reading({
      stashdb: [[scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])]],
      tpdb: [[scene(CHAPTER_TWO, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])]],
    }).findByFingerprint({ fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }] });
    expect(read.data.matches).toHaveLength(1);
    const sources = read.data.matches[0]!.scene.held_by.filter(
      (who) => who.state === "answered",
    ).map((who) => who.source);
    expect(sources).toEqual(["stashdb", "tpdb"]);
    expect(read.data.records_named).toBe(1);
  });
});

/* ------------------------------------ a hash no answering catalogue reads */

describe("a hash of an algorithm no answering catalogue searches", () => {
  const asked = { fingerprints: [{ hash: PHASH, algorithm: "PHASH" }], sources: ["tpdb"] };

  it("is reported as never put to one, and never as unmatched", async () => {
    const read = await reading({ tpdb: [[]] }).findByFingerprint(asked);
    expect(read.data.not_searched).toEqual([{ hash: PHASH, algorithm: "PHASH" }]);
    expect(read.data.unmatched).toEqual([]);
  });

  it("counts as no match and no record", async () => {
    const read = await reading({ tpdb: [[]] }).findByFingerprint(asked);
    expect(read.data.match_count).toBe(0);
    expect(read.data.records_named).toBe(0);
  });

  it("says so in the prose, and claims no catalogue looked", async () => {
    const read = await reading({ tpdb: [[]] }).findByFingerprint(asked);
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain(PHASH);
    expect(said.toLowerCase()).toContain("never put");
    // A catalogue that does not search an algorithm did not look for it, and
    // its silence is no evidence about the file the hash was computed from.
    expect(said).not.toContain("looked and found nothing");
    expect(said).not.toContain("do not know");
  });
});

/* ---------------------------------------- a hash every catalogue searched */

describe("a hash the catalogues searched and none holds", () => {
  it("stands as unmatched, and the prose says they looked", async () => {
    const read = await reading({ stashdb: [[]], tpdb: [[]] }).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
    });
    expect(read.data.unmatched).toEqual([{ hash: OSHASH, algorithm: "OSHASH" }]);
    expect(read.data.not_searched).toEqual([]);
    expect(renderMatches(read.data, read.cached).text).toContain("looked and found nothing");
  });
});

/* ------------------------------------------------ what the headline counts */

describe("the headline", () => {
  it("counts records named by exact hashes, and leaves perceptual matches out of that", async () => {
    const read = await reading({
      stashdb: [
        [scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])],
        [scene(ELSEWHERE, "A", [{ hash: PHASH, algorithm: "PHASH" }])],
      ],
      tpdb: [[scene(CHAPTER_TWO, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])]],
    }).findByFingerprint({
      fingerprints: [
        { hash: OSHASH, algorithm: "OSHASH" },
        { hash: PHASH, algorithm: "PHASH" },
      ],
    });
    // One record is named by the exact hash, on two catalogues. The perceptual
    // hash reaches the same record and establishes no file, so it raises the
    // count of matches and no count of records.
    expect(read.data.records_named).toBe(1);
    expect(read.data.match_count).toBe(2);
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain("1 record(s) named by an exact hash");
    expect(said).not.toContain("file(s).");
  });
});

/* ------------------------------------------- which hash produced a block */

describe("each block a match opens", () => {
  it("names the hash that reached it", async () => {
    const read = await reading({
      stashdb: [
        [scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])],
        [scene(CHAPTER_TWO, "B", [{ hash: PHASH, algorithm: "PHASH" }])],
      ],
      tpdb: [[], []],
    }).findByFingerprint({
      fingerprints: [
        { hash: OSHASH, algorithm: "OSHASH" },
        { hash: PHASH, algorithm: "PHASH" },
      ],
    });
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain(`OSHASH ${OSHASH} names these bytes`);
    expect(said).toContain(`PHASH ${PHASH} resembles this`);
  });
});

/* --------------------------------------- what makes a fingerprint weigh */

describe("a fingerprint a record carries", () => {
  it("is printed with what the catalogue counted for it", () => {
    const said = fingerprintRows([
      {
        algorithm: "PHASH",
        hash: PHASH,
        durationSeconds: 1500,
        submissions: 512,
        reports: 0,
        contested: false,
      },
    ]).join("\n");
    expect(said).toContain("512 submission(s)");
  });

  it("says a hash its catalogue counts a dispute on", () => {
    const said = fingerprintRows([
      {
        algorithm: "OSHASH",
        hash: OSHASH,
        durationSeconds: null,
        submissions: 1,
        reports: 3,
        contested: true,
      },
    ]).join("\n");
    // A hash under dispute read as a plain one is a consensus the catalogue
    // never published.
    expect(said.toLowerCase()).toContain("contested");
  });

  it("carries that weight into a card, where a bare hash reads as agreed", async () => {
    const read = await reading({
      stashdb: [[scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])]],
      tpdb: [[]],
    }).findByFingerprint({
      fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }],
      sections: ["basic", "fingerprints"],
    });
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain("12 submission(s)");
  });
});
