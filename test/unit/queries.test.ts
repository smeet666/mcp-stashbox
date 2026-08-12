/**
 * What this client asks a catalogue for, read off the documents themselves.
 *
 * A document is a string, so every case here asks one question of it: is this
 * field selected, and under which of the record's parts. Two registers decide
 * that, and they decide different things. **The registry decides which fields
 * are asked for**, because a catalogue publishing no table of site categories
 * refuses a request selecting one. **The dialect decides how a request is
 * written**. A field asked on the dialect would be asked of the wrong
 * catalogues the day a catalogue changed one without the other, so every case
 * below builds its catalogues by hand and varies one register at a time.
 *
 * The specs are invented rather than taken from the registry, so a case states
 * what the rule is instead of what today's five catalogues happen to declare.
 *
 * Nothing leaves this file: no catalogue is asked and no document is sent.
 */

import { describe, expect, it } from "vitest";

import type { Capability, Dialect, InstanceSpec } from "../../src/stashbox/instances.js";
import {
  fingerprintRequest,
  findPerformerRequest,
  findSceneRequest,
  performerSelection,
  queryPerformersRequest,
  queryScenesRequest,
  sceneSelection,
  searchScenesRequest,
} from "../../src/stashbox/queries.js";

/* ----------------------------------------------------------------- fixtures */

const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const MD5 = "0badc0ffee1122334455667788990011";

/** The routes every catalogue in this file answers, so a case varies one field alone. */
const ROUTES: Capability[] = [
  "search_scenes",
  "search_performers",
  "get_scene",
  "get_performer",
  "find_by_fingerprint",
];

/** A catalogue answering every route, and whatever else a case declares of it. */
function specWith(extra: readonly Capability[], dialect: Dialect = "strict"): InstanceSpec {
  return {
    id: "stashdb",
    name: "A Catalogue",
    endpoint: "https://example.test/graphql",
    webBase: "https://example.test",
    envVar: "STASHBOX_TEST_KEY",
    capabilities: [...ROUTES, ...extra],
    dialect,
  };
}

const DIALECTS: Dialect[] = ["strict", "loose"];

/* ------------------------------------------------------- reading a document */

/** Whether a selection asks for a field by that exact name. */
function asks(selection: string, name: string): boolean {
  return new RegExp(`(^|[\\s{,])${name}(?![A-Za-z0-9_])`).test(selection);
}

/**
 * What a field's own braces enclose, or the empty string where the field is not
 * selected at all. The braces are balanced, so a nested block never ends the
 * one holding it.
 */
function block(selection: string, name: string): string {
  const opening = new RegExp(`(^|[\\s{,])${name}(?![A-Za-z0-9_])(\\s*\\([^()]*\\))?\\s*\\{`);
  const found = opening.exec(selection);
  if (found === null) return "";
  let depth = 1;
  let out = "";
  for (let index = found.index + found[0].length; index < selection.length; index += 1) {
    const character = selection[index]!;
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return out;
    }
    out += character;
  }
  return out;
}

/** The fields asked for on the record itself, with every nested block removed. */
function ownFields(selection: string): string {
  let depth = 0;
  let out = "";
  for (const character of selection) {
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      continue;
    }
    if (depth === 0) out += character;
  }
  return out;
}

/* ------------------------- 1. the registry decides, and never the dialect */

interface Conditional {
  capability: Capability;
  what: string;
  /** Where the field sits, read off a selection built for a catalogue. */
  selects: (spec: InstanceSpec) => boolean;
}

const CONDITIONALS: Conditional[] = [
  {
    capability: "site_categories",
    what: "a site's category",
    selects: (spec) =>
      asks(block(block(sceneSelection(spec, ["basic"]), "urls"), "site"), "category"),
  },
  {
    capability: "tag_categories",
    what: "a tag's category",
    selects: (spec) => asks(block(sceneSelection(spec, ["basic"]), "tags"), "category"),
  },
  {
    capability: "fingerprint_reports",
    what: "a fingerprint's reports",
    selects: (spec) =>
      asks(block(sceneSelection(spec, ["basic", "fingerprints"]), "fingerprints"), "reports"),
  },
  {
    capability: "pending_edits",
    what: "the status of an open edit",
    selects: (spec) => asks(block(sceneSelection(spec, ["basic"]), "edits"), "status"),
  },
];

describe("which fields are asked for is decided by the registry", () => {
  for (const conditional of CONDITIONALS) {
    for (const dialect of DIALECTS) {
      it(`asks for ${conditional.what} on a ${dialect} catalogue declaring '${conditional.capability}'`, () => {
        expect(
          conditional.selects(specWith([conditional.capability], dialect)),
          `a catalogue declaring '${conditional.capability}' was never asked for ${conditional.what}, so the field comes back empty and the emptiness reads as an answer`,
        ).toBe(true);
      });

      it(`asks for no ${conditional.what} on a ${dialect} catalogue that declares nothing of the kind`, () => {
        expect(
          conditional.selects(specWith([], dialect)),
          `a catalogue declaring no '${conditional.capability}' was asked for ${conditional.what}, which is a request it refuses outright`,
        ).toBe(false);
      });
    }

    it(`decides ${conditional.what} alike on both dialects`, () => {
      const strict = conditional.selects(specWith([conditional.capability], "strict"));
      const loose = conditional.selects(specWith([conditional.capability], "loose"));

      expect(
        loose,
        `${conditional.what} was asked for on one dialect and not the other, so the field is decided by how a request is written rather than by what the catalogue publishes`,
      ).toBe(strict);
    });
  }
});

