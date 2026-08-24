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
const OTHER_OSHASH = "3c30b044619b6487";
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

/**
 * A client one of whose catalogues refuses the exchange.
 *
 * A catalogue that could not answer and one nobody asked are two states a card
 * has to keep apart, and a case needs both of them on one answer to measure it.
 */
function refusing(
  answers: Partial<Record<string, Record<string, unknown>[][]>>,
  failing: readonly string[],
) {
  return new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere", tpdb: "another" },
    transport: {
      request: async (spec) => {
        if (failing.includes(spec.id)) {
          throw new Error(`${spec.name} could not be reached`);
        }
        return { findScenesBySceneFingerprints: answers[spec.id] ?? [] } as never;
      },
    },
  });
}

/** The notes a card carries, which is where a policy applied is stated. */
const notesOf = (match: { scene: { notes: string[] } } | undefined) => match?.scene.notes ?? [];

/** Whether any note of a card says what a case is reading for. */
const saying = (notes: readonly string[], said: string) => notes.some((one) => one.includes(said));

/* ------------------------------------- the blocks a card carries per match */

describe("the heavy blocks of a card a hash reached", () => {
  const answers = {
    stashdb: [
      [scene(CHAPTER_THREE, "Second Light Chapter 3", [{ hash: OSHASH, algorithm: "OSHASH" }])],
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
        scene(CHAPTER_THREE, "Second Light Chapter 3", [{ hash: OSHASH, algorithm: "OSHASH" }]),
        scene(CHAPTER_TWO, "Second Light Chapter 2", [{ hash: OSHASH, algorithm: "OSHASH" }]),
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
    expect(said).toContain("Second Light Chapter 3");
    expect(said).toContain("Second Light Chapter 2");
    // Which of the two holds the file is a question the catalogue answers no
    // way at all, and it says so by minting two identifiers.
    expect(said).toContain("reached more than one record");
  });
});

/* ------------------------------ several hashes of one file, one catalogue */

