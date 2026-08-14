/**
 * What each catalogue was actually asked, beside what the caller wrote for it.
 *
 * A narrowing written for every catalogue reaches each of them shorn of what
 * names the others, and what is left decides three different things: whether
 * the catalogue has a question left at all, what its own index total counts,
 * and what order its rows stand in. Held per code path, each of those is
 * disclosed where somebody remembered to disclose it, and a combination nobody
 * tried hands over a page narrowed on less than the question with nothing
 * saying so.
 *
 * Every case here reads the difference between the two. Each of them is paired
 * with the ordinary neighbour it could take down: a list that is wholly the
 * catalogue's own, an order nobody wrote, a lookup a catalogue did answer.
 */

import { describe, expect, it } from "vitest";

import { StashboxClient } from "../../src/stashbox/client.js";
import { renderRows, renderMatches } from "../../src/answer/render.js";

const MINE = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const OTHER = "019fec3f-1bb1-7383-8782-ea0e678f6de0";
const FOREIGN = "6f0a7f5c-1d55-4f39-9a56-1f5ec8a7f0c2";

/** One scene as a catalogue answers a faceted page with. */
const ROW = {
  id: MINE,
  title: "Sunset",
  deleted: false,
  urls: [],
  performers: [],
  tags: [],
  release_date: "1997-04-12",
};

/** A client whose catalogues answer one row, handing back what it sent them. */
function watching(answer: unknown = { queryScenes: { count: 832, scenes: [ROW] } }) {
  const sent: string[] = [];
  const client = new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere", tpdb: "another" },
    transport: {
      request: async (_spec, _apiKey, body) => {
        sent.push(JSON.stringify(body.variables ?? {}));
        return answer as never;
      },
    },
    config: { minIntervalMs: 1000 },
  });
  return { client, sent };
}

const stashdbIn = (reports: readonly { source: string }[]) =>
  reports.find((one) => one.source === "stashdb") as unknown as {
    state: string;
    count?: number;
    reason?: string;
    indexTotal?: number;
    narrowingsNamingNoRecord?: string[];
    narrowingsReceivedInPart?: string[];
    narrowingsNotReceived?: string[];
  };

/* ------------------------------- a narrowing about records it never minted */

