/**
 * The rules that hold at every site of every answer, rather than at the one site
 * a reader happened to look at.
 *
 * Every other suite here states one behaviour at one place, because somebody
 * found it there. The defect this file exists for is the rule honoured at six
 * sites out of seven: an example-based test cannot reach the seventh, because
 * nobody listed it. So each case below states a rule and then walks the whole of
 * every answer looking for a node that breaks it, and names the exact path when
 * one does. A field added tomorrow, a list nested one level deeper, a sixth tool:
 * all of them are covered the day they appear.
 *
 * One fixture carries every awkward shape at once, and all five tools are driven
 * against it across the argument shapes they publish. Nothing leaves this file: a
 * stub transport stands in for the catalogues, every fixture is invented, and the
 * clock is fake and pinned, so an answer is decided by what the code does with a
 * payload and never by a network or a clock.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTANCES } from "../../src/stashbox/instances.js";
import { StashboxClient } from "../../src/stashbox/client.js";
import { registerFindByFingerprint } from "../../src/tools/findByFingerprint.js";
import { registerGetPerformer } from "../../src/tools/getPerformer.js";
import { registerGetScene } from "../../src/tools/getScene.js";
import { registerSearchPerformers } from "../../src/tools/searchPerformers.js";
import { registerSearchScenes } from "../../src/tools/searchScenes.js";

/* ------------------------------------------------------------------ pinning */

/** Pinned, so no assertion here reads a clock. */
const EPOCH = new Date("2026-08-11T00:00:00.000Z");
const EPOCH_ISO = "2026-08-11T00:00:00.000Z";

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(EPOCH);
});

afterAll(() => {
  vi.useRealTimers();
});

/* ----------------------------------------------------------- the vocabulary */

/** The six codes an answer is allowed to carry. */
const ERROR_CODES = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
] as const;

/** What a message written by an engine rather than by this server looks like. */
const ENGINE_WORDS =
  /Cannot read propert|Cannot use '[^']+' operator|is not a function|is not iterable|undefined is not|TypeError|ReferenceError|SyntaxError|of undefined|of null\b|\bat Object\.|\bat Module\./;

/** A path on a disk, which no answer of this server has any business naming. */
const FILE_PATHS = /(?:^|[\s(])(?:\/[A-Za-z0-9_.-]+){2,}|[A-Za-z]:\\|\bnode_modules\b|\.[jt]s:\d+/;

/** The words an answer uses of a record its catalogue no longer holds as itself. */
const MARKED = /withdrawn|merged|folded|no longer|successor|marker|deleted|former/i;

/** The catalogues this server names, taken from what it publishes rather than by hand. */
const SOURCE_IDS = INSTANCES.map((instance) => String((instance as { id: string }).id));

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const NAMESPACED = new RegExp(`^(?:${SOURCE_IDS.join("|")}):${UUID}$`);

/* ------------------------------------------------------------------ walking */

interface Node {
  /** Where the value sits, as a reader would write it: `results[0].studio_id`. */
  path: string;
  key: string;
  value: unknown;
  /** The object the value hangs off, so a rule can read its siblings. */
  owner: Record<string, unknown> | undefined;
}

/** Every node of a payload, with the path that names it. */
function* walk(
  value: unknown,
  path: string,
  key = "",
  owner?: Record<string, unknown>,
): Generator<Node> {
  yield { path, key, value, owner };
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* walk(item, `${path}[${index}]`, key, owner);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [name, item] of Object.entries(record)) {
      yield* walk(item, `${path}.${name}`, name, record);
    }
  }
}

/** Every object in a payload, with its path. */
function* objects(
  value: unknown,
  path: string,
): Generator<{ path: string; object: Record<string, unknown> }> {
  for (const node of walk(value, path)) {
    if (node.value !== null && typeof node.value === "object" && !Array.isArray(node.value)) {
      yield { path: node.path, object: node.value as Record<string, unknown> };
    }
  }
}

/* ----------------------------------------------------------------- fixtures */

const U = {
  sceneOk: "94ef9c17-82c6-48b0-8dcc-063b69231960",
  sceneMerged: "019fec3f-1bb1-7383-8782-ea0e678f6de0",
  sceneHeir: "3f2a1c88-0d47-4e19-9a55-71b0c2d4e6f8",
  sceneBadHeir: "b2f4e8a0-1c76-4d39-95e2-8f30a7c6b514",
  perfOk: "6b1d5e20-9c3a-4f77-b2ec-58a1d0e93c44",
  perfMerged: "c40e8b71-2a95-4d63-9f18-7e5b3c0a6d22",
  perfGone: "aa77b3d9-5e41-4c08-84f2-19c6d7e0b533",
  studio: "d1c9f4a6-3b72-4e85-9017-6a2f8c5d3e91",
  studioGone: "7c3b9e15-4a08-4d26-b7f1-e9524c8a0d63",
  tag: "5e0a7c31-8d46-4b92-a3f5-c7180b6e4d29",
  tagGone: "2d8f6b04-7e19-4a53-8c60-f4b19d7e2a85",
};

const MD5 = "0badc0ffee1122334455667788990011";
const PHASH = "9f8e7d6c5b4a3928";
const OSHASH = "1122334455667788";
/** A hash in the shape the tool takes, which no record in this fixture carries. */
const HELD_BY_NOBODY = "ffffffffffffffffffffffffffffffff";

/** A studio holding a parent, so the nesting a reader sees is exercised. */
const STUDIO = {
  id: U.studio,
  name: "Harbour Lights Pictures",
  parent: { id: U.studioGone, name: "Harbour Group", deleted: false },
  deleted: false,
  merged_into_id: null,
};

/** A link the catalogue attaches a site to, and one it does not. */
const URLS = [
  {
    url: "https://example-listing.test/a",
    site: { name: "The Listing", category: { name: "STUDIO" } },
  },
  { url: "https://example-listing.test/b", site: null },
];

const TAGS = [
  {
    id: U.tag,
    name: "harbour-at-dusk",
    deleted: false,
    merged_into_id: null,
    category: { id: U.tag, name: "Setting" },
  },
  { id: U.tagGone, name: "tag-since-folded", deleted: true, merged_into_id: U.tag, category: null },
];

/** Three credits: one established, one the catalogue folded, one it withdrew. */
const CREDITS = [
  {
    as: "Angie",
    performer: {
      id: U.perfOk,
      name: "Ilva Norrsken",
      disambiguation: "I",
      deleted: false,
      merged_into_id: null,
    },
  },
  {
    as: null,
    performer: {
      id: U.perfMerged,
      name: "Perrine Vasquez",
      disambiguation: null,
      deleted: true,
      merged_into_id: U.perfOk,
    },
  },
  {
    as: null,
    performer: {
      id: U.perfGone,
      name: "Cato Bramble",
      disambiguation: null,
      deleted: true,
      merged_into_id: null,
    },
  },
];

