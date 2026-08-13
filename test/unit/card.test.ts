/**
 * One record, read on every catalogue that holds it, published as one card.
 *
 * This is the only place in the server where readings of several catalogues are
 * put together, and it is where the rule that governs everything is easiest to
 * break. Four readings of it decide every case below.
 *
 * **A value carries who said it.** Two catalogues agreeing is a stronger fact
 * than one catalogue asserting, and a card that published the value alone would
 * throw that away. Two catalogues disagreeing is a fact as well, and the card
 * publishes both readings rather than the winner alone: choosing is a policy,
 * and a policy applied in silence is a claim nobody can check.
 *
 * **A list is united, never chosen.** Every alias in the union is an alias some
 * catalogue published, so the union asserts nothing new. Picking one catalogue's
 * list would erase what the other holds.
 *
 * **A count is never merged.** The catalogues index corpora that overlap by an
 * unknown amount, so counts stay one per catalogue, and a catalogue publishing
 * none says so rather than contributing a zero.
 *
 * **A catalogue that failed is not a catalogue that holds nothing.** Every
 * reading names its state, and a card built while one catalogue was unreachable
 * says the field set is what the others carry.
 */

import { describe, expect, it } from "vitest";

import { consolidate, type Reading } from "../../src/answer/card.js";
import type { CardEntry, CardValue } from "../../src/types.js";

/** The order the registry declares, which is the preference unless one is written. */
const REGISTRY_ORDER = ["stashdb", "tpdb", "fansdb", "pmv", "javstash"] as const;

const UUID_A = "155f2559-d1f1-42b1-8cbe-9008542df5ce";
const UUID_B = "a6fb1863-b433-4274-ae07-0e1327c854d1";

/**
 * Two readings of one performer, as the two catalogues actually answered on
 * 2026-08-13: they agree on the birth date, the country and the gender, and
 * their alias lists overlap without matching.
 */
function answered(source: string, id: string, record: Record<string, unknown>): Reading {
  return { source, id: `${source}:${id}`, state: "answered", record };
}

const STASHDB = answered("stashdb", UUID_A, {
  name: "Angela White",
  birthDate: "1985-03-04",
  country: "AU",
  aliases: ["Angela Exposed", "Angie", "Aussie Angela"],
  sceneCount: 1041,
});

const TPDB = answered("tpdb", UUID_B, {
  name: "Angela White",
  birthDate: "1985-03-04",
  country: "AU",
  aliases: ["Angie", "Angelia White", "Angela Exposed"],
  sceneCount: null,
});

const SHAPE = {
  scalars: ["name", "birthDate", "country"],
  lists: ["aliases"],
  perSource: ["sceneCount"],
} as const;

function card(readings: Reading[], prefer: readonly string[] = REGISTRY_ORDER) {
  return consolidate({ readings, prefer, ...SHAPE });
}

/* ------------------------------------------------------- what a value carries */

describe("a value carries the catalogues that said it", () => {
  it("names both where both said the same thing", () => {
    const held = card([STASHDB, TPDB]);
    expect(held.fields.birthDate as CardValue).toEqual({
      value: "1985-03-04",
      agreed_by: ["stashdb", "tpdb"],
    });
  });

  it("names one where one published it and the other carried nothing", () => {
    const quiet = answered("tpdb", UUID_B, { ...TPDB.record, country: null });
    const held = card([STASHDB, quiet]);
    expect(held.fields.country as CardValue).toEqual({ value: "AU", agreed_by: ["stashdb"] });
  });

  it("carries the reading nobody preferred beside the one that won", () => {
    const other = answered("tpdb", UUID_B, { ...TPDB.record, country: "US" });
    const held = card([STASHDB, other]);
    expect(held.fields.country as CardValue).toEqual({
      value: "AU",
      agreed_by: ["stashdb"],
      disagreed: [{ source: "tpdb", value: "US" }],
    });
  });

  it("lets the preference be written, and then the other reading wins", () => {
    const other = answered("tpdb", UUID_B, { ...TPDB.record, country: "US" });
    const held = card([STASHDB, other], ["tpdb", "stashdb"]);
    expect(held.fields.country as CardValue).toEqual({
      value: "US",
      agreed_by: ["tpdb"],
      disagreed: [{ source: "stashdb", value: "AU" }],
    });
  });

  it("states the policy that was applied, since choosing is a policy", () => {
    // The policy is what was written. What came back is a second fact, and a
    // card reporting only the second would read as a policy nobody wrote.
    expect(card([STASHDB, TPDB], ["tpdb", "stashdb"]).preferred).toEqual(["tpdb", "stashdb"]);
    expect(card([STASHDB, TPDB], ["tpdb", "stashdb"]).read_from).toEqual(["tpdb", "stashdb"]);
    expect(card([STASHDB], ["tpdb", "stashdb"]).read_from).toEqual(["stashdb"]);
  });

  it("publishes a field no catalogue carried as null, agreed by nobody", () => {
    const a = answered("stashdb", UUID_A, { ...STASHDB.record, country: null });
    const b = answered("tpdb", UUID_B, { ...TPDB.record, country: null });
    // The field is published rather than dropped, since a key missing reads as
    // a block nobody loaded. Agreeing takes two readings of something, and two
    // silences are readings of nothing.
    expect(card([a, b]).fields.country as CardValue).toEqual({ value: null, agreed_by: [] });
  });
});

