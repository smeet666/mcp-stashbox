/**
 * What kind of evidence stands behind each claim this server publishes.
 *
 * A schema and an answer are two different facts about a catalogue. Reading a
 * catalogue's GraphQL schema says what it declares: the route names it
 * publishes, the fields a record type carries, the shape a search answers in.
 * Putting a request to it says what it answers: rows, or a refusal. A table
 * built from the first and published as the second tells a caller that a call
 * has been exercised when nothing has, and the caller plans a session on it.
 *
 * Three of the five catalogues here have never been put a request, because this
 * install holds no key for them. Their capabilities were read from their own
 * endpoints by introspection, which is evidence, of the first kind. This suite
 * holds that the published table names which kind stands behind each row, and
 * that the day beside a row is the day that evidence was gathered.
 */

import { describe, expect, it } from "vitest";

import { INSTANCES, instanceById } from "../../src/stashbox/instances.js";
import { describeSources } from "../../src/answer/sources.js";

describe("the registry names its evidence", () => {
  it("gives every catalogue one of the two kinds and no third", () => {
    for (const spec of INSTANCES) {
      expect(
        ["measured_answering", "declared_in_schema"],
        `${spec.id} publishes a table resting on nothing named`,
      ).toContain(spec.evidence);
    }
  });

  it("calls a catalogue measured answering only where requests were put to it", () => {
    // A key is held for two of these catalogues, and the live suite puts every
    // capability they declare to them. The other three have been read by
    // introspection alone, so their tables rest on a declaration.
    const answered = INSTANCES.filter((spec) => spec.evidence === "measured_answering");
    expect(answered.map((spec) => spec.id)).toEqual(["stashdb", "tpdb"]);
    const declared = INSTANCES.filter((spec) => spec.evidence === "declared_in_schema");
    expect(declared.map((spec) => spec.id)).toEqual(["fansdb", "pmv", "javstash"]);
  });

  it("dates the evidence it names, on every catalogue", () => {
    for (const spec of INSTANCES) {
      expect(spec.measuredAt, `${spec.id} names evidence with no day behind it`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  });

  it("names the schema read for a catalogue no request was put to", () => {
    // The three unkeyed catalogues were introspected on their own endpoints,
    // and the day of that reading is the day their rows carry.
    for (const id of ["fansdb", "pmv", "javstash"]) {
      expect(instanceById(id)?.measuredAt, `${id} carries a day older than its own reading`).toBe(
        "2026-08-14",
      );
    }
  });
});

describe("the answer get_sources gives names its evidence", () => {
  it("carries the kind on every row", () => {
    const said = describeSources({ configured: ["stashdb"] });
    for (const one of said.sources) {
      const spec = instanceById(one.id);
      expect(one.evidence, `${one.id} publishes a table with no evidence named`).toBe(
        spec?.evidence,
      );
    }
  });

  it("says of a catalogue read by introspection that no request was put to it", () => {
    const said = describeSources({ configured: ["stashdb", "tpdb"] });
    for (const spec of INSTANCES.filter((one) => one.evidence === "declared_in_schema")) {
      const note = said.notes.find((line) => line.startsWith(spec.name));
      expect(
        note,
        `${spec.id} publishes 18 capabilities and says nothing about where they come from`,
      ).toBeDefined();
      expect(note).toContain("no request");
      expect(note).toContain(spec.measuredAt);
    }
  });

  it("names the faceted search of such a catalogue as declared rather than seen", () => {
    // Whether a faceted route applies the narrowings written to it is a thing
    // a request shows and a schema cannot, so a catalogue read by
    // introspection alone carries that word on the same footing as the rest.
    const said = describeSources({ configured: [] });
    for (const spec of INSTANCES.filter((one) => one.evidence === "declared_in_schema")) {
      const one = said.sources.find((row) => row.id === spec.id);
      expect(one?.answers).toContain("faceted_search");
      const note = said.notes.find((line) => line.startsWith(spec.name));
      expect(note).toContain("faceted_search");
    }
  });

  it("claims no measurement of answering over the whole table", () => {
    // One sentence covering every row as measured answering is the claim this
    // file exists to remove: it is true of two catalogues and false of three.
    const said = describeSources({ configured: [] });
    const covering = said.notes.filter(
      (line) => !INSTANCES.some((spec) => line.startsWith(spec.name)),
    );
    for (const line of covering) {
      expect(line, "a note tells every reader their table was measured answering").not.toContain(
        "measured answering",
      );
    }
  });

  it("leaves a catalogue put to the test saying so", () => {
    const said = describeSources({ configured: ["stashdb"] });
    const stashdb = said.sources.find((one) => one.id === "stashdb");
    expect(stashdb?.evidence).toBe("measured_answering");
    expect(stashdb?.answers).toContain("search_scenes");
  });
});
