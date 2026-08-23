/**
 * What a question becomes on the wire, catalogue by catalogue.
 *
 * This is the file that would have caught the two worst failures this server
 * has shipped, and both were invisible to every other kind of test: a request
 * is refused by a catalogue, the refusal is reported honestly, and every schema
 * in the answer validates, because **a failed answer is perfectly
 * schema-conformant**. Six routes reached no catalogue at all under a suite of
 * six hundred green tests.
 *
 * So the assertions here are about the request and never about the answer. Two
 * rules decide them.
 *
 * **A catalogue is asked in its own spelling.** The two catalogues name the same
 * route differently, one plural and one singular, and a request written in the
 * other's spelling comes back refused. Read as a limit of the catalogue, that
 * refusal became a published claim that one of them answered no search at all.
 *
 * **A filter is written the way the schema declares it.** A criterion is an
 * object carrying a value and a comparison. A scene carries one studio, so a
 * list of studios is a union whatever the caller asked for. A date field takes
 * one comparison, because the enumeration of comparisons declares no range.
 *
 * The route names and the shapes below were read on 2026-08-13 by introspecting
 * each catalogue's own query type.
 */

import { describe, expect, it } from "vitest";

import { instanceById } from "../../src/stashbox/instances.js";
import {
  fingerprintRequest,
  performerQueryInput,
  recordRequest,
  sceneQueryInput,
  searchRequest,
  studioQueryInput,
  tagQueryInput,
} from "../../src/stashbox/queries.js";

const SD = instanceById("stashdb")!;
const TP = instanceById("tpdb")!;

const A = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const B = "019fec3f-1bb1-7383-8782-ea0e678f6de0";

/* ----------------------------------------------- each catalogue, its spelling */

describe("a catalogue is asked in the spelling it declares", () => {
  const cases: [string, "scenes" | "performers", string][] = [
    ["StashDB writes its scene search plural", "scenes", "searchScenes"],
    ["StashDB writes its performer search plural", "performers", "searchPerformers"],
  ];

  for (const [what, kind, route] of cases) {
    it(what, () => {
      expect(searchRequest(SD, kind, "sunset", 5).operation).toBe(route);
    });
  }

  it("ThePornDB writes its scene search singular", () => {
    expect(searchRequest(TP, "scenes", "sunset", 5).operation).toBe("searchScene");
  });

  it("ThePornDB writes its performer search singular", () => {
    expect(searchRequest(TP, "performers", "angela", 5).operation).toBe("searchPerformer");
  });

  it("puts the words in the argument the route takes them in", () => {
    const built = searchRequest(SD, "scenes", "sunset", 5);
    expect(built.variables).toMatchObject({ term: "sunset", limit: 5 });
  });

  it("asks no route of a catalogue the registry does not declare it on", () => {
    // This catalogue answers no search of studios, so nothing is built for it.
    expect(() => searchRequest(TP, "studios" as never, "vixen", 5)).toThrow();
  });
});

describe("one record is read on the route each catalogue names", () => {
  const cases: [string, "scene" | "performer" | "studio" | "tag", string][] = [
    ["a scene", "scene", "findScene"],
    ["a performer", "performer", "findPerformer"],
    ["a studio", "studio", "findStudio"],
    ["a tag", "tag", "findTag"],
  ];

  for (const [what, kind, route] of cases) {
    it(`reads ${what} on both catalogues`, () => {
      expect(recordRequest(SD, kind, A).operation).toBe(route);
      expect(recordRequest(TP, kind, A).operation).toBe(route);
    });
  }

  it("passes the bare uuid, since the catalogue is the one being asked", () => {
    expect(recordRequest(SD, "scene", A).variables).toMatchObject({ id: A });
  });
});

/* --------------------------------------------------------- a criterion's shape */

describe("a filter written as free text travels as a criterion", () => {
  it("carries the value and the comparison, rather than the bare string", () => {
    const input = sceneQueryInput(SD, { code: "START-614", page: 1, limit: 25 }).input;
    expect(input.code).toEqual({ value: "START-614", modifier: "EQUALS" });
  });

  it("leaves a title as the schema takes it, which is a plain string", () => {
    const input = sceneQueryInput(SD, { title: "sunset", page: 1, limit: 25 }).input;
    expect(input.title).toBe("sunset");
  });

  it("writes a country as a criterion on the performer route", () => {
    const input = performerQueryInput(SD, { country: "AU", page: 1, limit: 25 }).input;
    expect(input.country).toEqual({ value: "AU", modifier: "EQUALS" });
  });
});

