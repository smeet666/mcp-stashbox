/**
 * The qualifications an answer owes, held to the same condition wherever they
 * are owed.
 *
 * Every case here states one sentence and pins the two places it belongs. A
 * qualification written at one site and missed at its sibling is the defect
 * shape this suite exists to catch: nothing in it is wrong about what a
 * catalogue did, and a reader of the sibling still acts on a number nobody
 * qualified.
 *
 * Two further cases pin the other half of the same rule, a note whose condition
 * is wrong: one that fires where its case has passed states something the
 * answer does not carry as surely as one that never fires.
 */

import { describe, expect, it } from "vitest";

import { instructionsFor } from "../../src/server.js";
import { INSTANCES, instanceById, type InstanceId } from "../../src/stashbox/instances.js";
import { renderPerformer } from "../../src/tools/getPerformer.js";
import { renderScene } from "../../src/tools/getScene.js";
import { renderPerformerRows } from "../../src/tools/searchPerformers.js";
import { renderSceneRows } from "../../src/tools/searchScenes.js";
import { windowFor } from "../../src/answer/rows.js";
import type {
  PerformerRecord,
  RowsResult,
  SceneRecord,
  SourceReport,
  TagRow,
} from "../../src/types.js";

const ORDERING = "interleaved by catalogue, in the order the catalogues were asked";
const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const RETRIEVED_AT = "2026-08-11T00:00:00.000Z";

function nameOf(source: InstanceId): string {
  const spec = instanceById(source);
  if (spec === undefined) throw new Error(`no instance declares ${source}`);
  return spec.name;
}

function scene(source: InstanceId, over: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: `${source}:${UUID}`,
    source,
    sourceUrl: `https://catalogue.invalid/${source}/scenes/${UUID}`,
    retrievedAt: RETRIEVED_AT,
    status: "established",
    pendingEdits: 0,
    title: "A Quiet Afternoon",
    details: null,
    code: null,
    director: null,
    durationSeconds: null,
    releaseDate: { value: "2019-04-12", precision: "day" },
    productionDate: null,
    studio: null,
    performers: [],
    tags: [],
    urls: [],
    created: null,
    updated: null,
    ...over,
  };
}

function performer(source: InstanceId, over: Partial<PerformerRecord> = {}): PerformerRecord {
  return {
    id: `${source}:${UUID}`,
    source,
    sourceUrl: `https://catalogue.invalid/${source}/performers/${UUID}`,
    retrievedAt: RETRIEVED_AT,
    status: "established",
    pendingEdits: 0,
    mergedInto: null,
    mergedIds: [],
    name: "Nadia Verlaine",
    disambiguation: null,
    aliases: [],
    gender: null,
    country: null,
    birthDate: null,
    deathDate: null,
    careerStartYear: null,
    careerEndYear: null,
    sceneCount: null,
    urls: [],
    created: null,
    updated: null,
    ...over,
  };
}

function answered(
  source: InstanceId,
  count: number,
  over: Partial<SourceReport> = {},
): SourceReport {
  return { source, name: nameOf(source), state: "answered", count, ...over };
}

function sceneRows(
  rows: SceneRecord[],
  perSource: SourceReport[],
  window?: { page: number; limit: number },
  asked?: Parameters<typeof renderSceneRows>[3],
) {
  const result: RowsResult<SceneRecord> = { rows, perSource, ordering: ORDERING };
  return renderSceneRows(result, null, window, asked ?? { identifiersGiven: false, match: "all" });
}

function performerRows(
  rows: PerformerRecord[],
  perSource: SourceReport[],
  window?: { page: number; limit: number },
  asked?: Parameters<typeof renderPerformerRows>[3],
) {
  const result: RowsResult<PerformerRecord> = { rows, perSource, ordering: ORDERING };
  return renderPerformerRows(result, null, window, asked);
}

const TAGS: TagRow[] = [
  { id: `stashdb:${UUID}`, name: "outdoors", category: null, status: "established" },
];

/* ------------------------------------------------- a note whose case passed */

describe("a count of an index qualifies the page it is beside", () => {
  it("says nothing about a page under the reader's eyes where no row is on it", () => {
    const rendered = sceneRows([], [answered("stashdb", 0, { indexTotal: 4_312 })], {
      page: 9,
      limit: 25,
    });
    expect(rendered.text).not.toContain("this page is part of that number");
  });

  it("qualifies the number where the page carries a row", () => {
    const rendered = sceneRows(
      [scene("stashdb")],
      [answered("stashdb", 1, { indexTotal: 4_312 })],
      {
        page: 1,
        limit: 25,
      },
    );
    expect(rendered.text).toContain("this page is part of that number");
  });
});

