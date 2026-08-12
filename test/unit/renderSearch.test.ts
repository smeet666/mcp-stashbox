import { describe, it, expect } from "vitest";
import { renderSceneRows as renderSceneRowsOrdered } from "../../src/tools/searchScenes.js";
import { renderPerformerRows as renderPerformerRowsOrdered } from "../../src/tools/searchPerformers.js";
import { instanceById, type InstanceId } from "../../src/stashbox/instances.js";
import type { PerformerRecord, RowsResult, SceneRecord, SourceReport } from "../../src/types.js";

/** The ordering the client hands a renderer once every catalogue has answered. */
const ORDERING =
  "interleaved by catalogue, in the order the catalogues were asked; no score is shared across them";

type Unordered<T> = Omit<RowsResult<T>, "ordering">;

/** The page and the page size a client honoured, as the renderer receives them. */
interface Window {
  page: number;
  limit: number;
}

/** What the caller typed, as the renderer receives it beside the rows. */
interface SceneAsked {
  identifiersGiven: boolean;
  match: "all" | "any";
  sorted?: boolean;
  bounded?: boolean;
  cached?: boolean;
}

interface PerformerAsked {
  sorted?: boolean;
  cached?: boolean;
}

function renderSceneRows(
  result: Unordered<SceneRecord>,
  query: string | null,
  window?: Window,
  asked?: SceneAsked,
) {
  return renderSceneRowsOrdered({ ...result, ordering: ORDERING }, query, window, asked);
}

function renderPerformerRows(
  result: Unordered<PerformerRecord>,
  query: string | null,
  window?: Window,
  asked?: PerformerAsked,
) {
  return renderPerformerRowsOrdered({ ...result, ordering: ORDERING }, query, window, asked);
}

/** Identifiers in the two shapes the catalogue mints. */
const UUIDS = [
  "94ef9c17-82c6-48b0-8dcc-063b69231960",
  "019fec3f-1bb1-7383-8782-ea0e678f6de0",
  "3f2a1c88-0d47-4e19-9a55-71b0c2d4e6f8",
  "018b7d55-6c2a-7f31-b904-5ad3e1c9f072",
];

function uuid(index: number): string {
  const value = UUIDS[index % UUIDS.length];
  if (value === undefined) throw new Error("no uuid at that index");
  return value;
}

/** The name an instance calls itself, as the registry holds it. */
function instanceName(source: InstanceId): string {
  const spec = instanceById(source);
  if (spec === undefined) throw new Error(`no instance declares ${source}`);
  return spec.name;
}

function scene(source: InstanceId, index: number, title: string, studioName: string): SceneRecord {
  const id = uuid(index);
  return {
    id: `${source}:${id}`,
    source,
    sourceUrl: `https://catalogue.invalid/${source}/scenes/${id}`,
    // Pinned, so no test reads a clock.
    retrievedAt: "2026-08-11T00:00:00.000Z",
    status: "established",
    pendingEdits: 0,
    mergedInto: null,
    title,
    details: null,
    code: null,
    director: null,
    durationSeconds: 1500,
    releaseDate: { value: "2019-04-12", precision: "day" },
    productionDate: null,
    studio: { id: `${source}:${id}`, name: studioName, parent: null, status: "established" },
    performers: [
      {
        id: `${source}:${id}`,
        name: "Nadia Verlaine",
        creditedAs: null,
        disambiguation: null,
        status: "established",
      },
    ],
    tags: [],
    urls: [],
    created: "2019-05-01T00:00:00Z",
    updated: "2020-01-02T00:00:00Z",
  };
}

function performer(
  source: InstanceId,
  index: number,
  name: string,
  sceneCount: number | null,
): PerformerRecord {
  const id = uuid(index);
  return {
    id: `${source}:${id}`,
    source,
    sourceUrl: `https://catalogue.invalid/${source}/performers/${id}`,
    // Pinned, so no test reads a clock.
    retrievedAt: "2026-08-11T00:00:00.000Z",
    status: "established",
    pendingEdits: 0,
    mergedInto: null,
    mergedIds: [],
    name,
    disambiguation: null,
    aliases: [],
    gender: null,
    country: null,
    birthDate: null,
    deathDate: null,
    careerStartYear: null,
    careerEndYear: null,
    sceneCount,
    urls: [],
    created: null,
    updated: null,
  };
}

