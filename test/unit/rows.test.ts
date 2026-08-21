/**
 * What a row of a search carries, and what it leaves to the record route.
 *
 * A search answers with identifiers and a record route answers with the record.
 * A row that carries the whole card spends the caller's page on the answer
 * rather than on the question: measured on twenty scenes read from one
 * catalogue, the synopsis, the link list and the editing stamps run to a fifth
 * of the payload, and none of them tells two releases apart.
 *
 * Both halves are read here. A field the record route answers with is gone from
 * the row, and the fields a caller picks a row by are still on it, since a page
 * trimmed past the point of telling two similar records apart costs a second
 * call per row and is the more expensive of the two mistakes.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TOOLS } from "../../src/tools/index.js";
import { StashboxClient } from "../../src/stashbox/client.js";

const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const OTHER = "019fec3f-1bb1-7383-8782-ea0e678f6de0";

const tool = (name: string) => {
  const found = TOOLS.find((one) => one.name === name);
  if (found === undefined) {
    throw new Error(`no tool is named ${name}`);
  }
  return found;
};

/** A catalogue answering one page, built from what the payload it is handed says. */
function answering(payload: (operation: string) => unknown): StashboxClient {
  return new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere" },
    transport: {
      request: async (_spec, _apiKey, body) => {
        const named = /(?:query|mutation)\s+\w+[^{]*\{\s*(\w+)/.exec(body.query)?.[1] ?? "";
        return payload(named) as never;
      },
    },
  });
}

/** One page of one kind of row, as the tool that asked for it publishes it. */
async function firstRow(
  name: string,
  written: Record<string, unknown>,
  container: string,
  one: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = answering((operation) => ({ [operation]: { count: 1, [container]: [one] } }));
  const read = tool(name).inputSchema.parse(written);
  const rendered = await tool(name).run(client as never, read as Record<string, unknown>);
  const rows = (rendered.structured as { results: Record<string, unknown>[] }).results;
  expect(rows.length, `${name} answered no row to read`).toBe(1);
  return rows[0] as Record<string, unknown>;
}

/** A scene as a catalogue publishes one, every selected field carrying a value. */
const SCENE = {
  id: UUID,
  title: "A title this test invented",
  details: "A synopsis this test invented, which runs to a paragraph on a real record.",
  code: "X-1",
  director: "A director this test invented",
  duration: 2400,
  release_date: "2019-04-12",
  production_date: "2019-03-01",
  deleted: false,
  created: "2019-05-01T00:00:00Z",
  updated: "2020-05-01T00:00:00Z",
  studio: { id: OTHER, name: "A studio this test invented", deleted: false, parent: null },
  performers: [
    {
      as: "An alias this test invented",
      performer: {
        id: OTHER,
        name: "A performer this test invented",
        disambiguation: null,
        deleted: false,
        merged_into_id: null,
      },
    },
  ],
  tags: [
    {
      id: OTHER,
      name: "A tag this test invented",
      deleted: false,
      category: { id: UUID, name: "Acts" },
    },
  ],
  urls: [{ url: "https://example.invalid/a", site: { id: UUID, name: "A site", category: null } }],
  edits: [],
};

describe("a scene row names the record and leaves the record to get_scene", () => {
  const dropped = ["details", "urls", "created", "updated", "director", "production_date"];

  for (const field of dropped) {
    it(`carries no ${field}`, async () => {
      const row = await firstRow("search_scenes", { title: "a title" }, "scenes", SCENE);
      expect(Object.keys(row)).not.toContain(field);
    });
  }

  it("keeps what a caller tells two releases apart by", async () => {
    const row = await firstRow("search_scenes", { title: "a title" }, "scenes", SCENE);
    for (const field of [
      "id",
      "source",
      "source_url",
      "status",
      "title",
      "code",
      "studio",
      "release_date",
      "duration_seconds",
      "performers",
      "tags",
    ]) {
      expect(Object.keys(row), `a scene row lost ${field}`).toContain(field);
    }
    // The credit a caller reads a row for: the name, and the identifier the
    // next call takes.
    const performers = row.performers as Record<string, unknown>[];
    expect(performers[0]?.name).toBe("A performer this test invented");
    expect(performers[0]?.id).toBe(`stashdb:${OTHER}`);
  });

  it("names each tag with the identifier the next call takes and nothing else", async () => {
    const row = await firstRow("search_scenes", { title: "a title" }, "scenes", SCENE);
    const tags = row.tags as Record<string, unknown>[];
    expect(Object.keys(tags[0] ?? {}).sort()).toEqual(["id", "name"]);
    expect(tags[0]?.id).toBe(`stashdb:${OTHER}`);
  });
});

describe("a card still answers with everything a row leaves out", () => {
  it("gives get_scene the fields the row drops", async () => {
    const client = answering(() => ({ findScene: SCENE }));
    const read = tool("get_scene").inputSchema.parse({ id: `stashdb:${UUID}` });
    const rendered = await tool("get_scene").run(client as never, read as never);
    const fields = (rendered.structured as { card: { fields: Record<string, unknown> } }).card
      .fields;
    for (const field of ["details", "urls", "director", "productionDate"]) {
      expect(Object.keys(fields), `get_scene lost ${field}`).toContain(field);
    }
  });
});