describe("a narrowing whose identifiers are all another catalogue's", () => {
  it("leaves the catalogue unasked even where another narrowing survives", async () => {
    const { client, sent } = watching();
    const read = await client.searchScenes({
      studioIds: [`stashdb:${MINE}`],
      tagIds: [`tpdb:${FOREIGN}`],
      sources: ["stashdb"],
    });
    const stashdb = stashdbIn(read.data.perSource);
    // No record of StashDB carries that tag, so nothing it holds answers the
    // question. Asked without it, it answers the studio alone, and that page
    // reaches a reader as the answer to both.
    expect(stashdb.state).toBe("absent");
    expect(stashdb.narrowingsNamingNoRecord ?? []).toContain("tag_ids");
    expect(stashdb.reason ?? "").toContain("tag_ids");
    expect(read.data.rows).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("asks the catalogue where every identifier written is its own", async () => {
    const { client, sent } = watching();
    const read = await client.searchScenes({
      studioIds: [`stashdb:${MINE}`],
      tagIds: [`stashdb:${OTHER}`],
      sources: ["stashdb"],
    });
    const stashdb = stashdbIn(read.data.perSource);
    expect(stashdb.state).toBe("answered");
    expect(stashdb.narrowingsNamingNoRecord).toBeUndefined();
    expect(sent.join(" ")).toContain(MINE);
    expect(sent.join(" ")).toContain(OTHER);
  });

  it("asks the catalogue where part of one list is its own", async () => {
    const { client, sent } = watching();
    const read = await client.searchScenes({
      tagIds: [`stashdb:${MINE}`, `tpdb:${FOREIGN}`],
      sources: ["stashdb"],
    });
    const stashdb = stashdbIn(read.data.perSource);
    // Part of the list names records it holds, so it has a question left, and
    // what it answers is narrower than what was written by the rest of it.
    expect(stashdb.state).toBe("answered");
    expect(stashdb.narrowingsReceivedInPart ?? []).toContain("tag_ids");
    expect(sent.join(" ")).toContain(MINE);
    expect(sent.join(" ")).not.toContain(FOREIGN);
  });

  it("leaves it unasked where the surviving narrowing is words of a field", async () => {
    const { client } = watching();
    const read = await client.searchScenes({
      title: "sunset",
      studioIds: [`tpdb:${FOREIGN}`],
      sources: ["stashdb"],
    });
    const stashdb = stashdbIn(read.data.perSource);
    expect(stashdb.state).toBe("absent");
    expect(stashdb.narrowingsNamingNoRecord ?? []).toContain("studio_ids");
  });
});

/* ----------------------------------------- an order that reached a catalogue */

describe("the sentence naming the order rows stand in", () => {
  it("states a direction written without an order to apply it to", async () => {
    const { client, sent } = watching();
    const read = await client.searchScenes({
      title: "sunset",
      direction: "desc",
      sources: ["stashdb"],
    });
    // The direction goes onto the wire and the rows come back reordered by it.
    // Called the catalogue's own order, the first row is read as the one that
    // catalogue holds first.
    expect(sent.join(" ")).toContain("DESC");
    expect(read.data.ordering).toContain("descending");
    expect(read.data.ordering).not.toBe("in the order the catalogue that answered holds them");
  });

  it("names the catalogue's own order where no order was written at all", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ title: "sunset", sources: ["stashdb"] });
    expect(read.data.ordering).toBe("in the order the catalogue that answered holds them");
  });

  it("states no order of a catalogue where none answered", async () => {
    const { client } = watching();
    const read = await client.searchScenes({
      studioIds: [`tpdb:${FOREIGN}`],
      sources: ["stashdb"],
    });
    expect(read.data.perSource.every((one) => one.state !== "answered")).toBe(true);
    expect(read.data.ordering).not.toContain("the catalogue that answered holds them");
  });

  it("names one order of the catalogues, where an order reached none of them", async () => {
    const { client } = watching({ searchScenes: { count: 1, scenes: [ROW] }, searchScene: [ROW] });
    const read = await client.searchScenes({ query: "sunset", sort: "date" });
    const answered = read.data.perSource.filter((one) => one.state === "answered");
    expect(answered.length).toBeGreaterThan(1);
    // One sentence stating two different orders of the catalogues leaves a
    // reader no way to know which of them the rows stand in.
    expect(read.data.ordering.match(/in the order they answered/g) ?? []).toHaveLength(1);
    expect(read.data.ordering).not.toMatch(/in the order \w+.*holds them/);
  });
});

/* ------------------------------- what the prose says of a total and a share */

describe("an index total beside a narrowing that was dropped", () => {
  const report = {
    source: "stashdb",
    name: "StashDB",
    state: "answered",
    count: 2,
    indexTotal: 263,
  };
  const rows = (one: Record<string, unknown>) => ({
    rows: [],
    ordering: "in the order the catalogue that answered holds them",
    perSource: [{ ...report, ...one }],
  });

  it("says the total counts the question the catalogue received", () => {
    const said = renderRows(
      rows({ narrowingsNotReceived: ["career_start_year"] }) as never,
      "performer",
      [],
    ).text;
    // The total is for the question the catalogue was put, which is this one
    // without what its route reads nothing of. Called the total for "this
    // question", it stands beside the disclosure that denies it.
    expect(said).toContain("263");
    expect(said).not.toContain("holds for this question");
    expect(said).toContain("the question it received");
  });

  it("says the total counts this question where the catalogue received all of it", () => {
    const said = renderRows(rows({}) as never, "performer", []).text;
    expect(said).toContain("263");
    expect(said).toContain("holds for this question");
  });

  it("states a list the catalogue received short of what was written", () => {
    const said = renderRows(
      rows({ narrowingsReceivedInPart: ["tag_ids"] }) as never,
      "performer",
      [],
    ).text;
    expect(said).toContain("tag_ids");
  });
});

