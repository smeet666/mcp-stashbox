/**
 * What an answer is allowed to claim, asserted on the tools and on the mappers.
 *
 * Each case here states one thing a reader would act on: that a narrowing the
 * catalogues cannot read is refused rather than answered with an emptiness, that
 * a note fires only where the phenomenon it describes happened, that a printed
 * identifier is one this server would accept back, and that a row the mapper
 * could not read is counted rather than dropped.
 *
 * Nothing leaves this file. A stub transport stands in for the catalogues, every
 * fixture is invented, and every moment is pinned, so an answer is decided by
 * what the code does with the payload and never by a network or a clock.
 */

import { describe, expect, it } from "vitest";

import { instanceById } from "../../src/stashbox/instances.js";
import { mapPerformer, mapScene } from "../../src/stashbox/map.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StashboxClient } from "../../src/stashbox/client.js";
import { renderFingerprintMatches } from "../../src/tools/findByFingerprint.js";
import { renderPerformer } from "../../src/tools/getPerformer.js";
import { registerGetScene } from "../../src/tools/getScene.js";
import { registerSearchPerformers } from "../../src/tools/searchPerformers.js";
import { registerSearchScenes } from "../../src/tools/searchScenes.js";
import type { PerformerRecord } from "../../src/types.js";

/* ------------------------------------------------------------------ helpers */

/** Pinned, so no assertion here reads a clock. */
const RETRIEVED_AT = "2026-08-11T00:00:00.000Z";

const UUID_A = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const UUID_B = "019fec3f-1bb1-7383-8782-ea0e678f6de0";

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

/** A transport answering every catalogue with a fixed payload and no network. */
type Transport = { request: <T>(spec: unknown, apiKey: string, body: unknown) => Promise<T> };

