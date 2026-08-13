/**
 * What a reader would wrongly conclude.
 *
 * Every case here comes from someone putting a real question to the running
 * server and reading the answer as a person reads it. They are the cases no
 * static reading found: each one is an answer that is well-formed, internally
 * consistent to a machine, and false to a reader.
 *
 * The common shape is a narrowing that leaves quietly. A filter removed before
 * the request goes out turns a question about one performer into a page of the
 * whole index, and the answer renders that page as what was asked for.
 */

import { describe, expect, it } from "vitest";

import { StashboxClient } from "../../src/stashbox/client.js";
import { renderCard } from "../../src/answer/render.js";
import { consolidate } from "../../src/answer/card.js";

const A = "94ef9c17-82c6-48b0-8dcc-063b69231960";

/**
 * A client that reaches no catalogue and answers a well-formed empty page.
 *
 * The answer has to be readable, since what is under test is the report a
 * catalogue leaves behind rather than the rows it returns.
 */
function watching() {
  const sent: { instance: string; body: string }[] = [];
  const client = new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere", tpdb: "another" },
    transport: {
      request: async (spec, _apiKey, body) => {
        sent.push({ instance: spec.id, body: JSON.stringify(body.variables ?? {}) });
        const named = /(?:query|mutation)\s+\w+[^{]*\{\s*(\w+)/.exec(body.query)?.[1] ?? "";
        const paged = /searchScenes|searchPerformers|query\w+/.test(named);
        const rows = named.toLowerCase().includes("performer")
          ? "performers"
          : named.toLowerCase().includes("studio")
            ? "studios"
            : named.toLowerCase().includes("tag")
              ? "tags"
              : "scenes";
        return (paged ? { [named]: { count: 0, [rows]: [] } } : { [named]: [] }) as never;
      },
    },
  });
  return { client, sent };
}

/* ----------------------------------- a narrowing that names no record here */

describe("a filter written with another catalogue's identifiers", () => {
  it("is never sent as no filter at all", async () => {
    const { client, sent } = watching();
    await client.searchScenes({ performerIds: [`tpdb:${A}`], limit: 3 });
    // The catalogue that minted nothing in the list has nothing to narrow on.
    // Sending the request without the filter asks for a page of its whole
    // index, and the answer renders that page as what was asked for.
    const toStashdb = sent.filter((one) => one.instance === "stashdb");
    for (const one of toStashdb) {
      expect(
        one.body.includes("performers"),
        `a scene search narrowed on a performer reached StashDB with no performer in it: ${one.body}`,
      ).toBe(true);
    }
  });

  it("reports the catalogue as never asked, naming the narrowing", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ performerIds: [`tpdb:${A}`], limit: 3 });
    const stashdb = read.data.perSource.find((one) => one.source === "stashdb");
    expect(stashdb?.state).toBe("absent");
    expect(stashdb?.reason ?? "").toContain("performer_ids");
    expect(stashdb?.narrowingsNamingNoRecord ?? []).toContain("performer_ids");
  });

  it("tells that catalogue apart from one whose route cannot narrow at all", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ performerIds: [`tpdb:${A}`], limit: 3 });
    const tpdb = read.data.perSource.find((one) => one.source === "tpdb");
    // This catalogue minted the identifier, and its faceted routes apply no
    // narrowing written to them. Those are two different reasons and a caller
    // acts on which of the two they met.
    expect(tpdb?.state).toBe("absent");
    expect(tpdb?.reason ?? "").toContain("words alone");
    expect(tpdb?.narrowingsNamingNoRecord).toBeUndefined();
  });
});

/* --------------------------------------- a page the route never receives */

describe("a page a route cannot take", () => {
  it("is reported as one the catalogue did not receive on the text path", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ query: "sunset", page: 900, limit: 5 });
    const stashdb = read.data.perSource.find((one) => one.source === "stashdb");
    // The text route sends words and a size and no page at all, so a caller
    // paging through one collects the same rows forever.
    expect(stashdb?.narrowingsNotReceived ?? []).toContain("page");
  });

  it("states no window for a page nobody received", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ query: "sunset", page: 900, limit: 5 });
    expect((read.data as { window?: unknown }).window).toBeUndefined();
  });

  it("reports an order the text route does not take", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ query: "sunset", sort: "date", direction: "desc" });
    const stashdb = read.data.perSource.find((one) => one.source === "stashdb");
    expect(stashdb?.narrowingsNotReceived ?? []).toContain("sort");
  });
});

/* ------------------------------------------- a record nobody holds */

describe("a record its catalogue holds nothing at", () => {
  it("says so where a reader reads, not only in the payload", () => {
    const card = consolidate({
      readings: [
        {
          source: "stashdb",
          id: `stashdb:${A}`,
          state: "answered",
          reason: `StashDB holds no scene at stashdb:${A}.`,
        },
      ],
      prefer: ["stashdb"],
      scalars: ["title"],
      lists: [],
      perSource: [],
    });
    const said = renderCard(card, "scene").text;
    expect(said).toContain("holds no scene");
    // A catalogue that answered and holds nothing does not hold it.
    expect(said).not.toContain("holds it at");
  });
});

/* ------------------------------------- a catalogue the caller contradicted */

describe("an identifier and a list of catalogues that exclude each other", () => {
  it("is refused rather than answered with an empty card", async () => {
    const { client } = watching();
    await expect(client.getCard("scene", `stashdb:${A}`, { sources: ["tpdb"] })).rejects.toThrow(
      /invalid_input|stashdb/i,
    );
  });
});

/* ------------------------------------------------ a hash that names nothing */

describe("a hash carrying no information", () => {
  it("is refused rather than put to a catalogue", async () => {
    // A hash of all zeroes is what a failed computation writes. Put to a
    // catalogue it matches whatever garbage was submitted upstream, and the
    // answer states that those bytes are that file.
    const { client } = watching();
    await expect(
      client.findByFingerprint({
        fingerprints: [{ hash: "0000000000000000", algorithm: "OSHASH" }],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
