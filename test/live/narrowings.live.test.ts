/**
 * Every narrowing that changes the shape of a request, put to the catalogues.
 *
 * A version shipped with six routes dead because the documents were written
 * from the field names the catalogues publish, without the wrappers their
 * schemas require. Every unit test passed, because none of them sends a
 * request, and the live suite of the day asked one call per route while the
 * wire shape varies **per narrowing**.
 *
 * So this suite asks one question per narrowing. A narrowing that travels
 * differently from its siblings gets its own case, and a case never pins what a
 * catalogue holds: that belongs to the people who edit it, and pinning it would
 * produce failures that say nothing about this client.
 *
 * Two things fail a case, because a refusal is only one of the two ways a
 * narrowing dies. **A refused request** is the loud one. **A request accepted
 * and answered as though it carried nothing** is the quiet one: a catalogue's
 * faceted input declares a field its route reads nothing of, so the page that
 * comes back is the first page of the whole index and reaches a caller as the
 * answer to what they narrowed. Its signature is a count of what the index
 * holds for the question that equals the count for no question at all, and that
 * is what every case here reads.
 */

import process from "node:process";
import { describe, expect, it } from "vitest";

import { StashboxClient } from "../../src/stashbox/client.js";
import type { InstanceId } from "../../src/stashbox/instances.js";
import type { SourceReport } from "../../src/types.js";

const KEYS: Partial<Record<InstanceId, string>> = {
  ...(process.env.STASHBOX_STASHDB_KEY ? { stashdb: process.env.STASHBOX_STASHDB_KEY } : {}),
  ...(process.env.STASHBOX_TPDB_KEY ? { tpdb: process.env.STASHBOX_TPDB_KEY } : {}),
};

const ENABLED = process.env.STASHBOX_LIVE === "1" && Object.keys(KEYS).length > 0;
const client = new StashboxClient({ keys: KEYS });

/** A catalogue that answered nothing because the request was refused. */
function refusals(reports: readonly SourceReport[]): string[] {
  return reports
    .filter((report) => report.state === "failed")
    .map((report) => `${report.name ?? report.source}: ${report.error} ${report.reason ?? ""}`);
}

/**
 * What each catalogue's index holds for no question at all, per entity.
 *
 * This is the number a narrowing has to move. Read once per entity from a
 * search carrying nothing but a size, which is the very page a narrowing that
 * travelled nowhere answers with.
 */
const CORPUS = new Map<string, Map<string, number>>();

async function corpus(kind: string): Promise<Map<string, number>> {
  const held = CORPUS.get(kind);
  if (held !== undefined) {
    return held;
  }
  const read = await (
    client[`search${kind}` as "searchScenes"] as (
      input: Record<string, unknown>,
    ) => Promise<{ data: { perSource: SourceReport[] } }>
  )({ limit: 1 });
  const totals = new Map<string, number>();
  for (const report of read.data.perSource) {
    if (report.state === "answered" && report.indexTotal !== undefined) {
      totals.set(report.source, report.indexTotal);
    }
  }
  CORPUS.set(kind, totals);
  return totals;
}

/**
 * The catalogues that answered a narrowed question with the whole of their
 * index.
 *
 * A catalogue that received the narrowing answers a count of its own. One that
 * did not answers the count it answers for nothing, and the page beneath it is
 * the first page of everything it holds.
 */
function unnarrowed(reports: readonly SourceReport[], totals: Map<string, number>): string[] {
  return reports
    .filter(
      (report) =>
        report.state === "answered" &&
        report.indexTotal !== undefined &&
        report.indexTotal === totals.get(report.source),
    )
    .map(
      (report) =>
        `${report.name ?? report.source}: ${String(report.indexTotal)}, which is everything its index holds`,
    );
}

/** Identifiers that exist, used only to give a narrowing something to carry. */
const A_PERFORMER = "stashdb:155f2559-d1f1-42b1-8cbe-9008542df5ce";
const A_STUDIO = "stashdb:915dd307-a440-4578-b83f-699b9706faea";
const A_PARENT_STUDIO = "stashdb:b62bc449-c3d9-49ff-9a16-8f5b1bfa20b9";
const A_TAG = "stashdb:9441c3ad-41d2-4d6e-bc97-54ad8cc227d5";
const ANOTHER_TAG = "stashdb:42d9e5c4-1a1d-4c93-bf47-9086f2016dcd";
const A_CATEGORY = "stashdb:ef4ae6d1-d13c-4195-b47e-f245e49051a6";

