import { describe, it, expect } from "vitest";

import { renderScene } from "../../src/tools/getScene.js";
import type { SceneRecord, PerformerAppearance, FingerprintRow } from "../../src/types.js";

/**
 * Every fixture here is invented. Titles, performers, studios, codes and hashes
 * name nothing that exists, so no third-party content lives in this repository.
 */

/* ------------------------------------------------------------------ helpers */

/**
 * A structured payload is addressed by meaning rather than by spelling: the
 * shapes are published in snake_case and the record types are camelCase, so a
 * lookup accepts either and an assertion states which field it means.
 */
function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function hasField(payload: unknown, key: string): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return toSnake(key) in obj || toCamel(key) in obj;
}

function field(payload: unknown, key: string): unknown {
  if (payload === null || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  return toSnake(key) in obj ? obj[toSnake(key)] : obj[toCamel(key)];
}

/** Every line of prose matching a pattern, so an assertion can name where it looks. */
function linesMatching(text: string, pattern: RegExp): string[] {
  return text.split("\n").filter((line) => pattern.test(line));
}

/** Every string anywhere in a structured payload, for assertions about content. */
function allStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, into);
  else if (value !== null && typeof value === "object")
    for (const item of Object.values(value as Record<string, unknown>)) allStrings(item, into);
  return into;
}

/* ----------------------------------------------------------------- fixtures */

const SCENE_UUID = "1f2e3d4c-5b6a-4978-8899-0a1b2c3d4e5f";

function performer(over: Partial<PerformerAppearance> = {}): PerformerAppearance {
  return {
    id: "stashdb:6d7c8b9a-0e1f-4a2b-9c3d-4e5f6a7b8c9d",
    name: "Ilva Norrsken",
    creditedAs: null,
    disambiguation: null,
    ...over,
  };
}

function fingerprint(over: Partial<FingerprintRow> = {}): FingerprintRow {
  return {
    algorithm: "PHASH",
    hash: "a1b2c3d4e5f60718",
    durationSeconds: 2732,
    submissions: 4,
    reports: 0,
    contested: false,
    ...over,
  };
}

function scene(over: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id: `stashdb:${SCENE_UUID}`,
    source: "stashdb",
    sourceUrl: `https://stashdb.org/scenes/${SCENE_UUID}`,
    // Pinned, so no test reads a clock.
    retrievedAt: "2026-08-11T00:00:00.000Z",
    status: "established",
    mergedInto: null,
    pendingEdits: 0,
    title: "Harbour Lights, Chapter Two",
    details: "An invented synopsis for an invented release.",
    code: "NGP-114",
    director: "Rill Anselm",
    durationSeconds: 2732,
    releaseDate: { value: "2019-04-12", precision: "day" },
    productionDate: null,
    studio: {
      id: "stashdb:2b3c4d5e-6f70-4812-9345-56789abcdef0",
      name: "Northgate Pictures",
      parent: null,
    },
    performers: [performer()],
    tags: [
      { id: "stashdb:3c4d5e6f-7081-4923-8456-6789abcdef01", name: "Coastal", category: "Setting" },
    ],
    urls: [
      {
        url: "https://northgate-pictures.example/releases/ngp-114",
        siteName: "Northgate Pictures",
        siteCategory: "primary sources",
      },
    ],
    created: "2019-05-02T09:14:00Z",
    updated: "2024-11-18T16:02:00Z",
    ...over,
  };
}

/* -------------------------------------------------------------------- tests */

