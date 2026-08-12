/**
 * What an answer is allowed to claim, on the cases three adversarial readings of
 * the running server found it claiming something else.
 *
 * Each case here states one thing a reader would act on: that an answer this
 * client could not read is a failure rather than an emptiness, that a narrowing
 * a catalogue never received is named for the reason it stayed behind, that a
 * window is published only where an answer has one, and that every row a mapper
 * dropped is counted wherever the record is printed.
 *
 * Nothing leaves this file. A stub transport stands in for the catalogues, every
 * fixture is invented, and the clock is fake and pinned, so an answer is decided
 * by what the code does with the payload and never by a network or a clock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { instanceById } from "../../src/stashbox/instances.js";
import { mapScene } from "../../src/stashbox/map.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StashboxClient } from "../../src/stashbox/client.js";
import { registerFindByFingerprint } from "../../src/tools/findByFingerprint.js";
import { registerGetScene } from "../../src/tools/getScene.js";
import { registerSearchPerformers } from "../../src/tools/searchPerformers.js";
import { registerSearchScenes } from "../../src/tools/searchScenes.js";

/* ------------------------------------------------------------------ helpers */

/** Pinned, so no assertion here reads a clock. */
const EPOCH = new Date("2026-08-11T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

const RETRIEVED_AT = "2026-08-11T00:00:00.000Z";

const UUID_A = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const UUID_B = "019fec3f-1bb1-7383-8782-ea0e678f6de0";
const UUID_C = "3f2a1c88-0d47-4e19-9a55-71b0c2d4e6f8";

const MD5_HASH = "0badc0ffee1122334455667788990011";
const PHASH_HASH = "9f8e7d6c5b4a3928";

const STASHDB = instanceById("stashdb")!;

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** A field of a payload, whichever of the two spellings carries it. */
function field(payload: unknown, key: string): unknown {
  if (payload === null || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  return toSnake(key) in obj ? obj[toSnake(key)] : obj[toCamel(key)];
}

function hasField(payload: unknown, key: string): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return toSnake(key) in obj || toCamel(key) in obj;
}

/** A transport answering every catalogue with a fixed payload and no network. */
type Transport = { request: <T>(spec: unknown, apiKey: string, body: unknown) => Promise<T> };

function transportAnswering(payload: unknown): Transport {
  return { request: async <T>(): Promise<T> => payload as T };
}

/** A transport answering each request with the next payload of a script. */
function transportScripted(payloads: readonly unknown[]): Transport {
  let index = 0;
  return {
    request: async <T>(): Promise<T> => {
      const payload = payloads[Math.min(index, payloads.length - 1)];
      index += 1;
      return payload as T;
    },
  };
}

/** A tool as its registration publishes it: its declaration and its handler. */
interface Tool {
  inputSchema: { safeParse: (value: unknown) => any; parse: (value: unknown) => any };
  handler: (args: unknown) => Promise<{
    isError?: boolean;
    content?: { text?: string }[];
    structuredContent?: unknown;
  }>;
}

// The registrars take the SDK's server; this suite drives them with a stub that
// records what each tool declared, so the parameter is read structurally here.
type Register = (server: McpServer, client: StashboxClient) => void;

function toolWith(
  register: Register,
  transport: Transport,
  keys: Record<string, string> = { stashdb: "test-key" },
): Tool {
  const client = new StashboxClient({
    keys,
    transport,
    minIntervalMs: 0,
  } as ConstructorParameters<typeof StashboxClient>[0]);
  let captured: Tool | undefined;
  const server = {
    registerTool: (
      _name: string,
      config: { inputSchema: Tool["inputSchema"] },
      handler: Tool["handler"],
    ) => {
      captured = { inputSchema: config.inputSchema, handler };
    },
  };
  register(server as unknown as McpServer, client);
  if (captured === undefined) throw new Error("the registration published no tool");
  return captured;
}

function toolOf(
  register: Register,
  payload: unknown,
  keys: Record<string, string> = { stashdb: "test-key" },
): Tool {
  return toolWith(register, transportAnswering(payload), keys);
}

/**
 * What a caller reads when a call is answered or refused. A refusal can come
 * from the declaration or from the handler, and both name what was refused: the
 * declaration through the path of the issue, the handler through its message.
 */
interface Outcome {
  refused: boolean;
  text: string;
  structured: unknown;
  notes: string[];
}

async function call(tool: Tool, args: unknown): Promise<Outcome> {
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    const text = parsed.error.issues
      .map(
        (issue: { path: (string | number)[]; message: string }) =>
          `${issue.path.join(".")}: ${issue.message}`,
      )
      .join("\n");
    return { refused: true, text, structured: undefined, notes: [] };
  }
  let answer;
  try {
    answer = await tool.handler(parsed.data);
  } catch (error) {
    const thrown = error as { code?: string; message?: string };
    return {
      refused: true,
      text: `[${thrown.code ?? "unknown"}] ${thrown.message ?? String(error)}`,
      structured: undefined,
      notes: [],
    };
  }
  const text = (answer.content ?? []).map((part) => part.text ?? "").join("\n");
  const notes = (field(answer.structuredContent, "notes") as string[] | undefined) ?? [];
  return { refused: answer.isError === true, text, structured: answer.structuredContent, notes };
}