/** Fingerprints including a row this client cannot read. */
const PRINTS = [
  { algorithm: "MD5", hash: MD5, duration: 1500, submissions: 3, reports: 0 },
  { algorithm: "PHASH", hash: PHASH, duration: 1500, submissions: 2, reports: null },
  { algorithm: "OSHASH", hash: OSHASH, duration: 1500, submissions: 1, reports: 4 },
  {
    algorithm: "NOT-AN-ALGORITHM",
    hash: null,
    duration: "a while",
    submissions: null,
    reports: null,
  },
];

/** An established scene, carrying every awkward shape a scene can carry at once. */
const SCENE_OK = {
  id: U.sceneOk,
  title: "Harbour Lights, Chapter Two",
  details: "Filmed on the quay over two nights.",
  release_date: "2019",
  production_date: "2019-02-31",
  duration: 1500,
  code: "HL-002",
  director: "Ines Marchetti",
  deleted: false,
  merged_into_id: null,
  merged_ids: [],
  studio: STUDIO,
  tags: TAGS,
  urls: URLS,
  edits: [{ status: "PENDING" }, { status: "ACCEPTED" }],
  images: [
    { id: U.tag, url: "https://images.example.test/one.jpg", width: 1920, height: 1080 },
    null,
    7,
    "an image",
  ],
  fingerprints: PRINTS,
  performers: CREDITS,
  created: "2020-01-01T00:00:00Z",
  updated: "2020-02-01T00:00:00Z",
};

/** A scene the catalogue folded into a successor it names. */
const SCENE_MERGED = {
  ...SCENE_OK,
  id: U.sceneMerged,
  title: "Tidewater, Chapter One",
  deleted: true,
  merged_into_id: U.sceneHeir,
};

/** A scene folded into a successor this client cannot read. */
const SCENE_BAD_HEIR = {
  ...SCENE_OK,
  id: U.sceneBadHeir,
  title: "Nightjar Sessions",
  deleted: true,
  merged_into_id: "not-a-uuid",
};

/** An established performer, with a nested list holding a null, a number and a string. */
const PERF_OK = {
  id: U.perfOk,
  name: "Ilva Norrsken",
  disambiguation: "I",
  aliases: ["Angie", null, 7],
  gender: "FEMALE",
  country: "AU",
  birth_date: "1985",
  death_date: "2001-02-31",
  career_start_year: 2003,
  career_end_year: null,
  scene_count: null,
  deleted: false,
  merged_ids: [U.perfMerged, "not-a-uuid"],
  merged_into_id: null,
  urls: URLS,
  edits: [{ status: "PENDING" }],
  ethnicity: "CAUCASIAN",
  eye_color: "BLUE",
  hair_color: "BROWN",
  height: 167,
  cup_size: "D",
  band_size: 32,
  waist_size: 26,
  hip_size: 36,
  breast_type: "NATURAL",
  tattoos: [
    { location: "left forearm", description: "a rose" },
    { location: null, description: null },
  ],
  piercings: [{ location: "ear", description: null }],
  images: [{ id: U.tag, url: "https://images.example.test/p.jpg", width: 900, height: 1200 }, null],
  studios: [
    { studio: STUDIO, scene_count: 4 },
    { studio: null, scene_count: null },
  ],
  created: "2020-01-01T00:00:00Z",
  updated: "2020-02-01T00:00:00Z",
};

const PERF_MERGED = {
  ...PERF_OK,
  id: U.perfMerged,
  name: "Perrine Vasquez",
  deleted: true,
  merged_into_id: U.perfOk,
};

const PERF_GONE = {
  ...PERF_OK,
  id: U.perfGone,
  name: "Cato Bramble",
  deleted: true,
  merged_into_id: null,
};

const SCENES = [SCENE_OK, SCENE_MERGED, SCENE_BAD_HEIR];
const PERFORMERS = [PERF_OK, PERF_MERGED, PERF_GONE];

/**
 * The catalogue's answer to one request, decided by the request itself so that a
 * lookup of one identifier answers about that record and never about another.
 */
function payloadFor(body: unknown): Record<string, unknown> {
  const text = JSON.stringify(body ?? null);
  const vars = (body as { variables?: Record<string, unknown> })?.variables ?? {};
  const id = String(vars.id ?? "");
  const pick = <T extends { id: string }>(list: readonly T[], fallback: T): T =>
    list.find((row) => row.id === id) ?? fallback;

  const out: Record<string, unknown> = {};
  if (/findScenesBySceneFingerprints/.test(text)) {
    const asked = JSON.stringify((vars as { fingerprints?: unknown }).fingerprints ?? []);
    // A hash nobody holds answers with an empty group; the hashes the fixture
    // holds answer with two records, one of them folded.
    out.findScenesBySceneFingerprints = asked.includes(HELD_BY_NOBODY)
      ? [[]]
      : [[SCENE_OK, SCENE_MERGED], []];
  }
  if (/findScene\b/.test(text)) out.findScene = pick(SCENES, SCENE_OK);
  if (/findPerformer\b/.test(text)) out.findPerformer = pick(PERFORMERS, PERF_OK);
  if (/findStudio\b/.test(text)) out.findStudio = STUDIO;
  if (/findTag\b/.test(text)) out.findTag = TAGS[0];
  if (/queryScenes\b/.test(text)) out.queryScenes = { count: 42, scenes: SCENES };
  if (/searchScenes\b/.test(text)) out.searchScenes = { count: 42, scenes: SCENES };
  if (/queryPerformers\b/.test(text)) out.queryPerformers = { count: 17, performers: PERFORMERS };
  if (/searchPerformers\b/.test(text)) out.searchPerformers = { count: 17, performers: PERFORMERS };
  return out;
}

/* -------------------------------------------------------- driving the tools */

type Transport = { request: <T>(spec: unknown, apiKey: string, body: unknown) => Promise<T> };

/**
 * Two catalogues answer and a third answers a shape this client cannot read, so
 * every answer collected here carries all three states at once. The other two
 * hold no key and are absent.
 */
const KEYS = { stashdb: "test-key", fansdb: "test-key", pmv: "test-key" };