describe("the other three rows leave their card fields to the record route", () => {
  const PERFORMER = {
    id: UUID,
    name: "A performer this test invented",
    disambiguation: "b. 1985",
    aliases: ["Another name"],
    gender: "FEMALE",
    country: "AU",
    birth_date: "1985-01-01",
    death_date: null,
    career_start_year: 2003,
    career_end_year: 2020,
    deleted: false,
    merged_into_id: null,
    urls: [
      { url: "https://example.invalid/b", site: { id: UUID, name: "A site", category: null } },
    ],
    created: "2019-05-01T00:00:00Z",
    updated: "2020-05-01T00:00:00Z",
  };

  const STUDIO = {
    id: UUID,
    name: "A studio this test invented",
    aliases: ["Another studio name"],
    deleted: false,
    parent: null,
    urls: [
      { url: "https://example.invalid/c", site: { id: UUID, name: "A site", category: null } },
    ],
    images: [{ id: UUID, url: "https://example.invalid/d.jpg", width: 100, height: 100 }],
  };

  const TAG = {
    id: UUID,
    name: "A tag this test invented",
    description: "What this tag is for",
    aliases: ["Another tag name"],
    deleted: false,
    category: { id: OTHER, name: "Acts" },
  };

  it("drops the links and the editing stamps from a performer row, keeping who it names", async () => {
    const row = await firstRow("search_performers", { name: "a name" }, "performers", PERFORMER);
    for (const field of ["urls", "created", "updated"]) {
      expect(Object.keys(row)).not.toContain(field);
    }
    for (const field of ["name", "disambiguation", "aliases", "gender", "country", "birth_date"]) {
      expect(Object.keys(row), `a performer row lost ${field}`).toContain(field);
    }
  });

  it("drops the links and the pictures from a studio row, keeping what names it", async () => {
    const row = await firstRow("search_studios", { name: "a name" }, "studios", STUDIO);
    for (const field of ["urls", "images"]) {
      expect(Object.keys(row)).not.toContain(field);
    }
    for (const field of ["name", "parent"]) {
      expect(Object.keys(row), `a studio row lost ${field}`).toContain(field);
    }
  });

  it("keeps a tag row saying what the tag is and what it is filed under", async () => {
    const row = await firstRow("search_tags", { name: "a name" }, "tags", TAG);
    for (const field of ["name", "category", "description"]) {
      expect(Object.keys(row), `a tag row lost ${field}`).toContain(field);
    }
  });

  /* ------------------------------- what the schema says a row carries */

  /**
   * The reading the published schema declares for the rows of one search.
   *
   * A row of a scene and a row of a tag carry different fields, so each search
   * declares the kind its own rows are. One shape covering all four would name
   * every field of every kind as one any row might hold, which tells a client
   * reading it nothing about what a scene row carries.
   */
  const reading = (name: string) => {
    const declared = z.toJSONSchema(z.object(tool(name).outputSchema), {
      io: "output",
    }) as unknown as {
      properties: {
        results: { items: { properties: Record<string, unknown>; required?: string[] } };
      };
    };
    return declared.properties.results.items;
  };

  const ROWS: [string, string, Record<string, unknown>, Record<string, unknown>, string][] = [
    ["search_scenes", "scenes", { title: "a title" }, SCENE, "title"],
    ["search_performers", "performers", { name: "a name" }, PERFORMER, "gender"],
    ["search_studios", "studios", { name: "a name" }, STUDIO, "parent"],
    ["search_tags", "tags", { name: "a name" }, TAG, "description"],
  ];

  for (const [name, container, written, record, marker] of ROWS) {
    it(`${name} declares every field its rows carry`, async () => {
      const row = await firstRow(name, written, container, record);
      const declared = Object.keys(reading(name).properties);
      expect(declared, `${name} declares a row that names no ${marker}`).toContain(marker);
      for (const field of Object.keys(row)) {
        expect(declared, `${name} answers with ${field} and declares nothing about it`).toContain(
          field,
        );
      }
    });

    it(`${name} declares as carried only what its rows carry`, async () => {
      // A field a schema requires and an answer never holds fails a client that
      // validates what it is given, and one declared and never emitted is a
      // promise a caller plans against.
      const row = await firstRow(name, written, container, record);
      for (const field of reading(name).required ?? []) {
        expect(Object.keys(row), `${name} requires ${field} and answers without it`).toContain(
          field,
        );
      }
    });
  }

  it("declares the reading a row of a record its catalogue folded satisfies", async () => {
    // A merged record still answers, and what it carries is a marker: the row
    // names the record it was folded into and the fields around it stand as
    // the marker holds them.
    const row = await firstRow("search_performers", { name: "a name" }, "performers", {
      ...PERFORMER,
      deleted: true,
      merged_into_id: OTHER,
    });
    expect(row.status).toBe("merged");
    const declared = Object.keys(reading("search_performers").properties);
    for (const field of Object.keys(row)) {
      expect(declared, `a folded row carries ${field} and the schema declares nothing`).toContain(
        field,
      );
    }
  });
});