interface AnsweredExtras {
  reason?: string;
  narrowingsNotReceived?: string[];
  fieldsSearched?: string[];
  indexTotal?: number;
}

function answered(source: InstanceId, count: number, extras: AnsweredExtras = {}): SourceReport {
  const report: SourceReport = { source, name: instanceName(source), state: "answered", count };
  if (extras.reason !== undefined) report.reason = extras.reason;
  if (extras.indexTotal !== undefined) report.indexTotal = extras.indexTotal;
  if (extras.narrowingsNotReceived !== undefined) {
    report.narrowingsNotReceived = extras.narrowingsNotReceived;
  }
  if (extras.fieldsSearched !== undefined) report.fieldsSearched = extras.fieldsSearched;
  return report;
}

function failed(source: InstanceId, moment: string, reason: string): SourceReport {
  return { source, name: instanceName(source), state: "failed", reason, moment, error: "timeout" };
}

function absent(source: InstanceId, reason: string): SourceReport {
  return { source, name: instanceName(source), state: "absent", reason };
}

function sceneResult(rows: SceneRecord[], perSource: SourceReport[]): Unordered<SceneRecord> {
  return { rows, perSource };
}

function performerResult(
  rows: PerformerRecord[],
  perSource: SourceReport[],
): Unordered<PerformerRecord> {
  return { rows, perSource };
}

/**
 * The lines of a rendered block carrying a given string. An instance id also
 * matches the lines naming that instance as it calls itself, so an assertion
 * holds whichever of the two the prose uses. Throws when no line matches.
 */
function linesWith(text: string, needle: string): string[] {
  const spec = instanceById(needle);
  const forms = spec === undefined ? [needle] : [needle, spec.name];
  const lines = text.split("\n").filter((line) => forms.some((form) => line.includes(form)));
  if (lines.length === 0) throw new Error(`no line carries "${needle}"`);
  return lines;
}

/** Whether some line carrying `needle` also satisfies `pattern`. */
function someLine(text: string, needle: string, pattern: RegExp): boolean {
  return linesWith(text, needle).some((line) => pattern.test(line));
}

/** Whether no line carrying `needle` satisfies `pattern`. */
function noLine(text: string, needle: string, pattern: RegExp): boolean {
  return linesWith(text, needle).every((line) => !pattern.test(line));
}

const FAILURE = /fail/i;
const NEVER_ASKED = /absent|not asked|never asked/i;

describe("renderSceneRows order", () => {
  it("keeps the rows in the order they arrive", () => {
    const rows = [
      scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
      scene("fansdb", 1, "Lantern Street, Part One", "Verdigris Pictures"),
      scene("stashdb", 2, "The Midnight Garden Sessions II", "Blue Harbour Media"),
      scene("fansdb", 3, "Lantern Street, Part Two", "Verdigris Pictures"),
    ];
    const { text } = renderSceneRows(
      sceneResult(rows, [answered("stashdb", 2), answered("fansdb", 2)]),
      "lantern",
    );
    const positions = rows.map((row) => text.indexOf(row.title ?? ""));
    for (const position of positions) {
      expect(position).toBeGreaterThan(-1);
    }
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("names the instance each row came from", () => {
    const rows = [
      scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
      scene("fansdb", 1, "Lantern Street, Part One", "Verdigris Pictures"),
    ];
    const { text } = renderSceneRows(
      sceneResult(rows, [answered("stashdb", 1), answered("fansdb", 1)]),
      null,
    );
    for (const row of rows) {
      expect(text).toContain(row.id);
      expect(text).toContain(row.source);
    }
  });

  it("states how the order was built", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [
          scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
          scene("fansdb", 1, "Lantern Street, Part One", "Verdigris Pictures"),
        ],
        [answered("stashdb", 1), answered("fansdb", 1)],
      ),
      "lantern",
    );
    expect(text).toContain(ORDERING);
  });

  it("presents the rows as ranked by nothing", () => {
    // The instances share no score, so an order presented as relevance would
    // rank rows on a measurement none of them computed.
    const { text } = renderSceneRows(
      sceneResult(
        [
          scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
          scene("fansdb", 1, "Lantern Street, Part One", "Verdigris Pictures"),
        ],
        [answered("stashdb", 1), answered("fansdb", 1)],
      ),
      "lantern",
    );
    expect(text).toContain(ORDERING);
    expect(text).not.toMatch(/best match|most relevant|ranked by|top result/i);
  });

  it("carries a link back for every row", () => {
    const rows = [
      scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
      scene("pmv", 1, "Lantern Street, Part One", "Verdigris Pictures"),
    ];
    const { text } = renderSceneRows(
      sceneResult(rows, [answered("stashdb", 1), answered("pmv", 1)]),
      null,
    );
    for (const row of rows) {
      expect(text).toContain(row.sourceUrl);
    }
  });

  it("prints no placeholder for a field the record does not carry", () => {
    // A director the catalogue holds none of is left out of the prose rather
    // than printed as the word a language leaves behind.
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [answered("stashdb", 1)],
      ),
      null,
    );
    expect(text).not.toMatch(/\bnull\b/i);
    expect(text).not.toMatch(/\bundefined\b/i);
  });
});