const EXHAUSTIVE_TRANSPORT: Transport = {
  request: async <T>(spec: unknown, _apiKey: string, body: unknown): Promise<T> => {
    const source = String((spec as { id?: string })?.id ?? "");
    if (source === "pmv") return "a shape this client cannot read" as T;
    return payloadFor(body) as T;
  },
};

interface Tool {
  name: string;
  inputSchema: { safeParse: (value: unknown) => any };
  outputSchema: unknown;
  handler: (args: unknown) => Promise<{
    isError?: boolean;
    content?: { text?: string }[];
    structuredContent?: unknown;
  }>;
}

type Register = (server: McpServer, client: StashboxClient) => void;

function toolWith(
  register: Register,
  transport: Transport,
  keys: Record<string, string> = KEYS,
): Tool {
  const client = new StashboxClient({
    keys,
    transport,
    minIntervalMs: 0,
  } as unknown as ConstructorParameters<typeof StashboxClient>[0]);
  let captured: Tool | undefined;
  const server = {
    registerTool: (
      name: string,
      config: { inputSchema: Tool["inputSchema"]; outputSchema?: unknown },
      handler: Tool["handler"],
    ) => {
      captured = {
        name,
        inputSchema: config.inputSchema,
        outputSchema: config.outputSchema,
        handler,
      };
    },
  };
  register(server as unknown as McpServer, client);
  if (captured === undefined) throw new Error("the registration published no tool");
  return captured;
}

const REGISTRARS: Record<string, Register> = {
  search_scenes: registerSearchScenes,
  search_performers: registerSearchPerformers,
  get_scene: registerGetScene,
  get_performer: registerGetPerformer,
  find_by_fingerprint: registerFindByFingerprint,
};

/** Every tool as its registration publishes it, driven against the exhaustive fixture. */
const TOOLS: Record<string, Tool> = Object.fromEntries(
  Object.entries(REGISTRARS).map(([name, register]) => [
    name,
    toolWith(register, EXHAUSTIVE_TRANSPORT),
  ]),
);

interface Answer {
  tool: string;
  label: string;
  args: unknown;
  refused: boolean;
  text: string;
  notes: string[];
  /** Everything a caller reads in prose, whichever block carries it. */
  prose: string;
  structured: unknown;
}

async function call(tool: Tool, args: unknown, label: string): Promise<Answer> {
  const base = { tool: tool.name, label, args };
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    const text = parsed.error.issues
      .map(
        (issue: { path: (string | number)[]; message: string }) =>
          `${issue.path.join(".")}: ${issue.message}`,
      )
      .join("\n");
    return { ...base, refused: true, text, notes: [], prose: text, structured: undefined };
  }
  let answer;
  try {
    answer = await tool.handler(parsed.data);
  } catch (error) {
    const thrown = error as { code?: string; message?: string };
    const text = `[${thrown.code ?? "unknown"}] ${thrown.message ?? String(error)}`;
    return { ...base, refused: true, text, notes: [], prose: text, structured: undefined };
  }
  const text = (answer.content ?? []).map((part) => part.text ?? "").join("\n");
  const structured = answer.structuredContent;
  const notes =
    ((structured as { notes?: string[] } | undefined)?.notes as string[] | undefined) ?? [];
  return {
    ...base,
    refused: answer.isError === true,
    text,
    notes,
    prose: [text, ...notes].join("\n"),
    structured,
  };
}