/** Every catalogue's report in an answer, whichever spelling carries them. */
function reports(structured: unknown): Record<string, unknown>[] {
  return (field(structured, "perSource") as Record<string, unknown>[] | undefined) ?? [];
}

function reportFor(structured: unknown, source: string): Record<string, unknown> {
  const found = reports(structured).find((report) => field(report, "source") === source);
  if (found === undefined) throw new Error(`no report for ${source}`);
  return found;
}

/* ----------------------------------------------------------------- fixtures */

/** A scene row in the shape a catalogue publishes one. */
const SCENE_ROW = {
  id: UUID_A,
  title: "Harbour Lights, Chapter Two",
  release_date: "2019-04-12",
  duration: 1500,
  deleted: false,
  studio: null,
  performers: [],
  urls: [],
  created: null,
  updated: null,
};

const PERFORMER_ROW = {
  id: UUID_B,
  name: "Angela White",
  disambiguation: null,
  aliases: [],
  gender: null,
  country: null,
  birth_date: null,
  death_date: null,
  career_start_year: null,
  career_end_year: null,
  scene_count: 3,
  deleted: false,
  merged_ids: [],
  merged_into_id: null,
  urls: [],
  edits: [],
  created: null,
  updated: null,
};

/** Both scene searches answered, so either path a tool takes finds its rows. */
const SCENE_SEARCH_PAYLOAD = {
  queryScenes: { count: 1, scenes: [SCENE_ROW] },
  searchScenes: { count: 1, scenes: [SCENE_ROW] },
};

const PERFORMER_SEARCH_PAYLOAD = {
  searchPerformers: { count: 1, performers: [PERFORMER_ROW] },
  queryPerformers: { count: 1, performers: [PERFORMER_ROW] },
};

/** A fingerprint as a catalogue publishes one on a scene. */
function print(algorithm: string, hash: string) {
  return { algorithm, hash, duration: 1500, submissions: 3, reports: 0 };
}

/** The answer shape a fingerprint lookup reads, one list per hash asked. */
function fingerprintPayload(scenes: unknown[][]) {
  return { findScenesBySceneFingerprints: scenes };
}

const ONE_MD5 = { fingerprints: [{ hash: MD5_HASH, algorithm: "MD5" }] };

