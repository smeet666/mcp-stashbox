/**
 * Every argument a tool declares reaches the request the catalogue is sent.
 *
 * The live suite drives the client, and the unit suites drive the request
 * builders. Between them sits the layer that turns what a caller wrote into
 * what the client reads, and nothing was watching it: every argument whose name
 * holds more than one word was dropped there in silence, so a search narrowed
 * on a list of performers sent a request narrowed on nothing and the first page
 * of the whole index came back as the answer to it.
 *
 * Nothing here is written per argument. The list of tools is walked, every
 * declared argument is given a value its own schema accepts, and the request
 * the catalogue would receive is read back. An argument added tomorrow is
 * covered the day it is declared rather than the day somebody remembers it.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TOOLS } from "../../src/tools/index.js";
import { StashboxClient } from "../../src/stashbox/client.js";

const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const OTHER = "019fec3f-1bb1-7383-8782-ea0e678f6de0";

/** A value the declaration accepts, for an argument named as it is named. */
const VALUE: Record<string, unknown> = {
  query: "sunset",
  title: "sunset",
  name: "vixen",
  code: "START-614",
  alias: "sunset",
  date: "2019-04-12",
  date_compare: "after",
  performer_ids: [`stashdb:${UUID}`],
  studio_ids: [`stashdb:${UUID}`],
  tag_ids: [`stashdb:${UUID}`, `stashdb:${OTHER}`],
  parent_studio_id: `stashdb:${UUID}`,
  parent_id: `stashdb:${UUID}`,
  category_id: `stashdb:${UUID}`,
  performed_with: `stashdb:${UUID}`,
  studio_id: `stashdb:${UUID}`,
  has_parent: true,
  match: "any",
  gender: "FEMALE",
  country: "AU",
  ethnicity: "CAUCASIAN",
  disambiguation: "Beautiful Agony",
  birth_year: 1985,
  career_start_year: 2003,
  career_end_year: 2020,
  page: 3,
  limit: 7,
};

/** What each argument has to be visible as, once the request is built. */
const REACHES: Record<string, (sent: string) => boolean> = {
  query: (sent) => sent.includes("sunset"),
  title: (sent) => sent.includes("sunset"),
  name: (sent) => sent.includes("vixen"),
  code: (sent) => sent.includes("START-614"),
  alias: (sent) => sent.includes("sunset"),
  date: (sent) => sent.includes("2019-04-12"),
  date_compare: (sent) => sent.includes("GREATER_THAN"),
  // An identifier reaches the catalogue that minted it, as the bare uuid.
  performer_ids: (sent) => sent.includes(UUID) && !sent.includes(`stashdb:${UUID}`),
  studio_ids: (sent) => sent.includes(UUID) && !sent.includes(`stashdb:${UUID}`),
  tag_ids: (sent) => sent.includes(UUID) && sent.includes(OTHER),
  parent_studio_id: (sent) => sent.includes(UUID),
  parent_id: (sent) => sent.includes(UUID),
  category_id: (sent) => sent.includes(UUID),
  performed_with: (sent) => sent.includes(UUID),
  studio_id: (sent) => sent.includes(UUID),
  has_parent: (sent) => sent.includes('"has_parent":true'),
  match: (sent) => sent.includes("INCLUDES") && !sent.includes("INCLUDES_ALL"),
  gender: (sent) => sent.includes("FEMALE"),
  country: (sent) => sent.includes('"AU"'),
  ethnicity: (sent) => sent.includes("CAUCASIAN"),
  disambiguation: (sent) => sent.includes("Beautiful Agony"),
  birth_year: (sent) => sent.includes("1985"),
  career_start_year: (sent) => sent.includes("2003"),
  career_end_year: (sent) => sent.includes("2020"),
  page: (sent) => sent.includes('"page":3'),
  limit: (sent) => sent.includes('"per_page":7'),
};

/** The arguments that decide who is asked rather than what is asked. */
const NOT_A_NARROWING = new Set(["sources", "prefer", "sections", "sort", "direction", "id"]);

/**
 * The narrowings a catalogue's faceted input declares and its route reads
 * nothing of.
 *
 * Measured on 2026-08-14: written into a request, each of these answers the
 * count, the page and the first row of a request carrying no narrowing at all.
 * They never reach a catalogue, so they owe a caller the other half of the rule:
 * the answer names them as narrowings the route did not receive, and a page
 * narrowed on nothing is never handed over as the answer to them.
 */
const ANSWERED_BY_NO_ROUTE: Record<string, readonly string[]> = {
  search_scenes: ["alias"],
  search_performers: ["alias", "career_start_year", "career_end_year"],
  search_studios: [],
  search_tags: [],
};

/** A client that reaches no catalogue and hands back what it would have sent. */
function watching(): { client: StashboxClient; sent: string[] } {
  const sent: string[] = [];
  const client = new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere" },
    transport: {
      request: async (_spec, _apiKey, body) => {
        sent.push(JSON.stringify(body.variables ?? {}));
        // A shape the reading refuses, so nothing here depends on an answer.
        throw new Error("this test reads the request and never an answer");
      },
    },
  });
  return { client, sent };
}

/** A client whose catalogue answers a well-formed empty page, so a report comes back. */
function answering(): StashboxClient {
  return new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere" },
    transport: {
      request: async (_spec, _apiKey, body) => {
        const named = /(?:query|mutation)\s+\w+[^{]*\{\s*(\w+)/.exec(body.query)?.[1] ?? "";
        const rows = named.toLowerCase().includes("performer")
          ? "performers"
          : named.toLowerCase().includes("studio")
            ? "studios"
            : named.toLowerCase().includes("tag")
              ? "tags"
              : "scenes";
        return { [named]: { count: 0, [rows]: [] } } as never;
      },
    },
  });
}

