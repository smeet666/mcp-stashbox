/**
 * What this server publishes about itself, and what it refuses.
 *
 * A declaration is a promise, and the rule that governs the whole server has a
 * reading for it: **a rule announced and not applied is worse than none.** A
 * schema that says it takes nothing else while the runtime accepts something
 * else makes every other line of the schema worth nothing.
 *
 * Three things are held here.
 *
 * **Every refusal carries one of the six codes**, at every depth, because that
 * is what a caller branches on. A message a validator writes on its own arrives
 * without one.
 *
 * **Every tool declares the same things.** Five registrars honouring a rule at
 * three sites is the defect shape this project has met in every review, so the
 * assertions below run over the whole list rather than over one tool.
 *
 * **A shape is declared once.** Writing the same record shape into five output
 * schemas cost about 25,000 tokens per session, more than half of it the same
 * description strings repeated, and a caller paid it before asking anything.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TOOLS } from "../../src/tools/index.js";

/** The six codes, closed. Only the first is a statement about the world. */
const CODES = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
];

const NAMES = [
  "get_sources",
  "search_scenes",
  "search_performers",
  "search_studios",
  "search_tags",
  "get_scene",
  "get_performer",
  "get_studio",
  "get_tag",
  "find_by_fingerprint",
];

/** The messages of a refusal, or a failure saying the input was accepted. */
function refusal(schema: z.ZodTypeAny, input: unknown): string {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("the schema accepted an input it was expected to refuse");
  return result.error.issues.map((issue) => issue.message).join("\n");
}