/* ------------------------------------------- a lookup nobody was put to */

describe("a fingerprint lookup no catalogue answered", () => {
  const empty = {
    matches: [],
    match_count: 0,
    records_named: 0,
    resemblances: 0,
    unmatched: [],
    not_searched: [],
    unattributed: 0,
    asked: [{ hash: "fff42a3ad642122a", algorithm: "PHASH" }],
    perSource: [
      {
        source: "fansdb",
        name: "FansDB",
        state: "absent",
        reason: "No key is configured for FansDB, so it was never asked.",
      },
    ],
  };

  it("says the question reached no catalogue rather than reaching nothing", () => {
    const said = renderMatches(empty as never, false).text;
    expect(said).toContain("No catalogue answered this question");
  });

  it("counts the hashes put to a catalogue apart from the hashes written", () => {
    const said = renderMatches(empty as never, false).text;
    // "1 fingerprint(s) asked, 0 match(es)" states a lookup that was performed
    // and found nothing, where nothing was performed.
    expect(said).not.toMatch(/^1 fingerprint\(s\) asked/);
    expect(said).toContain("0 put to a catalogue");
  });

  it("says nothing of the kind where a catalogue did answer", () => {
    const answered = {
      ...empty,
      unmatched: [{ hash: "fff42a3ad642122a", algorithm: "PHASH" }],
      perSource: [{ source: "stashdb", name: "StashDB", state: "answered", count: 0 }],
    };
    const said = renderMatches(answered as never, false).text;
    expect(said).not.toContain("No catalogue answered this question");
    expect(said).toContain("1 put to a catalogue");
  });
});

/* ------------------------- a reading written for lists a question carries none of */

describe("the reading written for identifier lists", () => {
  it("is named among the narrowings the catalogue never received", async () => {
    const { client, sent } = watching();
    const read = await client.searchScenes({
      title: "sunset",
      match: "any",
      sources: ["stashdb"],
    });
    const stashdb = stashdbIn(read.data.perSource);
    // Accepted and applied to nothing, it shapes no part of the request, and
    // the answer to a question written with it is the answer to the question
    // written without it.
    expect(stashdb.state).toBe("answered");
    expect(stashdb.narrowingsNotReceived ?? []).toContain("match");
    expect(sent.join(" ")).not.toContain("INCLUDES");
  });

  it("is named nowhere where a list it decides the reading of was written", async () => {
    const { client, sent } = watching();
    const read = await client.searchScenes({
      tagIds: [`stashdb:${MINE}`],
      match: "any",
      sources: ["stashdb"],
    });
    expect(stashdbIn(read.data.perSource).narrowingsNotReceived ?? []).not.toContain("match");
    expect(sent.join(" ")).toContain("INCLUDES");
  });

  it("is named nowhere where nobody wrote it", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ title: "sunset", sources: ["stashdb"] });
    expect(stashdbIn(read.data.perSource).narrowingsNotReceived ?? []).not.toContain("match");
  });

  it("leaves the catalogue unasked where it is the whole of what was written", async () => {
    const { client, sent } = watching();
    const read = await client.searchScenes({ match: "any", sources: ["stashdb"] });
    const stashdb = stashdbIn(read.data.perSource);
    // Nothing written reached the request, so the first page of the whole
    // index is what would come back, and it would reach a reader as the answer
    // to a question they wrote a narrowing into.
    expect(stashdb.state).toBe("absent");
    expect(stashdb.reason ?? "").toContain("match");
    expect(sent).toEqual([]);
  });
});