describe.skipIf(!ENABLED)("live: every scene narrowing reaches a catalogue", () => {
  const cases: [string, Parameters<StashboxClient["searchScenes"]>[0]][] = [
    ["words", { query: "sunset", limit: 1 }],
    ["a title", { title: "sunset", limit: 1 }],
    ["a code", { code: "START-614", limit: 1 }],
    ["an alias", { alias: "sunset", limit: 1 }],
    ["a date on a day", { date: "2017-11-02", dateCompare: "on", limit: 1 }],
    ["a date before a day", { date: "2018-01-01", dateCompare: "before", limit: 1 }],
    ["a date after a day", { date: "2017-01-01", dateCompare: "after", limit: 1 }],
    ["performers", { performerIds: [A_PERFORMER], limit: 1 }],
    ["studios", { studioIds: [A_STUDIO], limit: 1 }],
    ["a parent studio", { parentStudioId: A_PARENT_STUDIO, limit: 1 }],
    ["tags", { tagIds: [A_TAG], limit: 1 }],
    ["every one of a list", { tagIds: [A_TAG, ANOTHER_TAG], match: "all", limit: 1 }],
    ["any one of a list", { tagIds: [A_TAG, ANOTHER_TAG], match: "any", limit: 1 }],
    ["an order", { title: "sunset", sort: "date", direction: "asc", limit: 1 }],
    ["a page", { title: "sunset", page: 2, limit: 1 }],
  ];

  for (const [what, input] of cases) {
    it(`is answered when narrowed on ${what}`, async () => {
      const totals = await corpus("Scenes");
      const read = await client.searchScenes(input);
      expect(
        refusals(read.data.perSource),
        `a scene search narrowed on ${what} was refused, so the request this client builds is not one the catalogue takes`,
      ).toEqual([]);
      expect(
        unnarrowed(read.data.perSource, totals),
        `a scene search narrowed on ${what} was answered with the whole index, so the narrowing reached the catalogue and shaped nothing`,
      ).toEqual([]);
    }, 60_000);
  }
});

describe.skipIf(!ENABLED)("live: every performer narrowing reaches a catalogue", () => {
  const cases: [string, Parameters<StashboxClient["searchPerformers"]>[0]][] = [
    ["words", { query: "angela", limit: 1 }],
    ["a name", { name: "Angela White", limit: 1 }],
    ["an alias", { alias: "Angie", limit: 1 }],
    ["a disambiguation", { disambiguation: "Beautiful Agony", limit: 1 }],
    ["a country", { country: "AU", limit: 1 }],
    ["a gender", { gender: "FEMALE", limit: 1 }],
    ["an ethnicity", { ethnicity: "CAUCASIAN", limit: 1 }],
    ["a year of birth", { birthYear: 1985, limit: 1 }],
    ["a year a career opened", { careerStartYear: 2003, limit: 1 }],
    ["a year a career closed", { careerEndYear: 2020, limit: 1 }],
    ["someone performed with", { performedWith: A_PERFORMER, limit: 1 }],
    ["a studio", { studioId: A_STUDIO, limit: 1 }],
    ["an order", { name: "Angela", sort: "birthdate", direction: "asc", limit: 1 }],
    ["a page", { name: "Angela", page: 2, limit: 1 }],
  ];

  for (const [what, input] of cases) {
    it(`is answered when narrowed on ${what}`, async () => {
      const totals = await corpus("Performers");
      const read = await client.searchPerformers(input);
      expect(refusals(read.data.perSource), `narrowed on ${what}`).toEqual([]);
      expect(
        unnarrowed(read.data.perSource, totals),
        `a performer search narrowed on ${what} was answered with the whole index, so the narrowing reached the catalogue and shaped nothing`,
      ).toEqual([]);
    }, 60_000);
  }
});

describe.skipIf(!ENABLED)("live: every studio narrowing reaches a catalogue", () => {
  const cases: [string, Parameters<StashboxClient["searchStudios"]>[0]][] = [
    ["words", { query: "vixen", limit: 1 }],
    ["a name", { name: "Vixen", limit: 1 }],
    ["a parent", { parentId: A_PARENT_STUDIO, limit: 1 }],
    ["holding a parent at all", { hasParent: true, limit: 1 }],
    ["an order", { name: "Vixen", sort: "name", direction: "asc", limit: 1 }],
    ["a page", { name: "Vixen", page: 2, limit: 1 }],
  ];

  for (const [what, input] of cases) {
    it(`is answered when narrowed on ${what}`, async () => {
      const totals = await corpus("Studios");
      const read = await client.searchStudios(input);
      expect(refusals(read.data.perSource), `narrowed on ${what}`).toEqual([]);
      expect(
        unnarrowed(read.data.perSource, totals),
        `a studio search narrowed on ${what} was answered with the whole index, so the narrowing reached the catalogue and shaped nothing`,
      ).toEqual([]);
    }, 60_000);
  }
});