/** Every non-empty subset of a tool's sections, so no subset goes undriven. */
function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << items.length; mask += 1) {
    out.push(items.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return out;
}

const SCENE_SECTIONS = ["basic", "fingerprints", "images"] as const;
const PERFORMER_SECTIONS = ["basic", "appearance", "images", "scenes", "studios"] as const;

/** Every answer this suite reads, collected once. */
const ANSWERS: Answer[] = [];

beforeAll(async () => {
  const push = async (tool: string, args: unknown, label: string) => {
    ANSWERS.push(await call(TOOLS[tool]!, args, label));
  };

  // Both search paths, and every narrowing the declaration publishes.
  await push("search_scenes", { query: "harbour lights" }, "full text");
  await push(
    "search_scenes",
    { title: "harbour", sort: "date", direction: "asc", page: 2, limit: 3 },
    "typed",
  );
  await push(
    "search_scenes",
    { performer_ids: [`stashdb:${U.perfMerged}`], match: "any" },
    "narrowed on a folded performer",
  );
  await push(
    "search_scenes",
    { studio_ids: [`stashdb:${U.studio}`], tag_ids: [`fansdb:${U.tag}`] },
    "narrowed on studios and tags",
  );
  await push(
    "search_scenes",
    { code: "HL-002", date_from: "2018-01-01", date_to: "2020-01-01" },
    "both date bounds",
  );
  await push("search_scenes", { query: "harbour", sources: ["stashdb"] }, "one catalogue");

  await push("search_performers", { query: "ilva" }, "full text");
  await push(
    "search_performers",
    { name: "ilva", country: "AU", sort: "scene_count", direction: "desc" },
    "typed",
  );
  await push(
    "search_performers",
    { performed_with: `stashdb:${U.perfMerged}` },
    "narrowed on a folded performer",
  );
  await push("search_performers", { studio_id: `stashdb:${U.studio}` }, "narrowed on a studio");

  for (const sections of subsets(SCENE_SECTIONS)) {
    for (const [name, id] of [
      ["established", U.sceneOk],
      ["folded", U.sceneMerged],
      ["folded into an unreadable successor", U.sceneBadHeir],
    ] as const) {
      await push(
        "get_scene",
        { id: `stashdb:${id}`, sections },
        `${name}, sections ${sections.join("+")}`,
      );
    }
  }
  await push("get_scene", { id: `stashdb:${U.sceneOk}` }, "established, sections left out");

  for (const sections of subsets(PERFORMER_SECTIONS)) {
    await push(
      "get_performer",
      { id: `stashdb:${U.perfOk}`, sections },
      `established, sections ${sections.join("+")}`,
    );
  }
  await push("get_performer", { id: `stashdb:${U.perfMerged}` }, "folded");
  await push("get_performer", { id: `stashdb:${U.perfGone}` }, "withdrawn");
  await push("get_performer", { id: `fansdb:${U.perfOk}` }, "established on a second catalogue");

  await push(
    "find_by_fingerprint",
    { fingerprints: [{ hash: MD5, algorithm: "MD5" }] },
    "an exact hash that hits",
  );
  await push(
    "find_by_fingerprint",
    { fingerprints: [{ hash: PHASH, algorithm: "PHASH" }] },
    "a perceptual hash that hits",
  );
  await push(
    "find_by_fingerprint",
    {
      fingerprints: [
        { hash: MD5, algorithm: "MD5" },
        { hash: OSHASH, algorithm: "OSHASH" },
        { hash: PHASH, algorithm: "PHASH" },
      ],
    },
    "a whole inventory",
  );
  await push(
    "find_by_fingerprint",
    { fingerprints: [{ hash: HELD_BY_NOBODY, algorithm: "MD5" }] },
    "a hash nobody holds",
  );
}, 120_000);

/** The answers that were not refused, which are the ones carrying a payload. */
function answered(): Answer[] {
  return ANSWERS.filter((answer) => !answer.refused && answer.structured !== undefined);
}

function at(answer: Answer): string {
  return `${answer.tool} (${answer.label})`;
}

/* ------------------------------------------------ 0. the fixture is exhaustive */

describe("the fixture carries every awkward shape at once", () => {
  it("drives every tool, and every state a catalogue can be in", () => {
    expect(answered().length, "no answer was collected at all").toBeGreaterThan(40);
    expect(new Set(ANSWERS.map((answer) => answer.tool)).size, "a tool went undriven").toBe(5);

    const states = new Set<unknown>();
    for (const answer of answered()) {
      for (const report of (answer.structured as { per_source?: { state?: unknown }[] })
        ?.per_source ?? []) {
        states.add(report.state);
      }
    }
    expect(states, "the fixture never puts a catalogue in all three states at once").toEqual(
      new Set(["answered", "failed", "absent"]),
    );
  });
});

/* ------------------------------------- 1. every identifier this server prints */

/** The keys whose values a caller can hand back to this server as identifiers. */
function isIdentifierKey(key: string): boolean {
  return key === "id" || key === "merged_into" || key === "studio_id" || /_ids?$/.test(key);
}

/** Every identifier printed anywhere in any payload, with where it was printed. */
function printedIdentifiers(): { path: string; value: unknown }[] {
  const found: { path: string; value: unknown }[] = [];
  for (const answer of answered()) {
    for (const node of walk(answer.structured, answer.tool)) {
      if (!isIdentifierKey(node.key)) continue;
      if (Array.isArray(node.value) || node.value === null || node.value === undefined) continue;
      if (node.value !== null && typeof node.value === "object") continue;
      found.push({ path: node.path, value: node.value });
    }
  }
  return found;
}

describe("every identifier this server prints is one it would accept back", () => {
  it("names a catalogue and a real uuid at every site that prints one", () => {
    const printed = printedIdentifiers();
    expect(
      printed.length,
      "no identifier was printed anywhere, so this rule is not measured",
    ).toBeGreaterThan(10);

    const broken = printed.filter(
      (entry) => typeof entry.value !== "string" || !NAMESPACED.test(entry.value),
    );
    expect(
      broken.map((entry) => `${entry.path} = ${JSON.stringify(entry.value)}`),
      "an identifier was printed in a form this server would not accept back",
    ).toEqual([]);
  });

  it("refuses none of them for not being an identifier", async () => {
    const unique = [...new Set(printedIdentifiers().map((entry) => String(entry.value)))];
    expect(
      unique.length,
      "no identifier was printed, so this rule is not measured",
    ).toBeGreaterThan(3);

    const complaints: string[] = [];
    for (const id of unique) {
      for (const tool of ["get_scene", "get_performer"]) {
        const answer = await call(TOOLS[tool]!, { id }, `fed back ${id}`);
        if (!answer.refused) continue;
        if (
          /not an identifier|is not an? .*identifier|must be .*<uuid>|malformed identifier|unrecognised identifier|invalid identifier/i.test(
            answer.text,
          )
        ) {
          complaints.push(`${tool}(${id}): ${answer.text.split("\n")[0]}`);
        }
      }
    }
    expect(complaints, "an identifier this server printed was refused as not being one").toEqual(
      [],
    );
  }, 120_000);
});

/* -------------------------------------------- 2. every payload key is declared */

type Schema = Record<string, any>;

function schemaOf(tool: string): Schema {
  return z.toJSONSchema(TOOLS[tool]!.outputSchema as never, { io: "output" }) as Schema;
}

function schemaInputOf(tool: string): Schema {
  return z.toJSONSchema(TOOLS[tool]!.inputSchema as never) as Schema;
}

/** Whether a value could be what a schema node declares. */
function matchesType(value: unknown, node: Schema): boolean {
  if (node === undefined) return false;
  if (Array.isArray(node.anyOf))
    return node.anyOf.some((branch: Schema) => matchesType(value, branch));
  if (node.const !== undefined) return value === node.const;
  switch (node.type) {
    case "string":
      return typeof value === "string";
    case "number":
    case "integer":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

/** The branches of a schema node a value could be described by. */
function branches(node: Schema): Schema[] {
  if (node === undefined) return [];
  if (Array.isArray(node.anyOf)) return node.anyOf.flatMap((branch: Schema) => branches(branch));
  return [node];
}

/**
 * Every key of a payload that no branch of its schema declares, and every value
 * no branch's type admits, each with the path that names it.
 */
function undeclared(value: unknown, node: Schema, path: string): string[] {
  const out: string[] = [];
  if (value === undefined) return out;
  const options = branches(node);
  if (options.length === 0) return [`${path}: nothing is declared at this path`];
  if (!options.some((option) => matchesType(value, option))) {
    const declared = options
      .map((option) => option.type ?? (option.const !== undefined ? `const ${option.const}` : "?"))
      .join(" | ");
    return [
      `${path}: a ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value} was published where the schema declares ${declared}`,
    ];
  }
  if (Array.isArray(value)) {
    const items = options.find((option) => option.type === "array" && option.items)?.items;
    if (items) {
      for (const [index, item] of value.entries())
        out.push(...undeclared(item, items, `${path}[${index}]`));
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    const shapes = options.filter((option) => option.type === "object" || option.properties);
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const declaredHere = shapes
        .map(
          (shape) =>
            shape.properties?.[key] ??
            (shape.additionalProperties && shape.additionalProperties !== false
              ? shape.additionalProperties
              : undefined),
        )
        .filter((found) => found !== undefined);
      if (declaredHere.length === 0) {
        out.push(
          `${path}.${key}: this key is present in the payload and declared nowhere in the outputSchema`,
        );
        continue;
      }
      out.push(
        ...undeclared(
          item,
          declaredHere.length === 1 ? declaredHere[0] : { anyOf: declaredHere },
          `${path}.${key}`,
        ),
      );
    }
  }
  return out;
}

describe("every payload key is declared, at the path it is published on", () => {
  it("publishes no key and no type the outputSchema does not declare", () => {
    const complaints: string[] = [];
    for (const answer of answered()) {
      complaints.push(
        ...undeclared(answer.structured, schemaOf(answer.tool), `${answer.tool}[${answer.label}]`),
      );
    }
    expect(
      [...new Set(complaints)],
      "a payload carried a key or a type its tool never declared",
    ).toEqual([]);
  });

  it("declares every key the outputSchema names as required on every answer that carries a payload", () => {
    const missing: string[] = [];
    for (const answer of answered()) {
      const required: string[] = schemaOf(answer.tool).required ?? [];
      for (const key of required) {
        if ((answer.structured as Record<string, unknown>)[key] === undefined) {
          missing.push(`${at(answer)}.${key}`);
        }
      }
    }
    expect(missing, "an answer left out a key its own schema declares as required").toEqual([]);
  });
});

/* -------------------------------- 3. every qualification is also in the prose */

/** The tokens that make a key a qualification rather than a fact. */
const QUALIFIERS = [
  "skipped",
  "unreadable",
  "not_received",
  "naming_no_record",
  "in_part",
  "nothing_to_do",
  "not_searched",
  "unavailable",
  "pending_edits",
  "cached",
];

function qualifierIn(key: string): string | undefined {
  return QUALIFIERS.find((token) => key.includes(token));
}

/** The thing a qualifying key qualifies, as words a sentence would use. */
function subjectOf(key: string, qualifier: string): string[] {
  const words = key
    .replace(qualifier, " ")
    .split(/[_\s]+/)
    .filter((word) => word.length > 0 && !["of", "in", "the", "with", "here", "no"].includes(word));
  return words.map((word) => word.replace(/(?:ies|s)$/, "").replace(/y$/, ""));
}

interface Qualification {
  answer: Answer;
  path: string;
  key: string;
  qualifier: string;
  value: unknown;
}

function qualifications(): Qualification[] {
  const found: Qualification[] = [];
  for (const answer of answered()) {
    for (const node of walk(answer.structured, answer.tool)) {
      if (node.key === "") continue;
      if (Array.isArray(node.owner?.[node.key]) && node.path.endsWith("]")) continue;
      const qualifier = qualifierIn(node.key);
      if (qualifier === undefined) continue;
      if (node.value === undefined || node.value === null || node.value === false) continue;
      if (typeof node.value === "number" && node.value === 0) continue;
      if (Array.isArray(node.value) && node.value.length === 0) continue;
      if (!node.path.endsWith(`.${node.key}`)) continue;
      found.push({ answer, path: node.path, key: node.key, qualifier, value: node.value });
    }
    // A status other than 'established' is a qualification wherever it sits.
    for (const node of walk(answer.structured, answer.tool)) {
      if (node.key !== "status" || node.value === "established" || typeof node.value !== "string")
        continue;
      found.push({
        answer,
        path: node.path,
        key: "status",
        qualifier: "status",
        value: node.value,
      });
    }
  }
  return found;
}

describe("every qualification in the payload is also in the prose", () => {
  it("says in words what every qualifying key says in the payload", () => {
    const all = qualifications();
    expect(
      all.length,
      "no qualification was published, so this rule is not measured",
    ).toBeGreaterThan(10);

    const silent: string[] = [];
    for (const found of all) {
      const prose = found.answer.prose.toLowerCase();
      if (found.qualifier === "status") {
        if (!MARKED.test(found.answer.prose)) {
          silent.push(
            `${at(found.answer)}: ${found.path} = ${String(found.value)} is nowhere in the prose`,
          );
        }
        continue;
      }
      if (Array.isArray(found.value)) {
        // A list of names is a list a reader must be able to read in words.
        for (const item of found.value) {
          if (typeof item === "string" && !prose.includes(item.toLowerCase())) {
            silent.push(
              `${at(found.answer)}: ${found.path} names ${JSON.stringify(item)} and the prose never does`,
            );
          }
        }
        continue;
      }
      const subject = subjectOf(found.key, found.qualifier);
      const spoken =
        subject.length === 0 || subject.every((word) => prose.includes(word.toLowerCase()));
      if (!spoken) {
        silent.push(
          `${at(found.answer)}: ${found.path} = ${String(found.value)}, and no sentence names ${subject.join(" ")}`,
        );
      }
    }
    expect(
      [...new Set(silent)],
      "a qualification the payload carries is nowhere in the prose",
    ).toEqual([]);
  });
});

/* ------------------- 4. every record that is not established is marked */

/** The name a reader would recognise a record by, wherever it is printed. */
function displayName(object: Record<string, unknown>): string | undefined {
  for (const key of ["title", "name", "former_title", "former_name"]) {
    const value = object[key];
    if (typeof value === "string" && value.trim().length > 2) return value;
  }
  return undefined;
}

describe("every record that is not established is marked wherever it appears", () => {
  it("marks it in the prose, and prints it nowhere without the mark", () => {
    const unmarked: string[] = [];
    for (const answer of answered()) {
      for (const { path, object } of objects(answer.structured, answer.tool)) {
        const status = object.status;
        if (typeof status !== "string" || status === "established") continue;
        const name = displayName(object);
        if (name === undefined) continue;
        const lines = answer.prose.split("\n").filter((line) => line.includes(name));
        if (lines.length === 0) {
          unmarked.push(`${at(answer)}: ${path} is ${status} and its name is nowhere in the prose`);
          continue;
        }
        for (const line of lines) {
          if (!MARKED.test(line)) {
            unmarked.push(
              `${at(answer)}: ${path} is ${status} and is printed unmarked on the line "${line.trim()}"`,
            );
          }
        }
      }
    }
    expect(
      [...new Set(unmarked)],
      "a record its catalogue no longer holds as itself was printed without the mark",
    ).toEqual([]);
  });
});

/* ------------------------------------------- 5. a count never exceeds what it counts */

/** A key naming a number of things, read word by word so 'country' is no count. */
function isCountKey(key: string): boolean {
  return key
    .split("_")
    .some((word) => ["total", "totals", "count", "counts", "held"].includes(word));
}

/** The sibling list a count would be counting, where the payload carries one. */
function siblingList(
  owner: Record<string, unknown>,
  key: string,
): { name: string; rows: unknown[] } | undefined {
  const stem = key.replace(/_?(total|count|held|matched)$/, "").replace(/^(total|count)_?/, "");
  const candidates =
    stem.length > 0 ? [stem, `${stem}s`] : ["results", "matches", "scenes", "rows"];
  for (const name of candidates) {
    if (Array.isArray(owner[name])) return { name, rows: owner[name] as unknown[] };
  }
  return undefined;
}

describe("a count is a whole number of things, and never smaller than what it counts", () => {
  it("publishes no count that is not a whole number of things", () => {
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const node of walk(answer.structured, answer.tool)) {
        if (!isCountKey(node.key) || node.value === null || node.value === undefined) continue;
        if (typeof node.value === "object") continue;
        if (typeof node.value !== "number" || !Number.isSafeInteger(node.value) || node.value < 0) {
          wrong.push(`${at(answer)}: ${node.path} = ${JSON.stringify(node.value)}`);
        }
      }
    }
    expect(wrong, "a count was published that is no whole number of things").toEqual([]);
  });

  it("never counts fewer things than the list beside it holds", () => {
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const node of walk(answer.structured, answer.tool)) {
        if (!isCountKey(node.key) || typeof node.value !== "number" || node.owner === undefined)
          continue;
        const list = siblingList(node.owner, node.key);
        if (list === undefined) continue;
        if (node.value < list.rows.length) {
          wrong.push(
            `${at(answer)}: ${node.path} = ${node.value} while the list ${list.name} beside it holds ${list.rows.length} row(s)`,
          );
        }
      }
    }
    expect(wrong, "a count reported fewer things than the list published beside it").toEqual([]);
  });

  it("never falls back to the page size where a wider count was asked for", () => {
    // A count declared to measure what a catalogue's index holds, coming back
    // equal to the number of rows one page could carry, is the page size wearing
    // the name of a total.
    const wrong: string[] = [];
    for (const answer of answered()) {
      const window = (answer.structured as { window?: { limit?: number } })?.window;
      const limit = window?.limit;
      if (typeof limit !== "number") continue;
      for (const node of walk(answer.structured, answer.tool)) {
        if (node.key !== "index_total" || typeof node.value !== "number") continue;
        const rows = node.owner?.count;
        if (node.value === limit && typeof rows === "number" && rows === limit) {
          wrong.push(`${at(answer)}: ${node.path} = ${node.value}, which is exactly the page size`);
        }
      }
    }
    expect(
      wrong,
      "a total came back equal to the page size, which measures the page rather than the index",
    ).toEqual([]);
  });
});