function transportAnswering(payload: unknown): Transport {
  return { request: async <T>(): Promise<T> => payload as T };
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

function toolOf(
  register: Register,
  payload: unknown,
  keys: Record<string, string> = { stashdb: "test-key" },
): Tool {
  const client = new StashboxClient({
    keys,
    transport: transportAnswering(payload),
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

/**
 * What a caller reads when an argument is refused. A refusal can come from the
 * declaration or from the handler, and both name the argument: the declaration
 * through the path of the issue, the handler through the message it writes.
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
  return {
    refused: answer.isError === true,
    text,
    structured: answer.structuredContent,
    notes,
  };
}

/** Every catalogue's report in an answer, whichever spelling carries them. */
function reports(structured: unknown): Record<string, unknown>[] {
  return ((field(structured, "perSource") as Record<string, unknown>[] | undefined) ?? []).map(
    (report) => report,
  );
}

function reportFor(structured: unknown, source: string): Record<string, unknown> {
  const found = reports(structured).find((report) => field(report, "source") === source);
  if (found === undefined) throw new Error(`no report for ${source}`);
  return found;
}

/** A performer as the mappers hand one to a renderer. */
function performerRecord(over: Partial<PerformerRecord> = {}): PerformerRecord {
  return {
    id: `stashdb:${UUID_A}`,
    source: "stashdb",
    sourceUrl: `https://stashdb.org/performers/${UUID_A}`,
    retrievedAt: RETRIEVED_AT,
    status: "established",
    pendingEdits: 0,
    mergedInto: null,
    mergedIds: [],
    name: "Ilva Norrsken",
    disambiguation: null,
    aliases: [],
    gender: null,
    country: null,
    birthDate: null,
    deathDate: null,
    careerStartYear: null,
    careerEndYear: null,
    sceneCount: 3,
    urls: [],
    created: null,
    updated: null,
    ...over,
  };
}

/** A row a performer search answers with, in the shape a catalogue publishes. */
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

const PERFORMER_SEARCH_PAYLOAD = {
  searchPerformers: { count: 1, performers: [PERFORMER_ROW] },
  queryPerformers: { count: 1, performers: [PERFORMER_ROW] },
};

const SCENE_SEARCH_PAYLOAD = { queryScenes: { count: 1, scenes: [SCENE_ROW] } };

/* --------------------------------------------------- 1. unreadable narrowings */

describe("a narrowing the catalogues cannot read is refused rather than answered", () => {
  /**
   * A date the catalogues would reinterpret answers a question nobody asked, and
   * the emptiness it produces reads as a catalogue that looked and found none.
   */
  for (const value of ["nonsense", "99999-01-01", "2020-13-45"]) {
    it(`refuses search_scenes date_from ${JSON.stringify(value)} as invalid input naming the argument`, async () => {
      const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
        date_from: value,
      });

      expect(outcome.refused, `date_from ${value} was answered rather than refused`).toBe(true);
      expect(outcome.text).toMatch(/invalid_input|date_from/);
      expect(outcome.text).toContain("date_from");
      expect(outcome.structured, "a refused narrowing published an answer").toBeUndefined();
    });
  }

  it("refuses search_performers country written out in full, where a two-letter code is declared", async () => {
    const outcome = await call(toolOf(registerSearchPerformers, PERFORMER_SEARCH_PAYLOAD), {
      country: "AUSTRALIA",
    });

    expect(outcome.refused, "a country written out was answered rather than refused").toBe(true);
    expect(outcome.text).toContain("country");
    expect(outcome.structured).toBeUndefined();
  });
});

/* -------------------------------------------------------- 2. empty narrowings */

describe("an empty narrowing is refused rather than dropped", () => {
  const cases: { tool: Register; payload: unknown; args: Record<string, unknown>; name: string }[] =
    [
      {
        tool: registerSearchScenes,
        payload: SCENE_SEARCH_PAYLOAD,
        args: { title: "" },
        name: "title",
      },
      {
        tool: registerSearchScenes,
        payload: SCENE_SEARCH_PAYLOAD,
        args: { performer_ids: [] },
        name: "performer_ids",
      },
      {
        tool: registerSearchScenes,
        payload: SCENE_SEARCH_PAYLOAD,
        args: { date_to: "" },
        name: "date_to",
      },
      {
        tool: registerSearchPerformers,
        payload: PERFORMER_SEARCH_PAYLOAD,
        args: { country: "" },
        name: "country",
      },
    ];

  for (const { tool, payload, args, name } of cases) {
    it(`refuses an empty ${name} rather than answering the whole index under a narrowed question`, async () => {
      const outcome = await call(toolOf(tool, payload), args);

      expect(outcome.refused, `an empty ${name} was dropped and the answer stood`).toBe(true);
      expect(outcome.text).toContain(name);
      expect(outcome.structured).toBeUndefined();
    });
  }
});

/* ------------------------------------------------ 3. the words a row carries */

const CARRIES_NONE = /No row here carries|carries none of/i;

describe("a note about a query no row carries", () => {
  it("stays silent when a row's name carries every word of the query in another order", async () => {
    const outcome = await call(toolOf(registerSearchPerformers, PERFORMER_SEARCH_PAYLOAD), {
      query: "White Angela",
    });

    expect(
      outcome.notes.join("\n"),
      'a row named "Angela White" was denied the words it carries',
    ).not.toMatch(CARRIES_NONE);
  });

  it("fires when no row carries any of the words asked for", async () => {
    const outcome = await call(toolOf(registerSearchPerformers, PERFORMER_SEARCH_PAYLOAD), {
      query: "Zzzz Qqqq",
    });

    expect(outcome.notes.join("\n")).toMatch(CARRIES_NONE);
  });
});

/* --------------------------------------------- 4 & 5. what 'match' explains */

const LIST_OF_IDENTIFIERS = /lists? of identifiers|any one of them/i;
const IDENTIFIERS_CARRIED = /carries (every|one of the) identifier/i;

describe("the explanation of 'match'", () => {
  it("is written only when a list of identifiers was sent", async () => {
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
      title: "Harbour",
      match: "all",
    });

    expect(
      outcome.notes.join("\n"),
      "'match' was explained on an answer carrying no list of identifiers",
    ).not.toMatch(LIST_OF_IDENTIFIERS);
  });

  it("never says a row satisfies identifier lists the catalogues did not receive", async () => {
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
      performer_ids: [`tpdb:${UUID_B}`],
      match: "any",
    });

    const notes = outcome.notes.join("\n");
    expect(notes).toMatch(/performer_ids/);
    expect(
      notes,
      "the notes dropped the identifier lists and claimed a row carries them at once",
    ).not.toMatch(IDENTIFIERS_CARRIED);
  });
});