const tool = (name: string) => {
  const found = TOOLS.find((one) => one.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
};

/* -------------------------------------------------------------- the list */

describe("the list of tools", () => {
  it("publishes each of the ten, in a fixed order", () => {
    // A client caches the list it is given, and an order that varies between
    // two runs invalidates that cache for nothing.
    expect(TOOLS.map((one) => one.name)).toEqual(NAMES);
  });

  it("gives every one of them a title, a description and both schemas", () => {
    for (const one of TOOLS) {
      expect(one.title, `${one.name} has no title`).toBeTruthy();
      expect(one.description, `${one.name} has no description`).toBeTruthy();
      expect(one.inputSchema, `${one.name} declares no input`).toBeDefined();
      expect(one.outputSchema, `${one.name} declares no output`).toBeDefined();
    }
  });

  it("marks every one of them as reading and never writing", () => {
    // The first sentence this server says about itself is that it writes
    // nowhere. A client that gates on the hint reads three of ten as unsafe.
    for (const one of TOOLS) {
      expect(one.annotations?.readOnlyHint, `${one.name} claims no read-only hint`).toBe(true);
      expect(one.annotations?.openWorldHint, `${one.name} claims no open-world hint`).toBe(true);
    }
  });

  it("refuses an argument it does not declare, on every one of them", () => {
    for (const one of TOOLS) {
      const said = refusal(one.inputSchema, { nonsense: 1 });
      expect(said, `${one.name} accepted an argument it never declared`).toContain(
        "[invalid_input]",
      );
    }
  });

  it("names the declared argument a near miss was reaching for", () => {
    const said = refusal(tool("search_scenes").inputSchema, { titel: "sunset" });
    expect(said).toContain("did you mean title");
  });
});

/* ------------------------------------------------------------ every refusal */

describe("every refusal opens with one of the six codes", () => {
  const cases: [string, unknown][] = [
    ["search_scenes", { limit: 0 }],
    ["search_scenes", { limit: 500 }],
    ["search_scenes", { page: 0 }],
    ["search_scenes", { title: "" }],
    ["search_scenes", { title: "   " }],
    ["search_scenes", { date: "2019-02-30", date_compare: "on" }],
    ["search_scenes", { date: "not a day", date_compare: "on" }],
    ["search_scenes", { performer_ids: [] }],
    ["search_scenes", { performer_ids: ["nonsense"] }],
    ["search_scenes", { match: "either" }],
    ["search_scenes", { sources: [] }],
    ["search_scenes", { sources: ["nowhere"] }],
    ["search_performers", { country: "France" }],
    ["search_performers", { birth_year: 12 }],
    ["get_scene", {}],
    ["get_scene", { id: "94ef9c17" }],
    ["get_scene", { id: "stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960", sections: [] }],
    ["get_scene", { id: "stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960", sections: ["nothing"] }],
    ["get_tag", { id: "elsewhere:94ef9c17-82c6-48b0-8dcc-063b69231960" }],
    ["find_by_fingerprint", { fingerprints: [] }],
    ["find_by_fingerprint", { fingerprints: [{ hash: "abc" }] }],
    ["find_by_fingerprint", { fingerprints: [{ hash: "abc", algorithm: "SHA1" }] }],
    ["find_by_fingerprint", { fingerprints: [{ hash: "abc", algorithm: "MD5", extra: 1 }] }],
  ];

  for (const [name, input] of cases) {
    it(`${name} refuses ${JSON.stringify(input).slice(0, 58)}`, () => {
      const said = refusal(tool(name).inputSchema, input);
      const carried = CODES.some((code) => said.includes(`[${code}]`));
      expect(carried, `a refusal reached a caller with no code: ${said}`).toBe(true);
    });
  }
});

/* ------------------------------------------------- the two paths are exclusive */

describe("a text search and a faceted search are exclusive", () => {
  const both: [string, Record<string, unknown>][] = [
    ["search_scenes", { query: "sunset", title: "sunset" }],
    [
      "search_scenes",
      { query: "sunset", tag_ids: ["stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960"] },
    ],
    ["search_scenes", { query: "sunset", date: "2019-04-12", date_compare: "on" }],
    ["search_performers", { query: "angela", name: "angela" }],
    ["search_performers", { query: "angela", country: "AU" }],
    ["search_studios", { query: "vixen", name: "vixen" }],
    ["search_tags", { query: "hair", category_id: "stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960" }],
  ];

  for (const [name, input] of both) {
    it(`${name} refuses words written beside ${Object.keys(input)[1]}`, () => {
      const said = refusal(tool(name).inputSchema, input);
      expect(said).toContain("[invalid_input]");
      // The two combine their terms in opposite ways: the words are read as a
      // union, the typed filters as an intersection. Answering one while
      // reporting the other as unreceived hands back rows narrowed by a logic
      // the caller did not choose.
      expect(said).toContain("query");
      expect(said).toContain(Object.keys(input)[1] ?? "");
    });
  }

  it("takes an order and a page beside words, which narrow nothing", () => {
    const ok = tool("search_scenes").inputSchema.safeParse({
      query: "sunset",
      page: 2,
      limit: 5,
      sources: ["stashdb"],
    });
    expect(ok.success).toBe(true);
  });

  it("takes the typed filters together, since they are read as an intersection", () => {
    const ok = tool("search_scenes").inputSchema.safeParse({
      title: "sunset",
      code: "X-1",
      date: "2019-04-12",
      date_compare: "after",
      match: "all",
    });
    expect(ok.success).toBe(true);
  });
});

describe("a date and the comparison it is read with travel together", () => {
  it("refuses a comparison written with no date to compare", () => {
    const said = refusal(tool("search_scenes").inputSchema, { date_compare: "after" });
    expect(said).toContain("[invalid_input]");
    expect(said).toContain("date");
  });

  it("refuses a date with no comparison, which would state one nobody chose", () => {
    const said = refusal(tool("search_scenes").inputSchema, { date: "2019-04-12" });
    expect(said).toContain("[invalid_input]");
  });

  it("declares no pair of bounds, since no catalogue answers a range", () => {
    const declared = Object.keys(
      (tool("search_scenes").inputSchema as z.ZodObject<z.ZodRawShape>).shape,
    );
    expect(declared).not.toContain("date_from");
    expect(declared).not.toContain("date_to");
  });
});

/* ------------------------------------------------------ what each tool takes */

describe("each tool declares what the specification gives it", () => {
  const expected: [string, string[]][] = [
    ["get_sources", []],
    [
      "search_scenes",
      [
        "query",
        "title",
        "code",
        "alias",
        "date",
        "date_compare",
        "performer_ids",
        "studio_ids",
        "parent_studio_id",
        "tag_ids",
        "match",
        "sort",
        "direction",
        "page",
        "limit",
        "sources",
      ],
    ],
    ["get_scene", ["id", "sections", "sources", "prefer"]],
    ["get_studio", ["id", "sources", "prefer"]],
    ["get_tag", ["id", "sources", "prefer"]],
    ["find_by_fingerprint", ["fingerprints", "sources", "prefer"]],
  ];

  for (const [name, args] of expected) {
    it(`${name} takes exactly what it is specified to take`, () => {
      const shape = (tool(name).inputSchema as z.ZodObject<z.ZodRawShape>).shape;
      expect(Object.keys(shape).sort()).toEqual([...args].sort());
    });
  }

  it("gives get_sources nothing to take, since it reaches no catalogue", () => {
    expect(tool("get_sources").inputSchema.safeParse({}).success).toBe(true);
  });
});

/* --------------------------------------------------- what a schema costs */

describe("a shape is declared once", () => {
  it("carries no shape a schema never names", () => {
    // A shape a schema holds and never refers to costs a caller exactly what a
    // shape it uses costs: the list is read whole before a question is asked.
    for (const one of TOOLS) {
      const schema = one.outputSchema as { $defs?: Record<string, unknown> };
      const json = JSON.stringify(schema);
      for (const name of Object.keys(schema.$defs ?? {})) {
        expect(
          json.includes(`#/$defs/${name}`),
          `${one.name} carries the shape ${name} and refers to it nowhere`,
        ).toBe(true);
      }
    }
  });

  it("refers to a shape rather than writing it out, wherever two tools share one", () => {
    for (const one of TOOLS) {
      const schema = one.outputSchema as { properties?: Record<string, unknown> };
      const written = JSON.stringify(schema.properties ?? {});
      // The properties of a tool name the shapes; the shapes themselves live
      // under $defs and are written once per schema rather than per field.
      expect(
        written.split('"source_url"').length - 1,
        `${one.name} writes a record shape into its own properties`,
      ).toBe(0);
    }
  });

  it("declares ten tools for less than the five that came before cost", () => {
    const bytes = JSON.stringify(TOOLS.map((one) => one.outputSchema)).length;
    expect(bytes).toBeLessThan(91_436);
  });
});
