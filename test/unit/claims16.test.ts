/**
 * What an answer is allowed to claim, on the cases a sixth adversarial reading of
 * the running server found it claiming something else.
 *
 * Each case here states one thing a reader would act on: that an answer this
 * client could not read is a failure wherever it arrives, that an emptiness is
 * explained by its own cause and never by another, that a catalogue the caller
 * excluded is never asked and never quoted, that a count is a whole number of
 * things, and that a catalogue naming how long to wait is waited for.
 *
 * Nothing leaves this file. A stub transport stands in for the catalogues, every
 * fixture is invented, and the clock is fake and pinned, so an answer is decided
 * by what the code does with the payload and never by a network or a clock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Logger } from "../../src/config.js";
import { createHttpTransport } from "../../src/stashbox/graphql.js";
import { instanceById } from "../../src/stashbox/instances.js";
import type { InstanceSpec } from "../../src/stashbox/instances.js";
import { mapPerformer } from "../../src/stashbox/map.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RateLimiter } from "../../src/stashbox/rateLimiter.js";
import { StashboxClient } from "../../src/stashbox/client.js";
import { renderPerformer } from "../../src/tools/getPerformer.js";
import { registerFindByFingerprint } from "../../src/tools/findByFingerprint.js";
import { registerGetScene } from "../../src/tools/getScene.js";
import { registerSearchScenes } from "../../src/tools/searchScenes.js";
import type { PerformerRecord } from "../../src/types.js";

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

const STASHDB = instanceById("stashdb")!;

/** The six codes an answer is allowed to carry. */
const ERROR_CODES = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
];

/** What a message written by an engine rather than by this server looks like. */
const ENGINE_WORDS =
  /Cannot read propert|Cannot use '[^']+' operator|is not a function|is not iterable|undefined is not|TypeError|ReferenceError|SyntaxError|of undefined|of null\b|\bat Object\.|\bat Module\./;

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

/** A transport answering every catalogue with a fixed payload and no network. */
type Transport = { request: <T>(spec: unknown, apiKey: string, body: unknown) => Promise<T> };

function transportAnswering(payload: unknown): Transport {
  return { request: async <T>(): Promise<T> => payload as T };
}

/** What one request carried, so a test can say which catalogue was asked what. */
interface Sent {
  source: string;
  body: string;
}

/**
 * A transport deciding each answer from the request itself, and recording every
 * request it received. A route answering with an Error throws it, which is how a
 * catalogue that failed on one of two questions is stated.
 */
function transportRouting(route: (sent: Sent) => unknown): {
  transport: Transport;
  sent: Sent[];
} {
  const sent: Sent[] = [];
  const transport: Transport = {
    request: async <T>(spec: unknown, _apiKey: string, body: unknown): Promise<T> => {
      const record: Sent = {
        source: String(field(spec, "id") ?? ""),
        body: JSON.stringify(body ?? null),
      };
      sent.push(record);
      const answer = route(record);
      if (answer instanceof Error) throw answer;
      return answer as T;
    },
  };
  return { transport, sent };
}