describe.skipIf(!ENABLED)("live: every tag narrowing reaches a catalogue", () => {
  const cases: [string, Parameters<StashboxClient["searchTags"]>[0]][] = [
    ["words", { query: "hair", limit: 1 }],
    ["a name", { name: "Brown Hair", limit: 1 }],
    ["a category", { categoryId: A_CATEGORY, limit: 1 }],
    ["an order", { name: "Hair", sort: "name", direction: "asc", limit: 1 }],
    ["a page", { name: "Hair", page: 2, limit: 1 }],
  ];

  for (const [what, input] of cases) {
    it(`is answered when narrowed on ${what}`, async () => {
      const totals = await corpus("Tags");
      const read = await client.searchTags(input);
      expect(refusals(read.data.perSource), `narrowed on ${what}`).toEqual([]);
      expect(
        unnarrowed(read.data.perSource, totals),
        `a tag search narrowed on ${what} was answered with the whole index, so the narrowing reached the catalogue and shaped nothing`,
      ).toEqual([]);
    }, 60_000);
  }
});

/** A tag on another catalogue, which no record of the one asked here carries. */
const A_FOREIGN_TAG = "tpdb:83f9360b-ea69-484d-b534-12b42f81ab67";

describe.skipIf(!ENABLED)("live: what a catalogue was asked is what the answer states", () => {
  it("asks nobody a question part of which names another catalogue's records", async () => {
    // The count for the part that survives is what a catalogue answers when the
    // rest of the question left quietly, and that page reaches a caller as the
    // answer to all of it.
    const alone = await client.searchScenes({ studioIds: [A_STUDIO], limit: 1 });
    const surviving = new Map(
      alone.data.perSource
        .filter((one) => one.state === "answered" && one.indexTotal !== undefined)
        .map((one) => [one.source, one.indexTotal]),
    );
    const both = await client.searchScenes({
      studioIds: [A_STUDIO],
      tagIds: [A_FOREIGN_TAG],
      limit: 1,
    });
    expect(refusals(both.data.perSource)).toEqual([]);
    const answering = both.data.perSource.filter(
      (one) => one.state === "answered" && one.indexTotal === surviving.get(one.source),
    );
    expect(
      answering.map((one) => `${one.name ?? one.source}: ${String(one.indexTotal)}`),
      "a catalogue answered the part of the question it could receive, and the answer hands that page over as the answer to the whole of it",
    ).toEqual([]);
    // The catalogue that answered the surviving part is the one this question
    // leaves nothing to narrow on, and it says which narrowing did that.
    for (const source of surviving.keys()) {
      const one = both.data.perSource.find((report) => report.source === source);
      expect(one?.narrowingsNamingNoRecord ?? [], `${source} was left out unexplained`).toContain(
        "tag_ids",
      );
    }
  }, 90_000);

  it("states the direction a call wrote with no order beside it", async () => {
    const read = await client.searchScenes({ title: "sunset", direction: "desc", limit: 3 });
    const answering = read.data.perSource.filter((one) => one.state === "answered");
    expect(
      answering.length,
      "no catalogue answered, so this case measures nothing",
    ).toBeGreaterThan(0);
    // The direction reaches the catalogue's route and the rows come back the
    // way it ran them. Called the catalogue's own order, the first row is read
    // as the one it holds first.
    expect(read.data.ordering).toContain("descending");

    const other = await client.searchScenes({ title: "sunset", direction: "asc", limit: 3 });
    const held = (rows: readonly unknown[]) =>
      rows.map((row) => (row as { id: string }).id).join(" ");
    if (answering.some((one) => (one.indexTotal ?? 0) > 3)) {
      expect(
        held(read.data.rows),
        "the two directions answered with one page, so nothing here reads the direction as applied",
      ).not.toBe(held(other.data.rows));
    }
  }, 90_000);
});

