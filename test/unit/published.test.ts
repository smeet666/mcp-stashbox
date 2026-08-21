/**
 * Every answer this server gives, held against the schema it publishes for it.
 *
 * A tool declares an `outputSchema`, and a client that validates structured
 * output rejects an answer that does not satisfy it. The declaration says
 * `additionalProperties: false`, so a key the schema does not name makes a
 * correct answer unusable, and the leak is invisible to every assertion written
 * about what an answer says: the payload carries more than was declared, and
 * reading it in a test finds exactly what the test looked for.
 *
 * So nothing here is written per key. Every tool is run, the payload it hands a
 * client is read back, and it is validated against that tool's own declaration.
 * A field added to an answer tomorrow and left out of the schema fails the suite
 * the day it appears.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { StashboxClient } from "../../src/stashbox/client.js";
import { TOOLS } from "../../src/tools/index.js";

const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const OTHER = "019fec3f-1bb1-7383-8782-ea0e678f6de0";
const OSHASH = "cc2fed05aa9ab4a8";
const PHASH = "e276686d35b2c94c";

/* ------------------------------------------------- reading a JSON Schema */

/** Where a mismatch was found, written as a reader of the payload would point. */
type Fault = string;

/**
 * What a payload breaks in the schema declared for it.
 *
 * Only the constructs these declarations use are read, and an unread construct
 * is silently accepted rather than reported: a checker that invented a rule
 * would fail answers that satisfy the published schema.
 */
function faults(schema: Record<string, unknown>, value: unknown, at = ""): Fault[] {
  const found: Fault[] = [];
  const where = at === "" ? "the answer" : at;

  const options = schema.anyOf as Record<string, unknown>[] | undefined;
  if (options !== undefined) {
    if (options.some((one) => faults(one, value, at).length === 0)) return [];
    return [`${where} matches none of the readings the schema declares`];
  }

  const named = schema.enum as unknown[] | undefined;
  if (named !== undefined && !named.includes(value)) {
    found.push(`${where} carries ${JSON.stringify(value)}, outside the set the schema declares`);
  }

  const type = schema.type as string | undefined;
  if (type === "array") {
    if (!Array.isArray(value)) return [`${where} is no array`];
    const items = schema.items as Record<string, unknown> | undefined;
    if (items !== undefined) {
      value.forEach((one, index) => {
        found.push(...faults(items, one, `${where}[${index}]`));
      });
    }
    return found;
  }
  if (type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [`${where} is no object`];
    }
    const held = value as Record<string, unknown>;
    const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    for (const name of (schema.required as string[]) ?? []) {
      if (!(name in held)) found.push(`${where} declares ${name} and carries none`);
    }
    for (const [name, one] of Object.entries(held)) {
      const declared = properties[name];
      if (declared === undefined) {
        if (schema.additionalProperties === false) {
          found.push(`${where} carries ${name}, which its schema does not declare`);
        }
        continue;
      }
      found.push(...faults(declared, one, `${where}.${name}`));
    }
    return found;
  }
  if (type === "string" && typeof value !== "string") found.push(`${where} is no string`);
  if (type === "number" && typeof value !== "number") found.push(`${where} is no number`);
  if (type === "boolean" && typeof value !== "boolean") found.push(`${where} is no boolean`);
  if (type === "null" && value !== null) found.push(`${where} is not null`);
  return found;
}

/* --------------------------------------------- the catalogues, answering */

const SCENE = {
  id: UUID,
  title: "Awakening",
  details: null,
  code: "X-1",
  director: null,
  duration: 2557,
  release_date: "2017-11-02",
  production_date: null,
  deleted: false,
  created: "2020-07-07T12:39:35Z",
  updated: "2022-03-09T05:21:01Z",
  studio: { id: OTHER, name: "Girlsway", deleted: false, parent: null },
  performers: [{ as: null, performer: { id: OTHER, name: "Angela White", deleted: false } }],
  tags: [{ id: OTHER, name: "Brown Hair", deleted: false, category: null }],
  urls: [{ url: "https://example.invalid/a", site: { id: UUID, name: "Twitter" } }],
  images: [{ id: UUID, url: "https://stashdb.org/images/x", width: 960, height: 544 }],
  fingerprints: [
    {
      hash: OSHASH,
      algorithm: "OSHASH",
      duration: 2556,
      submissions: 126,
      reports: 0,
      user_submitted: false,
    },
  ],
};

