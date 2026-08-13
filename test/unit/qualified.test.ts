/**
 * The sentences an answer owes once it is otherwise correct.
 *
 * Nothing here is about a catalogue lying. Each case is a qualification that
 * was missing, mis-conditioned, or true of the answer rather than of the
 * question: a reason naming an argument nobody wrote, a policy reported as
 * whatever happened to come back, a catalogue that failed vanishing out of a
 * table instead of being named in it.
 *
 * They matter for one reason. A reader who cannot tell a policy from an outcome
 * cannot tell whether to change the policy, and a reader handed a reason that
 * does not fit their call stops trusting the reasons.
 */

import { describe, expect, it } from "vitest";

import { consolidate, type Reading } from "../../src/answer/card.js";
import { StashboxClient } from "../../src/stashbox/client.js";
import { renderRows } from "../../src/answer/render.js";
import type { CardValue } from "../../src/types.js";

const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";

/** A client that reaches no catalogue and hands back what it would have sent. */
function watching(answer?: unknown) {
  const sent: string[] = [];
  const client = new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere", tpdb: "another" },
    transport: {
      request: async (_spec, _apiKey, body) => {
        sent.push(JSON.stringify(body.variables ?? {}));
        if (answer === undefined) throw new Error("this test reads the request");
        return answer as never;
      },
    },
    config: { minIntervalMs: 1000 },
  });
  return { client, sent };
}

/* ------------------------------------------------- a reason that fits the call */

describe("a catalogue left out is told why in the words of this call", () => {
  it("asks the catalogue where the caller narrowed on nothing at all", async () => {
    const { client } = watching();
    const read = await client.searchScenes({});
    const tpdb = read.data.perSource.find((one) => one.source === "tpdb");
    // A question narrowed on nothing asks for a page of the whole index, which
    // every catalogue answers. Leaving one out for a narrowing nobody wrote
    // states something about the call that the call does not carry.
    expect(tpdb?.state).not.toBe("absent");
    expect(tpdb?.reason ?? "").not.toContain("narrowed on typed arguments");
  });

  it("names the narrowing where the caller did write one", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ title: "sunset" });
    const tpdb = read.data.perSource.find((one) => one.source === "tpdb");
    expect(tpdb?.reason ?? "").toContain("narrowed on typed arguments");
  });
});

/* ------------------------------------------------ a policy, and what came back */

const answered = (source: string, record: Record<string, unknown>): Reading => ({
  source,
  id: `${source}:${UUID}`,
  state: "answered",
  record,
});

const SHAPE = { scalars: ["name"], lists: ["aliases"], perSource: ["sceneCount"] } as const;

describe("a card tells the policy apart from what came back", () => {
  it("states the order that was written, whether or not every catalogue answered", () => {
    const one = consolidate({
      readings: [answered("stashdb", { name: "A", sceneCount: 3 })],
      prefer: ["tpdb", "stashdb"],
      ...SHAPE,
    });
    // The policy preferred one catalogue and the other is what answered. A
    // card that reported only the answer would read as a policy nobody wrote.
    expect(one.preferred).toEqual(["tpdb", "stashdb"]);
    expect(one.read_from).toEqual(["stashdb"]);
  });
});

describe("a count names every catalogue asked", () => {
  it("keeps a catalogue that failed in the table rather than dropping it", () => {
    const card = consolidate({
      readings: [
        answered("stashdb", { name: "A", sceneCount: 41 }),
        { source: "tpdb", id: `tpdb:${UUID}`, state: "failed", error: "timeout" },
      ],
      prefer: ["stashdb", "tpdb"],
      ...SHAPE,
    });
    const counts = card.counts.sceneCount ?? [];
    expect(counts.map((one) => one.source)).toEqual(["stashdb", "tpdb"]);
    // A catalogue that could not answer has no count, which is a different
    // fact from a catalogue that publishes none.
    expect(counts.find((one) => one.source === "tpdb")?.value).toBeNull();
    expect(counts.find((one) => one.source === "tpdb")?.state).toBe("failed");
  });
});

describe("a value nobody published claims no agreement", () => {
  it("names no catalogue where none of them carried the field", () => {
    const card = consolidate({
      readings: [answered("stashdb", { name: null }), answered("tpdb", { name: null })],
      prefer: ["stashdb", "tpdb"],
      ...SHAPE,
    });
    // Agreeing takes two readings of something. Two silences agree on nothing.
    expect((card.fields.name as CardValue).agreed_by).toEqual([]);
  });
});

/* --------------------------------------------- what the prose owes the payload */

describe("the prose of a search carries what its payload carries", () => {
  const rows = {
    rows: [],
    ordering: "in the order the catalogue that answered holds them",
    perSource: [
      {
        source: "stashdb",
        name: "StashDB",
        state: "answered",
        count: 25,
        skipped: 5,
        indexTotal: 4312,
      },
    ],
  };

  it("states the rows a catalogue answered with that could not be read", () => {
    const said = renderRows(rows as never, "scene", []).text;
    expect(said).toContain("5");
    expect(said.toLowerCase()).toContain("could not be read");
  });

  it("states what the catalogue's own index holds for the question", () => {
    const said = renderRows(rows as never, "scene", []).text;
    expect(said).toContain("4312");
  });
});

/* ------------------------------------------------------------- a folded record */

describe("a record its catalogue folded", () => {
  it("names a successor only where the catalogue publishes one", () => {
    const withdrawn = consolidate({
      readings: [answered("stashdb", { name: "A", status: "deleted" })],
      prefer: ["stashdb"],
      ...SHAPE,
    });
    // A withdrawn scene names no record in its place, so a note promising one
    // sends a reader to an identifier that does not exist.
    expect(withdrawn.notes.join(" ")).not.toContain("under another identifier");
    expect(withdrawn.notes.join(" ")).toContain("withdrawn");

    const merged = consolidate({
      readings: [
        answered("stashdb", { name: "A", status: "merged", mergedInto: `stashdb:${UUID}` }),
      ],
      prefer: ["stashdb"],
      scalars: ["name", "mergedInto"],
      lists: ["aliases"],
      perSource: ["sceneCount"],
    });
    expect(merged.notes.join(" ")).toContain(`stashdb:${UUID}`);
  });
});