/* ------------------ 2. the fields an answer depends on are always asked for */

describe("the fields an answer depends on are always asked for", () => {
  /** A catalogue declaring the routes and nothing beyond them. */
  const BARE = specWith([]);

  const places: { what: string; selection: () => string }[] = [
    { what: "a scene", selection: () => ownFields(sceneSelection(BARE, ["basic"])) },
    {
      what: "a studio",
      selection: () => ownFields(block(sceneSelection(BARE, ["basic"]), "studio")),
    },
    {
      what: "a studio's parent",
      selection: () => ownFields(block(block(sceneSelection(BARE, ["basic"]), "studio"), "parent")),
    },
    { what: "a tag", selection: () => ownFields(block(sceneSelection(BARE, ["basic"]), "tags")) },
    {
      what: "a credited performer",
      selection: () =>
        ownFields(block(block(sceneSelection(BARE, ["basic"]), "performers"), "performer")),
    },
    { what: "a performer", selection: () => ownFields(performerSelection(BARE, ["basic"])) },
  ];

  for (const place of places) {
    it(`asks ${place.what} whether it was deleted`, () => {
      const selection = place.selection();

      expect(
        selection,
        `${place.what} is selected nowhere in the document, so the rule below is not measured`,
      ).not.toBe("");
      expect(
        asks(selection, "deleted"),
        `${place.what} is named in an answer without being asked what its identifier addresses now, so a record the catalogue no longer holds as itself is printed as one it does`,
      ).toBe(true);
    });
  }

  it("asks a performer which record it was folded into, and which resolve to it", () => {
    const selection = ownFields(performerSelection(specWith([]), ["basic"]));

    expect(
      asks(selection, "merged_into_id"),
      "a performer is read without being asked which record it was folded into, so a caller is left with an identifier and nothing to read next",
    ).toBe(true);
    expect(
      asks(selection, "merged_ids"),
      "a performer is read without being asked which identifiers still resolve to it",
    ).toBe(true);
  });
});

/* ------------------------------- 3. a scene is never asked for a successor */

describe("a scene is never asked for a successor", () => {
  it("selects no successor on the scene itself", () => {
    const own = ownFields(sceneSelection(specWith([]), ["basic", "fingerprints", "images"]));

    expect(
      asks(own, "merged_into_id"),
      "a scene was asked which record it was folded into, and these catalogues publish none for one, so the request is refused or the answer is a silence read as an absence",
    ).toBe(false);
    expect(
      asks(own, "merged_ids"),
      "a scene was asked which identifiers were folded into it, and these catalogues publish none for one",
    ).toBe(false);
  });

  it("selects no successor on the scene a document names", () => {
    const document = findSceneRequest(specWith([]), UUID, ["basic"]).query;
    const own = ownFields(block(document, "findScene"));

    expect(own, "the document asks for no findScene, so this rule is not measured").not.toBe("");
    expect(
      asks(own, "merged_into_id"),
      "the document sent for one scene asks which record it was folded into",
    ).toBe(false);
  });
});

/* --------------------------------- 4. a section asked for, and one not asked */