const PERFORMER = {
  id: UUID,
  name: "Angela White",
  disambiguation: null,
  aliases: ["Angie"],
  gender: "FEMALE",
  country: "AU",
  birth_date: "1985-03-04",
  death_date: null,
  career_start_year: 2003,
  career_end_year: null,
  deleted: false,
  merged_into_id: null,
  merged_ids: [],
  created: "2020-07-07T12:39:35Z",
  updated: "2022-03-09T05:21:01Z",
  scene_count: 12,
  urls: [],
  images: [],
  studios: [{ scene_count: 3, studio: { id: OTHER, name: "Girlsway", deleted: false } }],
};

const STUDIO = {
  id: UUID,
  name: "Girlsway",
  aliases: [],
  deleted: false,
  parent: null,
  urls: [],
  images: [],
};

const TAG = {
  id: UUID,
  name: "Brown Hair",
  description: null,
  aliases: [],
  deleted: false,
  category: { id: OTHER, name: "Hair Color", group: "Appearance", description: null },
};

/** The row a route answers with, for every route this server puts to a catalogue. */
const ANSWERS: Record<string, unknown> = {
  queryScenes: { count: 1, scenes: [SCENE] },
  queryPerformers: { count: 1, performers: [PERFORMER] },
  queryStudios: { count: 1, studios: [STUDIO] },
  queryTags: { count: 1, tags: [TAG] },
  searchScenes: { count: 1, scenes: [SCENE] },
  searchPerformers: { count: 1, performers: [PERFORMER] },
  searchScene: [SCENE],
  searchPerformer: [PERFORMER],
  searchStudio: [STUDIO],
  searchTag: [TAG],
  findScene: SCENE,
  findPerformer: PERFORMER,
  findStudio: STUDIO,
  findTag: TAG,
  findScenesBySceneFingerprints: [[SCENE]],
};

/** Catalogues that answer every route with a well-formed row of their own. */
function answering(): StashboxClient {
  return new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere", tpdb: "another" },
    transport: {
      request: async (_spec, _apiKey, body) => {
        const named = /(?:query|mutation)\s+\w+[^{]*\{\s*(\w+)/.exec(body.query)?.[1] ?? "";
        return { [named]: ANSWERS[named] ?? null } as never;
      },
    },
  });
}

/* ------------------------------------------------------------- the calls */

/**
 * One call per tool, and one per report a catalogue can leave behind.
 *
 * A report is where an answer says what a catalogue could not receive, and each
 * of those fields reaches a payload on a path of its own.
 */
