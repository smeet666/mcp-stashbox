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
    ["find_by_fingerprint", ["fingerprints", "sections", "sources", "prefer"]],
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

/* ------------------------------------- what a refusal says a tool does take */

describe("a refusal names what the tool takes instead", () => {
  it("says a tool taking nothing takes nothing, rather than listing an emptiness", () => {
    // A sentence that ends "It takes: ." lists nothing and reads as a list
    // somebody forgot to fill in, which sends a caller looking for the
    // arguments this tool would take.
    const said = refusal(tool("get_sources").inputSchema, { limit: 3 });
    expect(said).toContain("[invalid_input]");
    expect(said).toContain("limit");
    expect(said).not.toContain("It takes: .");
    expect(said).toContain("takes no argument at all");
  });

  it("enumerates what a tool with arguments takes", () => {
    const said = refusal(tool("search_scenes").inputSchema, { nonsense: 1 });
    expect(said).toContain("It takes: query, title");
  });
});

/* --------------------------------------- what a caller reads before calling */

describe("an argument whose default decides the answer says so", () => {
  const describedBy = (name: string, argument: string) => {
    const shape = (tool(name).declared as z.ZodObject<z.ZodRawShape>).shape;
    return (shape[argument] as { description?: string } | undefined)?.description ?? "";
  };

  it("describes match, names its default, and names the arguments it governs", () => {
    // Measured: one call answers 1282 rows of an index under 'all' and 22074
    // under 'any'. A caller who cannot read which of the two stands by default
    // plans a session on a number the argument decided for them.
    const said = describedBy("search_scenes", "match");
    expect(said, "match is published with no description at all").not.toBe("");
    expect(said).toContain("all");
    expect(said).toContain("any");
    expect(said).toContain("default");
    for (const governed of ["performer_ids", "tag_ids"]) {
      expect(said, `match says nothing about ${governed}`).toContain(governed);
    }
  });

  it("says a list of studios is read one way whatever match is written", () => {
    // A scene carries one studio, so a request asking for every studio of a
    // list answers nothing at all, and studio_ids travels as a union under
    // both readings. Named among what match decides, it promises a narrowing
    // no request carries.
    const said = describedBy("search_scenes", "match");
    expect(said).toContain("studio_ids");
    expect(said).toMatch(/one studio/);
  });

  it("keeps the paging arguments beside it described", () => {
    expect(describedBy("search_scenes", "page")).not.toBe("");
    expect(describedBy("search_scenes", "limit")).not.toBe("");
  });

  it("describes page as what it decides, promising no report of its own", () => {
    // A report naming page as a narrowing a catalogue did not receive is
    // written by nothing here, and a caller who plans on reading one plans on
    // a disclosure no answer carries.
    const said = describedBy("search_scenes", "page");
    expect(said).not.toMatch(/did not receive/);
    expect(said).toContain("own order");
  });

  it("keeps limit saying the pages of two catalogues are never interleaved", () => {
    expect(describedBy("search_scenes", "limit")).toContain("interleave");
  });
});

/* ------------------------------------- what an answer carries, declared */

/**
 * A declared output no call produces is a promise a caller plans against.
 *
 * They plan for it: a field a schema names is a field a client branches on
 * before a single answer has come back, and one that never arrives is read as a
 * catalogue that answered without it rather than as a shape nothing emits.
 */