/* --------------------------------------------------- 6. a section asked for */

describe("a section the caller asked for", () => {
  it("renders an appearance the catalogue publishes none of, stating that emptiness", () => {
    // The studios, the scenes and the images all print their zero, and an
    // appearance silently left out reads as a section that was never asked for.
    const record = performerRecord({
      scenes: [],
      studios: [],
      images: [],
    } as Partial<PerformerRecord>);

    const { text } = renderPerformer(record, [
      "basic",
      "appearance",
      "images",
      "scenes",
      "studios",
    ]);

    expect(
      text,
      "the studios section did not print its zero, so this case is not the one measured",
    ).toMatch(/^Studios/m);
    expect(text, "an appearance section was asked for and rendered nothing at all").toMatch(
      /^Appearance/m,
    );
  });
});

/* ------------------------------------------- 7 & 8 & 9. fingerprint prose */

/** Two hashes of one file, both matching one scene on one catalogue. */
function twoHashesOneScene() {
  const scene = {
    id: `stashdb:${UUID_A}`,
    source: "stashdb",
    sourceUrl: `https://stashdb.org/scenes/${UUID_A}`,
    retrievedAt: RETRIEVED_AT,
    status: "established",
    pendingEdits: 0,
    mergedInto: null,
    title: "Harbour Lights, Chapter Two",
    details: null,
    code: null,
    director: null,
    durationSeconds: 1500,
    releaseDate: null,
    productionDate: null,
    studio: null,
    performers: [],
    tags: [],
    urls: [],
    created: null,
    updated: null,
  };
  const print = (algorithm: string, hash: string) => ({
    algorithm,
    hash,
    durationSeconds: 1500,
    submissions: 4,
    reports: 0,
    contested: false,
  });
  return {
    matches: [
      {
        scene,
        algorithm: "MD5",
        matchKind: "exact_file",
        fingerprint: print("MD5", MD5_HASH),
      },
      {
        scene,
        algorithm: "PHASH",
        matchKind: "perceptual_similarity",
        fingerprint: print("PHASH", PHASH_HASH),
      },
    ],
    perSource: [{ source: "stashdb", state: "answered", count: 2, records: 1 }],
    unattributed: 0,
    asked: [
      { hash: MD5_HASH, algorithm: "MD5" },
      { hash: PHASH_HASH, algorithm: "PHASH" },
    ],
  };
}

describe("find_by_fingerprint prose reports records", () => {
  it("says one record on the catalogue's line when two hashes match one scene", () => {
    const { text } = renderFingerprintMatches(twoHashesOneScene() as never);

    const line = text
      .split("\n")
      .find((row) => /StashDB|stashdb/.test(row) && /answered/.test(row));
    expect(line, "no line reports what the catalogue answered").toBeDefined();
    expect(line, "the catalogue's line counts rows and never the records behind them").toMatch(
      /\b1\b[^\n]*record/i,
    );
  });

  it("makes the number of records matched readable in the header", () => {
    const { text, structured } = renderFingerprintMatches(twoHashesOneScene() as never);

    expect(field(structured, "scenesMatched")).toBe(1);
    const header = text.split("\n")[0] ?? "";
    expect(header, "the header states no number of records in words").toMatch(/\b1\b[^\n]*record/i);
  });
});