/** One scene as get_scene reads one, with whatever a case overrides. */
function findScene(over: Record<string, unknown> = {}) {
  return {
    findScene: {
      id: UUID_A,
      title: "Harbour Lights, Chapter Two",
      release_date: "2019-04-12",
      production_date: null,
      duration: 1500,
      code: null,
      director: null,
      details: null,
      deleted: false,
      studio: null,
      tags: [],
      urls: [],
      edits: [],
      created: null,
      updated: null,
      performers: [],
      ...over,
    },
  };
}

/* ------------------------------------------------ 1. an answer never read */

describe("a catalogue answering an unreadable shape is a failure and never an emptiness", () => {
  const unreadable: Record<string, unknown>[] = [
    { queryScenes: "a string where an object was published" },
    { queryScenes: null },
    { someOtherQuery: { count: 1, scenes: [SCENE_ROW] } },
  ];

  for (const [index, payload] of unreadable.entries()) {
    it(`reports a scene search answered in shape ${index + 1} as failed at parse_failure`, async () => {
      const outcome = await call(toolOf(registerSearchScenes, payload), { title: "Harbour" });

      const report = reportFor(outcome.structured, "stashdb");
      expect(
        field(report, "state"),
        "an unreadable answer was reported as a catalogue that looked and found nothing",
      ).toBe("failed");
      expect(field(report, "error")).toBe("parse_failure");
      expect(
        field(report, "count"),
        "a failure carried a count of rows it never returned",
      ).toBeUndefined();
    });
  }

  const unreadablePerformers: Record<string, unknown>[] = [
    { queryPerformers: "a string where an object was published", searchPerformers: "likewise" },
    { queryPerformers: null, searchPerformers: null },
    { someOtherQuery: { count: 1, performers: [PERFORMER_ROW] } },
  ];

  for (const [index, payload] of unreadablePerformers.entries()) {
    it(`reports a performer search answered in shape ${index + 1} as failed at parse_failure`, async () => {
      const outcome = await call(toolOf(registerSearchPerformers, payload), { name: "Angela" });

      const report = reportFor(outcome.structured, "stashdb");
      expect(
        field(report, "state"),
        "an unreadable answer was reported as a catalogue that looked and found nothing",
      ).toBe("failed");
      expect(field(report, "error")).toBe("parse_failure");
    });
  }

  const unreadableFingerprints: Record<string, unknown>[] = [
    { findScenesBySceneFingerprints: "a string where a list was published" },
    { findScenesBySceneFingerprints: null },
    { someOtherQuery: [[SCENE_ROW]] },
  ];

  for (const [index, payload] of unreadableFingerprints.entries()) {
    it(`reports a fingerprint lookup answered in shape ${index + 1} as failed at parse_failure`, async () => {
      const outcome = await call(toolOf(registerFindByFingerprint, payload), ONE_MD5);

      const report = reportFor(outcome.structured, "stashdb");
      expect(
        field(report, "state"),
        "a fingerprint answer this client could not read was reported as a catalogue holding no such file",
      ).toBe("failed");
      expect(field(report, "error")).toBe("parse_failure");
    });
  }

  it("stores no unreadable answer, so the next identical question reaches the catalogue", async () => {
    // A failure kept in the store answers every repeat of the question for the
    // lifetime of the entry, turning one unreadable moment into a lasting one.
    const tool = toolWith(
      registerSearchScenes,
      transportScripted([{ queryScenes: null }, SCENE_SEARCH_PAYLOAD]),
    );

    const first = await call(tool, { title: "Harbour" });
    expect(field(reportFor(first.structured, "stashdb"), "state")).toBe("failed");

    const second = await call(tool, { title: "Harbour" });
    expect(
      field(reportFor(second.structured, "stashdb"), "state"),
      "an unreadable answer was stored and served back as the answer to the question",
    ).toBe("answered");
    expect((field(second.structured, "results") as unknown[]).length).toBe(1);
  });
});

/* --------------------------------------------- 2. a record that was not read */