describe("every tool declares the answer it gives", () => {
  /** The description a published output schema carries for one field. */
  const describedAt = (name: string, field: string): string => {
    const declared = z.toJSONSchema(z.object(tool(name).outputSchema), { io: "output" });
    const found = (node: unknown): string | undefined => {
      if (node === null || typeof node !== "object") return undefined;
      const held = node as Record<string, unknown>;
      const properties = held.properties as Record<string, Record<string, unknown>> | undefined;
      const here = properties?.[field]?.description;
      if (typeof here === "string") return here;
      for (const value of Object.values(held)) {
        const deeper = found(value);
        if (deeper !== undefined) return deeper;
      }
      return undefined;
    };
    return found(declared) ?? "";
  };

  it("declares no per-catalogue report on a record route, which the card carries", () => {
    // A record route answers with the card alone. What each catalogue did with
    // the record is on the card itself, one entry per catalogue asked.
    for (const name of ["get_scene", "get_performer", "get_studio", "get_tag"]) {
      expect(Object.keys(tool(name).outputSchema).sort()).toEqual(["cached", "card"]);
    }
  });

  it("says on the card where what each catalogue did is read", () => {
    const said = describedAt("get_scene", "held_by");
    expect(said).toContain("state");
    expect(said).toContain("reason");
  });

  it("keeps the per-catalogue report on every answer that carries one", () => {
    for (const name of [
      "search_scenes",
      "search_performers",
      "search_studios",
      "search_tags",
      "find_by_fingerprint",
    ]) {
      expect(Object.keys(tool(name).outputSchema), `${name} lost its report`).toContain(
        "per_source",
      );
    }
  });

  it("says index_total counts the question the catalogue received", () => {
    // A narrowing a catalogue could not receive, and one it received short of
    // what was written, leave it answering a wider question than the one
    // asked. Called the total for this question, the number denies the
    // disclosure standing beside it.
    const said = describedAt("search_scenes", "index_total");
    expect(said).toContain("received");
    expect(said).not.toContain("for this question");
  });

  it("keeps the counts beside it saying what they count", () => {
    expect(describedAt("search_scenes", "count")).toMatch(/[Nn]ever added/);
    expect(describedAt("search_scenes", "index_total_over_any_word")).not.toBe("");
  });

  it("describes the window as what the answer was read at", () => {
    // A words-only search carries a window while no catalogue was given a
    // page: those routes take none. Called the page they paged through, it
    // describes a paging nobody did.
    const said = describedAt("search_scenes", "window");
    expect(said).not.toMatch(/paged through/);
    expect(said).toContain("read at");
  });

  it("describes each of the three narrowings a catalogue can report", () => {
    for (const field of [
      "narrowings_not_received",
      "narrowings_naming_no_record",
      "narrowings_received_in_part",
    ]) {
      expect(describedAt("search_scenes", field), `${field} is published undescribed`).not.toBe("");
    }
  });
});

/* --------------------------------------------------- what a schema costs */

describe("the declaration the protocol enforces is the one it publishes", () => {
  it("carries the rules that read two arguments against each other", () => {
    // A rule of that kind is no field of a schema. Applied in a second pass
    // behind the protocol layer, it would be a rule the published declaration
    // does not carry, and a caller reading the contract could not find it.
    for (const one of TOOLS.filter((tool) => tool.name.startsWith("search_"))) {
      const shape = (one.declared as z.ZodObject<z.ZodRawShape>).shape;
      if (shape.query === undefined) continue;
      const typed = Object.keys(shape).find(
        (name) => !["query", "sort", "direction", "page", "limit", "sources"].includes(name),
      );
      expect(typed, `${one.name} declares no typed argument`).toBeDefined();
      const written = { query: "sunset", [typed ?? ""]: VALUE_FOR[typed ?? ""] };
      // The object alone takes it; the whole declaration refuses it.
      expect(one.declared.safeParse(written).success, `${one.name} object`).toBe(true);
      expect(one.inputSchema.safeParse(written).success, `${one.name} declaration`).toBe(false);
    }
  });
});

/** A value each typed argument accepts, for the case above. */
const VALUE_FOR: Record<string, unknown> = {
  title: "sunset",
  name: "vixen",
  code: "X-1",
  alias: "a",
  date: "2019-04-12",
  performer_ids: ["stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960"],
  category_id: "stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960",
  parent_id: "stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960",
};