describe("a window states a page a catalogue paged through", () => {
  it("is withheld where every catalogue that answered was never given the page", () => {
    const reports = [answered("stashdb", 3, { narrowingsOutsideThisRoute: ["page", "sort"] })];
    expect(windowFor(reports, 4, 25)).toBeUndefined();
  });

  it("is withheld where the catalogue cannot receive a page at all", () => {
    const reports = [answered("stashdb", 3, { narrowingsNotReceived: ["page"] })];
    expect(windowFor(reports, 4, 25)).toBeUndefined();
  });

  it("stands where a catalogue that answered received it", () => {
    expect(windowFor([answered("stashdb", 3)], 4, 25)).toEqual({ page: 4, limit: 25 });
  });

  it("is withheld where no catalogue answered at all", () => {
    const reports: SourceReport[] = [
      { source: "stashdb", name: nameOf("stashdb"), state: "failed", error: "timeout" },
    ];
    expect(windowFor(reports, 1, 25)).toBeUndefined();
  });
});

/* ------------------------------------- a qualification owed at two sites */

describe("why a tag carries no category", () => {
  const say = "publishes no taxonomy sorting the tags a record carries";

  it("is said where one record is read", () => {
    const rendered = renderScene(scene("tpdb", { tags: TAGS, source: "tpdb" }), ["basic"]);
    expect(rendered.text).toContain(say);
  });

  it("is said where the same tags come back on the rows of a search", () => {
    const row = scene("tpdb", { tags: TAGS, source: "tpdb" });
    const rendered = sceneRows([row], [answered("tpdb", 1)]);
    expect(rendered.text).toContain(say);
  });

  it("is withheld where the catalogue publishes the taxonomy and every tag carries one", () => {
    const row = scene("stashdb", {
      tags: [
        { id: `stashdb:${UUID}`, name: "outdoors", category: "Setting", status: "established" },
      ],
    });
    const rendered = sceneRows([row], [answered("stashdb", 1)]);
    expect(rendered.text).not.toContain(say);
  });

  it("names a tag left uncategorised where the catalogue does publish the taxonomy", () => {
    const rendered = sceneRows([scene("stashdb", { tags: TAGS })], [answered("stashdb", 1)]);
    expect(rendered.text).toContain("which is a category nobody recorded for it");
  });

  it("words the silence the same way whether a record or a row carries the tag", () => {
    const row = scene("tpdb", { tags: TAGS, source: "tpdb" });
    const said = renderScene(row, ["basic"])
      .text.split("\n")
      .filter((one) => one.includes(say));
    const rows = sceneRows([row], [answered("tpdb", 1)])
      .text.split("\n")
      .filter((one) => one.includes(say));
    expect(rows).toEqual(said);
  });
});

describe("why a link names no category of site", () => {
  const say = "publishes no table sorting the sites a record links to";
  const URLS = [{ url: "https://example.invalid/a", siteName: null, siteCategory: null }];

  it("is said where one record is read", () => {
    expect(renderScene(scene("tpdb", { urls: URLS, source: "tpdb" }), ["basic"]).text).toContain(
      say,
    );
  });

  it("is said where the same links come back on the rows of a search", () => {
    const row = scene("tpdb", { urls: URLS, source: "tpdb" });
    expect(sceneRows([row], [answered("tpdb", 1)]).text).toContain(say);
  });

  it("names a link left uncategorised where the catalogue does publish the table", () => {
    const rendered = sceneRows([scene("stashdb", { urls: URLS })], [answered("stashdb", 1)]);
    expect(rendered.text).toContain("which is a category nobody recorded for it");
  });
});

describe("what a count of scenes measures", () => {
  const say = "says nothing about a career";

  it("is said on the rows of a performer search", () => {
    const rendered = performerRows(
      [performer("stashdb", { sceneCount: 0 })],
      [answered("stashdb", 1)],
    );
    expect(rendered.text).toContain(say);
  });

  it("is said where the same record is read on its own", () => {
    const rendered = renderPerformer(performer("stashdb", { sceneCount: 0 }), ["basic"]);
    expect(rendered.text).toContain(say);
  });

  it("is withheld where the record carries no count", () => {
    const rendered = renderPerformer(performer("stashdb"), ["basic"]);
    expect(rendered.text).not.toContain(say);
  });
});