/** Whether a request asks a catalogue to resolve one identifier. */
function isLookup(sent: Sent): boolean {
  return /find(Performer|Studio|Tag)/i.test(sent.body);
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

/** What a caller reads when a call is answered or refused. */
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

/** Everything a caller reads in prose, whichever block carries it. */
function everything(outcome: Outcome): string {
  return [outcome.text, ...outcome.notes].join("\n");
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

/** Whether a value is a whole number of things, or no number at all. */
function isWholeCount(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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

const EMPTY_SCENE_SEARCH = {
  queryScenes: { count: 0, scenes: [] },
  searchScenes: { count: 0, scenes: [] },
};

/** A fingerprint as a catalogue publishes one on a scene. */
function print(algorithm: string, hash: string, over: Record<string, unknown> = {}) {
  return { algorithm, hash, duration: 1500, submissions: 3, reports: 0, ...over };
}

/** The answer shape a fingerprint lookup reads, one list per hash asked. */
function fingerprintPayload(scenes: unknown[]) {
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

/** A marker record, as a catalogue answers for an identifier it has folded. */
function foldedMarker(over: Record<string, unknown> = {}) {
  return {
    id: UUID_B,
    name: "Angela White",
    deleted: true,
    merged_into_id: UUID_C,
    merged_ids: [],
    urls: [],
    edits: [],
    ...over,
  };
}

/** The words an answer uses of an identifier the catalogue folded. */
const FOLDED = /merged|folded|no longer|successor/i;

/* ------------------------------- 1. a fingerprint answer that is no answer */

describe("a fingerprint answer whose groups are not groups is a failure", () => {
  const shapes: { name: string; groups: unknown[] }[] = [
    { name: "a null where a group of records was published", groups: [null] },
    { name: "a bare record where a group of records was published", groups: [SCENE_ROW] },
  ];

  for (const { name, groups } of shapes) {
    it(`reports ${name} as failed at parse_failure`, async () => {
      const outcome = await call(
        toolOf(registerFindByFingerprint, fingerprintPayload(groups)),
        ONE_MD5,
      );

      const report = reportFor(outcome.structured, "stashdb");
      expect(
        field(report, "state"),
        "a fingerprint answer this client could not read was reported as a catalogue that has never seen the file",
      ).toBe("failed");
      expect(field(report, "error")).toBe("parse_failure");
      expect(
        field(report, "count"),
        "a failure carried a count of rows it never returned",
      ).toBeUndefined();
    });
  }
});

/* ----------------------------------- 2. the cause an emptiness is given */

describe("an emptiness is explained by the cause it has", () => {
  it("names the failure, and never the folding of an identifier, when every catalogue failed", async () => {
    // The search fails on a shape this client cannot read, while the catalogue
    // would answer for the identifier with a marker. The emptiness is the
    // failure's, so the marker explains nothing here.
    const { transport } = transportRouting((sent) =>
      isLookup(sent)
        ? { findPerformer: foldedMarker() }
        : { queryScenes: null, searchScenes: null },
    );

    const outcome = await call(toolWith(registerSearchScenes, transport), {
      performer_ids: [`stashdb:${UUID_B}`],
    });

    expect(
      field(reportFor(outcome.structured, "stashdb"), "state"),
      "the catalogue did not fail, so this case is not the one measured",
    ).toBe("failed");
    expect(
      everything(outcome),
      "an emptiness every catalogue's failure produced was explained by the identifier having been folded",
    ).not.toMatch(FOLDED);
  });
});

/* --------------------------------- 3. a catalogue the caller excluded */

describe("a catalogue the caller excluded is never asked", () => {
  it("spends no request on it, not even to resolve a narrowing identifier", async () => {
    const { transport, sent } = transportRouting((sent) =>
      isLookup(sent) ? { findPerformer: foldedMarker() } : EMPTY_SCENE_SEARCH,
    );

    const outcome = await call(
      toolWith(registerSearchScenes, transport, { stashdb: "test-key", fansdb: "test-key" }),
      { sources: ["stashdb"], performer_ids: [`fansdb:${UUID_B}`] },
    );

    expect(
      sent.map((request) => request.source),
      "a catalogue the caller excluded was asked",
    ).not.toContain("fansdb");
    expect(
      everything(outcome),
      "a fact read from a catalogue the answer reports as never asked was stated",
    ).not.toContain(`fansdb:${UUID_C}`);
  });
});

/* ------------------------------- 4. a check that could not be made */

describe("a check that could not run is said, and its answer is not stored", () => {
  it("says the check did not run, and asks again on the next identical call", async () => {
    let lookups = 0;
    const { transport } = transportRouting((sent) => {
      if (!isLookup(sent)) return EMPTY_SCENE_SEARCH;
      lookups += 1;
      return { findPerformer: "a shape this client cannot read" };
    });
    const tool = toolWith(registerSearchScenes, transport);
    const args = { performer_ids: [`stashdb:${UUID_B}`] };

    const first = await call(tool, args);
    const afterFirst = lookups;
    const second = await call(tool, args);

    expect(
      everything(first),
      "an emptiness whose explanation could not be checked said nothing about the check",
    ).toMatch(/could not be (checked|resolved|read)|did not run|was not (checked|resolved)/i);
    expect(
      lookups,
      "an answer stating a check that did not run was served from the store on the next identical call",
    ).toBeGreaterThan(afterFirst);
    expect(everything(second)).toMatch(
      /could not be (checked|resolved|read)|did not run|was not (checked|resolved)/i,
    );
  });
});

/* ------------------------------- 5. a record continuing into itself */

describe("a record is never offered as the record that continues itself", () => {
  it("publishes no successor equal to the record's own identifier", () => {
    const record = mapPerformer(
      {
        id: UUID_A,
        name: "Ilva Norrsken",
        deleted: true,
        merged_into_id: UUID_A,
        merged_ids: [],
        urls: [],
      } as never,
      STASHDB as never,
      RETRIEVED_AT,
    );

    expect(record, "the record could not be mapped at all").not.toBeNull();
    expect(
      field(record, "mergedInto"),
      "a record was published as continuing into itself",
    ).not.toBe(`stashdb:${UUID_A}`);

    const { text } = renderPerformer(record as PerformerRecord, ["basic"]);
    const pointers = text
      .split("\n")
      .filter((line) => /merged into|continues|read (it )?next|ask .*\bon\b|instead/i.test(line));
    for (const line of pointers) {
      expect(line, "a reader was sent to read the record they are already reading").not.toContain(
        `stashdb:${UUID_A}`,
      );
    }
  });
});

/* --------------------------- 6. a successor that could not be read */

describe("a successor that could not be read is not a withdrawal", () => {
  it("publishes no outright withdrawal, and counts the row it lost", () => {
    const record = mapPerformer(
      {
        id: UUID_A,
        name: "Ilva Norrsken",
        deleted: true,
        merged_into_id: "not-a-uuid",
        merged_ids: [],
        urls: [],
      } as never,
      STASHDB as never,
      RETRIEVED_AT,
    );

    expect(
      field(record, "mergedInto"),
      "a successor that is no identifier was published as one",
    ).toBeNull();
    expect(
      field(record, "status"),
      "a record the catalogue folded into a successor this client could not read was published as a record withdrawn outright",
    ).not.toBe("deleted");
    expect(
      Number(field(record, "rowsSkipped") ?? 0),
      "a successor lost on the marker branch was dropped uncounted",
    ).toBeGreaterThan(0);
    expect((field(record, "rowsSkippedIn") as string[] | undefined) ?? []).not.toHaveLength(0);
  });
});

/* ------------------------------------------------ 7. a count that is no count */

describe("a count is a whole number of things or it is no count", () => {
  it("publishes neither a fractional nor an absurd count as what an index holds", async () => {
    for (const count of [3.7, 1e21]) {
      const outcome = await call(
        toolOf(registerSearchScenes, { queryScenes: { count, scenes: [SCENE_ROW] } }),
        { title: "Harbour" },
      );

      const report = reportFor(outcome.structured, "stashdb");
      expect(
        isWholeCount(field(report, "indexTotal")),
        `a count of ${count} was published as what the catalogue's index holds`,
      ).toBe(true);
      expect(everything(outcome), `a count of ${count} was printed in the prose`).not.toContain(
        String(count),
      );
    }
  });

  it("publishes neither as a number of submissions, of reports, or of seconds", async () => {
    const scene = {
      ...SCENE_ROW,
      fingerprints: [print("MD5", MD5_HASH, { submissions: 2.5, reports: 1e21, duration: 4.25 })],
    };

    const outcome = await call(
      toolOf(registerFindByFingerprint, fingerprintPayload([[scene]])),
      ONE_MD5,
    );

    const matches = (field(outcome.structured, "matches") as unknown[] | undefined) ?? [];
    expect(
      matches,
      "the catalogue's row reached no match, so this case is not the one measured",
    ).toHaveLength(1);
    const row = field(matches[0], "fingerprint");
    expect(
      isWholeCount(field(row, "submissions")),
      "a fractional number of submissions was published as a number of people",
    ).toBe(true);
    expect(
      isWholeCount(field(row, "reports")),
      "an absurd number of reports was published as a number of people",
    ).toBe(true);
    expect(
      isWholeCount(field(row, "durationSeconds")),
      "a fractional number of seconds was published as a duration",
    ).toBe(true);
  });
});

/* ------------------------------- 8. a catalogue naming how long to wait */

describe("a catalogue naming how long to wait is waited for", () => {
  it("makes no further attempt before the delay a Retry-After header names", async () => {
    // Pinned without auto-advance, so the instant of each attempt is exact.
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);

    const calls: number[] = [];
    const steps: Array<() => Response> = [
      () => new Response("", { status: 429, headers: { "Retry-After": "5" } }),
      () =>
        new Response(JSON.stringify({ data: { findPerformer: { id: UUID_A } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ];
    const fetchImpl = (async () => {
      calls.push(Date.now());
      const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
      return step();
    }) as unknown as typeof fetch;

    const silent: Logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
    const limiter = new RateLimiter({ intervalMs: 1000 });
    const transport = createHttpTransport({
      fetchImpl,
      userAgent: "mcp-stashbox/0.0.0 (+https://github.com/smeet666/mcp-stashbox)",
      timeoutMs: 5000,
      maxRetries: 2,
      limiterFor: () => limiter,
      logger: silent,
    });

    const request = transport.request(STASHDB as unknown as InstanceSpec, "test-key", {
      query: "query FindPerformer($id: ID!) { findPerformer(id: $id) { id } }",
      variables: { id: UUID_A },
    });
    const held = request.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(600_000);
    await held;

    expect(
      calls.length,
      "the request was never retried, so this case is not the one measured",
    ).toBeGreaterThan(1);
    expect(
      calls[1]! - calls[0]!,
      "a second attempt was made before the delay the catalogue named in Retry-After",
    ).toBeGreaterThanOrEqual(5000);
  });
});

/* ------------------------------------- 9. the work an answer can trigger */

describe("the work an answer can trigger is bounded", () => {
  it("refuses a narrowing list longer than a bounded number of identifiers", async () => {
    const many = Array.from(
      { length: 500 },
      (_, index) => `stashdb:94ef9c17-82c6-48b0-8dcc-${String(index).padStart(12, "0")}`,
    );

    const outcome = await call(toolOf(registerSearchScenes, EMPTY_SCENE_SEARCH), {
      performer_ids: many,
    });

    expect(
      outcome.refused,
      "a list of five hundred identifiers was accepted, so one empty search can trigger five hundred follow-up reads",
    ).toBe(true);
    expect(outcome.text).toContain("performer_ids");
  });
});

/* --------------------------------- 10. a refusal written by this server */

describe("a refusal never carries an engine's own words", () => {
  const shapes: unknown[] = [null, "a string where an answer was published", 42];

  for (const payload of shapes) {
    it(`reads ${JSON.stringify(payload)} the way any other unreadable shape reads`, async () => {
      // A payload carrying the wrong keys is the shape a catalogue is already
      // reported for, and it is the message every unreadable answer owes.
      const readable = await call(toolOf(registerGetScene, ["a", "list"]), {
        id: `stashdb:${UUID_A}`,
      });
      const outcome = await call(toolOf(registerGetScene, payload), { id: `stashdb:${UUID_A}` });

      expect(
        readable.text,
        "the readable-shape case states no such sentence, so this case is not the one measured",
      ).toMatch(/states nothing about whether/i);
      expect(
        ERROR_CODES.some((code) => outcome.text.includes(code)),
        `a payload published as ${JSON.stringify(payload)} carried none of the six codes`,
      ).toBe(true);
      expect(
        outcome.text,
        `a payload published as ${JSON.stringify(payload)} was reported in an engine's own words`,
      ).not.toMatch(ENGINE_WORDS);
      expect(
        outcome.text,
        "the answer never says it states nothing about what the catalogue holds",
      ).toMatch(/states nothing|says nothing|no evidence/i);
    });
  }
});

/* ------------------------- 11. every narrowing written with identifiers */

describe("every narrowing written with identifiers gets the same explanation", () => {
  const narrowings = ["studio_ids", "tag_ids"];

  for (const narrowing of narrowings) {
    it(`explains an emptiness narrowed on ${narrowing} as one narrowed on performer_ids is explained`, async () => {
      const payload = {
        ...EMPTY_SCENE_SEARCH,
        findPerformer: foldedMarker(),
        findStudio: foldedMarker(),
        findTag: foldedMarker(),
      };

      const onPerformers = await call(toolOf(registerSearchScenes, payload), {
        performer_ids: [`stashdb:${UUID_B}`],
      });
      const onThese = await call(toolOf(registerSearchScenes, payload), {
        [narrowing]: [`stashdb:${UUID_B}`],
      });

      expect(
        everything(onPerformers),
        "the performer narrowing carries no such explanation, so this case is not the one measured",
      ).toMatch(FOLDED);
      expect(
        everything(onThese),
        `an emptiness narrowed on ${narrowing} was left unexplained where one narrowed on performers is explained`,
      ).toMatch(FOLDED);
      expect(everything(onThese)).toContain(`stashdb:${UUID_C}`);
    });
  }
});

/* ------------------------- 12. a withdrawn record that could not be read */

describe("a record that could not be read is not a record carrying nothing", () => {
  it("counts and names a title lost on a withdrawn record", async () => {
    const outcome = await call(
      toolOf(registerGetScene, findScene({ deleted: true, title: { nested: "a title" } })),
      { id: `stashdb:${UUID_A}` },
    );

    expect(
      field(outcome.structured, "status"),
      "the record came back as something other than a withdrawal, so this case is not the one measured",
    ).toBe("deleted");
    expect(
      Number(field(outcome.structured, "rowsSkipped") ?? 0),
      "a title published in a shape this client cannot read was dropped uncounted, so the record reads as one carrying none",
    ).toBeGreaterThan(0);
    expect(
      everything(outcome),
      "the loss of the title is nowhere named, so a reader takes the silence for the catalogue's",
    ).toMatch(/could not be read|unreadable|too damaged/i);
  });
});

/* ------------------- 13. an absence told apart from a check that failed */

describe("an identifier a catalogue holds nothing for is told apart from one it could not answer about", () => {
  it("answers the two on different terms", async () => {
    const holdsNothing = transportRouting((sent) =>
      isLookup(sent) ? { findPerformer: null } : EMPTY_SCENE_SEARCH,
    );
    const couldNotAnswer = transportRouting((sent) =>
      isLookup(sent) ? { findPerformer: "a shape this client cannot read" } : EMPTY_SCENE_SEARCH,
    );
    const args = { performer_ids: [`stashdb:${UUID_B}`] };

    const absent = await call(toolWith(registerSearchScenes, holdsNothing.transport), args);
    const failed = await call(toolWith(registerSearchScenes, couldNotAnswer.transport), args);

    expect(
      everything(absent),
      "a catalogue holding no such record and a catalogue that could not answer read alike",
    ).not.toBe(everything(failed));
    expect(
      everything(absent),
      "a catalogue that answered it holds no such record was reported as one whose answer could not be read",
    ).not.toMatch(/could not be (checked|resolved|read)|did not run/i);
    expect(everything(absent)).toMatch(/no such record|holds none|holds no|no record/i);
  });
});

/* ----------------------- 14. every row a catalogue answered with */

describe("a per-catalogue line reports every row the catalogue answered with", () => {
  it("accounts for the rows that carried none of the hashes asked", async () => {
    // The catalogue answers with three records; two carry none of the hashes
    // asked, so no match can be attributed to them.
    const carrying = { ...SCENE_ROW, fingerprints: [print("MD5", MD5_HASH)] };
    const carryingNone = [
      { ...SCENE_ROW, id: UUID_B, fingerprints: [] },
      { ...SCENE_ROW, id: UUID_C, fingerprints: [] },
    ];

    const outcome = await call(
      toolOf(registerFindByFingerprint, fingerprintPayload([[carrying, ...carryingNone]])),
      ONE_MD5,
    );

    expect(
      field(reportFor(outcome.structured, "stashdb"), "unattributed"),
      "the catalogue's rows carrying no hash asked reached no report, so this case is not the one measured",
    ).toBe(2);

    const line = outcome.text
      .split("\n")
      .find((row) => /stashdb/i.test(row) && /answered/i.test(row));
    expect(line, "no line reports what the catalogue answered").toBeDefined();
    expect(
      line,
      "the catalogue's line counts the rows a hash was attributed to alone, so the records it answered with that carried none go unreported on it",
    ).toMatch(/\b2\b|\b3\b/);
  });
});