describe("renderSceneRows counts", () => {
  it("reports a count for each source", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [answered("stashdb", 12), answered("fansdb", 30)],
      ),
      "midnight",
    );
    expect(someLine(text, "stashdb", /\b12\b/)).toBe(true);
    expect(someLine(text, "fansdb", /\b30\b/)).toBe(true);
  });

  it("adds no count across instances", () => {
    // The instances index overlapping corpora, and one scene present on two of
    // them holds two identifiers there, so a sum would count it twice.
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [answered("stashdb", 12), answered("fansdb", 30)],
      ),
      "midnight",
    );
    expect(text).not.toMatch(/\b42\b/);
  });

  it("keeps the per-source report in the structured payload", () => {
    const perSource = [answered("stashdb", 12), failed("tpdb", "search", "the request timed out")];
    const { structured } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        perSource,
      ),
      "midnight",
    );
    const payload = structured as { per_source?: SourceReport[] };
    expect(payload.per_source).toEqual(perSource);
  });
});

describe("renderSceneRows sources that did not answer", () => {
  it("names a failed instance as failed, with the moment that failed", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [
          answered("stashdb", 1),
          failed("tpdb", "search", "the request timed out after 20 seconds"),
        ],
      ),
      "midnight",
    );
    expect(someLine(text, "tpdb", FAILURE)).toBe(true);
    expect(someLine(text, "tpdb", /search/)).toBe(true);
    expect(text).toContain("the request timed out after 20 seconds");
  });

  it("names a record that could not be read as a failure at that moment", () => {
    // A search that did not answer and a row that could not be read are two
    // different failures, and which one happened tells a caller what to do.
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [
          answered("stashdb", 1),
          failed("pmv", "record", "a row came back in a shape this client cannot read"),
        ],
      ),
      "midnight",
    );
    expect(someLine(text, "pmv", FAILURE)).toBe(true);
    expect(someLine(text, "pmv", /record/)).toBe(true);
  });

  it("returns the rows the other instances found when one fails", () => {
    // An instance that fell over says nothing about the rows the others hold,
    // and withholding them would lose an answer that exists.
    const { text } = renderSceneRows(
      sceneResult(
        [
          scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
          scene("fansdb", 1, "Lantern Street, Part One", "Verdigris Pictures"),
        ],
        [
          answered("stashdb", 1),
          answered("fansdb", 1),
          failed("tpdb", "search", "the request timed out"),
        ],
      ),
      "midnight",
    );
    expect(text).toContain("The Midnight Garden Sessions");
    expect(text).toContain("Lantern Street, Part One");
  });

  it("names an instance holding no key as absent, with the reason", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [answered("stashdb", 1), absent("javstash", "no key configured in STASHBOX_JAVSTASH_KEY")],
      ),
      "midnight",
    );
    expect(someLine(text, "javstash", NEVER_ASKED)).toBe(true);
    expect(text).toContain("no key configured in STASHBOX_JAVSTASH_KEY");
  });

  it("names an instance the caller excluded as absent, with the reason", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [answered("stashdb", 1), absent("pmv", "excluded by the sources argument")],
      ),
      "midnight",
    );
    expect(someLine(text, "pmv", NEVER_ASKED)).toBe(true);
    expect(text).toContain("excluded by the sources argument");
  });

  it("reports a narrowing an instance did not receive", () => {
    // What an instance was asked and what the answer says it was asked are the
    // same thing, so a text search one instance does not offer is stated.
    const { text } = renderSceneRows(
      sceneResult(
        [
          scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
          scene("tpdb", 1, "Lantern Street, Part One", "Verdigris Pictures"),
        ],
        [
          answered("stashdb", 12, { fieldsSearched: ["title", "details"] }),
          answered("tpdb", 4, {
            narrowingsNotReceived: ["query"],
            reason: "this instance offers no plural text search",
          }),
        ],
      ),
      "midnight garden",
    );
    expect(someLine(text, "tpdb", /query/)).toBe(true);
    // The report explains in its own words why the narrowing stayed behind, and
    // a client rendering only the text keeps that explanation.
    expect(text).toContain("this instance offers no plural text search");
  });

  it("says which fields each instance read", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [
          answered("stashdb", 12, { fieldsSearched: ["title", "details"] }),
          answered("fansdb", 2, { fieldsSearched: ["title"] }),
        ],
      ),
      "midnight garden",
    );
    expect(someLine(text, "stashdb", /title/)).toBe(true);
    expect(someLine(text, "stashdb", /details/)).toBe(true);
    expect(someLine(text, "fansdb", /title/)).toBe(true);
  });

  it("tells an empty answer apart from a failure and from an absence", () => {
    // Three different things: an instance that answered nothing, one that could
    // not answer, and one that was never asked.
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [
          answered("stashdb", 1),
          answered("fansdb", 0),
          failed("tpdb", "search", "the request timed out"),
          absent("javstash", "no key configured"),
        ],
      ),
      "midnight",
    );
    expect(someLine(text, "fansdb", /\b0\b/)).toBe(true);
    expect(noLine(text, "fansdb", FAILURE)).toBe(true);
    expect(noLine(text, "fansdb", NEVER_ASKED)).toBe(true);
    expect(someLine(text, "tpdb", FAILURE)).toBe(true);
    expect(noLine(text, "tpdb", NEVER_ASKED)).toBe(true);
    expect(someLine(text, "javstash", NEVER_ASKED)).toBe(true);
    expect(noLine(text, "javstash", FAILURE)).toBe(true);
  });

  it("states the failure when no instance found a row", () => {
    // An answer with no rows and a failed instance is no evidence that the
    // scene is uncatalogued.
    const { text } = renderSceneRows(
      sceneResult(
        [],
        [answered("stashdb", 0), failed("fansdb", "search", "the connection dropped")],
      ),
      "a title nobody catalogued",
    );
    expect(someLine(text, "fansdb", FAILURE)).toBe(true);
    expect(text).toContain("the connection dropped");
  });
});

