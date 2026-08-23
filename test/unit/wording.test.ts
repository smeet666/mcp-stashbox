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

import { catalogues, severalOf } from "../../src/tools/arguments.js";
import { blockLoss } from "../../src/answer/render.js";

/** The messages of a refusal, or a failure saying the input was accepted. */
function refusal(schema: { safeParse: (value: unknown) => unknown }, input: unknown): string {
  const result = schema.safeParse(input) as
    | { success: true }
    | { success: false; error: { issues: { message: string }[] } };
  if (result.success) {
    throw new Error("the schema accepted an input it was expected to refuse");
  }
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
});

/* --------------------------------------------- one number, one preposition */