describe("a shape is declared once", () => {
  /** What a client is actually sent, which is what a session pays for. */
  const emitted = () =>
    TOOLS.map((one) =>
      JSON.stringify({
        name: one.name,
        description: one.description,
        inputSchema: z.toJSONSchema(one.declared, { io: "input" }),
        outputSchema: z.toJSONSchema(z.object(one.outputSchema), { io: "output" }),
      }),
    ).join("");

  it("declares every tool inside the budget a session pays before it asks", () => {
    // The whole list is read at the opening of a session, so this is money
    // spent before a question. Ten tools are held under what five once cost.
    expect(emitted().length).toBeLessThan(99_644);
  });

  it("spends less than half of that budget on the words rather than the shape", () => {
    const json = emitted();
    const described = (json.match(/"description":"(?:[^"\\]|\\.)*"/g) ?? []).join("").length;
    // Every sentence here earns its place, and a schema that is mostly prose
    // is a schema whose reader pays for the same paragraph once per tool.
    expect(described / json.length).toBeLessThan(0.5);
  });
});

/* --------------------------------- the closed sets the catalogues take */

/**
 * A value outside a set the catalogue declares, refused before a request.
 *
 * These fields are enumerations on the catalogue's own input, and a value
 * outside one is refused with a status. Sent, that refusal comes back as a
 * catalogue that could not answer, under a code whose meaning is an answer this
 * client could not read, and the caller reads their own typo as an outage.
 */
describe("a value outside a set the catalogue declares", () => {
  const cases: [string, unknown][] = [
    ["search_performers", { gender: "zzz" }],
    ["search_performers", { gender: "woman" }],
    ["search_performers", { ethnicity: "zzz" }],
    ["search_performers", { ethnicity: "european" }],
    ["find_by_fingerprint", { fingerprints: [{ hash: "zzz", algorithm: "MD5" }] }],
    ["find_by_fingerprint", { fingerprints: [{ hash: "not a hash at all", algorithm: "OSHASH" }] }],
  ];

  for (const [name, input] of cases) {
    it(`${name} refuses ${JSON.stringify(input).slice(0, 58)}`, () => {
      const said = refusal(tool(name).inputSchema, input);
      expect(said, `a refusal reached a caller with no code: ${said}`).toContain("[invalid_input]");
    });
  }
});

describe("a value inside a set the catalogue declares", () => {
  // The correction that closes a set is one entry away from closing it around
  // less than the catalogue takes, and a value it answers refused here is a
  // question this server can no longer put to it at all.
  const GENDERS = [
    "UNKNOWN",
    "MALE",
    "FEMALE",
    "TRANSGENDER_MALE",
    "TRANSGENDER_FEMALE",
    "INTERSEX",
    "NON_BINARY",
  ];
  const ETHNICITIES = [
    "UNKNOWN",
    "CAUCASIAN",
    "BLACK",
    "ASIAN",
    "INDIAN",
    "LATIN",
    "MIDDLE_EASTERN",
    "MIXED",
    "OTHER",
  ];

  for (const gender of GENDERS) {
    it(`search_performers takes ${gender}, which its rows publish`, () => {
      expect(tool("search_performers").inputSchema.safeParse({ gender }).success).toBe(true);
    });
  }

  for (const ethnicity of ETHNICITIES) {
    it(`search_performers takes ${ethnicity}, which its rows publish`, () => {
      expect(tool("search_performers").inputSchema.safeParse({ ethnicity }).success).toBe(true);
    });
  }

  const HASHES: [string, string][] = [
    ["MD5", "d41d8cd98f00b204e9800998ecf8427e"],
    ["OSHASH", "3c30b044619b6487"],
    ["PHASH", "841f346c96e743b3"],
  ];

  for (const [algorithm, hash] of HASHES) {
    it(`find_by_fingerprint takes a ${algorithm} as the catalogues store one`, () => {
      const read = tool("find_by_fingerprint").inputSchema.safeParse({
        fingerprints: [{ hash, algorithm }],
      });
      expect(read.success, `a hash a catalogue published was refused: ${hash}`).toBe(true);
    });
  }
});