describe("renderScene sections", () => {
  it("renders basic and leaves fingerprints and images out of the payload entirely", () => {
    const record = scene({
      images: [{ url: "https://cdn.stashdb.example/img/ngp-114-a.jpg", width: 1920, height: 1080 }],
      fingerprints: [fingerprint()],
    });

    const { text, structured } = renderScene(record, ["basic"]);

    // A section that was not asked for is absent from the payload. A key present
    // and empty would state that the record holds none of them.
    expect(hasField(structured, "fingerprints")).toBe(false);
    expect(hasField(structured, "images")).toBe(false);

    expect(field(structured, "title")).toBe("Harbour Lights, Chapter Two");
    expect(text).toContain("Harbour Lights, Chapter Two");
    expect(text).not.toContain("a1b2c3d4e5f60718");
    expect(text).not.toContain("ngp-114-a.jpg");
  });

  it("carries a link back to the record on the instance that answered", () => {
    const { text, structured } = renderScene(scene(), ["basic"]);

    expect(field(structured, "sourceUrl")).toBe(`https://stashdb.org/scenes/${SCENE_UUID}`);
    expect(text).toContain(`https://stashdb.org/scenes/${SCENE_UUID}`);
  });

  it("names the instance a row came from", () => {
    const { text, structured } = renderScene(scene(), ["basic"]);

    expect(field(structured, "source")).toBe("stashdb");
    expect(text).toMatch(/stashdb|StashDB/);
  });

  it("renders fingerprints only when the section is asked for", () => {
    const record = scene({
      fingerprints: [
        fingerprint({
          algorithm: "OSHASH",
          hash: "0f1e2d3c4b5a6978",
          submissions: 7,
          reports: 1,
          contested: false,
        }),
      ],
    });

    const { text, structured } = renderScene(record, ["basic", "fingerprints"]);

    const rows = field(structured, "fingerprints") as FingerprintRow[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(field(rows[0], "algorithm")).toBe("OSHASH");
    expect(field(rows[0], "submissions")).toBe(7);
    expect(field(rows[0], "reports")).toBe(1);
    expect(text).toContain("0f1e2d3c4b5a6978");
  });
});

describe("renderScene images", () => {
  it("returns addresses and never an encoded picture", () => {
    const record = scene({
      images: [
        { url: "https://cdn.stashdb.example/img/ngp-114-a.jpg", width: 1920, height: 1080 },
        { url: "https://cdn.stashdb.example/img/ngp-114-b.jpg", width: null, height: null },
      ],
    });

    const { text, structured } = renderScene(record, ["basic", "images"]);

    const images = field(structured, "images") as { url: string }[];
    expect(Array.isArray(images)).toBe(true);
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(typeof field(image, "url")).toBe("string");
      expect(field(image, "url")).toMatch(/^https:\/\//);
    }

    expect(text).toContain("https://cdn.stashdb.example/img/ngp-114-a.jpg");

    // No route through this renderer puts the picture itself in front of a reader.
    const everything = [text, ...allStrings(structured)].join("\n");
    expect(everything).not.toMatch(/data:image/i);
    expect(everything).not.toMatch(/base64/i);
    expect(everything).not.toMatch(/[A-Za-z0-9+/]{200,}={0,2}/);
  });

  it("omits a width and a height the catalogue does not publish", () => {
    const record = scene({
      images: [{ url: "https://cdn.stashdb.example/img/ngp-114-b.jpg", width: null, height: null }],
    });

    const { text } = renderScene(record, ["basic", "images"]);

    expect(text).not.toMatch(/\b0\s*[x×]\s*0\b/);
    expect(text).not.toMatch(/\bnull\b/);
  });
});

describe("renderScene dates", () => {
  it("keeps a release date and a production date apart", () => {
    const record = scene({
      releaseDate: { value: "2019-04-12", precision: "day" },
      productionDate: null,
    });

    const { text, structured } = renderScene(record, ["basic"]);

    expect(field(structured, "releaseDate")).toEqual({ value: "2019-04-12", precision: "day" });
    expect(field(structured, "productionDate")).toBeNull();

    // The release date is never reported under the other question's name.
    for (const line of linesMatching(text, /produc/i)) {
      expect(line).not.toContain("2019-04-12");
      expect(line).not.toContain("2019");
    }
    expect(text).toContain("2019-04-12");
  });

  it("renders two dates as two dates when the catalogue publishes both", () => {
    const record = scene({
      releaseDate: { value: "2019-04-12", precision: "day" },
      productionDate: { value: "2018-11-03", precision: "day" },
    });

    const { text, structured } = renderScene(record, ["basic"]);

    expect(field(structured, "releaseDate")).toEqual({ value: "2019-04-12", precision: "day" });
    expect(field(structured, "productionDate")).toEqual({ value: "2018-11-03", precision: "day" });
    expect(text).toContain("2019-04-12");
    expect(text).toContain("2018-11-03");
  });

  it("prints a year-precision date as a year", () => {
    const record = scene({
      releaseDate: { value: "1998", precision: "year" },
      productionDate: null,
    });

    const { text, structured } = renderScene(record, ["basic"]);

    expect(field(structured, "releaseDate")).toEqual({ value: "1998", precision: "year" });
    expect(text).toContain("1998");

    // A month or a day nobody entered would claim a precision the record denies.
    expect(text).not.toContain("1998-01");
    expect(text).not.toContain("1998-1");
    expect(text).not.toMatch(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    );
    expect(text).not.toMatch(/\b1998[-/]\d/);
  });

  it("states the precision alongside the date", () => {
    const { structured } = renderScene(
      scene({ releaseDate: { value: "2003-07", precision: "month" } }),
      ["basic"],
    );

    expect(field(structured, "releaseDate")).toEqual({ value: "2003-07", precision: "month" });
  });
});

describe("renderScene credited names", () => {
  it("renders a credited spelling beside the performer's own name", () => {
    const record = scene({
      performers: [performer({ name: "Marlow Vane", creditedAs: "Marlowe Vane" })],
    });

    const { text, structured } = renderScene(record, ["basic"]);

    // The two spellings differ by one letter, which is the case a renderer loses
    // when it prints one name and drops the other.
    expect(text).toContain("Marlow Vane");
    expect(text).toContain("Marlowe Vane");

    const performers = field(structured, "performers") as unknown[];
    expect(field(performers[0], "name")).toBe("Marlow Vane");
    expect(field(performers[0], "creditedAs")).toBe("Marlowe Vane");
  });

  it("renders one name when the release credits the performer's own", () => {
    const record = scene({ performers: [performer({ name: "Ilva Norrsken", creditedAs: null })] });

    const { text, structured } = renderScene(record, ["basic"]);

    expect(text).toContain("Ilva Norrsken");
    const performers = field(structured, "performers") as unknown[];
    expect(field(performers[0], "creditedAs")).toBeNull();
    expect(text).not.toMatch(/credited as\s*$/im);
    expect(text).not.toMatch(/credited as\s*(null|—|-)\s*/i);
  });

  it("carries a performer's disambiguation without folding it into the name", () => {
    const record = scene({
      performers: [performer({ name: "Ilva Norrsken", disambiguation: "1994-2001, Sweden" })],
    });

    const { text, structured } = renderScene(record, ["basic"]);

    const performers = field(structured, "performers") as unknown[];
    expect(field(performers[0], "name")).toBe("Ilva Norrsken");
    expect(field(performers[0], "disambiguation")).toBe("1994-2001, Sweden");
    expect(text).toContain("1994-2001, Sweden");
  });
});

describe("renderScene merged marker", () => {
  const successor = "stashdb:9a8b7c6d-5e4f-4302-9182-736455647382";

  function marker(): SceneRecord {
    return scene({
      status: "merged",
      mergedInto: successor,
      title: "Harbour Lights, Chapter Two",
      details: null,
      code: null,
      director: null,
      durationSeconds: null,
      releaseDate: null,
      productionDate: null,
      studio: null,
      performers: [],
      tags: [],
      urls: [],
    });
  }

  it("names its successor and its former title as a former title", () => {
    const { text, structured } = renderScene(marker(), ["basic"]);

    expect(field(structured, "status")).toBe("merged");
    expect(field(structured, "mergedInto")).toBe(successor);
    expect(text).toContain(successor);
    expect(text).toMatch(/merged/i);
    expect(text).toMatch(/former/i);
  });

  it("never presents its emptiness as a fact about the release", () => {
    const { text } = renderScene(marker(), ["basic"]);

    // The record as it stood before the merge was emptied. Rendering that as a
    // scene would state that a release under a former title has no performers,
    // which is a claim nobody made.
    expect(text).not.toMatch(/\bno performers\b/i);
    expect(text).not.toMatch(/\bno tags\b/i);
    expect(text).not.toMatch(/\bno studio\b/i);
    expect(text).not.toMatch(/\bno links\b/i);
    expect(text).not.toMatch(/\bno fingerprints\b/i);
    expect(text).not.toMatch(/\b0 performers\b/i);
    expect(text).not.toMatch(/\b0 tags\b/i);
    expect(text).not.toMatch(/\bunknown\b/i);
    expect(text).not.toMatch(/\b0 seconds\b/i);
  });

  it("carries the successor rather than a record of its own", () => {
    const { text } = renderScene(marker(), ["basic", "fingerprints", "images"]);

    // A marker answers with where the record went. Asking for its heavy sections
    // does not turn it into a scene with content.
    expect(text).toContain(successor);
    expect(text).not.toMatch(/^\s*(performers|tags|studio|director)\b/im);
  });
});

describe("renderScene measurements and absences", () => {
  it("names the unit of a duration the catalogue publishes as a bare integer", () => {
    const { text, structured } = renderScene(scene({ durationSeconds: 2732 }), ["basic"]);

    expect(field(structured, "durationSeconds")).toBe(2732);
    // Either the count of seconds names its unit, or the prose spells the
    // duration out in units a reader can read off.
    expect(text).toMatch(/(\bseconds?\b)|(\b\d+\s*h\s*\d+\s*m\b)|(\b\d+\s*m(in)?\s*\d+\s*s\b)/i);
  });

  it("omits a duration the catalogue does not publish", () => {
    const { text, structured } = renderScene(scene({ durationSeconds: null }), ["basic"]);

    expect(field(structured, "durationSeconds")).toBeNull();
    expect(text).not.toMatch(/\b0 seconds\b/i);
    expect(text).not.toMatch(/duration/i);
    expect(text).not.toMatch(/\b0:00\b/);
  });

  it("omits every field the record does not carry rather than printing a placeholder", () => {
    const record = scene({
      details: null,
      code: null,
      director: null,
      durationSeconds: null,
      releaseDate: null,
      productionDate: null,
      studio: null,
      tags: [],
      urls: [],
    });

    const { text } = renderScene(record, ["basic"]);

    expect(text).not.toMatch(/\bnull\b/);
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/\bN\/A\b/i);
    expect(text).not.toMatch(/:\s*$/m);
    expect(text).not.toMatch(/\bdirector\b/i);
    expect(text).not.toMatch(/\bcode\b/i);
  });

  it("renders a free-text director without parsing it", () => {
    const { text, structured } = renderScene(scene({ director: "Rill Anselm & Teodora Vasch" }), [
      "basic",
    ]);

    expect(field(structured, "director")).toBe("Rill Anselm & Teodora Vasch");
    expect(text).toContain("Rill Anselm & Teodora Vasch");
  });

  it("keeps a link back and a link out apart", () => {
    const record = scene({
      urls: [
        {
          url: "https://northgate-pictures.example/releases/ngp-114",
          siteName: "Northgate Pictures",
          siteCategory: "primary sources",
        },
      ],
    });

    const { text, structured } = renderScene(record, ["basic"]);

    const urls = field(structured, "urls") as unknown[];
    expect(urls).toHaveLength(1);
    expect(field(urls[0], "siteName")).toBe("Northgate Pictures");
    expect(field(urls[0], "siteCategory")).toBe("primary sources");
    expect(field(structured, "sourceUrl")).toBe(`https://stashdb.org/scenes/${SCENE_UUID}`);
    expect(text).toContain("https://northgate-pictures.example/releases/ngp-114");
  });

  it("carries a link with no category from an instance that publishes none", () => {
    const record = scene({
      urls: [
        {
          url: "https://example-listing.test/items/8814",
          siteName: "Example Listing",
          siteCategory: null,
        },
      ],
    });

    const { text, structured } = renderScene(record, ["basic"]);

    const urls = field(structured, "urls") as unknown[];
    expect(field(urls[0], "siteCategory")).toBeNull();
    expect(text).not.toMatch(/\bnull\b/);
  });
});

describe("renderScene notes", () => {
  it("puts what qualifies the answer in the text block and in the payload alike", () => {
    // A record's qualifications are composed while it is rendered, from what the
    // record turns out to carry. A client reading only the text block must not
    // lose them, and neither must one reading only the payload.
    const record = scene();
    record.releaseDate = { value: "1998", precision: "year" };

    const { text, structured } = renderScene(record, ["basic"]);

    const notes = field(structured, "notes") as string[] | undefined;
    expect(Array.isArray(notes)).toBe(true);
    expect(notes!.length).toBeGreaterThan(0);
    for (const note of notes!) {
      expect(text).toContain(note);
    }
    expect(text).toMatch(/^Note: /m);
  });

  it("indents published text that opens with a line this server writes", () => {
    const record = scene({
      details: "Note: an invented synopsis line published on the record.",
    });

    const { text } = renderScene(record, ["basic"]);

    // Published text cannot forge a line the server writes.
    expect(text).not.toMatch(/^Note: an invented synopsis line/m);
    expect(text).toContain("Note: an invented synopsis line published on the record.");
  });
});