/* ------------------------------------------- 6. every emptiness carries its reason */

/** How many rows an answer holds, whichever list a tool publishes them in. */
function rowsOf(structured: unknown): number | undefined {
  const payload = structured as Record<string, unknown>;
  for (const key of ["results", "matches"]) {
    if (Array.isArray(payload[key])) return (payload[key] as unknown[]).length;
  }
  return undefined;
}

const A_REASON =
  /could not answer|failed|not asked|no API key|did not contribute|not receive|received short|nothing to do|merged|folded|resolves? to|withdrawn|found nothing|holds no|no such|states nothing|no record|inside that window|does not search|never asked/i;

describe("every emptiness carries its reason", () => {
  it("says why, on every answer holding no row at all", () => {
    const silent: string[] = [];
    let measured = 0;
    for (const answer of answered()) {
      const rows = rowsOf(answer.structured);
      if (rows === undefined || rows > 0) continue;
      measured += 1;
      if (!answer.notes.some((note) => A_REASON.test(note))) {
        silent.push(`${at(answer)}: ${rows} row(s) and no note saying why`);
      }
    }
    expect(measured, "no answer came back empty, so this rule is not measured").toBeGreaterThan(0);
    expect(silent, "an answer of zero carried no sentence saying why it is zero").toEqual([]);
  });
});