describe("a record the catalogue holds and this client could not read", () => {
  it("raises parse_failure on a response whose findScene key is absent altogether", async () => {
    const outcome = await call(toolOf(registerGetScene, { somethingElse: null }), {
      id: `stashdb:${UUID_A}`,
    });

    expect(outcome.refused, "an answer this client could not read was published as a record").toBe(
      true,
    );
    expect(
      outcome.text,
      "an answer carrying no record at all was reported as a catalogue holding no such scene",
    ).toContain("parse_failure");
    expect(outcome.text).not.toContain("not_found");
  });
});

/* ------------------------------------------- 3. a withdrawn record answering */

describe("a fingerprint that reaches a withdrawn record", () => {
  it("carries that record as a match, marked as withdrawn", async () => {
    const withdrawn = { ...SCENE_ROW, deleted: true, fingerprints: [print("MD5", MD5_HASH)] };

    const outcome = await call(
      toolOf(registerFindByFingerprint, fingerprintPayload([[withdrawn]])),
      ONE_MD5,
    );

    const matches = (field(outcome.structured, "matches") as unknown[] | undefined) ?? [];
    expect(
      matches,
      "a record the catalogue answered with was filed as no match at all",
    ).toHaveLength(1);
    expect(field(field(matches[0], "scene"), "status")).toBe("deleted");
    expect(outcome.text).toMatch(/withdrawn|deleted|no longer/i);
    expect(
      field(outcome.structured, "unattributed"),
      "a match carrying the hash asked for was filed as unattributed",
    ).toBe(0);
  });
});

/* ------------------------------------------------ 4. a narrowing that narrows nothing */

describe("a narrowing carrying only whitespace is refused", () => {
  const cases: { tool: Register; payload: unknown; name: string }[] = [
    { tool: registerSearchScenes, payload: SCENE_SEARCH_PAYLOAD, name: "title" },
    { tool: registerSearchScenes, payload: SCENE_SEARCH_PAYLOAD, name: "code" },
    { tool: registerSearchPerformers, payload: PERFORMER_SEARCH_PAYLOAD, name: "name" },
    { tool: registerSearchPerformers, payload: PERFORMER_SEARCH_PAYLOAD, name: "disambiguation" },
  ];

  for (const { tool, payload, name } of cases) {
    it(`refuses ${name} written as spaces, on the terms an empty query is refused`, async () => {
      const outcome = await call(toolOf(tool, payload), { [name]: "   " });

      expect(outcome.refused, `${name} written as spaces was sent as a narrowing`).toBe(true);
      expect(outcome.text).toContain("invalid_input");
      expect(outcome.text).toContain(name);
      expect(outcome.structured).toBeUndefined();
    });
  }
});

/* ------------------------------- 5. identifiers minted by another catalogue */

describe("a catalogue given none of its own identifiers", () => {
  it("is told apart from a catalogue that could receive no narrowing at all", async () => {
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
      studio_ids: [`tpdb:${UUID_B}`],
    });

    const report = reportFor(outcome.structured, "stashdb");
    const reason = String(field(report, "reason") ?? "");
    expect(
      reason,
      "a catalogue that takes this narrowing was reported as one that could not receive it",
    ).not.toMatch(/could receive none of the narrowings/i);
    expect(
      reason,
      "the reason never says the identifiers name another catalogue, which is the fact a caller acts on",
    ).toMatch(/another catalogue|other catalogue|minted|none of its own|not its own/i);
  });
});

/* -------------------------------------------------- 6. a folded identifier */