describe("two hashes of one file reaching one record", () => {
  /**
   * The route answers a group per hash, and a record carrying both hashes
   * stands in both groups. Read as two records, one file is reported as
   * several, and a caller identifying a folder quarantines it.
   */
  const answers = {
    stashdb: [
      [
        scene(CHAPTER_THREE, "Second Light Chapter 3", [
          { hash: OSHASH, algorithm: "OSHASH" },
          { hash: OTHER_OSHASH, algorithm: "OSHASH" },
        ]),
      ],
      [
        scene(CHAPTER_THREE, "Second Light Chapter 3", [
          { hash: OSHASH, algorithm: "OSHASH" },
          { hash: OTHER_OSHASH, algorithm: "OSHASH" },
        ]),
      ],
    ],
    tpdb: [[], []],
  };
  const asked = {
    fingerprints: [
      { hash: OSHASH, algorithm: "OSHASH" },
      { hash: OTHER_OSHASH, algorithm: "OSHASH" },
    ],
    sources: ["stashdb"],
  };

  it("is one match, since one record is one record", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    expect(read.data.matches).toHaveLength(1);
    expect(read.data.match_count).toBe(1);
    expect(read.data.records_named).toBe(1);
  });

  it("names both hashes on the one block it opens", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain(OSHASH);
    expect(said).toContain(OTHER_OSHASH);
    expect(said.match(/Second Light Chapter 3/g)).toHaveLength(1);
  });

  it("asserts no ambiguity, since one record leaves nothing to choose between", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    const said = renderMatches(read.data, read.cached).text;
    expect(said).not.toContain("reached more than one record");
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
    expect(read.data.not_searched).toEqual([
      { hash: PHASH, algorithm: "PHASH", sources: ["tpdb"] },
    ]);
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

/* ------------------ a hash one catalogue searches and another never reads */

describe("a batch mixing an algorithm one catalogue does not search", () => {
  /**
   * ThePornDB's lookup searches no perceptual hash, so the PHASH is never put
   * to it. The record it answers the exact hash with carries a PHASH of its
   * own, which is the catalogue describing its record and no answer to a
   * question it was never asked.
   */
  const answers = {
    stashdb: [
      [scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])],
      [scene(CHAPTER_THREE, "B", [{ hash: PHASH, algorithm: "PHASH" }])],
    ],
    tpdb: [
      [
        scene(CHAPTER_TWO, "A", [
          { hash: OSHASH, algorithm: "OSHASH" },
          { hash: PHASH, algorithm: "PHASH" },
        ]),
      ],
    ],
  };
  const asked = {
    fingerprints: [
      { hash: OSHASH, algorithm: "OSHASH" },
      { hash: PHASH, algorithm: "PHASH" },
    ],
  };

  it("attributes no perceptual match to the catalogue that never received one", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    for (const one of read.data.matches) {
      if (one.matchKind !== "perceptual_similarity") {
        continue;
      }
      // A catalogue stands on a card as a reading of it only where it carries
      // the identifier it minted for the record. Named without one, it looked
      // and holds nothing here, which is the other fact the card owes.
      const held = one.scene.held_by
        .filter((who) => who.state === "answered" && who.id !== undefined)
        .map((who) => who.source);
      expect(held).not.toContain("tpdb");
      expect(one.scene.held_by.map((who) => who.source)).toContain("tpdb");
    }
  });

  it("carries on every match the hash that reached it on each catalogue", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    for (const one of read.data.matches) {
      for (const by of one.matchedBy) {
        if (by.algorithm === "PHASH") {
          expect(by.sources).not.toContain("tpdb");
        }
      }
    }
  });

  it("keeps the hash that catalogue never searched in the payload", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    // Collapsed where another hash of the batch was searched, the one fact a
    // caller has about that catalogue and that file disappears.
    expect(read.data.not_searched).toEqual([
      { hash: PHASH, algorithm: "PHASH", sources: ["tpdb"] },
    ]);
  });

  it("names that catalogue in the note that says the hash was never put", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    const notes = (renderMatches(read.data, read.cached).structured as { notes: string[] }).notes;
    const said = notes.find((one) => one.toLowerCase().includes("never put")) ?? "";
    expect(said).toContain(PHASH);
    expect(said).toContain("ThePornDB");
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

/* ------------------------- what a card states about the catalogues behind it */

describe("a card a hash reached", () => {
  const answers = {
    stashdb: [[scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])]],
    tpdb: [[]],
  };
  const asked = { fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }] };

  it("names every catalogue the registry declares, whatever became of it", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    // A card holding only the catalogues that answered cannot tell one that
    // looked and holds nothing from one nobody asked, and those are two of the
    // three states every other answer of this server keeps apart.
    const named = read.data.matches[0]?.scene.held_by.map((one) => one.source) ?? [];
    expect(named).toEqual(["stashdb", "tpdb", "fansdb", "pmv", "javstash"]);
  });

  it("states the catalogues nobody asked", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    const said = notesOf(read.data.matches[0]).find((one) => one.includes("never asked")) ?? "";
    expect(said).toContain("fansdb");
    // A catalogue that answered the lookup was asked, whatever it held.
    expect(said).not.toContain("tpdb");
  });

  it("states the catalogues that could not answer", async () => {
    const read = await refusing(answers, ["tpdb"]).findByFingerprint(asked);
    const said =
      notesOf(read.data.matches[0]).find((one) => one.includes("could not answer")) ?? "";
    expect(said).toContain("tpdb");
  });

  it("names a catalogue that looked and holds no record here as one that answered", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    const tpdb = read.data.matches[0]?.scene.held_by.find((one) => one.source === "tpdb");
    expect(tpdb?.state).toBe("answered");
  });

  it("announces the fallback where the catalogue it preferred was never asked", async () => {
    const read = await reading(answers).findByFingerprint({ ...asked, prefer: ["fansdb"] });
    // A fallback performed in silence reads as the preferred catalogue's own
    // answer, and every value on this card was read from another.
    const said =
      notesOf(read.data.matches[0]).find((one) => one.includes("preferred is fansdb")) ?? "";
    expect(said).toContain("never asked");
    expect(said).toContain("stashdb");
  });

  it("announces the fallback where the catalogue it preferred could not answer", async () => {
    const read = await refusing(answers, ["tpdb"]).findByFingerprint({
      ...asked,
      prefer: ["tpdb", "stashdb"],
    });
    const said =
      notesOf(read.data.matches[0]).find((one) => one.includes("preferred is tpdb")) ?? "";
    expect(said).toContain("could not answer");
  });

  it("announces no fallback where the catalogue it preferred answered", async () => {
    const read = await reading(answers).findByFingerprint({ ...asked, prefer: ["stashdb"] });
    expect(saying(notesOf(read.data.matches[0]), "this call preferred")).toBe(false);
  });

  it("states the policy applied, whichever catalogues answered under it", async () => {
    const read = await reading(answers).findByFingerprint({ ...asked, prefer: ["fansdb"] });
    expect(read.data.matches[0]?.scene.preferred).toEqual(["fansdb"]);
    expect(read.data.matches[0]?.scene.read_from).toEqual(["stashdb"]);
  });
});