describe("the precision a date was entered at", () => {
  const say = "shown at the precision it was entered with";

  it("is said where one record is read", () => {
    const record = scene("stashdb", { releaseDate: { value: "2019", precision: "year" } });
    expect(renderScene(record, ["basic"]).text).toContain(say);
  });

  it("is said where the same date comes back on the rows of a search", () => {
    const row = scene("stashdb", { releaseDate: { value: "2019", precision: "year" } });
    const rendered = sceneRows([row], [answered("stashdb", 1)]);
    expect(rendered.text).toContain(say);
    expect(rendered.text).toContain("release date");
  });

  it("reaches a performer row read the same way", () => {
    const row = performer("stashdb", { birthDate: { value: "1988-03", precision: "month" } });
    const rendered = performerRows([row], [answered("stashdb", 1)]);
    expect(rendered.text).toContain(say);
    expect(rendered.text).toContain("birth date");
  });

  it("is withheld where every date on the rows names a day", () => {
    const rendered = sceneRows([scene("stashdb")], [answered("stashdb", 1)]);
    expect(rendered.text).not.toContain(say);
  });
});

/* ------------------------------------------ a block asked for and not carried */

describe("a block a search route does not carry", () => {
  it("is named rather than left as a key nobody published", () => {
    const rendered = performerRows(
      [performer("stashdb")],
      [answered("stashdb", 1, { sectionsNotCarried: ["scenes"] })],
    );
    expect(rendered.text).toContain("scenes");
    expect(rendered.text).toContain("was never asked for on this route");
  });
});

describe("a block published in the payload and printed nowhere", () => {
  it("is named, so a reader of the prose knows where the rest of it is", () => {
    const rendered = sceneRows([scene("stashdb")], [answered("stashdb", 1)], undefined, {
      identifiersGiven: false,
      match: "all",
      sections: ["basic", "images"],
    });
    expect(rendered.text).toContain("images");
    expect(rendered.text).toContain("carried in the payload of this answer and printed nowhere");
  });

  it("says nothing where the block a caller asked for is the one the rows print", () => {
    const rendered = sceneRows([scene("stashdb")], [answered("stashdb", 1)], undefined, {
      identifiersGiven: false,
      match: "all",
      sections: ["basic"],
    });
    expect(rendered.text).not.toContain("printed nowhere");
  });
});

/* --------------------------------------------------- a record named in passing */

describe("a folded record named inside an answer", () => {
  it("is marked whatever the length of the name it carries", () => {
    const record = scene("stashdb", {
      performers: [
        {
          id: `stashdb:${UUID}`,
          name: "JJ",
          creditedAs: null,
          disambiguation: null,
          status: "merged",
        },
      ],
    });
    const rendered = renderScene(record, ["basic"]);
    expect(rendered.text).toContain("Named inside this answer and folded on StashDB");
    expect(rendered.text).toContain("JJ");
  });
});

/* ----------------------------------------------- a counter naming what it counts */

describe("a number beside a list says which list it counts", () => {
  it("counts the fingerprints shown, since the ones lost are counted apart", () => {
    const record = scene("stashdb", {
      fingerprints: [
        {
          algorithm: "PHASH",
          hash: "841f346c96e743b3",
          durationSeconds: null,
          submissions: 2,
          reports: 0,
          contested: false,
        },
      ],
      fingerprintsSkipped: 3,
      fingerprintCount: { PHASH: 1 },
    });
    const payload = renderScene(record, ["basic", "fingerprints"]).structured;
    expect(payload.fingerprints_shown).toEqual({ PHASH: 1 });
    expect(payload).not.toHaveProperty("fingerprints_held");
  });

  it("counts the studio rows a catalogue answered with, which the whole list came back from", () => {
    const record = performer("stashdb", {
      studios: [{ id: `stashdb:${UUID}`, name: "Vixen", sceneCount: null, status: "established" }],
      studiosTotal: 2,
      studiosSkipped: 1,
    });
    const payload = renderPerformer(record, ["basic", "studios"]).structured;
    expect(payload.studios_answered_with).toBe(2);
    expect(payload).not.toHaveProperty("studios_total");
  });
});

/* ------------------------------------------------ what a caller is told upfront */

describe("the instructions name every limit measured of a catalogue", () => {
  it("names the fingerprint route that searches no perceptual hash", () => {
    const said = instructionsFor(INSTANCES.filter((spec) => spec.id === "tpdb"));
    expect(said).toContain("ThePornDB");
    expect(said).toContain("perceptual");
  });

  it("claims no limit of a catalogue that publishes every one of them", () => {
    const said = instructionsFor(INSTANCES.filter((spec) => spec.id === "stashdb"));
    expect(said).not.toContain("publishes no");
  });
});
