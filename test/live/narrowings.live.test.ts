/**
 * Every narrowing that changes the shape of a request, put to the catalogues.
 *
 * A version shipped with six routes dead because the documents were written
 * from the catalogues' field names without the wrappers their schemas require:
 * a criterion is an object carrying a value and a comparison, a scene takes one
 * studio so its list is a union, and the fingerprint route reads a list of
 * groups. Every unit test passed, because none of them sends a request, and the
 * live suite covered one call per route rather than one per shape.
 *
 * So this suite asks one question per **narrowing**, not per route. A narrowing
 * that travels differently from its siblings gets its own case, and a case
 * fails when a catalogue refuses the request rather than when it answers
 * something unexpected: what a catalogue holds belongs to the people who edit
 * it, and pinning that would produce failures that say nothing about this
 * client.
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

/** Identifiers that exist on StashDB, used only to give a narrowing something to carry. */
const A_PERFORMER = "stashdb:155f2559-d1f1-42b1-8cbe-9008542df5ce";
const A_STUDIO = "stashdb:9f51116e-9b2f-4d1c-a5a2-2a2a4dd8f74c";
const A_TAG = "stashdb:86783b99-3e60-4be0-909e-d00afe65c9ef";

describe.skipIf(!ENABLED)("live: every scene narrowing reaches a catalogue", () => {
  const cases: [string, Parameters<StashboxClient["searchScenes"]>[0]][] = [
    ["words", { query: "sunset", limit: 1 }],
    ["title", { title: "sunset", limit: 1 }],
    ["code", { code: "START-614", limit: 1 }],
    ["one date bound", { dateFrom: "2017-01-01", limit: 1 }],
    ["the other date bound", { dateTo: "2018-01-01", limit: 1 }],
    ["both date bounds", { dateFrom: "2017-01-01", dateTo: "2018-01-01", limit: 1 }],
    ["performers", { performerIds: [A_PERFORMER], limit: 1 }],
    ["studios", { studioIds: [A_STUDIO], limit: 1 }],
    ["tags", { tagIds: [A_TAG], limit: 1 }],
    ["several tags", { tagIds: [A_TAG, "stashdb:0b3a5375-77f5-4e2b-a1ba-0a1eb0d21a24"], limit: 1 }],
    ["every one of a list", { tagIds: [A_TAG], match: "all", limit: 1 }],
    ["any one of a list", { tagIds: [A_TAG], match: "any", limit: 1 }],
    ["an order", { title: "sunset", sort: "date", direction: "asc", limit: 1 }],
    ["a page", { title: "sunset", page: 2, limit: 1 }],
  ];

  for (const [what, input] of cases) {
    it(`is answered when narrowed on ${what}`, async () => {
      const read = await client.searchScenes(input);
      expect(
        refusals(read.data.perSource),
        `a scene search narrowed on ${what} was refused by a catalogue, so the request this client built is not one it takes`,
      ).toEqual([]);
    }, 60_000);
  }
});

describe.skipIf(!ENABLED)("live: every performer narrowing reaches a catalogue", () => {
  const cases: [string, Parameters<StashboxClient["searchPerformers"]>[0]][] = [
    ["words", { query: "angela", limit: 1 }],
    ["a name", { name: "Angela White", limit: 1 }],
    ["a disambiguation", { disambiguation: "Beautiful Agony", limit: 1 }],
    ["a country", { country: "AU", limit: 1 }],
    ["someone performed with", { performedWith: A_PERFORMER, limit: 1 }],
    ["a studio", { studioId: A_STUDIO, limit: 1 }],
    ["an order", { name: "Angela", sort: "birth_date", direction: "asc", limit: 1 }],
    ["a page", { name: "Angela", page: 2, limit: 1 }],
  ];

  for (const [what, input] of cases) {
    it(`is answered when narrowed on ${what}`, async () => {
      const read = await client.searchPerformers(input);
      expect(
        refusals(read.data.perSource),
        `a performer search narrowed on ${what} was refused by a catalogue, so the request this client built is not one it takes`,
      ).toEqual([]);
    }, 60_000);
  }
});

describe.skipIf(!ENABLED)("live: the fingerprint route reaches a catalogue", () => {
  // The three algorithms travel in one variable whose shape the catalogues
  // declare as a list of groups, so each of them is put to a catalogue here.
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
      expect(
        refusals(read.data.perSource),
        `a fingerprint lookup for ${what} was refused by a catalogue, so the request this client built is not one it takes`,
      ).toEqual([]);
    }, 60_000);
  }

  it("finds the record a hash this client itself published belongs to", async () => {
    // Read one scene, take a hash it carries, and put that hash back. A route
    // that answers nothing for a hash the catalogue just handed over is broken
    // whatever else it does.
    const scene = await client.getScene("stashdb:001659bc-3cfc-4b65-9419-958e91d9bcf4", [
      "basic",
      "fingerprints",
    ]);
    const print = scene.data.fingerprints?.[0];
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

describe.skipIf(!ENABLED)("live: every section of a record is answered", () => {
  it("reads a scene with each section asked for", async () => {
    const read = await client.getScene("stashdb:001659bc-3cfc-4b65-9419-958e91d9bcf4", [
      "basic",
      "fingerprints",
      "images",
    ]);
    expect(read.data.id).toBe("stashdb:001659bc-3cfc-4b65-9419-958e91d9bcf4");
    expect(
      read.data.fingerprints,
      "the fingerprints section was asked for and is absent",
    ).toBeDefined();
    expect(read.data.images, "the images section was asked for and is absent").toBeDefined();
  }, 60_000);

  it("reads a performer with each section asked for", async () => {
    const read = await client.getPerformer(A_PERFORMER, [
      "basic",
      "appearance",
      "images",
      "scenes",
      "studios",
    ]);
    expect(read.data.id).toBe(A_PERFORMER);
    expect(
      read.data.appearance,
      "the appearance section was asked for and is absent",
    ).toBeDefined();
    expect(read.data.images, "the images section was asked for and is absent").toBeDefined();
    expect(read.data.scenes, "the scenes section was asked for and is absent").toBeDefined();
    expect(read.data.studios, "the studios section was asked for and is absent").toBeDefined();
  }, 90_000);
});