describe("renderSceneRows notes", () => {
  it("carries every note into the text block", () => {
    // A client rendering only the text must not lose what qualifies the answer.
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [
          answered("stashdb", 12),
          answered("fansdb", 4),
          failed("tpdb", "search", "the request timed out"),
          absent("javstash", "no key configured"),
        ],
      ),
      "midnight",
    );
    expect(text).toMatch(/^\s*Note:/m);
    expect(text).toContain(ORDERING);
    // The warning against adding counts belongs to an answer holding more than
    // one to add, which is why two catalogues answer in this fixture.
    expect(text).toMatch(/never (added|summed)|not added/i);
    expect(someLine(text, "tpdb", FAILURE)).toBe(true);
    expect(someLine(text, "javstash", NEVER_ASKED)).toBe(true);
  });
});

describe("renderPerformerRows", () => {
  it("keeps the rows in the order they arrive and names each instance", () => {
    const rows = [
      performer("stashdb", 0, "Nadia Verlaine", 34),
      performer("fansdb", 1, "Nadia Corbeau", 8),
      performer("stashdb", 2, "Petra Verlaine", 3),
    ];
    const { text } = renderPerformerRows(
      performerResult(rows, [answered("stashdb", 158), answered("fansdb", 21)]),
      "Nadia Verlaine",
    );
    const positions = rows.map((row) => text.indexOf(row.name ?? ""));
    for (const position of positions) {
      expect(position).toBeGreaterThan(-1);
    }
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const row of rows) {
      expect(text).toContain(row.source);
    }
  });

  it("states how the order was built", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34), performer("fansdb", 1, "Nadia Corbeau", 8)],
        [answered("stashdb", 158), answered("fansdb", 21)],
      ),
      "Nadia Verlaine",
    );
    expect(text).toContain(ORDERING);
  });

  it("presents the rows as ranked by nothing", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34), performer("fansdb", 1, "Nadia Corbeau", 8)],
        [answered("stashdb", 158), answered("fansdb", 21)],
      ),
      "Nadia Verlaine",
    );
    expect(text).toContain(ORDERING);
    expect(text).not.toMatch(/best match|most relevant|ranked by|top result/i);
  });

  it("names a count for what it counts on that instance", () => {
    // A search for a two-word name reports how many records the index touched,
    // and the rows under the first share one word of the name asked. Calling
    // that a number of people by that name states something nobody measured.
    const { text } = renderPerformerRows(
      performerResult(
        [
          performer("stashdb", 0, "Nadia Verlaine", 34),
          performer("stashdb", 1, "Nadia Corbeau", 8),
          performer("stashdb", 2, "Petra Verlaine", 3),
        ],
        [answered("stashdb", 158)],
      ),
      "Nadia Verlaine",
    );
    expect(text).toContain("158");
    expect(text).toMatch(/index/i);
    expect(text).not.toMatch(/158\s+\w*\s*(matches|results|performers|people)\s+for/i);
    expect(text).not.toMatch(/158\s+(matches|results)\b/i);
    expect(text).not.toMatch(/158[^\n]*named/i);
  });

  it("adds no count across instances", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34)],
        [answered("stashdb", 158), answered("fansdb", 21)],
      ),
      "Nadia Verlaine",
    );
    expect(someLine(text, "stashdb", /\b158\b/)).toBe(true);
    expect(someLine(text, "fansdb", /\b21\b/)).toBe(true);
    expect(text).not.toMatch(/\b179\b/);
  });

  it("reads a scene count as coverage on the instance that reports it", () => {
    // A settled record can hold no scenes at all on one instance, so a count of
    // zero belongs to that index rather than to a career.
    const { text } = renderPerformerRows(
      performerResult([performer("stashdb", 0, "Nadia Verlaine", 0)], [answered("stashdb", 1)]),
      "Nadia Verlaine",
    );
    expect(text).toContain("stashdb");
    expect(text).toMatch(/index|catalogue|instance/i);
    expect(text).not.toMatch(/never (appeared|performed)/i);
  });

  it("names a failed instance as failed, with the moment that failed", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34)],
        [
          answered("stashdb", 158),
          failed("fansdb", "search", "the request timed out after 20 seconds"),
        ],
      ),
      "Nadia Verlaine",
    );
    expect(someLine(text, "fansdb", FAILURE)).toBe(true);
    expect(someLine(text, "fansdb", /search/)).toBe(true);
    expect(text).toContain("Nadia Verlaine");
  });

  it("names a record that could not be read as a failure at that moment", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34)],
        [
          answered("stashdb", 158),
          failed("pmv", "record", "a row came back in a shape this client cannot read"),
        ],
      ),
      "Nadia Verlaine",
    );
    expect(someLine(text, "pmv", FAILURE)).toBe(true);
    expect(someLine(text, "pmv", /record/)).toBe(true);
  });

  it("names an instance holding no key as absent, with the reason", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34)],
        [
          answered("stashdb", 158),
          absent("javstash", "no key configured in STASHBOX_JAVSTASH_KEY"),
        ],
      ),
      "Nadia Verlaine",
    );
    expect(someLine(text, "javstash", NEVER_ASKED)).toBe(true);
    expect(text).toContain("no key configured in STASHBOX_JAVSTASH_KEY");
  });

  it("reports a narrowing an instance did not receive", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34), performer("tpdb", 1, "Nadia Corbeau", 8)],
        [
          answered("stashdb", 158, { fieldsSearched: ["name", "aliases"] }),
          answered("tpdb", 2, {
            narrowingsNotReceived: ["query"],
            reason: "this instance offers no plural text search",
          }),
        ],
      ),
      "Nadia Verlaine",
    );
    expect(someLine(text, "tpdb", /query/)).toBe(true);
    expect(someLine(text, "stashdb", /aliases/)).toBe(true);
    // The report explains in its own words why the narrowing stayed behind, and
    // a client rendering only the text keeps that explanation.
    expect(text).toContain("this instance offers no plural text search");
  });

  it("tells an empty answer apart from a failure and from an absence", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34)],
        [
          answered("stashdb", 158),
          answered("fansdb", 0),
          failed("tpdb", "search", "the request timed out"),
          absent("javstash", "no key configured"),
        ],
      ),
      "Nadia Verlaine",
    );
    expect(someLine(text, "fansdb", /\b0\b/)).toBe(true);
    expect(noLine(text, "fansdb", FAILURE)).toBe(true);
    expect(noLine(text, "fansdb", NEVER_ASKED)).toBe(true);
    expect(someLine(text, "tpdb", FAILURE)).toBe(true);
    expect(someLine(text, "javstash", NEVER_ASKED)).toBe(true);
  });

  it("carries every note into the text block", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34)],
        [
          answered("stashdb", 158),
          answered("fansdb", 6),
          failed("tpdb", "search", "the request timed out"),
          absent("javstash", "no key configured"),
        ],
      ),
      "Nadia Verlaine",
    );
    expect(text).toMatch(/^\s*Note:/m);
    expect(text).toContain(ORDERING);
    // The warning against adding counts belongs to an answer holding more than
    // one to add, which is why two catalogues answer in this fixture.
    expect(text).toMatch(/never (added|summed)|not added/i);
    expect(someLine(text, "tpdb", FAILURE)).toBe(true);
    expect(someLine(text, "javstash", NEVER_ASKED)).toBe(true);
  });

  it("carries a link back for every row", () => {
    const rows = [
      performer("stashdb", 0, "Nadia Verlaine", 34),
      performer("fansdb", 1, "Nadia Corbeau", 8),
    ];
    const { text } = renderPerformerRows(
      performerResult(rows, [answered("stashdb", 158), answered("fansdb", 21)]),
      "Nadia Verlaine",
    );
    for (const row of rows) {
      expect(text).toContain(row.sourceUrl);
      expect(text).toContain(row.id);
    }
  });

  it("prints no placeholder for a field the record does not carry", () => {
    const { text } = renderPerformerRows(
      performerResult([performer("stashdb", 0, "Nadia Verlaine", null)], [answered("stashdb", 1)]),
      null,
    );
    expect(text).not.toMatch(/\bnull\b/i);
    expect(text).not.toMatch(/\bundefined\b/i);
  });
});