describe("a list of identifiers travels as a criterion naming how it is read", () => {
  it("asks for a row carrying every one of them where all was written", () => {
    const input = sceneQueryInput(SD, { tagIds: [A, B], match: "all", page: 1, limit: 25 }).input;
    expect(input.tags).toEqual({ value: [A, B], modifier: "INCLUDES_ALL" });
  });

  it("asks for a row carrying one of them where any was written", () => {
    const input = sceneQueryInput(SD, { tagIds: [A, B], match: "any", page: 1, limit: 25 }).input;
    expect(input.tags).toEqual({ value: [A, B], modifier: "INCLUDES" });
  });

  it("reads a list of studios as a union whatever was written", () => {
    // A scene carries one studio, so asking for a row carrying two answers
    // nothing at all, whatever the caller meant by it.
    for (const match of ["all", "any"] as const) {
      const input = sceneQueryInput(SD, { studioIds: [A, B], match, page: 1, limit: 25 }).input;
      expect(input.studios).toEqual({ value: [A, B], modifier: "INCLUDES" });
    }
  });
});

/* ------------------------------------------------------------- one comparison */

describe("a date carries one comparison, because no catalogue declares a range", () => {
  const cases: [string, "on" | "before" | "after", string][] = [
    ["on a day", "on", "EQUALS"],
    ["before a day", "before", "LESS_THAN"],
    ["after a day", "after", "GREATER_THAN"],
  ];

  for (const [what, compare, modifier] of cases) {
    it(`compares ${what}`, () => {
      const input = sceneQueryInput(SD, {
        date: "2019-04-12",
        dateCompare: compare,
        page: 1,
        limit: 25,
      }).input;
      expect(input.date).toEqual({ value: "2019-04-12", modifier });
    });
  }

  it("never writes a comparison the catalogues do not declare", () => {
    // The enumeration holds EQUALS, NOT_EQUALS, GREATER_THAN, LESS_THAN,
    // IS_NULL, NOT_NULL, INCLUDES_ALL, INCLUDES and EXCLUDES. Nothing else.
    const declared = [
      "EQUALS",
      "NOT_EQUALS",
      "GREATER_THAN",
      "LESS_THAN",
      "IS_NULL",
      "NOT_NULL",
      "INCLUDES_ALL",
      "INCLUDES",
      "EXCLUDES",
    ];
    const built = [
      sceneQueryInput(SD, { date: "2019-04-12", dateCompare: "after", page: 1, limit: 25 }).input,
      sceneQueryInput(SD, { tagIds: [A], match: "all", page: 1, limit: 25 }).input,
      sceneQueryInput(SD, { code: "X", page: 1, limit: 25 }).input,
      performerQueryInput(SD, { country: "AU", page: 1, limit: 25 }).input,
    ];
    for (const input of built) {
      for (const value of Object.values(input)) {
        const modifier = (value as { modifier?: unknown })?.modifier;
        if (modifier !== undefined) {
          expect(declared).toContain(modifier);
        }
      }
    }
  });
});

/* ------------------------------------------ what one catalogue's route requires */

describe("a catalogue that requires an order gets one", () => {
  it("carries a sort and a direction where the route declares them required", () => {
    // Measured: this catalogue refuses a faceted query written without them.
    const input = performerQueryInput(TP, { name: "angela", page: 1, limit: 25 }).input;
    expect(input.sort).toBeDefined();
    expect(input.direction).toBeDefined();
  });

  it("leaves them out of a route that declares them optional", () => {
    const input = performerQueryInput(SD, { name: "angela", page: 1, limit: 25 }).input;
    expect(input.sort).toBeUndefined();
    expect(input.direction).toBeUndefined();
  });

  it("carries the order a caller wrote, on either catalogue", () => {
    for (const spec of [SD, TP]) {
      const input = performerQueryInput(spec, {
        name: "a",
        sort: "name",
        direction: "desc",
        page: 1,
        limit: 25,
      }).input;
      expect(input.direction).toBe("DESC");
    }
  });
});

/* ------------------------------------------------------------- the page */

describe("a page is asked for the way each route takes it", () => {
  it("names the page and how many rows it holds", () => {
    const input = sceneQueryInput(SD, { title: "a", page: 3, limit: 10 }).input;
    expect(input).toMatchObject({ page: 3, per_page: 10 });
  });

  it("does the same on the other three entities", () => {
    expect(performerQueryInput(SD, { name: "a", page: 2, limit: 5 }).input).toMatchObject({
      page: 2,
      per_page: 5,
    });
    expect(studioQueryInput(SD, { name: "a", page: 2, limit: 5 }).input).toMatchObject({
      page: 2,
      per_page: 5,
    });
    expect(tagQueryInput(SD, { name: "a", page: 2, limit: 5 }).input).toMatchObject({
      page: 2,
      per_page: 5,
    });
  });
});

/* ------------------------------------------------------------- fingerprints */