/** One narrowing, written on its own with whatever the declaration reads beside it. */
function written(argument: string): Record<string, unknown> {
  const held: Record<string, unknown> = { [argument]: VALUE[argument] };
  // A date and the comparison it is read with travel together.
  if (argument === "date") held.date_compare = "after";
  if (argument === "date_compare") held.date = "2019-04-12";
  // A list of identifiers is read one way or the other, and the reading is what
  // `match` decides, so it needs a list to decide about.
  if (argument === "match") held.tag_ids = VALUE.tag_ids;
  return held;
}

const searches = TOOLS.filter((one) => one.name.startsWith("search_"));

/** What one tool says about each argument it declares, or nothing where it says none. */
function describedBy(tool: (typeof TOOLS)[number], argument: string): string {
  const shape = (tool.declared as z.ZodObject<z.ZodRawShape>).shape;
  return (shape[argument] as { description?: string } | undefined)?.description ?? "";
}

describe("every narrowing a search declares reaches the catalogue", () => {
  for (const tool of searches) {
    const inert = ANSWERED_BY_NO_ROUTE[tool.name] ?? [];
    const declared = Object.keys((tool.declared as z.ZodObject<z.ZodRawShape>).shape).filter(
      (name) => !NOT_A_NARROWING.has(name) && name !== "query",
    );

    for (const argument of declared.filter((name) => !inert.includes(name))) {
      it(`${tool.name} sends ${argument}`, async () => {
        const value = VALUE[argument];
        expect(value, `this suite holds no value for ${argument}`).toBeDefined();
        const reaches = REACHES[argument];
        expect(reaches, `this suite says nothing about what ${argument} looks like`).toBeDefined();

        const asked = written(argument);
        const read = tool.inputSchema.safeParse(asked);
        expect(
          read.success,
          `${tool.name} refused its own ${argument}: ${JSON.stringify(asked)}`,
        ).toBe(true);

        const { client, sent } = watching();
        await tool.run(client as never, read.success ? (read.data as Record<string, unknown>) : {});

        expect(sent.length, `${tool.name} sent no request for ${argument}`).toBeGreaterThan(0);
        expect(
          sent.some((one) => reaches?.(one) === true),
          `${tool.name} declares ${argument} and the catalogue was sent ${sent.join(" ")}`,
        ).toBe(true);
      });
    }

    for (const argument of inert) {
      it(`${tool.name} names ${argument} as one the route did not receive`, async () => {
        expect(
          declared,
          `${tool.name} does not declare ${argument}, so this case measures nothing`,
        ).toContain(argument);
        const read = tool.inputSchema.parse(written(argument));
        const rendered = await tool.run(answering() as never, read as Record<string, unknown>);
        const reports = (rendered.structured as { per_source: { source: string }[] }).per_source;
        const stashdb = reports.find((one) => one.source === "stashdb") as {
          state?: string;
          narrowings_not_received?: string[];
          reason?: string;
        };
        // The only question left for the catalogue is a page of its whole
        // index. Answered, that page reaches a reader as the answer to the
        // question they narrowed, so it is never asked and the answer says
        // which narrowing left it with nothing.
        expect(stashdb?.state).toBe("absent");
        expect(stashdb?.narrowings_not_received ?? []).toContain(argument);
        expect(stashdb?.reason ?? "").toContain(argument);
        expect((rendered.structured as { results: unknown[] }).results).toEqual([]);
      });
    }

    for (const argument of inert) {
      it(`${tool.name} declares ${argument} as one no route applies`, () => {
        // The answer names it after the fact, and a caller reads the argument
        // list before calling. An argument published with nothing saying so is
        // one a caller spends a call to discover.
        const said = describedBy(tool, argument);
        expect(said, `${argument} is published with no description at all`).not.toBe("");
        expect(said.toLowerCase()).toContain("no catalogue's faceted route applies");
      });
    }

    for (const argument of declared.filter((name) => !inert.includes(name))) {
      it(`${tool.name} says nothing of the kind about ${argument}`, () => {
        // The sentence belongs to the narrowings nothing applies. Written over
        // one a catalogue does narrow on, it refuses a call that would have
        // answered.
        const said = describedBy(tool, argument);
        expect(said.toLowerCase()).not.toContain("no catalogue's faceted route applies");
      });
    }

    it(`${tool.name} sends the words of a text search`, async () => {
      const { client, sent } = watching();
      const read = tool.inputSchema.parse({ query: "sunset" });
      await tool.run(client as never, read as Record<string, unknown>);
      expect(sent.some((one) => one.includes("sunset"))).toBe(true);
    });
  }
});

describe("a record route reads the catalogue the caller named", () => {
  for (const tool of TOOLS.filter(
    (one) => one.name.startsWith("get_") && one.name !== "get_sources",
  )) {
    it(`${tool.name} refuses an identifier the named catalogues exclude`, async () => {
      const { client, sent } = watching();
      const read = tool.inputSchema.parse({ id: `stashdb:${UUID}`, sources: ["tpdb"] });
      // Answered as an empty card, this would read as the named catalogue
      // holding nothing, when nobody asked it anything.
      await expect(
        tool.run(client as never, read as Record<string, unknown>),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(sent, `${tool.name} asked a catalogue before refusing`).toEqual([]);
    });
  }
});