/* ------------------------------------------------------------------- notes */

/**
 * A note qualifies the answer that carries it. Each sentence below states
 * something about the rows, the counts or the window, so it belongs to an
 * answer where that thing happened and to no other. The wording is asserted on
 * a phrase carrying the claim rather than on a whole sentence, since a claim
 * survives a rewording and a rewording must not silently drop the claim.
 */
const IDENTIFIERS_CARRIED = /carries every identifier given/i;
const WHAT_A_COUNT_MEANS = /A count reports how many records/i;
const PAST_THE_END = /past everything these catalogues hold/i;
const SCENE_COUNT_CAUTION = /A scene count is what the catalogue naming it has indexed/i;
const INDEX_TOTAL = /the rows here included/i;

const WINDOW: Window = { page: 1, limit: 10 };
const FACETED: SceneAsked = { identifiersGiven: false, match: "all" };
const NARROWED_BY_IDS: SceneAsked = { identifiersGiven: true, match: "all" };

describe("renderSceneRows note about identifier narrowing", () => {
  it("makes no claim about the rows when no catalogue received the identifiers", () => {
    // Every answering catalogue reports the narrowing as one it could not take,
    // so a row here satisfying it does so by chance. A sentence saying the rows
    // carry the identifiers would state what nothing narrowed.
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [
          answered("stashdb", 1, {
            indexTotal: 5,
            narrowingsNotReceived: ["performer_ids"],
          }),
          answered("tpdb", 2, { indexTotal: 9, narrowingsNotReceived: ["performer_ids"] }),
        ],
      ),
      null,
      WINDOW,
      NARROWED_BY_IDS,
    );

    expect(text).not.toMatch(IDENTIFIERS_CARRIED);
  });

  it("makes the claim when a catalogue received the identifiers and returned rows", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [
          answered("stashdb", 1, { indexTotal: 5 }),
          answered("tpdb", 2, { indexTotal: 9, narrowingsNotReceived: ["performer_ids"] }),
        ],
      ),
      null,
      WINDOW,
      NARROWED_BY_IDS,
    );

    expect(text).toMatch(IDENTIFIERS_CARRIED);
  });
});

