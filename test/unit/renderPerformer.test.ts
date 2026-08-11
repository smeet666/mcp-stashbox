import { describe, it, expect } from "vitest";

import { renderPerformer } from "../../src/tools/getPerformer.js";
import type { PerformerRecord } from "../../src/types.js";

/**
 * Every fixture here is invented. Names, aliases, studios and links describe
 * nobody, so no third-party content lives in this repository.
 */

/* ------------------------------------------------------------------ helpers */

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

function linesMatching(text: string, pattern: RegExp): string[] {
  return text.split("\n").filter((line) => pattern.test(line));
}

function allStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, into);
  else if (value !== null && typeof value === "object")
    for (const item of Object.values(value as Record<string, unknown>)) allStrings(item, into);
  return into;
}

/* ----------------------------------------------------------------- fixtures */

const PERFORMER_UUID = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";

function performer(over: Partial<PerformerRecord> = {}): PerformerRecord {
  return {
    id: `stashdb:${PERFORMER_UUID}`,
    source: "stashdb",
    sourceUrl: `https://stashdb.org/performers/${PERFORMER_UUID}`,
    // Pinned, so no test reads a clock.
    retrievedAt: "2026-08-11T00:00:00.000Z",
    status: "established",
    mergedInto: null,
    mergedIds: [],
    pendingEdits: 0,
    name: "Ilva Norrsken",
    disambiguation: null,
    aliases: [],
    gender: "FEMALE",
    country: "SE",
    birthDate: { value: "1958-03-04", precision: "day" },
    deathDate: null,
    careerStartYear: 1976,
    careerEndYear: 2020,
    sceneCount: 12,
    urls: [
      {
        url: "https://example-index.test/people/ilva-norrsken",
        siteName: "Example Index",
        siteCategory: "third-party databases",
      },
    ],
    created: "2020-02-11T08:00:00Z",
    updated: "2026-01-09T11:30:00Z",
    ...over,
  };
}

/* -------------------------------------------------------------------- tests */