/** The names a payload carries, which prose must say in words instead. */
const PAYLOAD_KEYS = [
  "scenes_matched",
  "match_count",
  "match_kind",
  "per_source",
  "index_total",
  "fields_searched",
  "narrowings_not_received",
  "rows_skipped",
  "rows_skipped_in",
  "'contested'",
  '"contested"',
];

describe("a note names no field of the payload", () => {
  it("says in words what a fingerprint answer qualifies", async () => {
    const { structured } = renderFingerprintMatches(twoHashesOneScene() as never);
    const notes = ((field(structured, "notes") as string[] | undefined) ?? []).join("\n");

    for (const key of PAYLOAD_KEYS) {
      expect(notes, `a note named the payload field ${key}`).not.toContain(key);
    }
  });

  it("says in words what a scene search qualifies", async () => {
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
      performer_ids: [`tpdb:${UUID_B}`],
      match: "any",
    });

    for (const key of PAYLOAD_KEYS) {
      expect(outcome.notes.join("\n"), `a note named the payload field ${key}`).not.toContain(key);
    }
  });
});

const NEVER_ADDED = /never added|not added|never summed/i;

describe("the note about counts never being added", () => {
  it("stays silent on a fingerprint answer no catalogue matched", () => {
    const { structured } = renderFingerprintMatches({
      matches: [],
      perSource: [{ source: "stashdb", state: "answered", count: 0, records: 0 }],
      unattributed: 0,
      asked: [{ hash: PHASH_HASH, algorithm: "PHASH" }],
    } as never);
    const notes = ((field(structured, "notes") as string[] | undefined) ?? []).join("\n");

    expect(notes, "an answer carrying no count explained how counts are added").not.toMatch(
      NEVER_ADDED,
    );
  });

  it("stays silent when a single catalogue answered", () => {
    const { structured } = renderFingerprintMatches(twoHashesOneScene() as never);
    const notes = ((field(structured, "notes") as string[] | undefined) ?? []).join("\n");

    expect(notes, "one catalogue's count was explained as a sum of several").not.toMatch(
      NEVER_ADDED,
    );
  });
});

/* ------------------------------------------------------ 10. how rows are ordered */

describe("the order rows are in", () => {
  it("is named as the answering catalogue's own when only one answered", async () => {
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
      title: "Harbour",
    });

    const ordering = String(field(outcome.structured, "ordering") ?? "");
    expect(ordering, "a single catalogue's rows were presented as interleaved").not.toMatch(
      /interleav/i,
    );
    expect(ordering).toMatch(/own order/i);
    expect(outcome.notes.join("\n")).not.toMatch(/interleav/i);
  });
});

/* --------------------------------------- 11. a catalogue that received nothing */

describe("a catalogue that could receive none of the narrowings", () => {
  it("carries them as narrowings not received rather than only in its reason", async () => {
    const outcome = await call(toolOf(registerSearchScenes, SCENE_SEARCH_PAYLOAD), {
      performer_ids: [`tpdb:${UUID_B}`],
    });

    const report = reportFor(outcome.structured, "stashdb");
    expect(
      field(report, "narrowingsNotReceived"),
      "the narrowings live only in the free-text reason",
    ).toEqual(["performer_ids"]);
  });
});

/* ------------------------------------------------ 12. identifiers that answer */