/* --------------------------- one record an exact and a perceptual hash reached */

describe("one record two kinds of hash reached", () => {
  const answers = {
    stashdb: [
      [scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])],
      [scene(ELSEWHERE, "A", [{ hash: PHASH, algorithm: "PHASH" }])],
    ],
    tpdb: [[], []],
  };
  const asked = {
    fingerprints: [
      { hash: OSHASH, algorithm: "OSHASH" },
      { hash: PHASH, algorithm: "PHASH" },
    ],
  };

  it("stands as a card per kind, since the two make different claims about it", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    expect(read.data.matches.map((one) => one.matchKind)).toEqual([
      "exact_file",
      "perceptual_similarity",
    ]);
    expect(read.data.match_count).toBe(2);
    expect(read.data.records_named).toBe(1);
  });

  it("says the record stands on two cards, so the cards are no count of records", async () => {
    const read = await reading(answers).findByFingerprint(asked);
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain("stand here twice");
    expect(said).toContain(`stashdb:${ELSEWHERE}`);
  });

  it("says nothing of the kind where each record stands on one card", async () => {
    const read = await reading({
      stashdb: [[scene(ELSEWHERE, "A", [{ hash: OSHASH, algorithm: "OSHASH" }])]],
      tpdb: [[]],
    }).findByFingerprint({ fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }] });
    expect(renderMatches(read.data, read.cached).text).not.toContain("stand here twice");
  });

  it("never says two records stand one card each while each of them stands twice", async () => {
    const read = await reading({
      stashdb: [
        [
          scene(CHAPTER_THREE, "Second Light Chapter 3", [{ hash: OSHASH, algorithm: "OSHASH" }]),
          scene(CHAPTER_TWO, "Second Light Chapter 2", [{ hash: OSHASH, algorithm: "OSHASH" }]),
        ],
        [
          scene(CHAPTER_THREE, "Second Light Chapter 3", [{ hash: PHASH, algorithm: "PHASH" }]),
          scene(CHAPTER_TWO, "Second Light Chapter 2", [{ hash: PHASH, algorithm: "PHASH" }]),
        ],
      ],
      tpdb: [[], []],
    }).findByFingerprint(asked);
    const said = renderMatches(read.data, read.cached).text;
    expect(said).toContain("reached more than one record");
    // Four cards stand for two records, and a sentence saying each record
    // stands once contradicts what the reader is looking at.
    expect(said).not.toContain("one card each");
  });
});