/* --------------------------------------------- 7. every refusal carries a code */

/** Every argument a tool publishes, read from its declaration rather than listed here. */
function argumentsOf(tool: string): { name: string; schema: Schema; required: boolean }[] {
  const declared = schemaInputOf(tool);
  const required: string[] = declared.required ?? [];
  return Object.entries(declared.properties ?? {}).map(([name, schema]) => ({
    name,
    schema: schema as Schema,
    required: required.includes(name),
  }));
}

/** A value each tool needs before any other argument can be judged. */
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  search_scenes: { query: "harbour" },
  search_performers: { query: "ilva" },
  get_scene: { id: `stashdb:${U.sceneOk}` },
  get_performer: { id: `stashdb:${U.perfOk}` },
  find_by_fingerprint: { fingerprints: [{ hash: MD5, algorithm: "MD5" }] },
};

/** Every value the declaration says is out of bounds, derived from the bounds themselves. */
function badValues(schema: Schema): { label: string; value: unknown }[] {
  const out: { label: string; value: unknown }[] = [
    { label: "the empty string", value: "" },
    { label: "a whitespace-only string", value: "   " },
    { label: "an empty array", value: [] },
  ];
  const type = schema.type ?? (schema.anyOf?.[0]?.type as string | undefined);
  out.push({
    label: "a wrong type",
    value: type === "string" ? 17 : type === "array" ? "not a list" : { a: 1 },
  });
  if (typeof schema.minimum === "number")
    out.push({ label: "below the declared minimum", value: schema.minimum - 1 });
  if (typeof schema.maximum === "number")
    out.push({ label: "above the declared maximum", value: schema.maximum + 1 });
  if (typeof schema.minLength === "number" && schema.minLength > 0)
    out.push({ label: "shorter than the declared minimum", value: "" });
  if (typeof schema.minItems === "number")
    out.push({ label: "shorter than the declared minItems", value: [] });
  if (typeof schema.maxItems === "number") {
    out.push({
      label: "longer than the declared maxItems",
      value: Array.from({ length: schema.maxItems + 1 }, () =>
        schema.items?.type === "object" ? { hash: MD5, algorithm: "MD5" } : `stashdb:${U.perfOk}`,
      ),
    });
  }
  if (Array.isArray(schema.enum))
    out.push({ label: "outside the declared enum", value: "not-a-member" });
  if (schema.type === "array" && Array.isArray(schema.items?.enum)) {
    out.push({
      label: "a list holding a value outside the declared enum",
      value: ["not-a-member"],
    });
  }
  if (typeof schema.pattern === "string")
    out.push({ label: "outside the declared pattern", value: "not-matching-at-all" });
  // An argument whose own description says it takes an identifier is bounded by
  // what an identifier is, which the declaration cannot express as a type.
  const describes = `${schema.description ?? ""} ${schema.items?.description ?? ""}`;
  if (/identifier/i.test(describes)) {
    const shaped = (value: string) => (schema.type === "array" ? [value] : value);
    out.push({ label: "a string that is no identifier", value: shaped("not-an-identifier") });
    out.push({
      label: "a catalogue this server does not read",
      value: shaped(`nosuchcatalogue:${U.perfOk}`),
    });
    out.push({ label: "a catalogue named with no uuid", value: shaped("stashdb:not-a-uuid") });
  }
  return out;
}