describe("an identifier the catalogue has folded", () => {
  it("is answered as a folded record naming its successor rather than as an absence", async () => {
    // The catalogue answers the narrowing with no rows and answers for the
    // identifier with a marker, which is a record under a new name.
    const payload = {
      queryScenes: { count: 0, scenes: [] },
      searchScenes: { count: 0, scenes: [] },
      findPerformer: {
        id: UUID_B,
        name: "Angela White",
        deleted: true,
        merged_into_id: UUID_C,
        merged_ids: [],
        urls: [],
        edits: [],
      },
    };

    const outcome = await call(toolOf(registerSearchScenes, payload), {
      performer_ids: [`stashdb:${UUID_B}`],
    });

    const everything = [outcome.text, ...outcome.notes].join("\n");
    expect(
      everything,
      "an identifier the catalogue folded was answered as a narrowing that matched nothing",
    ).toMatch(/merged|folded|no longer|successor/i);
    expect(everything, "the successor of the folded identifier is nowhere in the answer").toContain(
      `stashdb:${UUID_C}`,
    );
  });
});

/* ---------------------------------------------------------- 7. the window */

describe("a window is published only for an answer that has one", () => {
  it("carries none when every catalogue asked failed", async () => {
    const outcome = await call(toolOf(registerSearchScenes, { queryScenes: null }), {
      title: "Harbour",
    });

    expect(field(reportFor(outcome.structured, "stashdb"), "state")).toBe("failed");
    expect(
      hasField(outcome.structured, "window"),
      "an answer whose emptiness is a failure published it as an emptiness inside a window",
    ).toBe(false);
    expect(outcome.notes.join("\n")).not.toMatch(
      /emptiness here is an emptiness inside that window/i,
    );
  });
});

/* ------------------------------------------------- 8. created and updated */

describe("'created' and 'updated' are carried only where the catalogue received the sort", () => {
  it("leaves them off the rows of a catalogue that could not take the sort", async () => {
    // The full-text path sends the words alone, so every typed argument stays
    // behind. Stamping the sort's fields onto the rows presents an order the
    // catalogue never applied as one a reader can check on the rows.
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
      query: "harbour",
      sort: "created",
    });

    const report = reportFor(outcome.structured, "stashdb");
    expect(
      (field(report, "narrowingsNotReceived") as string[] | undefined) ?? [],
      "the catalogue received the sort, so this case is not the one measured",
    ).toContain("sort");

    const rows = (field(outcome.structured, "results") as unknown[] | undefined) ?? [];
    expect(rows).toHaveLength(1);
    expect(
      hasField(rows[0], "created"),
      "a row carries the field the sort would be read on, where the sort never reached the catalogue",
    ).toBe(false);
    expect(hasField(rows[0], "updated")).toBe(false);
  });
});

/* --------------------------------------------- 9. a search that narrowed on nothing */

describe("a search that narrowed on nothing says so", () => {
  it("says it on search_scenes given no argument at all", async () => {
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {});

    expect(
      outcome.notes.join("\n"),
      "a page of the whole index was answered as though something had been asked of it",
    ).toMatch(
      /narrowed on nothing|nothing was narrowed|no narrowing|whole index|the index as a whole/i,
    );
  });

  it("says it on search_performers given no argument at all", async () => {
    const outcome = await call(toolOf(registerSearchPerformers, PERFORMER_SEARCH_PAYLOAD), {});

    expect(
      outcome.notes.join("\n"),
      "a page of the whole index was answered as though something had been asked of it",
    ).toMatch(
      /narrowed on nothing|nothing was narrowed|no narrowing|whole index|the index as a whole/i,
    );
  });
});

/* ---------------------------------------------- 10. an undeclared key at depth */

describe("an undeclared key is refused at every depth", () => {
  it("refuses one inside a fingerprints entry the way one at the top level is refused", async () => {
    const tool = toolOf(registerFindByFingerprint, fingerprintPayload([[]]));

    const nested = await call(tool, {
      fingerprints: [{ hash: MD5_HASH, algorithm: "MD5", duration: 12 }],
    });
    const top = await call(tool, {
      fingerprints: [{ hash: MD5_HASH, algorithm: "MD5" }],
      duration: 12,
    });

    expect(nested.refused, "an undeclared key inside an entry was accepted").toBe(true);
    expect(nested.text).toContain("duration");
    expect(
      nested.text,
      "a refusal at depth is written in another language from the one at the top level",
    ).toContain("invalid_input");
    expect(top.refused).toBe(true);
    expect(top.text).toContain("invalid_input");
  });
});