describe("renderPerformer sections", () => {
  it("renders basic and leaves every opt-in section out of the payload", () => {
    const record = performer({
      appearance: {
        ethnicity: "white",
        eyeColor: "blue",
        hairColor: "blonde",
        heightCm: 167,
        tattoos: [],
        piercings: [],
        breastType: "NATURAL",
        cupSize: null,
        bandSize: null,
        waistSize: null,
        hipSize: null,
      },
      images: [
        { url: "https://cdn.stashdb.example/img/performer-a.jpg", width: 800, height: 1200 },
      ],
    });

    const { text, structured } = renderPerformer(record, ["basic"]);

    // A section that was not asked for is absent from the payload. A key present
    // and empty would state that the record holds nothing under it.
    expect(hasField(structured, "appearance")).toBe(false);
    expect(hasField(structured, "images")).toBe(false);
    expect(hasField(structured, "scenes")).toBe(false);
    expect(hasField(structured, "studios")).toBe(false);

    expect(field(structured, "name")).toBe("Ilva Norrsken");
    expect(text).toContain("Ilva Norrsken");
    expect(text).not.toContain("performer-a.jpg");
    expect(text).not.toMatch(/\bblonde\b/i);
  });

  it("renders images as addresses and never as an encoded picture", () => {
    const record = performer({
      images: [
        { url: "https://cdn.stashdb.example/img/performer-a.jpg", width: 800, height: 1200 },
        { url: "https://cdn.stashdb.example/img/performer-b.jpg", width: null, height: null },
      ],
    });

    const { text, structured } = renderPerformer(record, ["basic", "images"]);

    const images = field(structured, "images") as { url: string }[];
    expect(images).toHaveLength(2);
    for (const image of images) expect(field(image, "url")).toMatch(/^https:\/\//);

    const everything = [text, ...allStrings(structured)].join("\n");
    expect(everything).not.toMatch(/data:image/i);
    expect(everything).not.toMatch(/base64/i);
    expect(everything).not.toMatch(/[A-Za-z0-9+/]{200,}={0,2}/);
  });

  it("carries a link back to the record on the instance that answered", () => {
    const { text, structured } = renderPerformer(performer(), ["basic"]);

    expect(field(structured, "sourceUrl")).toBe(`https://stashdb.org/performers/${PERFORMER_UUID}`);
    expect(field(structured, "source")).toBe("stashdb");
    expect(text).toContain(`https://stashdb.org/performers/${PERFORMER_UUID}`);
  });
});

describe("renderPerformer appearance", () => {
  it("renders the fields the record carries and omits the rest", () => {
    // Across a hundred records a height is present far more often than the body
    // measurements, so a placeholder for an absent value states more than the
    // record carries.
    const record = performer({
      appearance: {
        ethnicity: null,
        eyeColor: null,
        hairColor: null,
        heightCm: 167,
        tattoos: [],
        piercings: [],
        breastType: null,
        cupSize: null,
        bandSize: null,
        waistSize: null,
        hipSize: null,
      },
    });

    const { text, structured } = renderPerformer(record, ["basic", "appearance"]);

    expect(field(field(structured, "appearance"), "heightCm")).toBe(167);
    expect(text).toContain("167");

    expect(text).not.toMatch(/\bcup\b/i);
    expect(text).not.toMatch(/\bband\b/i);
    expect(text).not.toMatch(/\bwaist\b/i);
    expect(text).not.toMatch(/\bhip\b/i);
    expect(text).not.toMatch(/\bethnicity\b/i);
    expect(text).not.toMatch(/\btattoos?\b/i);
    expect(text).not.toMatch(/\bpiercings?\b/i);
    expect(text).not.toMatch(/\bnull\b/);
    expect(text).not.toMatch(/\bunknown\b/i);
    expect(text).not.toMatch(/\bN\/A\b/i);
  });

  it("names the unit of a height the catalogue publishes as a bare integer", () => {
    const record = performer({
      appearance: {
        ethnicity: null,
        eyeColor: null,
        hairColor: null,
        heightCm: 167,
        tattoos: [],
        piercings: [],
        breastType: null,
        cupSize: null,
        bandSize: null,
        waistSize: null,
        hipSize: null,
      },
    });

    const { text } = renderPerformer(record, ["basic", "appearance"]);

    expect(text).toMatch(/167\s*(cm\b|centimet)/i);
  });

  it("renders the measurements a record does carry", () => {
    const record = performer({
      appearance: {
        ethnicity: "white",
        eyeColor: "green",
        hairColor: "auburn",
        heightCm: 171,
        tattoos: ["left forearm, invented motif"],
        piercings: ["navel"],
        breastType: "NATURAL",
        cupSize: "C",
        bandSize: 34,
        waistSize: 26,
        hipSize: 36,
      },
    });

    const { text, structured } = renderPerformer(record, ["basic", "appearance"]);
    const appearance = field(structured, "appearance");

    expect(field(appearance, "cupSize")).toBe("C");
    expect(field(appearance, "bandSize")).toBe(34);
    expect(field(appearance, "waistSize")).toBe(26);
    expect(field(appearance, "hipSize")).toBe(36);
    expect(text).toContain("auburn");
    expect(text).toContain("left forearm, invented motif");
  });

  it("omits a height that arrived as a zero no person has", () => {
    const record = performer({
      appearance: {
        ethnicity: null,
        eyeColor: null,
        hairColor: null,
        heightCm: null,
        tattoos: [],
        piercings: [],
        breastType: null,
        cupSize: null,
        bandSize: null,
        waistSize: null,
        hipSize: null,
      },
    });

    const { text, structured } = renderPerformer(record, ["basic", "appearance"]);

    expect(field(field(structured, "appearance"), "heightCm")).toBeNull();
    expect(text).not.toMatch(/\b0\s*cm\b/i);
    expect(text).not.toMatch(/\bheight\b/i);
  });
});

describe("renderPerformer scene count", () => {
  /**
   * A settled record with a career running from 1976 to 2020, several aliases
   * and many links, reporting zero scenes because this catalogue has indexed
   * none of them. This is what the count means, and it is the shape a renderer
   * turns into a false statement about a person.
   */
  function settledWithNoIndexedScenes(): PerformerRecord {
    return performer({
      status: "established",
      mergedInto: null,
      mergedIds: [],
      name: "Ilva Norrsken",
      aliases: [
        "Ilva Nordsken",
        "Ilva N.",
        "Eeva Norrsken",
        "Ilva Norrskenn",
        "Iva Norrsken",
        "Ilva Nordstjerne",
      ],
      careerStartYear: 1976,
      careerEndYear: 2020,
      sceneCount: 0,
      urls: [
        {
          url: "https://example-index.test/people/ilva-norrsken",
          siteName: "Example Index",
          siteCategory: "third-party databases",
        },
        {
          url: "https://example-archive.test/p/9931",
          siteName: "Example Archive",
          siteCategory: "third-party databases",
        },
        {
          url: "https://example-social.test/@ilva",
          siteName: "Example Social",
          siteCategory: "social media",
        },
        {
          url: "https://example-links.test/ilva",
          siteName: "Example Links",
          siteCategory: "link aggregators",
        },
        {
          url: "https://example-gallery.test/ilva",
          siteName: "Example Gallery",
          siteCategory: "image sites",
        },
        {
          url: "https://example-platform.test/ilva",
          siteName: "Example Platform",
          siteCategory: "content distribution platforms",
        },
        {
          url: "https://example-otherbox.test/performers/44",
          siteName: "Example Stash-Box",
          siteCategory: "other stash-boxes",
        },
        {
          url: "https://example-index-two.test/p/1188",
          siteName: "Second Example Index",
          siteCategory: "third-party databases",
        },
        {
          url: "https://example-index-three.test/p/2277",
          siteName: "Third Example Index",
          siteCategory: "third-party databases",
        },
        {
          url: "https://example-primary.test/ilva",
          siteName: "Example Primary",
          siteCategory: "primary sources",
        },
        {
          url: "https://example-index-four.test/p/3366",
          siteName: "Fourth Example Index",
          siteCategory: "third-party databases",
        },
      ],
    });
  }

  it("counts this catalogue and states nothing about a person's work", () => {
    const { text, structured } = renderPerformer(settledWithNoIndexedScenes(), ["basic"]);

    expect(field(structured, "sceneCount")).toBe(0);

    // Depth of coverage varies by era and by language. A count reports coverage,
    // and turning it into a statement about a career invents the statement.
    expect(text).not.toMatch(/\bnever (appeared|performed|worked)\b/i);
    expect(text).not.toMatch(/\bno work\b/i);
    expect(text).not.toMatch(/\bempty career\b/i);
    expect(text).not.toMatch(/\bno credits\b/i);
    expect(text).not.toMatch(/\bnot appeared\b/i);
    expect(text).not.toMatch(/\bno recorded (scenes|work|credits)\b/i);

    // A sentence stating an emptiness has to name the catalogue it is empty on,
    // in the same sentence. An unqualified one reads as a fact about a person.
    for (const sentence of text.split(/(?<=\.)\s+/)) {
      if (/\bno scenes?\b/i.test(sentence)) {
        expect(sentence).toMatch(/stashdb|catalogue|indexed/i);
      }
    }
  });

  it("names what the count counts on the line that carries it", () => {
    const { text } = renderPerformer(settledWithNoIndexedScenes(), ["basic"]);

    const counting = linesMatching(text, /\b0\b/);
    expect(counting.length).toBeGreaterThan(0);
    // The count is named for what it counts on that instance: this catalogue,
    // this instance, what it has indexed.
    for (const line of counting) {
      expect(line).toMatch(/stashdb|this catalogue|this instance|indexed|catalogued/i);
    }
  });

  it("keeps the career, the aliases and the links a zero count sits beside", () => {
    const { text, structured } = renderPerformer(settledWithNoIndexedScenes(), ["basic"]);

    expect(field(structured, "careerStartYear")).toBe(1976);
    expect(field(structured, "careerEndYear")).toBe(2020);
    expect(text).toContain("1976");
    expect(text).toContain("2020");
    expect((field(structured, "urls") as unknown[]).length).toBe(11);
  });

  it("reads a zero count as no marker of a merge", () => {
    const { text, structured } = renderPerformer(settledWithNoIndexedScenes(), ["basic"]);

    expect(field(structured, "status")).toBe("established");
    expect(field(structured, "mergedInto")).toBeNull();
    expect(field(structured, "mergedIds")).toEqual([]);

    expect(text).not.toMatch(/\bmerged\b/i);
    expect(text).not.toMatch(/\bformer name\b/i);
    expect(text).not.toMatch(/\bsuccessor\b/i);
    expect(text).not.toMatch(/\bdeleted\b/i);
  });

  it("renders a count above zero as a count on that instance", () => {
    const { text, structured } = renderPerformer(performer({ sceneCount: 12 }), ["basic"]);

    expect(field(structured, "sceneCount")).toBe(12);
    for (const line of linesMatching(text, /\b12\b/)) {
      expect(line).toMatch(/stashdb|this catalogue|this instance|indexed|catalogued/i);
    }
    expect(text).not.toMatch(/\btotal\b/i);
  });
});

describe("renderPerformer aliases and disambiguation", () => {
  it("renders every name the person was released under", () => {
    const aliases = ["Ilva Nordsken", "Eeva Norrsken", "Ilva N.", "Ilva Norrskenn"];
    const { text, structured } = renderPerformer(performer({ aliases }), ["basic"]);

    // Stage names and variant spellings sit side by side, and a search matching
    // one of them has matched the person.
    expect(field(structured, "aliases")).toEqual(aliases);
    for (const alias of aliases) expect(text).toContain(alias);
  });

  it("omits the aliases line when the record carries none", () => {
    const { text, structured } = renderPerformer(performer({ aliases: [] }), ["basic"]);

    expect(field(structured, "aliases")).toEqual([]);
    expect(text).not.toMatch(/\baliases?\b/i);
  });

  it("renders a disambiguation verbatim without parsing it", () => {
    const record = performer({
      disambiguation: "2008-2016, Russia",
      country: null,
      careerStartYear: null,
      careerEndYear: null,
    });

    const { text, structured } = renderPerformer(record, ["basic"]);

    expect(field(structured, "disambiguation")).toBe("2008-2016, Russia");
    expect(text).toContain("2008-2016, Russia");

    // The phrase holds whatever tells two people apart on that record. Reading a
    // country or a career out of it would answer a question nobody asked.
    expect(field(structured, "country")).toBeNull();
    expect(field(structured, "careerStartYear")).toBeNull();
    expect(field(structured, "careerEndYear")).toBeNull();
    for (const line of linesMatching(text, /career/i)) {
      expect(line).not.toContain("2008");
      expect(line).not.toContain("2016");
    }
    for (const line of linesMatching(text, /country/i)) {
      expect(line).not.toContain("Russia");
    }
  });
});

describe("renderPerformer dates and ages", () => {
  it("renders a birth date and computes no age from it", () => {
    const { text, structured } = renderPerformer(
      performer({ birthDate: { value: "1958-03-04", precision: "day" } }),
      ["basic"],
    );

    expect(field(structured, "birthDate")).toEqual({ value: "1958-03-04", precision: "day" });
    expect(text).toContain("1958-03-04");
    // An age derived at read time changes between two identical reads.
    expect(hasField(structured, "age")).toBe(false);
    expect(text).not.toMatch(/\bages?\b/i);
    expect(text).not.toMatch(/\byears old\b/i);
  });

  it("prints a year-precision birth date as a year", () => {
    const { text, structured } = renderPerformer(
      performer({ birthDate: { value: "1958", precision: "year" } }),
      ["basic"],
    );

    expect(field(structured, "birthDate")).toEqual({ value: "1958", precision: "year" });
    expect(text).toContain("1958");
    expect(text).not.toContain("1958-01");
    expect(text).not.toMatch(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    );
  });

  it("omits a birth date the record does not carry", () => {
    const { text, structured } = renderPerformer(performer({ birthDate: null, deathDate: null }), [
      "basic",
    ]);

    expect(field(structured, "birthDate")).toBeNull();
    expect(text).not.toMatch(/\bborn\b/i);
    expect(text).not.toMatch(/\bbirth\b/i);
    expect(text).not.toMatch(/\bnull\b/);
  });
});

describe("renderPerformer merged marker", () => {
  const successor = "stashdb:7f8e9d0c-1b2a-4394-8576-6a5b4c3d2e1f";

  function marker(): PerformerRecord {
    return performer({
      status: "merged",
      mergedInto: successor,
      mergedIds: [`stashdb:${PERFORMER_UUID}`],
      name: "Ilva Nordsken",
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
    });
  }

  it("names its successor and its former name as a former name", () => {
    const { text, structured } = renderPerformer(marker(), ["basic"]);

    expect(field(structured, "status")).toBe("merged");
    expect(field(structured, "mergedInto")).toBe(successor);
    expect(text).toContain(successor);
    expect(text).toContain("Ilva Nordsken");
    expect(text).toMatch(/merged/i);
    expect(text).toMatch(/former name/i);
  });

  it("carries a null scene count rather than a zero belonging to the successor", () => {
    const { text, structured } = renderPerformer(marker(), ["basic"]);

    expect(field(structured, "sceneCount")).toBeNull();
    expect(text).not.toMatch(/\b0 scenes\b/i);
    expect(text).not.toMatch(/\bno scenes\b/i);
    expect(text).not.toMatch(/\bno aliases\b/i);
    expect(text).not.toMatch(/\bno links\b/i);
    expect(text).not.toMatch(/\bunknown\b/i);
  });

  it("lists the identifiers folded into the successor", () => {
    const { text, structured } = renderPerformer(marker(), ["basic"]);

    // A caller reconciling identifiers it stored earlier reads them here rather
    // than looking each one up.
    expect(field(structured, "mergedIds")).toEqual([`stashdb:${PERFORMER_UUID}`]);
    expect(text).toContain(`stashdb:${PERFORMER_UUID}`);
  });

  it("answers a merged identifier as a record rather than as an absence", () => {
    const { text } = renderPerformer(marker(), [
      "basic",
      "appearance",
      "images",
      "scenes",
      "studios",
    ]);

    // A merged identifier addresses a record that exists under another name.
    expect(text).toContain(successor);
    expect(text).not.toMatch(/\bnot found\b/i);
    expect(text).not.toMatch(/\bheight\b/i);
    expect(text).not.toMatch(/\b0 cm\b/i);
  });
});

describe("renderPerformer sections asked for and not rendered", () => {
  it("reads an empty list of sections as the default", () => {
    // The argument is optional, and a caller passing an empty list has narrowed
    // nothing. Rendering that as no section at all would answer with a record
    // stripped of what identifies it.
    const record = performer();

    const empty = renderPerformer(record, []);
    const omitted = renderPerformer(record, ["basic"]);

    expect(empty.text).toBe(omitted.text);
    expect(empty.structured).toEqual(omitted.structured);
  });

  it("says a section could not be rendered on a merged record", () => {
    const merged = performer({
      status: "merged",
      mergedInto: "stashdb:7f8e9d0c-1b2a-4394-8576-6a5b4c3d2e1f",
      sceneCount: null,
      urls: [],
      aliases: [],
    });

    for (const section of ["appearance", "images", "scenes", "studios"]) {
      const { text, structured } = renderPerformer(merged, ["basic", section]);
      const notes = (field(structured, "notes") as string[] | undefined) ?? [];

      // A section asked for and silently dropped reads as a record holding
      // nothing under it.
      expect(notes.some((note) => note.includes(section))).toBe(true);
      expect(text).toMatch(new RegExp(`${section}[^\\n]*could not be rendered`, "i"));
    }
  });

  it("says a section could not be rendered on a withdrawn record", () => {
    const withdrawn = performer({
      status: "deleted",
      mergedInto: null,
      sceneCount: null,
      urls: [],
      aliases: [],
    });

    for (const section of ["appearance", "images", "scenes", "studios"]) {
      const { text, structured } = renderPerformer(withdrawn, ["basic", section]);
      const notes = (field(structured, "notes") as string[] | undefined) ?? [];

      expect(notes.some((note) => note.includes(section))).toBe(true);
      expect(text).toMatch(new RegExp(`${section}[^\\n]*could not be rendered`, "i"));
    }
  });
});