describe("every refusal names the argument and carries one of the six codes", () => {
  const probes: { tool: string; name: string; label: string; args: unknown }[] = [];
  for (const tool of Object.keys(REGISTRARS)) {
    for (const argument of argumentsOf(tool)) {
      for (const bad of badValues(argument.schema)) {
        probes.push({
          tool,
          name: argument.name,
          label: `${tool}.${argument.name} given ${bad.label}`,
          args: { ...VALID_ARGS[tool], [argument.name]: bad.value },
        });
      }
    }
  }

  /**
   * A question the declaration accepts and the server still cannot ask.
   *
   * Every probe above is refused where the arguments are declared, which is the
   * right place for them. The rule below is about the other kind of refusal,
   * the sentence the server writes once a request is being built, so at least
   * one probe has to reach it or the rule goes unmeasured.
   */
  for (const [tool, argument, value] of [
    ["get_scene", "id", "javstash:94ef9c17-82c6-48b0-8dcc-063b69231960"],
    ["get_performer", "id", "javstash:94ef9c17-82c6-48b0-8dcc-063b69231960"],
  ] as const) {
    probes.push({
      tool,
      name: argument,
      label: `${tool}.${argument} naming a catalogue no key is held for`,
      args: { ...VALID_ARGS[tool], [argument]: value },
    });
  }

  it("submits every argument of every tool, past every bound its declaration names", () => {
    expect(probes.length, "no argument was probed, so this rule is not measured").toBeGreaterThan(
      60,
    );
  });

  it("refuses every one of them, naming the argument refused", async () => {
    const silent: string[] = [];
    for (const probe of probes) {
      const answer = await call(TOOLS[probe.tool]!, probe.args, probe.label);
      if (!answer.refused) {
        silent.push(`${probe.label}: accepted`);
        continue;
      }
      // The argument must be named as itself: 'id' inside 'identifier' names nothing.
      if (!new RegExp(`(^|[^A-Za-z_])${probe.name}([^A-Za-z_]|$)`).test(answer.text)) {
        silent.push(
          `${probe.label}: refused without naming ${probe.name} — "${answer.text.split("\n")[0]}"`,
        );
      }
    }
    expect(
      silent,
      "an argument outside its own declared bounds was accepted, or refused without being named",
    ).toEqual([]);
  }, 240_000);

  it("never writes an engine's words, a path on a disk, or a key into a refusal", async () => {
    const leaked: string[] = [];
    for (const probe of probes) {
      const answer = await call(TOOLS[probe.tool]!, probe.args, probe.label);
      if (!answer.refused) continue;
      if (ENGINE_WORDS.test(answer.text))
        leaked.push(`${probe.label}: an engine's words — "${answer.text.split("\n")[0]}"`);
      if (FILE_PATHS.test(answer.text))
        leaked.push(`${probe.label}: a path on a disk — "${answer.text.split("\n")[0]}"`);
      if (answer.text.includes("test-key")) leaked.push(`${probe.label}: a key`);
    }
    expect(leaked, "a refusal carried something no reader should ever be shown").toEqual([]);
  }, 240_000);

  it("opens every refusal the server itself writes with one of the six codes", async () => {
    // A refusal the declaration produces is written by the schema layer and
    // carries the path of the issue. A refusal the tool writes is the server's
    // own sentence, and that is the one owing a code.
    const codeless: string[] = [];
    let measured = 0;
    for (const probe of probes) {
      const tool = TOOLS[probe.tool]!;
      if (!tool.inputSchema.safeParse(probe.args).success) continue;
      const answer = await call(tool, probe.args, probe.label);
      if (!answer.refused) continue;
      measured += 1;
      if (!ERROR_CODES.some((code) => answer.text.includes(code))) {
        codeless.push(`${probe.label}: "${answer.text.split("\n")[0]}"`);
      }
    }
    expect(measured, "no probe reached the handler, so this rule is not measured").toBeGreaterThan(
      0,
    );
    expect(codeless, "a refusal this server wrote carried none of the six codes").toEqual([]);
  }, 240_000);
});

/* ------------------ 8. a catalogue that could not be read is never an emptiness */

/** Payloads that are not the declared shape, in every way a payload can fail to be one. */
const UNREADABLE: { label: string; payload: unknown }[] = [
  { label: "a string", payload: "an answer" },
  { label: "null", payload: null },
  { label: "an array", payload: [1, 2, 3] },
  { label: "a number", payload: 42 },
  { label: "a key naming another query", payload: { findTag: { id: U.tag, name: "x" } } },
  {
    label: "a group that is not a group",
    payload: { findScenesBySceneFingerprints: [{ id: U.sceneOk }] },
  },
  {
    label: "a search whose rows are not rows",
    payload: {
      searchScenes: { count: 0, scenes: "none" },
      queryScenes: { count: 0, scenes: "none" },
      searchPerformers: { count: 0, performers: "none" },
      queryPerformers: { count: 0, performers: "none" },
    },
  },
  { label: "a record that is not a record", payload: { findScene: "gone", findPerformer: "gone" } },
];

describe("a catalogue that could not be read is never an emptiness", () => {
  for (const shape of UNREADABLE) {
    it(`reports ${shape.label} as a catalogue that failed, on every tool`, async () => {
      const transport: Transport = { request: async <T>(): Promise<T> => shape.payload as T };
      const wrong: string[] = [];
      for (const [tool, register] of Object.entries(REGISTRARS)) {
        const answer = await call(
          toolWith(register, transport, { stashdb: "test-key" }),
          VALID_ARGS[tool],
          `${tool} on ${shape.label}`,
        );
        const per = (answer.structured as { per_source?: Record<string, unknown>[] } | undefined)
          ?.per_source;
        if (per !== undefined) {
          const report = per.find((row) => row.source === "stashdb");
          if (report === undefined) {
            wrong.push(`${tool}: no report for the catalogue that was asked`);
            continue;
          }
          if (report.state !== "failed") {
            wrong.push(
              `${tool}: per_source[stashdb].state = ${JSON.stringify(report.state)} where the answer could not be read`,
            );
          }
          if (!ERROR_CODES.includes(report.error as never)) {
            wrong.push(
              `${tool}: per_source[stashdb].error = ${JSON.stringify(report.error)}, which is none of the six codes`,
            );
          }
          if (typeof report.count === "number") {
            wrong.push(
              `${tool}: per_source[stashdb].count = ${report.count} on a catalogue that failed`,
            );
          }
          continue;
        }
        // A tool reading one record has no per-catalogue line, so the refusal
        // itself must carry the code and must not read as an absence.
        if (!answer.refused) {
          wrong.push(
            `${tool}: answered rather than refused where the catalogue's answer could not be read`,
          );
          continue;
        }
        if (!ERROR_CODES.some((code) => answer.text.includes(code))) {
          wrong.push(
            `${tool}: refused with none of the six codes — "${answer.text.split("\n")[0]}"`,
          );
        }
      }
      expect(
        wrong,
        `an answer shaped as ${shape.label} was read as something other than a catalogue that failed`,
      ).toEqual([]);
    }, 60_000);
  }
});

