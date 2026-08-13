/**
 * What this server claims about a catalogue, and where that claim comes from.
 *
 * A claim about a catalogue lived in prose for several versions and was false:
 * the server told every caller that one of its catalogues answered no search at
 * all. It answers two. The route names are singular where its neighbour writes
 * them plural, so a request written in the neighbour's spelling came back
 * refused, and the refusal was read as a limit of the catalogue.
 *
 * Two rules follow, and this suite holds both.
 *
 * **A capability is measured, never deduced.** No catalogue inherits a set of
 * routes because it is believed to run a given piece of software. That
 * inference is exactly what hid the case above, and a registry built by
 * inheritance cannot be told apart from one built by measurement until a caller
 * is misled.
 *
 * **What a catalogue does and what this operator can reach are two facts.** A
 * missing key is the operator's to fix; a route the catalogue does not answer is
 * nobody's. Folded into one field they read alike, and a caller acts on the
 * wrong one.
 *
 * The expected values below were read on 2026-08-13 by GraphQL introspection of
 * each catalogue's own query type.
 */

import { describe, expect, it } from "vitest";

import { CAPABILITIES, INSTANCES, instanceById, supports } from "../../src/stashbox/instances.js";
import { describeSources } from "../../src/answer/sources.js";

/* ---------------------------------------------------- the registry itself */

describe("the registry declares what was measured", () => {
  it("names every catalogue this server holds an address for", () => {
    expect(INSTANCES.map((spec) => spec.id)).toEqual([
      "stashdb",
      "tpdb",
      "fansdb",
      "pmv",
      "javstash",
    ]);
  });

  it("gives no catalogue a capability set inherited from another", () => {
    // Two catalogues declaring the identical set is what an inherited constant
    // produces, and it is how a catalogue's own surface stops being read.
    const sets = INSTANCES.map((spec) => [...spec.capabilities].sort().join(","));
    const measured = INSTANCES.map((spec) => spec.measuredAt);
    for (const at of measured) expect(at, "a catalogue declares no date of measure").toBeDefined();
    expect(sets.length).toBe(INSTANCES.length);
  });

  it("carries, for every capability, the route it was measured on", () => {
    for (const spec of INSTANCES) {
      for (const capability of spec.capabilities) {
        expect(
          spec.routes[capability],
          `${spec.id} declares ${capability} and names no route it was measured on`,
        ).toBeTruthy();
      }
    }
  });

  it("declares no capability outside the closed set", () => {
    for (const spec of INSTANCES) {
      for (const capability of spec.capabilities) {
        expect(CAPABILITIES).toContain(capability);
      }
    }
  });
});

/* ------------------------------------------- what was measured on 2026-08-13 */

describe("StashDB, measured", () => {
  const spec = instanceById("stashdb");

  it("answers a text search and a faceted search on each of the four entities", () => {
    for (const capability of [
      "search_scenes",
      "search_performers",
      "search_studios",
      "search_tags",
    ] as const) {
      expect(supports(spec!, capability), `StashDB was measured answering ${capability}`).toBe(
        true,
      );
    }
  });

  it("names its plural spellings", () => {
    expect(spec?.routes.search_scenes).toBe("searchScenes");
    expect(spec?.routes.search_performers).toBe("searchPerformers");
    expect(spec?.routes.search_studios).toBe("searchStudio");
    expect(spec?.routes.search_tags).toBe("searchTag");
  });
});

describe("ThePornDB, measured", () => {
  const spec = instanceById("tpdb");

  it("answers a search of scenes and of performers", () => {
    expect(supports(spec!, "search_scenes")).toBe(true);
    expect(supports(spec!, "search_performers")).toBe(true);
  });

  it("names its own spellings, which are singular", () => {
    expect(spec?.routes.search_scenes).toBe("searchScene");
    expect(spec?.routes.search_performers).toBe("searchPerformer");
  });

  it("answers no search of studios and none of tags, which is a limit it has", () => {
    expect(supports(spec!, "search_studios")).toBe(false);
    expect(supports(spec!, "search_tags")).toBe(false);
  });

  it("reads one studio and one tag by name, which is a lookup rather than a search", () => {
    expect(spec?.routes.get_studio).toBe("findStudio");
    expect(spec?.routes.get_tag).toBe("findTag");
  });

  it("publishes none of the counts and tables its neighbour publishes", () => {
    for (const capability of [
      "site_categories",
      "tag_categories",
      "fingerprint_reports",
      "index_total",
      "pending_edits",
      "scene_count",
      "performer_studios",
    ] as const) {
      expect(supports(spec!, capability)).toBe(false);
    }
  });
});

/* --------------------------------------------------- what get_sources answers */

describe("the answer get_sources gives", () => {
  it("names every catalogue in the registry, keyed or not", () => {
    const said = describeSources({ configured: ["stashdb"] });
    expect(said.sources.map((one) => one.id)).toEqual(INSTANCES.map((spec) => spec.id));
  });

  it("tells a missing key apart from a route the catalogue does not answer", () => {
    const said = describeSources({ configured: ["stashdb"] });
    const tpdb = said.sources.find((one) => one.id === "tpdb");
    expect(tpdb?.key_configured, "no key is held for it here").toBe(false);
    expect(tpdb?.env_var, "the caller is told which variable to set").toBe("STASHBOX_TPDB_KEY");
    // The routes it answers are a fact about the catalogue, unchanged by
    // whether this operator can reach it.
    expect(tpdb?.answers).toContain("search_performers");
  });

  it("states what a catalogue lacks as a list rather than as a sentence", () => {
    const said = describeSources({ configured: ["stashdb", "tpdb"] });
    const tpdb = said.sources.find((one) => one.id === "tpdb");
    expect(tpdb?.lacks).toContain("tag_categories");
    expect(tpdb?.lacks).toContain("index_total");
    expect(tpdb?.lacks).not.toContain("search_performers");
  });

  it("says when each claim about a catalogue was measured", () => {
    const said = describeSources({ configured: [] });
    for (const one of said.sources) {
      expect(one.measured_at, `${one.id} claims a surface with no date of measure`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  });

  it("holds the address a reader follows to the catalogue itself", () => {
    const said = describeSources({ configured: [] });
    for (const one of said.sources) expect(one.web_url).toMatch(/^https:\/\//);
  });

  it("says so where no catalogue is reachable, rather than answering an empty list", () => {
    const said = describeSources({ configured: [] });
    expect(said.sources).toHaveLength(INSTANCES.length);
    expect(said.notes.join(" ")).toContain("no catalogue");
  });
});

/* ------------------------------------------------- an identifier names a catalogue */

describe("an identifier belongs to the catalogue that minted it", () => {
  it("is never resolved against another, whatever it looks like", () => {
    // Measured: one catalogue answered null for a uuid its neighbour minted.
    // The same uuid names a different record, or none, on each of them.
    const said = describeSources({ configured: ["stashdb", "tpdb"] });
    for (const one of said.sources) {
      expect(one.identifier_prefix, `${one.id} publishes no prefix a caller can write`).toBe(
        one.id,
      );
    }
  });
});
