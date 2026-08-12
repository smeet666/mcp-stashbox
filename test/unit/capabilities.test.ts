/**
 * What each catalogue was measured to publish.
 *
 * Every entry here was established by asking the catalogues themselves, and
 * each one exists because a field one publishes and another leaves empty comes
 * back as a null that reads like an answer. Without a test, a capability is a
 * line in a registry that a rewrite drops in silence and no answer misses until
 * a caller reads a silence as a fact.
 *
 * The rule these serve: a catalogue that was never asked something says so, and
 * what a catalogue publishes is read from what it declares rather than from one
 * record's null.
 */

import { describe, expect, it } from "vitest";

import { CAPABILITIES, INSTANCES, instanceById, supports } from "../../src/stashbox/instances.js";
import type { Capability, InstanceSpec } from "../../src/stashbox/instances.js";

function spec(id: string): InstanceSpec {
  const found = instanceById(id);
  if (!found) throw new Error(`the registry holds no catalogue called '${id}'`);
  return found;
}

/**
 * What the reimplementation was measured not to publish.
 *
 * Each was established against the running catalogue: it answers no search of
 * either kind, attaches no site to a link and no category to a tag, publishes
 * no count beside a page of rows, no count of open edits, no count of the
 * scenes it indexes for a performer and no table of the studios one is credited
 * on, and its fingerprint route searches exact hashes alone.
 */
const NOT_PUBLISHED_BY_THE_REIMPLEMENTATION: readonly Capability[] = [
  "search_scenes",
  "search_performers",
  "site_categories",
  "tag_categories",
  "fingerprint_reports",
  "index_total",
  "pending_edits",
  "perceptual_lookup",
  "scene_count",
  "performer_studios",
];

describe("the registry names every field a catalogue can leave unpublished", () => {
  // A field read on one catalogue and absent on another needs a name here, or
  // the answer has no way to tell a record holding none from a catalogue that
  // was never asked.
  for (const capability of [
    "site_categories",
    "tag_categories",
    "fingerprint_reports",
    "index_total",
    "pending_edits",
    "perceptual_lookup",
    "scene_count",
    "performer_studios",
  ] as const) {
    it(`declares '${capability}'`, () => {
      expect(
        CAPABILITIES as readonly string[],
        `'${capability}' is a field one catalogue publishes and another does not, and the registry names it nowhere`,
      ).toContain(capability);
    });
  }
});

describe("the reimplementation is held to the smaller surface it was measured to have", () => {
  for (const capability of NOT_PUBLISHED_BY_THE_REIMPLEMENTATION) {
    it(`does not claim '${capability}' for it`, () => {
      expect(
        supports(spec("tpdb"), capability),
        `the registry claims tpdb offers '${capability}', so an answer would read its silence there as a fact about a record`,
      ).toBe(false);
    });
  }

  it("claims only the three routes it does answer", () => {
    expect([...spec("tpdb").capabilities].sort()).toEqual(
      ["find_by_fingerprint", "get_performer", "get_scene"].sort(),
    );
  });
});

describe("the catalogues running the published software offer all of it", () => {
  for (const instance of INSTANCES.filter((entry) => entry.dialect === "strict")) {
    it(`${instance.id} offers every capability the registry names`, () => {
      const missing = CAPABILITIES.filter((capability) => !supports(instance, capability));
      expect(
        missing,
        `${instance.id} runs the published software and the registry withholds ${missing.join(", ")} from it`,
      ).toEqual([]);
    });
  }
});
