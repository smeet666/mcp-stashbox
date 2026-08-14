/**
 * What a second round of real use found.
 *
 * The first round emptied the obvious ground, so these come from the surfaces
 * a caller reaches only once they trust the server enough to chain it: a
 * fingerprint answer carrying several hashes, a card read from the other side
 * of a join, an identifier taken out of one answer and put into the next.
 *
 * Two of them corrupt the signal every other answer rests on. One catalogue
 * counted twice turns two agreeing sources into three, and a count of what
 * matched nothing reported as zero turns "I could not identify two of your
 * files" into "I identified them all".
 */

import { describe, expect, it } from "vitest";

import { consolidate, type Reading } from "../../src/answer/card.js";
import { renderCard } from "../../src/answer/render.js";
import { readPerformer } from "../../src/stashbox/read.js";
import { instanceById } from "../../src/stashbox/instances.js";

const A = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const B = "019fec3f-1bb1-7383-8782-ea0e678f6de0";
const SD = instanceById("stashdb")!;

const reading = (source: string, record: Record<string, unknown>): Reading => ({
  source,
  id: `${source}:${A}`,
  state: "answered",
  record,
});

/* ------------------------------------------ one catalogue, counted once */

describe("a catalogue that answered twice is one catalogue", () => {
  it("is named once among those that agree", () => {
    // Two hashes reaching one record on one catalogue is two matches and one
    // reading. Counted twice, two agreeing catalogues read as three, and the
    // card's own note calls agreement evidence of its own.
    const card = consolidate({
      readings: [
        reading("stashdb", { title: "Bunny Mash" }),
        reading("stashdb", { title: "Bunny Mash" }),
        reading("tpdb", { title: "Bunny Mash" }),
      ],
      prefer: ["stashdb", "tpdb"],
      scalars: ["title"],
      lists: [],
      perSource: [],
    });
    expect((card.fields.title as { agreed_by: string[] }).agreed_by).toEqual(["stashdb", "tpdb"]);
    expect(card.read_from).toEqual(["stashdb", "tpdb"]);
    expect(card.held_by.filter((one) => one.source === "stashdb")).toHaveLength(1);
  });
});

/* ------------------------------------- a link this client cannot follow */

describe("a link a catalogue publishes to a record elsewhere", () => {
  it("is told apart from no link at all when it carries no identifier", () => {
    const read = readPerformer(
      {
        id: A,
        name: "Riley Reid",
        deleted: false,
        urls: [{ url: "https://theporndb.net/performers/riley-reid", site: { name: "ThePornDB" } }],
      },
      SD,
      "2026-08-14T00:00:00.000Z",
    );
    // The link is written, under the category these catalogues keep for it.
    // It names the record by a slug, which this client cannot address. Saying
    // nobody wrote it states something the record contradicts on its face.
    expect(read.record?.alsoHeldAt).toEqual([]);
    expect(read.record?.linkedUnfollowed).toEqual([{ source: "tpdb", url: expect.any(String) }]);
  });

  it("carries the identifier where the link names one", () => {
    const read = readPerformer(
      {
        id: A,
        name: "Riley Reid",
        deleted: false,
        urls: [{ url: `https://theporndb.net/performers/${B}`, site: { name: "ThePornDB" } }],
      },
      SD,
      "2026-08-14T00:00:00.000Z",
    );
    expect(read.record?.alsoHeldAt).toEqual([{ source: "tpdb", id: `tpdb:${B}` }]);
    expect(read.record?.linkedUnfollowed ?? []).toEqual([]);
  });
});

/* ------------------------------- a block a reader can read */

describe("a block of measurements", () => {
  it("is printed rather than named as a thing living in the payload", () => {
    const card = consolidate({
      readings: [
        reading("stashdb", {
          appearance: { ethnicity: "CAUCASIAN", eyeColor: "GREEN", heightCm: 160, tattoos: [] },
        }),
      ],
      prefer: ["stashdb"],
      scalars: ["appearance"],
      lists: [],
      perSource: [],
    });
    const said = renderCard(card, "performer").text;
    expect(said).toContain("CAUCASIAN");
    expect(said).toContain("160");
    expect(said).not.toContain("carries in its payload");
  });

  it("reads as one reading where two catalogues published the same one", () => {
    const held = { ethnicity: "CAUCASIAN", eyeColor: "GREEN", heightCm: 160, tattoos: [] };
    const card = consolidate({
      readings: [reading("stashdb", { appearance: held }), reading("tpdb", { appearance: held })],
      prefer: ["stashdb", "tpdb"],
      scalars: ["appearance"],
      lists: [],
      perSource: [],
    });
    // Rendered through a placeholder, two identical blocks read as a
    // disagreement between the catalogues about a person's body.
    expect((card.fields.appearance as { disagreed?: unknown }).disagreed).toBeUndefined();
    expect(renderCard(card, "performer").text).not.toContain("says");
  });
});

/* ------------------------------ a catalogue nobody asked did not fail */

describe("a preferred catalogue that is missing from an answer", () => {
  it("is said to have been unasked where nobody asked it", () => {
    const card = consolidate({
      readings: [
        { source: "stashdb", state: "absent", reason: "No key is configured for StashDB." },
        reading("tpdb", { title: "A" }),
      ],
      prefer: ["stashdb", "tpdb"],
      scalars: ["title"],
      lists: [],
      perSource: [],
    });
    const said = card.notes.join(" ");
    // Not asked and could not answer are two of the three states this server
    // exists to keep apart.
    expect(said).not.toContain("did not answer");
    expect(said).toContain("was never asked");
  });
});