describe("a section not asked for is not requested, and one asked for is", () => {
  const SPEC = specWith(["fingerprint_reports", "performer_studios"]);

  it("asks for no fingerprints and no images where neither section was asked for", () => {
    const selection = sceneSelection(SPEC, ["basic"]);

    expect(
      block(selection, "fingerprints"),
      "a scene was asked for its fingerprints where the caller asked for no such section",
    ).toBe("");
    expect(
      block(selection, "images"),
      "a scene was asked for its images where the caller asked for no such section",
    ).toBe("");
  });

  it("asks for the fingerprints, and them alone, where that section was asked for", () => {
    const selection = sceneSelection(SPEC, ["basic", "fingerprints"]);
    const prints = block(selection, "fingerprints");

    expect(prints, "the fingerprints section was asked for and nothing selects it").not.toBe("");
    expect(
      asks(prints, "hash") && asks(prints, "algorithm"),
      "a fingerprint was asked for without the hash or the algorithm that says what it is",
    ).toBe(true);
    expect(
      block(selection, "images"),
      "asking for the fingerprints brought back the images nobody asked for",
    ).toBe("");
  });

  it("asks for the images, and them alone, where that section was asked for", () => {
    const selection = sceneSelection(SPEC, ["basic", "images"]);

    expect(
      block(selection, "images"),
      "the images section was asked for and nothing selects it",
    ).not.toBe("");
    expect(
      block(selection, "fingerprints"),
      "asking for the images brought back the fingerprints nobody asked for",
    ).toBe("");
  });

  it("carries the section into the document sent for one scene", () => {
    const bare = findSceneRequest(SPEC, UUID, ["basic"]).query;
    const withPrints = findSceneRequest(SPEC, UUID, ["basic", "fingerprints"]).query;

    expect(
      block(bare, "fingerprints"),
      "a document sent for one scene asked for fingerprints no caller asked for",
    ).toBe("");
    expect(
      block(withPrints, "fingerprints"),
      "a document sent for one scene left out the fingerprints the caller asked for",
    ).not.toBe("");
    expect(
      findSceneRequest(SPEC, UUID, ["basic"]).variables?.id,
      "the document names no record to read",
    ).toBe(UUID);
  });

  it("asks a performer for its appearance, its images and its studios only where asked", () => {
    const bare = performerSelection(SPEC, ["basic"]);

    expect(
      asks(ownFields(bare), "ethnicity") || block(bare, "tattoos") !== "",
      "a performer was asked for its appearance where the caller asked for no such section",
    ).toBe(false);
    expect(
      block(bare, "images"),
      "a performer was asked for its images where the caller asked for no such section",
    ).toBe("");
    expect(
      block(bare, "studios"),
      "a performer was asked for its studios where the caller asked for no such section",
    ).toBe("");

    const appearance = performerSelection(SPEC, ["basic", "appearance"]);
    expect(
      asks(ownFields(appearance), "ethnicity"),
      "the appearance section was asked for and nothing selects what it describes",
    ).toBe(true);
    expect(
      block(performerSelection(SPEC, ["basic", "images"]), "images"),
      "the images section was asked for and nothing selects it",
    ).not.toBe("");
    expect(
      block(performerSelection(SPEC, ["basic", "studios"]), "studios"),
      "the studios section was asked for and nothing selects it",
    ).not.toBe("");
  });

  it("selects nothing on the record itself for the scenes crediting a performer", () => {
    expect(
      performerSelection(SPEC, ["basic", "scenes"]),
      "asking for the scenes crediting a performer changed what is selected on the performer, and those scenes are read with a scene query",
    ).toBe(performerSelection(SPEC, ["basic"]));
  });

  it("carries the section into every document that reads scenes", () => {
    const documents: { what: string; bare: string; withPrints: string }[] = [
      {
        what: "the faceted scene query",
        bare: queryScenesRequest(SPEC, { title: "harbour" }, ["basic"]).query,
        withPrints: queryScenesRequest(SPEC, { title: "harbour" }, ["basic", "fingerprints"]).query,
      },
      {
        what: "the full-text scene search",
        bare: searchScenesRequest(SPEC, "harbour", 10, ["basic"]).query,
        withPrints: searchScenesRequest(SPEC, "harbour", 10, ["basic", "fingerprints"]).query,
      },
      {
        what: "the fingerprint lookup",
        bare: fingerprintRequest(SPEC, [{ hash: MD5, algorithm: "MD5" }], ["basic"]).query,
        withPrints: fingerprintRequest(
          SPEC,
          [{ hash: MD5, algorithm: "MD5" }],
          ["basic", "fingerprints"],
        ).query,
      },
      {
        what: "the document sent for one performer",
        bare: findPerformerRequest(SPEC, UUID, ["basic"]).query,
        withPrints: findPerformerRequest(SPEC, UUID, ["basic", "images"]).query,
      },
    ];

    for (const document of documents) {
      const askedFor =
        document.what === "the document sent for one performer" ? "images" : "fingerprints";
      expect(
        block(document.bare, askedFor),
        `${document.what} asked for ${askedFor} no caller asked for`,
      ).toBe("");
      expect(
        block(document.withPrints, askedFor),
        `${document.what} left out the ${askedFor} the caller asked for`,
      ).not.toBe("");
    }
  });
});

/* ------------------------------------- every narrowing a caller can write is sent */

describe("a narrowing a caller writes reaches the catalogue", () => {
  /**
   * The typed narrowings of the performer route, each one an argument this
   * server publishes. One dropped between the argument and the request is a
   * question answered without it, which a caller reads as the answer to what
   * they asked.
   */
  const NARROWINGS = [
    ["name", { name: "Ilva Norrsken" }, "Ilva Norrsken"],
    ["disambiguation", { disambiguation: "the elder" }, "the elder"],
    ["country", { country: "SE" }, "SE"],
    ["performed_with", { performedWith: UUID }, UUID],
    ["studio_id", { studioId: UUID }, UUID],
  ] as const;

  for (const [field, narrowing, written] of NARROWINGS) {
    it(`carries '${field}' into the request it builds`, () => {
      const request = queryPerformersRequest(specWith(["search_performers"]), narrowing);
      const input = (request.variables as { input: Record<string, unknown> }).input;

      expect(
        Object.entries(input).find(([, value]) => value === written)?.[0],
        `'${field}' was written by the caller and reaches the catalogue under no name, so it narrowed nothing`,
      ).toBe(field);
    });
  }
});