describe.skipIf(!ENABLED)("live: the fingerprint route reaches a catalogue", () => {
  const cases: [string, { hash: string; algorithm: "MD5" | "OSHASH" | "PHASH" }[]][] = [
    ["one OSHASH", [{ hash: "3c30b044619b6487", algorithm: "OSHASH" }]],
    ["one PHASH", [{ hash: "841f346c96e743b3", algorithm: "PHASH" }]],
    ["one MD5", [{ hash: "d41d8cd98f00b204e9800998ecf8427e", algorithm: "MD5" }]],
    [
      "several at once",
      [
        { hash: "3c30b044619b6487", algorithm: "OSHASH" },
        { hash: "841f346c96e743b3", algorithm: "PHASH" },
      ],
    ],
  ];

  for (const [what, fingerprints] of cases) {
    it(`is answered for ${what}`, async () => {
      const read = await client.findByFingerprint({ fingerprints });
      expect(refusals(read.data.perSource), `a lookup for ${what}`).toEqual([]);
    }, 60_000);
  }

  it("finds the record a hash this client itself published belongs to", async () => {
    // A route that answers nothing for a hash the catalogue just handed over is
    // broken whatever else it does.
    const scene = await client.getScene("stashdb:001659bc-3cfc-4b65-9419-958e91d9bcf4", [
      "basic",
      "fingerprints",
    ]);
    const carried = scene.data.fields.fingerprints;
    const print = (Array.isArray(carried) ? carried[0]?.value : undefined) as
      | { hash: string; algorithm: "MD5" | "OSHASH" | "PHASH" }
      | undefined;
    expect(print, "the record carried no fingerprint, so this case measures nothing").toBeDefined();
    if (!print) {
      return;
    }

    const read = await client.findByFingerprint({
      fingerprints: [{ hash: print.hash, algorithm: print.algorithm }],
    });
    expect(refusals(read.data.perSource)).toEqual([]);
    expect(
      read.data.matches.length,
      "a hash this catalogue published for one of its own records reached nothing",
    ).toBeGreaterThan(0);
  }, 90_000);
});

describe.skipIf(!ENABLED)(
  "live: a record is consolidated across the catalogues that hold it",
  () => {
    it("follows the link one catalogue publishes to the same person on another", async () => {
      // Measured and reciprocal on 2026-08-13: each of the two catalogues carries
      // the address of the other's record for this person, under a category it
      // keeps for exactly that.
      const card = await client.getPerformer("stashdb:155f2559-d1f1-42b1-8cbe-9008542df5ce");
      const asked = card.data.held_by.map((one) => one.source);
      expect(asked, "the link to the other catalogue was not followed").toContain("tpdb");
    }, 90_000);

    it("reads one catalogue alone where the caller named one, and names the rest", async () => {
      const card = await client.getPerformer("stashdb:155f2559-d1f1-42b1-8cbe-9008542df5ce", {
        sources: ["stashdb"],
      });
      // One catalogue was read. Every other one is named with why it was not,
      // since a card holding only what was read cannot tell a catalogue that
      // was asked and lacks the record from one nobody asked.
      expect(card.data.read_from).toEqual(["stashdb"]);
      const left = card.data.held_by.filter((one) => one.source !== "stashdb");
      expect(left.length).toBeGreaterThan(0);
      for (const one of left) {
        expect(one.state, `${one.source} was neither read nor named as unasked`).toBe("absent");
        expect(one.reason ?? "").not.toBe("");
      }
    }, 60_000);

    it("reads a studio and a tag on the catalogue that minted the identifier", async () => {
      const studio = await client.getStudio("stashdb:915dd307-a440-4578-b83f-699b9706faea");
      expect(refusals(studio.data.perSource ?? [])).toEqual([]);
      const tag = await client.getTag("stashdb:9441c3ad-41d2-4d6e-bc97-54ad8cc227d5");
      expect(refusals(tag.data.perSource ?? [])).toEqual([]);
    }, 90_000);
  },
);

describe.skipIf(!ENABLED)("live: what a card a fingerprint lookup opens states", () => {
  it("names every catalogue and announces the fallback the preference took", async () => {
    const scene = await client.getScene("stashdb:001659bc-3cfc-4b65-9419-958e91d9bcf4", [
      "basic",
      "fingerprints",
    ]);
    const carried = scene.data.fields.fingerprints;
    const print = (Array.isArray(carried) ? carried[0]?.value : undefined) as
      | { hash: string; algorithm: "MD5" | "OSHASH" | "PHASH" }
      | undefined;
    expect(print, "the record carried no fingerprint, so this case measures nothing").toBeDefined();
    if (!print) {
      return;
    }

    // The preference names a catalogue this suite holds no key for, so every
    // value on every card was read from another one.
    const read = await client.findByFingerprint({
      fingerprints: [{ hash: print.hash, algorithm: print.algorithm }],
      prefer: ["fansdb"],
    });
    expect(
      read.data.matches.length,
      "a hash of a record read here reached nothing",
    ).toBeGreaterThan(0);
    for (const match of read.data.matches) {
      const named = match.scene.held_by.map((one) => one.source);
      expect(named, "a card names a catalogue nobody read as absent from it").toContain("fansdb");
      expect(new Set(named).size, "a catalogue stands twice on one card").toBe(named.length);
      expect(
        match.scene.notes.some((one) => one.includes("this call preferred")),
        "a fallback was performed with nothing on the card announcing it",
      ).toBe(true);
    }
  }, 90_000);
});
