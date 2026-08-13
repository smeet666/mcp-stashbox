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
 * differently from its siblings gets its own case, and a case fails when a
 * catalogue refuses the request rather than when it answers something
 * unexpected: what a catalogue holds belongs to the people who edit it, and
 * pinning that would produce failures that say nothing about this client.
 */

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
      const read = await client.searchScenes(input);
      expect(
        refusals(read.data.perSource),
        `a scene search narrowed on ${what} was refused, so the request this client builds is not one the catalogue takes`,
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
    ["an order", { name: "Angela", sort: "birth_date", direction: "asc", limit: 1 }],
    ["a page", { name: "Angela", page: 2, limit: 1 }],
  ];

  for (const [what, input] of cases) {
    it(`is answered when narrowed on ${what}`, async () => {
      const read = await client.searchPerformers(input);
      expect(refusals(read.data.perSource), `narrowed on ${what}`).toEqual([]);
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
      const read = await client.searchStudios(input);
      expect(refusals(read.data.perSource), `narrowed on ${what}`).toEqual([]);
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
      const read = await client.searchTags(input);
      expect(refusals(read.data.perSource), `narrowed on ${what}`).toEqual([]);
    }, 60_000);
  }
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
      { hash: string; algorithm: "MD5" | "OSHASH" | "PHASH" } | undefined;
    expect(print, "the record carried no fingerprint, so this case measures nothing").toBeDefined();
    if (!print) return;

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

    it("reads one catalogue alone where the caller named one", async () => {
      const card = await client.getPerformer("stashdb:155f2559-d1f1-42b1-8cbe-9008542df5ce", {
        sources: ["stashdb"],
      });
      expect(card.data.held_by.map((one) => one.source)).toEqual(["stashdb"]);
    }, 60_000);

    it("reads a studio and a tag on the catalogue that minted the identifier", async () => {
      const studio = await client.getStudio("stashdb:915dd307-a440-4578-b83f-699b9706faea");
      expect(refusals(studio.data.perSource ?? [])).toEqual([]);
      const tag = await client.getTag("stashdb:9441c3ad-41d2-4d6e-bc97-54ad8cc227d5");
      expect(refusals(tag.data.perSource ?? [])).toEqual([]);
    }, 90_000);
  },
);