describe("an identifier this server prints", () => {
  it("is never one it would refuse back, and the row that carried it is counted as unread", () => {
    const record = mapPerformer(
      {
        id: UUID_A,
        name: "Ilva Nordsken",
        deleted: true,
        merged_into_id: "not-a-uuid",
        merged_ids: [],
        urls: [],
      },
      STASHDB,
      RETRIEVED_AT,
    );

    expect(record, "the record could not be mapped at all").not.toBeNull();
    expect(
      field(record, "mergedInto"),
      "a successor that is no identifier was published as one",
    ).toBeNull();
    expect(Number(field(record, "rowsSkipped") ?? 0)).toBeGreaterThan(0);
    expect((field(record, "rowsSkippedIn") as string[] | undefined) ?? []).not.toHaveLength(0);

    const { text } = renderPerformer(record as PerformerRecord, ["basic"]);
    expect(text, "an identifier this server would refuse was offered to read next").not.toContain(
      "not-a-uuid",
    );
  });
});

/* ------------------------------------------- 13. a folded credit on a scene */

describe("a performer credited on a scene", () => {
  it("carries its folded-record marker in the payload and in the prose", async () => {
    const payload = {
      findScene: {
        id: UUID_A,
        title: "Harbour Lights, Chapter Two",
        release_date: null,
        production_date: null,
        duration: null,
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
        performers: [
          {
            as: "Angie",
            performer: {
              id: UUID_B,
              name: "Angela White",
              disambiguation: null,
              deleted: true,
              merged_into_id: null,
            },
          },
        ],
      },
    };

    const outcome = await call(toolOf(registerGetScene, payload), { id: `stashdb:${UUID_A}` });

    const credits = (field(outcome.structured, "performers") as unknown[] | undefined) ?? [];
    expect(credits, "the scene published no credit at all").toHaveLength(1);
    expect(
      field(credits[0], "status"),
      "a credit on a folded record was published as an ordinary one",
    ).toMatch(/merged|deleted|withdrawn/);
    expect(outcome.text, "the prose marks no credit as folded").toMatch(
      /withdrawn|merged|folded|no longer/i,
    );
  });
});

/* ---------------------------------------------------- 14. a discarded row */

describe("a row the mapper could not read", () => {
  it("counts a body modification carrying neither a location nor a description", () => {
    const record = mapPerformer(
      {
        id: UUID_A,
        name: "Ilva Norrsken",
        height: 167,
        deleted: false,
        merged_ids: [],
        merged_into_id: null,
        urls: [],
        tattoos: [{ location: null, description: null }],
        piercings: [],
      },
      STASHDB,
      RETRIEVED_AT,
    );

    expect(
      Number(field(record, "rowsSkipped") ?? 0),
      "an unreadable mark was dropped uncounted",
    ).toBeGreaterThan(0);
    expect((field(record, "rowsSkippedIn") as string[] | undefined) ?? []).not.toHaveLength(0);
  });

  it("counts an absorbed identifier lost on a marker record", () => {
    const record = mapPerformer(
      {
        id: UUID_A,
        name: "Ilva Nordsken",
        deleted: true,
        merged_into_id: UUID_B,
        merged_ids: ["nope", UUID_A],
        urls: [],
      },
      STASHDB,
      RETRIEVED_AT,
    );

    expect(
      Number(field(record, "rowsSkipped") ?? 0),
      "an absorbed identifier was dropped uncounted, so a caller reconciling identifiers loses one in silence",
    ).toBeGreaterThan(0);
    expect((field(record, "rowsSkippedIn") as string[] | undefined) ?? []).not.toHaveLength(0);
  });

  it("counts a studio answered as a scalar", () => {
    const record = mapScene(
      {
        id: UUID_A,
        title: "Harbour Lights, Chapter Two",
        studio: "Northgate Pictures",
        performers: [],
      },
      STASHDB,
      RETRIEVED_AT,
    );

    expect(
      field(record, "studio"),
      "a studio in a shape this client cannot read was published",
    ).toBeNull();
    expect(
      Number(field(record, "rowsSkipped") ?? 0),
      "a studio was dropped uncounted",
    ).toBeGreaterThan(0);
    expect((field(record, "rowsSkippedIn") as string[] | undefined) ?? []).not.toHaveLength(0);
  });
});
