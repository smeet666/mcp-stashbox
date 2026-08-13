/**
 * One fault, one sentence, wherever the fault is met.
 *
 * A refusal is what a caller reads to know what to write instead, and two
 * arguments refusing the same fault in different words read as two different
 * faults. Worse, a message written for one bound and reused for its opposite
 * states something the input does not carry: a list of six catalogues told it is
 * empty sends a caller to add what they already wrote too much of.
 *
 * The same holds for a qualification. A block that lost rows says so the one
 * way, whatever block it is and whichever record it hangs off, since a wording
 * that varies reads as a loss of another kind.
 */

import { describe, expect, it } from "vitest";

import { catalogues, identifiers, severalOf } from "../../src/tools/arguments.js";
import { renderPerformer } from "../../src/tools/getPerformer.js";
import { renderScene } from "../../src/tools/getScene.js";
import { fingerprintList } from "../../src/tools/findByFingerprint.js";
import { renderPerformerRows } from "../../src/tools/searchPerformers.js";
import { blockLoss } from "../../src/answer/records.js";
import type { PerformerRecord, RowsResult, SceneRecord } from "../../src/types.js";

const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const RETRIEVED_AT = "2026-08-11T00:00:00.000Z";

/** The messages of a refusal, or a failure saying the input was accepted. */
function refusal(schema: { safeParse: (value: unknown) => unknown }, input: unknown): string {
  const result = schema.safeParse(input) as
    { success: true } | { success: false; error: { issues: { message: string }[] } };
  if (result.success) throw new Error("the schema accepted an input it was expected to refuse");
  return result.error.issues.map((issue) => issue.message).join("\n");
}

describe("a bound is refused in the words of the bound it broke", () => {
  it("tells a list of catalogues written empty that it names none", () => {
    const said = refusal(catalogues("sources"), []);
    expect(said).toContain("[invalid_input]");
    expect(said).toContain("asks none of them");
  });

  it("tells a list of catalogues written too long what it holds too many of", () => {
    const said = refusal(catalogues("sources"), [
      "stashdb",
      "tpdb",
      "fansdb",
      "pmv",
      "javstash",
      "stashdb",
    ]);
    expect(said).toContain("[invalid_input]");
    expect(said).not.toContain("asks none of them");
    expect(said).toContain("names a catalogue twice");
  });

  it("tells a list of blocks written empty that it asks for none", () => {
    const said = refusal(severalOf("sections", "the blocks", ["basic", "images"]), []);
    expect(said).toContain("asks for no block at all");
  });

  it("tells a list of blocks written too long what it holds too many of", () => {
    const said = refusal(severalOf("sections", "the blocks", ["basic", "images"]), [
      "basic",
      "images",
      "basic",
    ]);
    expect(said).not.toContain("asks for no block at all");
    expect(said).toContain("names a block twice");
  });
});

describe("two arguments taking a list refuse its bounds alike", () => {
  it("says of an empty list of hashes what it says of an empty list of identifiers", () => {
    const hashes = refusal(fingerprintList, []);
    const ids = refusal(identifiers("performer_ids"), []);
    expect(hashes).toContain("was written as an empty list");
    expect(ids).toContain("was written as an empty list");
    expect(hashes).toContain("nothing was asked about");
  });
});

/* ------------------------------------------------- one loss, one sentence */

describe("a block that lost rows says so the one way", () => {
  it("is written once and reads the same for every block", () => {
    expect(blockLoss(3, "fingerprint", "StashDB")).toBe(
      (blockLoss(3, "image", "StashDB") ?? "").replace("image", "fingerprint"),
    );
  });

  it("says nothing where the block lost nothing", () => {
    expect(blockLoss(0, "image", "StashDB")).toBeNull();
    expect(blockLoss(undefined, "image", "StashDB")).toBeNull();
  });

  it("words a scene's loss and a performer's loss identically", () => {
    const scene: SceneRecord = {
      id: `stashdb:${UUID}`,
      source: "stashdb",
      sourceUrl: `https://catalogue.invalid/stashdb/scenes/${UUID}`,
      retrievedAt: RETRIEVED_AT,
      status: "established",
      pendingEdits: 0,
      title: "A Quiet Afternoon",
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
      images: [],
      imagesSkipped: 2,
      created: null,
      updated: null,
    };
    const performer: PerformerRecord = {
      id: `stashdb:${UUID}`,
      source: "stashdb",
      sourceUrl: `https://catalogue.invalid/stashdb/performers/${UUID}`,
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
      images: [],
      imagesSkipped: 2,
      created: null,
      updated: null,
    };
    const said = blockLoss(2, "image", "StashDB") ?? "";
    expect(said).not.toBe("");
    expect(renderScene(scene, ["basic", "images"]).text).toContain(said);
    expect(renderPerformer(performer, ["basic", "images"]).text).toContain(said);
  });
});

/* --------------------------------------------- one number, one preposition */

describe("a count of scenes names the catalogue it counts on the one way", () => {
  it("reads alike on a record and on the row of a search", () => {
    const record: PerformerRecord = {
      id: `stashdb:${UUID}`,
      source: "stashdb",
      sourceUrl: `https://catalogue.invalid/stashdb/performers/${UUID}`,
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
      sceneCount: 41,
      urls: [],
      created: null,
      updated: null,
    };
    const rows: RowsResult<PerformerRecord> = {
      rows: [record],
      perSource: [{ source: "stashdb", name: "StashDB", state: "answered", count: 1 }],
      ordering: "in StashDB's own order",
    };
    expect(renderPerformer(record, ["basic"]).text).toContain("Scenes indexed on StashDB: 41");
    expect(renderPerformerRows(rows, null).text).toContain("Scenes indexed on StashDB: 41");
  });
});