describe("a set of hashes travels as the route declares it", () => {
  it("sends one group per hash, since the argument is a list of groups", () => {
    const built = fingerprintRequest(SD, [
      { hash: "abc", algorithm: "OSHASH" },
      { hash: "def", algorithm: "PHASH" },
    ]);
    expect(built.variables.fingerprints).toEqual([
      [{ hash: "abc", algorithm: "OSHASH" }],
      [{ hash: "def", algorithm: "PHASH" }],
    ]);
  });

  it("puts to a catalogue only the algorithms its own lookup searches", () => {
    const built = fingerprintRequest(TP, [
      { hash: "abc", algorithm: "OSHASH" },
      { hash: "def", algorithm: "PHASH" },
    ]);
    expect(built.variables.fingerprints).toEqual([[{ hash: "abc", algorithm: "OSHASH" }]]);
    expect(built.notSearched).toEqual(["PHASH"]);
  });
});

/* ------------------------------------------ what a request never carries */

describe("a request carries nothing the caller did not write", () => {
  it("holds no key for a filter that was left out", () => {
    const input = sceneQueryInput(SD, { title: "sunset", page: 1, limit: 25 }).input;
    for (const name of ["code", "date", "studios", "tags", "performers", "alias"]) {
      expect(input, `${name} was never written and is in the request`).not.toHaveProperty(name);
    }
  });

  it("holds no empty list, which would narrow on nothing", () => {
    const input = sceneQueryInput(SD, { tagIds: [], match: "all", page: 1, limit: 25 }).input;
    expect(input).not.toHaveProperty("tags");
  });

  it("selects a field only where the catalogue publishes it", () => {
    // A count of edits is selected on the catalogue that publishes one, and
    // asking for it elsewhere makes the whole request fail.
    expect(recordRequest(SD, "performer", A).query).toContain("edits");
    expect(recordRequest(TP, "performer", A).query).not.toContain("edits");
  });

  it("selects a field only where the kind of record declares it", () => {
    // Measured: a scene, a performer and a tag each declare a list of open
    // edits, and a studio declares none. Asking a studio for it fails the
    // whole request rather than the one field.
    for (const kind of ["scene", "performer", "tag"] as const) {
      expect(recordRequest(SD, kind, A).query, `${kind} carries edits`).toContain("edits");
    }
    expect(recordRequest(SD, "studio", A).query).not.toContain("edits");
  });
});

/* --------------------------- a narrowing the route answers nothing for */

/**
 * The filters a faceted input declares and its route reads nothing of.
 *
 * Measured on 2026-08-14 against StashDB: `queryPerformers` written with
 * `alias`, `career_start_year` or `career_end_year`, and `queryScenes` written
 * with `alias`, each answer the count, the page and the first row of a request
 * carrying no narrowing at all. Written into a request they narrow nothing, and
 * the whole index comes back as the answer to the question a caller narrowed.
 */
describe("a filter the catalogue's route reads nothing of", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ["a performer alias", "alias", { alias: "Angie" }],
    ["a year a career opened", "career_start_year", { careerStartYear: 2003 }],
    ["a year a career closed", "career_end_year", { careerEndYear: 2020 }],
  ];

  for (const [what, published, written] of cases) {
    it(`leaves ${what} out of the request`, () => {
      const built = performerQueryInput(SD, { ...written, page: 1, limit: 25 });
      expect(built.input).not.toHaveProperty(published);
    });

    it(`names ${what} as a narrowing the route does not receive`, () => {
      const built = performerQueryInput(SD, { ...written, page: 1, limit: 25 });
      expect(built.unreceived).toContain(published);
    });
  }

  it("leaves a scene alias out of the request and names it", () => {
    const built = sceneQueryInput(SD, { alias: "sunset", page: 1, limit: 25 });
    expect(built.input).not.toHaveProperty("alias");
    expect(built.unreceived).toContain("alias");
  });
});

describe("a filter beside one the route reads nothing of", () => {
  // The correction that put four narrowings in the unreceived list is one line
  // away from putting their siblings there too, and a sibling silently dropped
  // is the very failure it was written for.
  it("still writes the year of birth, which the route answers", () => {
    const built = performerQueryInput(SD, { birthYear: 1985, page: 1, limit: 25 });
    expect(built.input.birth_year).toEqual({ value: 1985, modifier: "EQUALS" });
    expect(built.unreceived).toEqual([]);
  });

  it("still writes the name, the country and the studio beside an alias", () => {
    const built = performerQueryInput(SD, {
      alias: "Angie",
      name: "Angela White",
      country: "AU",
      studioId: A,
      page: 1,
      limit: 25,
    });
    expect(built.input.name).toBe("Angela White");
    expect(built.input.country).toEqual({ value: "AU", modifier: "EQUALS" });
    expect(built.input.studio_id).toBe(A);
    expect(built.unreceived).toEqual(["alias"]);
  });

  it("still writes a scene title and code beside an alias", () => {
    const built = sceneQueryInput(SD, {
      alias: "sunset",
      title: "sunset",
      code: "START-614",
      page: 1,
      limit: 25,
    });
    expect(built.input.title).toBe("sunset");
    expect(built.input.code).toEqual({ value: "START-614", modifier: "EQUALS" });
    expect(built.unreceived).toEqual(["alias"]);
  });
});