describe("renderSceneRows note about what a count means", () => {
  it("says nothing about a count when no catalogue answered", () => {
    // One catalogue fell over and the other was never asked, so this answer
    // carries no count at all and a sentence explaining one explains nothing.
    const { text } = renderSceneRows(
      sceneResult(
        [],
        [
          failed("stashdb", "search", "the request timed out"),
          absent("tpdb", "no key configured in STASHBOX_TPDB_KEY"),
        ],
      ),
      "midnight garden",
      WINDOW,
      FACETED,
    );

    expect(text).not.toMatch(WHAT_A_COUNT_MEANS);
  });

  it("says what a count means on an answer that carries one", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [answered("stashdb", 12, { indexTotal: 12 })],
      ),
      "midnight garden",
      WINDOW,
      FACETED,
    );

    expect(text).toMatch(WHAT_A_COUNT_MEANS);
  });
});

describe("renderSceneRows note about a page past the end", () => {
  it("never says a page is past the end of a catalogue that took no page", () => {
    // The catalogue answered its first page whatever was asked, so its rows say
    // nothing about page 9. Reading its emptiness as the end of the rows would
    // measure a window it never opened.
    const { text } = renderSceneRows(
      sceneResult([], [answered("stashdb", 0, { indexTotal: 5, narrowingsNotReceived: ["page"] })]),
      "midnight garden",
      { page: 9, limit: 10 },
      FACETED,
    );

    expect(text).not.toMatch(PAST_THE_END);
  });

  it("never says a page is past the end of a catalogue that returned rows", () => {
    const { text } = renderSceneRows(
      sceneResult(
        [scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media")],
        [answered("stashdb", 1, { indexTotal: 5 })],
      ),
      "midnight garden",
      { page: 9, limit: 10 },
      FACETED,
    );

    expect(text).not.toMatch(PAST_THE_END);
  });

  it("says a page is past the end when the page was honoured and nothing came back", () => {
    const { text } = renderSceneRows(
      sceneResult([], [answered("stashdb", 0, { indexTotal: 5 })]),
      "midnight garden",
      { page: 9, limit: 10 },
      FACETED,
    );

    expect(text).toMatch(PAST_THE_END);
    expect(someLine(text, "stashdb", PAST_THE_END)).toBe(true);
  });
});

describe("renderSceneRows note about what an index holds", () => {
  it("counts the rows returned within the total rather than beyond them", () => {
    // The number is what the index holds for the question, and the rows on this
    // page are part of it. Calling it a remainder would subtract them twice.
    const { text } = renderSceneRows(
      sceneResult(
        [
          scene("stashdb", 0, "The Midnight Garden Sessions", "Blue Harbour Media"),
          scene("stashdb", 2, "The Midnight Garden Sessions II", "Blue Harbour Media"),
        ],
        [answered("stashdb", 2, { indexTotal: 40 })],
      ),
      "midnight garden",
      WINDOW,
      FACETED,
    );

    expect(text).toMatch(INDEX_TOTAL);
    expect(text).not.toMatch(/beyond the page returned/i);
    expect(text).not.toMatch(/\bbeyond\b/i);
  });

  it("omits the note when every answering catalogue holds nothing for the question", () => {
    const { text } = renderSceneRows(
      sceneResult([], [answered("stashdb", 0, { indexTotal: 0 })]),
      "a title nobody catalogued",
      WINDOW,
      FACETED,
    );

    expect(text).not.toMatch(INDEX_TOTAL);
  });
});

describe("renderPerformerRows note about a scene count", () => {
  it("cautions about a scene count on a row carrying one above zero", () => {
    // The caution belongs to the number rather than to its value: a count of 34
    // is coverage on that catalogue as surely as a count of none.
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 34)],
        [answered("stashdb", 158, { indexTotal: 158 })],
      ),
      "Nadia Verlaine",
      WINDOW,
      {},
    );

    expect(text).toMatch(SCENE_COUNT_CAUTION);
  });

  it("cautions about a scene count on a row carrying zero", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [performer("stashdb", 0, "Nadia Verlaine", 0)],
        [answered("stashdb", 158, { indexTotal: 158 })],
      ),
      "Nadia Verlaine",
      WINDOW,
      {},
    );

    expect(text).toMatch(SCENE_COUNT_CAUTION);
  });

  it("omits the caution when no row carries a scene count", () => {
    const { text } = renderPerformerRows(
      performerResult(
        [
          performer("stashdb", 0, "Nadia Verlaine", null),
          performer("fansdb", 1, "Nadia Corbeau", null),
        ],
        [answered("stashdb", 158, { indexTotal: 158 }), answered("fansdb", 21, { indexTotal: 21 })],
      ),
      "Nadia Verlaine",
      WINDOW,
      {},
    );

    expect(text).not.toMatch(SCENE_COUNT_CAUTION);
  });
});