/* ------------------------------------------------ 11. the hash that matched */

describe("a fingerprint match names the hash that reached it", () => {
  it("renders two matches on one record from two hashes as two different lines", async () => {
    const scene = {
      ...SCENE_ROW,
      fingerprints: [print("MD5", MD5_HASH), print("PHASH", PHASH_HASH)],
    };

    const outcome = await call(toolOf(registerFindByFingerprint, fingerprintPayload([[scene]])), {
      fingerprints: [
        { hash: MD5_HASH, algorithm: "MD5" },
        { hash: PHASH_HASH, algorithm: "PHASH" },
      ],
    });

    const lines = outcome.text.split("\n").filter((line) => /^- /.test(line));
    expect(lines, "the answer carries no line per match").toHaveLength(2);
    expect(lines[0]).toContain(MD5_HASH);
    expect(lines[1]).toContain(PHASH_HASH);
    expect(lines[0], "two matches from two hashes render identically").not.toBe(lines[1]);
  });
});

/* ------------------------------------------ 12. a count the catalogue contradicts */

describe("a count a catalogue contradicts is not restated as a total", () => {
  it("prints no index total smaller than the rows the catalogue returned", async () => {
    const outcome = await call(
      toolOf(registerSearchScenes, {
        queryScenes: { count: 1, scenes: [SCENE_ROW, { ...SCENE_ROW, id: UUID_B }] },
      }),
      { title: "Harbour" },
    );

    expect((field(outcome.structured, "results") as unknown[]).length).toBe(2);
    expect(
      outcome.notes.join("\n"),
      "a number smaller than the rows on this page was printed as what the index holds, those rows included",
    ).not.toMatch(/the rows here included/i);
  });
});

/* ----------------------------------------- 13. more rows than the limit asked */

describe("a catalogue returning more rows than the limit asked for is named", () => {
  it("never states a window the number of rows contradicts", async () => {
    const outcome = await call(
      toolOf(registerSearchScenes, {
        queryScenes: { count: 2, scenes: [SCENE_ROW, { ...SCENE_ROW, id: UUID_B }] },
      }),
      { title: "Harbour", limit: 1 },
    );

    const rows = (field(outcome.structured, "results") as unknown[]).length;
    const window = field(outcome.structured, "window");
    const limit = Number(field(window, "limit") ?? 0);
    const everything = [outcome.text, ...outcome.notes].join("\n");

    expect(rows).toBe(2);
    expect(limit, "the window was left off, so this case is not the one measured").toBeLessThan(
      rows,
    );
    expect(
      everything,
      "the answer states a page size smaller than the rows it carries and says nothing about the difference",
    ).toMatch(/more than it was asked|more rows than|did not honour the limit/i);

    const sentence = everything
      .split("\n")
      .find((line) => /more than it was asked|more rows than|did not honour the limit/i.test(line));
    expect(
      sentence,
      "the catalogue that returned more rows than it was asked is nowhere named, so a caller cannot tell which one to page differently",
    ).toMatch(/StashDB|stashdb/);
  });
});

/* -------------------------------------------------- 14. a date left unread */

describe("a date this client could not read is said wherever the record is printed", () => {
  it("qualifies a search row on the terms a full record is qualified", async () => {
    const row = { ...SCENE_ROW, release_date: "2019-13-45" };

    const search = await call(
      toolOf(registerSearchScenes, { queryScenes: { count: 1, scenes: [row] } }),
      { title: "Harbour" },
    );
    const record = await call(toolOf(registerGetScene, findScene({ release_date: "2019-13-45" })), {
      id: `stashdb:${UUID_A}`,
    });

    const UNREADABLE = /could not read|unreadable|a date dropped/i;
    expect(
      record.notes.join("\n"),
      "the full record states no such qualification, so this case is not the one measured",
    ).toMatch(UNREADABLE);
    expect(
      search.notes.join("\n"),
      "a row whose date was published and dropped reads as a record carrying none",
    ).toMatch(UNREADABLE);
  });
});