const CALLS: [string, Record<string, unknown>][] = [
  ["get_sources", {}],
  ["search_scenes", { query: "sunset" }],
  ["search_scenes", { title: "sunset", sort: "date", direction: "asc", page: 2 }],
  // Every identifier written names one catalogue, so the other is asked nothing.
  ["search_scenes", { performer_ids: [`tpdb:${UUID}`] }],
  // Part of the list reaches each of them, and the rest names the other.
  ["search_scenes", { performer_ids: [`tpdb:${UUID}`, `stashdb:${OTHER}`] }],
  // A narrowing one catalogue's own input declares no field for.
  ["search_scenes", { parent_studio_id: `tpdb:${UUID}` }],
  ["search_performers", { query: "angela" }],
  ["search_performers", { name: "Angela White", gender: "FEMALE" }],
  // A narrowing the catalogue's route takes and reads nothing of.
  ["search_performers", { alias: "Angie" }],
  ["search_studios", { query: "girlsway" }],
  ["search_studios", { name: "Girlsway" }],
  ["search_tags", { query: "hair" }],
  ["search_tags", { name: "Brown Hair" }],
  ["get_scene", { id: `stashdb:${UUID}`, sections: ["basic", "fingerprints", "images"] }],
  ["get_performer", { id: `stashdb:${UUID}`, sections: ["basic", "appearance", "studios"] }],
  ["get_studio", { id: `stashdb:${UUID}` }],
  ["get_tag", { id: `stashdb:${UUID}` }],
  ["find_by_fingerprint", { fingerprints: [{ hash: OSHASH, algorithm: "OSHASH" }] }],
  // One catalogue searches perceptual hashes and the other does not, so the
  // answer names the algorithm that was never put to it.
  [
    "find_by_fingerprint",
    {
      fingerprints: [
        { hash: PHASH, algorithm: "PHASH" },
        { hash: OSHASH, algorithm: "OSHASH" },
      ],
      sections: ["basic", "fingerprints"],
    },
  ],
];

describe("every answer validates against the schema its tool publishes", () => {
  for (const [name, args] of CALLS) {
    it(`${name} ${JSON.stringify(args).slice(0, 62)}`, async () => {
      const tool = TOOLS.find((one) => one.name === name);
      expect(tool, `no tool named ${name}`).toBeDefined();
      if (tool === undefined) return;

      const read = tool.inputSchema.safeParse(args);
      expect(read.success, `${name} refused its own arguments: ${JSON.stringify(args)}`).toBe(true);
      if (!read.success) return;

      const rendered = await tool.run(answering() as never, read.data as Record<string, unknown>);
      const declared = z.toJSONSchema(z.object(tool.outputSchema), { io: "output" }) as Record<
        string,
        unknown
      >;
      expect(faults(declared, rendered.structured)).toEqual([]);
    });
  }

  /**
   * A row satisfies the reading its own search declares, and no other.
   *
   * Each search declares the kind of row it answers with. A declaration naming
   * the same fields on all four kinds would satisfy every answer while telling
   * a caller nothing about what a row of one kind holds, so every row is held
   * here against the three readings it is not.
   */
  const rowReading = (name: string): Record<string, unknown> => {
    const tool = TOOLS.find((one) => one.name === name);
    if (tool === undefined) throw new Error(`no tool named ${name}`);
    const declared = z.toJSONSchema(z.object(tool.outputSchema), {
      io: "output",
    }) as unknown as {
      properties: { results: { items: Record<string, unknown> } };
    };
    return declared.properties.results.items;
  };

  const SEARCHES = ["search_scenes", "search_performers", "search_studios", "search_tags"];

  for (const [name, args] of CALLS.filter(([one]) => SEARCHES.includes(one))) {
    it(`${name} ${JSON.stringify(args).slice(0, 40)} answers rows of the kind it declares`, async () => {
      const tool = TOOLS.find((one) => one.name === name);
      if (tool === undefined) throw new Error(`no tool named ${name}`);
      const read = tool.inputSchema.parse(args) as Record<string, unknown>;
      const rendered = await tool.run(answering() as never, read);
      const rows = (rendered.structured as { results: unknown[] }).results;

      for (const row of rows) {
        expect(faults(rowReading(name), row)).toEqual([]);
        for (const other of SEARCHES.filter((one) => one !== name)) {
          expect(
            faults(rowReading(other), row).length,
            `a row of ${name} satisfies the reading ${other} declares, so neither says what its rows hold`,
          ).toBeGreaterThan(0);
        }
      }
    });
  }

  it("puts every tool to the test", () => {
    // A tool nobody called here publishes a schema nothing holds it to.
    expect([...new Set(CALLS.map(([name]) => name))].sort()).toEqual(
      TOOLS.map((one) => one.name).sort(),
    );
  });
});