/* --------------------------------------------------------------- the lists */

describe("a list is united, never chosen", () => {
  it("holds every entry either catalogue published, once", () => {
    const held = card([STASHDB, TPDB]);
    expect((held.fields.aliases as CardEntry[]).map((entry) => entry.value).sort()).toEqual([
      "Angela Exposed",
      "Angelia White",
      "Angie",
      "Aussie Angela",
    ]);
  });

  it("names every catalogue that published an entry", () => {
    const held = card([STASHDB, TPDB]);
    const by = (value: string) =>
      (held.fields.aliases as CardEntry[]).find((entry) => entry.value === value)?.published_by;
    expect(by("Angie")).toEqual(["stashdb", "tpdb"]);
    expect(by("Aussie Angela")).toEqual(["stashdb"]);
    expect(by("Angelia White")).toEqual(["tpdb"]);
  });

  it("keeps the order of the preferred catalogue, then what the others add", () => {
    const held = card([STASHDB, TPDB]);
    expect((held.fields.aliases as CardEntry[]).map((entry) => entry.value)).toEqual([
      "Angela Exposed",
      "Angie",
      "Aussie Angela",
      "Angelia White",
    ]);
  });
});

/* -------------------------------------------------------------- the counts */

describe("a count is never merged", () => {
  it("stays one entry per catalogue", () => {
    // The state travels with the number: a catalogue publishing no such count,
    // one that could not answer and one nobody asked all carry a null, and a
    // reader acts on which of the three they met.
    expect(card([STASHDB, TPDB]).counts.sceneCount).toEqual([
      { source: "stashdb", value: 1041, state: "answered" },
      { source: "tpdb", value: null, state: "answered" },
    ]);
  });

  it("never adds two counts into one, whatever the two hold", () => {
    const other = answered("tpdb", UUID_B, { ...TPDB.record, sceneCount: 812 });
    const counts = card([STASHDB, other]).counts.sceneCount ?? [];
    expect(counts).toEqual([
      { source: "stashdb", value: 1041, state: "answered" },
      { source: "tpdb", value: 812, state: "answered" },
    ]);
    // The sum would state a corpus nobody measured: the two overlap by an
    // amount neither catalogue publishes.
    expect(counts.some((entry) => entry.value === 1853)).toBe(false);
  });
});

/* ------------------------------------------------- what became of each reading */

describe("every catalogue asked is named with what became of it", () => {
  it("carries the identifier the record holds on each of them", () => {
    expect(card([STASHDB, TPDB]).held_by).toEqual([
      { source: "stashdb", id: `stashdb:${UUID_A}`, state: "answered" },
      { source: "tpdb", id: `tpdb:${UUID_B}`, state: "answered" },
    ]);
  });

  it("tells a catalogue that failed apart from one holding nothing", () => {
    const broken: Reading = {
      source: "tpdb",
      id: `tpdb:${UUID_B}`,
      state: "failed",
      error: "timeout",
    };
    const held = card([STASHDB, broken]);
    expect(held.held_by[1]).toMatchObject({ source: "tpdb", state: "failed", error: "timeout" });
    expect((held.fields.birthDate as CardValue).agreed_by).toEqual(["stashdb"]);
    expect(held.notes.join(" ")).toContain("could not answer");
  });

  it("says so where the catalogue the preference names is the one that failed", () => {
    const broken: Reading = { source: "stashdb", id: `stashdb:${UUID_A}`, state: "failed" };
    const held = card([broken, TPDB]);
    expect((held.fields.country as CardValue).value).toBe("AU");
    expect((held.fields.country as CardValue).agreed_by).toEqual(["tpdb"]);
    // A fallback nobody announced reads as the preferred catalogue's own answer.
    expect(held.notes.join(" ")).toContain("stashdb");
  });

  it("tells a catalogue never asked apart from one that failed", () => {
    const unasked: Reading = {
      source: "fansdb",
      state: "absent",
      reason: "No key is configured for FansDB, so it was never asked.",
    };
    const held = card([STASHDB, unasked]);
    expect(held.held_by[1]).toMatchObject({ source: "fansdb", state: "absent" });
    expect(held.held_by[1]).not.toHaveProperty("id");
  });

  it("answers with a card from one reading, claiming nothing about the rest", () => {
    const held = card([STASHDB]);
    expect(held.fields.birthDate as CardValue).toEqual({
      value: "1985-03-04",
      agreed_by: ["stashdb"],
    });
    expect(held.held_by).toHaveLength(1);
    expect(held.notes.join(" ")).not.toContain("agree");
  });
});

/* ----------------------------------------------------------- a folded record */

describe("a record a catalogue has folded", () => {
  it("is named as folded on that catalogue and consolidated no further", () => {
    const folded: Reading = {
      source: "tpdb",
      id: `tpdb:${UUID_B}`,
      state: "answered",
      record: { ...TPDB.record, status: "merged", mergedInto: `tpdb:${UUID_A}` },
    };
    const held = card([STASHDB, folded]);
    expect(held.held_by[1]).toMatchObject({ source: "tpdb", status: "merged" });
    expect(held.notes.join(" ")).toContain("folded");
  });
});