/* ------------------------------------------------ 15. an unreadable edit count */

describe("a catalogue that publishes edit counts and answered an unreadable one", () => {
  it("is not reported as settled, and reads differently from one answering none open", async () => {
    const unreadable = await call(toolOf(registerGetScene, findScene({ edits: null })), {
      id: `stashdb:${UUID_A}`,
    });
    const settled = await call(toolOf(registerGetScene, findScene({ edits: [] })), {
      id: `stashdb:${UUID_A}`,
    });

    expect(
      unreadable.notes.join("\n"),
      "an edit count this client could not read was reported as a record nothing is open against",
    ).toMatch(/edit/i);
    expect(unreadable.text, "the two answers read identically").not.toBe(settled.text);
  });
});

/* ------------------------------------------------- 16. a tag taxonomy */

describe("a catalogue publishing no tag taxonomy says so", () => {
  it("says it the way a catalogue publishing no site taxonomy already does", async () => {
    const payload = findScene({
      tags: [{ id: UUID_B, name: "Coastal", category: null }],
      urls: [{ url: "https://example-listing.test/items/8814", site: null }],
    });

    const outcome = await call(toolOf(registerGetScene, payload, { tpdb: "test-key" }), {
      id: `tpdb:${UUID_A}`,
    });

    const notes = outcome.notes.join("\n");
    expect(
      notes,
      "the note about the sites is missing too, so this case is not the one measured",
    ).toMatch(/sites? a record links to|no link here carries a category/i);
    expect(notes, "a tag carrying no category reads as a tag the catalogue places in none").toMatch(
      /tag/i,
    );
  });
});

/* ------------------------------- 17. rows lost inside a fingerprint's record */

describe("rows lost inside a fingerprint match's record are counted", () => {
  it("counts a studio answered as a scalar the way a search row and a full record do", async () => {
    const scene = {
      ...SCENE_ROW,
      studio: "Northgate Pictures",
      fingerprints: [print("MD5", MD5_HASH)],
    };

    const outcome = await call(
      toolOf(registerFindByFingerprint, fingerprintPayload([[scene]])),
      ONE_MD5,
    );

    const matches = (field(outcome.structured, "matches") as unknown[]) ?? [];
    expect(
      field(field(matches[0], "scene"), "studio"),
      "a shape this client cannot read was published",
    ).toBeNull();

    const onAnswer = Number(field(outcome.structured, "rowsSkipped") ?? 0);
    const onCatalogue = Number(field(reportFor(outcome.structured, "stashdb"), "skipped") ?? 0);
    expect(
      onAnswer + onCatalogue,
      "a row inside a matched record was dropped uncounted, so a reader sees a record with no studio",
    ).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------- 18. a studio's parent */

describe("every loss is counted, including a studio's parent", () => {
  it("counts a parent present and unreadable, and names where it was lost", () => {
    const record = mapScene(
      {
        id: UUID_A,
        title: "Harbour Lights, Chapter Two",
        studio: { id: UUID_B, name: "Northgate Pictures", parent: "Northgate Group" },
        performers: [],
      } as never,
      STASHDB as never,
      RETRIEVED_AT,
    );

    expect(
      field(field(record, "studio"), "parent"),
      "a parent in a shape this client cannot read was published",
    ).toBeNull();
    expect(
      Number(field(record, "rowsSkipped") ?? 0),
      "a studio's parent was dropped uncounted, so the record reads as a studio standing alone",
    ).toBeGreaterThan(0);
    expect((field(record, "rowsSkippedIn") as string[] | undefined) ?? []).not.toHaveLength(0);
  });
});