/* --------------------------------------- 9. a marker names the record that continues it */

describe("a record its catalogue folded is never published as one it withdrew", () => {
  it("carries the successor at every site that publishes a folded record", () => {
    // Only the kinds of record a catalogue folds into a successor. Introspecting
    // both catalogues' published schemas shows 'Performer' carries
    // 'merged_into_id' and 'Scene' does not, so a scene, a studio and a tag are
    // held or withdrawn and there is no successor for them to name. A record
    // answered for with one and printed as withdrawn outright would state the
    // catalogue lost it, which it did not.
    const folded = new Set([U.perfMerged]);
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const { path, object } of objects(answer.structured, answer.tool)) {
        const id = object.id;
        if (typeof id !== "string") continue;
        const uuid = id.split(":")[1];
        if (uuid === undefined || !folded.has(uuid)) continue;
        if (object.status === "deleted") {
          wrong.push(
            `${at(answer)}: ${path} names a record the catalogue folded and publishes it as withdrawn outright`,
          );
        }
      }
      const structured = answer.structured as Record<string, unknown>;
      if (typeof structured.id === "string" && folded.has(structured.id.split(":")[1] ?? "")) {
        if (structured.status === "deleted") {
          wrong.push(
            `${at(answer)}: the record asked for was folded and comes back withdrawn outright`,
          );
        }
        if (structured.merged_into === null || structured.merged_into === undefined) {
          wrong.push(`${at(answer)}: the record asked for was folded and names no successor`);
        }
      }
    }
    expect(
      [...new Set(wrong)],
      "a record its catalogue folded into a successor was published as one it withdrew",
    ).toEqual([]);
  });

  it("names a successor on every record it publishes as merged", () => {
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const { path, object } of objects(answer.structured, answer.tool)) {
        if (object.status !== "merged") continue;
        if (!("merged_into" in object)) continue;
        if (typeof object.merged_into !== "string" || !NAMESPACED.test(object.merged_into)) {
          wrong.push(
            `${at(answer)}: ${path}.merged_into = ${JSON.stringify(object.merged_into)} on a record published as merged`,
          );
        }
      }
    }
    expect(
      wrong,
      "a record published as merged names no successor a caller could read next",
    ).toEqual([]);
  });
});

/* ----------------------------------- 10. a date keeps the precision it was entered with */

describe("a date keeps the precision it was entered with, at every site", () => {
  it("publishes no value wider or narrower than the precision beside it", () => {
    const shapes: Record<string, RegExp> = {
      day: /^\d{4}-\d{2}-\d{2}$/,
      month: /^\d{4}-\d{2}$/,
      year: /^\d{4}$/,
    };
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const { path, object } of objects(answer.structured, answer.tool)) {
        if (typeof object.precision !== "string" || typeof object.value !== "string") continue;
        const shape = shapes[object.precision];
        if (shape === undefined) {
          wrong.push(
            `${at(answer)}: ${path}.precision = ${JSON.stringify(object.precision)}, which is none of day, month, year`,
          );
          continue;
        }
        if (!shape.test(object.value)) {
          wrong.push(
            `${at(answer)}: ${path} = ${JSON.stringify(object.value)} at precision ${object.precision}`,
          );
        }
      }
    }
    expect(wrong, "a date was published at a precision its own value does not carry").toEqual([]);
  });
});

/* ---------------------- 11. a contest nobody counted is never an agreement */

describe("a contest nobody counted is never an agreement", () => {
  it("publishes no verdict on a fingerprint whose reports were never counted", () => {
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const { path, object } of objects(answer.structured, answer.tool)) {
        if (!("contested" in object) || !("reports" in object)) continue;
        if (object.reports === null && object.contested !== null) {
          wrong.push(
            `${at(answer)}: ${path}.contested = ${JSON.stringify(object.contested)} where reports were never counted`,
          );
        }
      }
    }
    expect(
      wrong,
      "a fingerprint whose disputes nobody counted was published as one nobody disputes",
    ).toEqual([]);
  });
});

/* ------------------------------------------- 12. every answer says when it was read */

describe("every record says when it came off the catalogue", () => {
  it("stamps every retrieved_at with the moment the answer was built", () => {
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const node of walk(answer.structured, answer.tool)) {
        if (node.key !== "retrieved_at") continue;
        if (node.value !== EPOCH_ISO) {
          wrong.push(`${at(answer)}: ${node.path} = ${JSON.stringify(node.value)}`);
        }
      }
    }
    expect(
      wrong,
      "a record was stamped with a moment other than the one the clock was pinned to",
    ).toEqual([]);
  });
});

/* ---------------------------------- 13. every address points at the catalogue named */

describe("every address a record carries points at the catalogue that answered", () => {
  it("builds no source_url on a catalogue other than the one the identifier names", () => {
    const bases = Object.fromEntries(
      INSTANCES.map((instance) => [
        String((instance as { id: string }).id),
        String((instance as { webBase: string }).webBase),
      ]),
    );
    const wrong: string[] = [];
    for (const answer of answered()) {
      for (const { path, object } of objects(answer.structured, answer.tool)) {
        const url = object.source_url;
        const id = object.id;
        if (typeof url !== "string" || typeof id !== "string") continue;
        const source = id.split(":")[0] ?? "";
        const base = bases[source];
        if (base === undefined) {
          wrong.push(
            `${at(answer)}: ${path}.id names ${JSON.stringify(source)}, which is no catalogue this server reads`,
          );
          continue;
        }
        if (!url.startsWith(base)) {
          wrong.push(
            `${at(answer)}: ${path}.source_url = ${url} while its identifier names ${source} at ${base}`,
          );
        }
      }
    }
    expect(
      wrong,
      "a record's address points at a catalogue other than the one its identifier names",
    ).toEqual([]);
  });
});
