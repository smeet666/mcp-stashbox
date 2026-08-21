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
  it("is refused rather than answered with the first rows on the text path", async () => {
    const { client } = watching();
    // The text route sends words and a size and no page at all, so a caller
    // paging through one collects the same rows forever, and each answer
    // reads as the page they asked for.
    await expect(
      client.searchScenes({ query: "sunset", page: 900, limit: 5 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("says in the refusal what an argument read and dropped would produce", async () => {
    const { client } = watching();
    const refused = await client.searchScenes({ query: "sunset", page: 2 }).then(
      () => "",
      (error: Error) => error.message,
    );
    expect(refused).toContain("read and dropped");
    expect(refused).toContain("page");
  });

  it("takes the page the faceted route pages with", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ title: "sunset", page: 3, limit: 5 });
    expect((read.data as { window?: { page: number } }).window?.page).toBe(3);
  });

  it("reads the first page of a text search, which is the page it answers", async () => {
    const { client } = watching();
    const read = await client.searchScenes({ query: "sunset", page: 1, limit: 5 });
    expect(read.data.perSource.some((one) => one.state === "answered")).toBe(true);
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

/* --------------------------------- what became of the catalogues not read */

describe("a card says what became of every catalogue, not only the ones read", () => {
  /** One performer, carrying no link to a record on any other catalogue. */
  const UNLINKED = {
    id: A,
    name: "Tawny Swain",
    deleted: false,
    aliases: [],
    urls: [],
    images: [],
  };

  it("names a catalogue the record publishes no link to", async () => {
    const card = await holding({ stashdb: UNLINKED }).getCard("performer", `stashdb:${A}`);
    const named = card.data.held_by.map((one) => one.source);
    // A card built from one identifier reached one catalogue. A reader cannot
    // tell "asked and lacks it" from "never asked" unless both are named, and
    // the tool promises a reading on every catalogue that holds the record.
    expect(named).toContain("tpdb");
    expect(named).toContain("fansdb");
    const tpdb = card.data.held_by.find((one) => one.source === "tpdb");
    expect(tpdb?.state).toBe("absent");
    expect(tpdb?.reason ?? "").toMatch(/link|publishes no/i);
  });

  it("names what stopped the reading rather than a setting that would change nothing", async () => {
    const card = await holding({ stashdb: UNLINKED }).getCard("performer", `stashdb:${A}`);
    const fansdb = card.data.held_by.find((one) => one.source === "fansdb");
    // This install holds no key for that catalogue, and nothing links this
    // record to a record there either. A reason naming the key sends a reader
    // to set a variable that would reach this record no better.
    expect(fansdb?.state).toBe("absent");
    expect(fansdb?.reason ?? "").toContain("publishes no link");
    expect(fansdb?.reason ?? "").not.toContain("STASHBOX_FANSDB_KEY");
  });
});

/* ------------------------------------------ a block asked for that came back empty */

describe("a block a caller asked for", () => {
  it("states its own zero rather than vanishing from the prose", () => {
    const card = consolidate({
      readings: [
        {
          source: "stashdb",
          id: `stashdb:${A}`,
          state: "answered",
          record: { name: "A", studios: [] },
        },
      ],
      prefer: ["stashdb"],
      scalars: ["name"],
      lists: ["studios"],
      perSource: [],
    });
    const said = renderCard(card, "performer").text;
    // A block that vanishes when it holds nothing is indistinguishable from
    // one nobody loaded, which is the distinction this server exists to keep.
    expect(said).toContain("Studios");
    expect(said.toLowerCase()).toMatch(/none|no studio/);
  });
});

/* --------------------- a narrowing the catalogue's route reads nothing of */

describe("a question written only with narrowings the route reads nothing of", () => {
  it("is never sent as no question at all", async () => {
    const { client, sent } = watching();
    await client.searchPerformers({ alias: "zzzzzzzznotathing", limit: 2 });
    // Measured: the route takes this field, answers the same count and the
    // same first row as a request carrying nothing, and refuses nothing. Sent
    // anyway, a page of the whole index comes back and the answer renders it
    // as the two performers known by that name.
    expect(sent.filter((one) => one.instance === "stashdb")).toEqual([]);
  });

  it("reports the catalogue as never asked, naming the narrowing", async () => {
    const { client } = watching();
    const read = await client.searchPerformers({ alias: "zzzzzzzznotathing", limit: 2 });
    const stashdb = read.data.perSource.find((one) => one.source === "stashdb");
    expect(stashdb?.state).toBe("absent");
    expect(stashdb?.narrowingsNotReceived ?? []).toContain("alias");
    expect(stashdb?.reason ?? "").toContain("alias");
  });

  it("counts no row and publishes no total for a catalogue nobody asked", async () => {
    const { client } = watching();
    const read = await client.searchPerformers({ careerStartYear: 1801, limit: 1 });
    const stashdb = read.data.perSource.find((one) => one.source === "stashdb");
    // A total beside a catalogue is what its own index holds for the question.
    // Published for a question it never received, it is the size of the corpus
    // standing where the answer to a narrowed question belongs.
    expect(stashdb?.indexTotal).toBeUndefined();
    expect(stashdb?.count).toBeUndefined();
  });
});

describe("a question written beside a narrowing the route reads nothing of", () => {
  it("is still put to the catalogue for the narrowings it does receive", async () => {
    const { client, sent } = watching();
    const read = await client.searchPerformers({ alias: "Angie", name: "Angela White", limit: 1 });
    // One narrowing left behind never silences the others: the catalogue
    // answers what it was given, and the answer names what it was not.
    const toStashdb = sent.filter((one) => one.instance === "stashdb");
    expect(toStashdb.length).toBeGreaterThan(0);
    expect(toStashdb[0]?.body).toContain("Angela White");
    const stashdb = read.data.perSource.find((one) => one.source === "stashdb");
    expect(stashdb?.state).toBe("answered");
    expect(stashdb?.narrowingsNotReceived ?? []).toContain("alias");
  });

  it("is still put to the catalogue where every narrowing written travels", async () => {
    const { client, sent } = watching();
    const read = await client.searchPerformers({ birthYear: 1991, limit: 1 });
    expect(sent.filter((one) => one.instance === "stashdb").length).toBeGreaterThan(0);
    const stashdb = read.data.perSource.find((one) => one.source === "stashdb");
    expect(stashdb?.state).toBe("answered");
    expect(stashdb?.narrowingsNotReceived).toBeUndefined();
  });

  it("is still put to the catalogue where the caller narrowed on nothing at all", async () => {
    const { client, sent } = watching();
    const read = await client.searchPerformers({ limit: 1 });
    // A page of the whole index is exactly what this question asks for, and
    // reporting the catalogue as unasked would deny it what it answered.
    expect(sent.filter((one) => one.instance === "stashdb").length).toBeGreaterThan(0);
    expect(read.data.perSource.find((one) => one.source === "stashdb")?.state).toBe("answered");
  });
});

/* ------------------------------ an identifier no catalogue ever minted */

/**
 * A client whose catalogues answer one record route with whatever a case hands
 * them, so what is under test is what the reading concludes from an answer.
 */
function holding(answers: Partial<Record<string, unknown>>) {
  return new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere", tpdb: "another" },
    transport: {
      request: async (spec, _apiKey, body) => {
        const named = /(?:query|mutation)\s+\w+[^{]*\{\s*(\w+)/.exec(body.query)?.[1] ?? "";
        if (!(spec.id in answers)) {
          throw new Error(`${spec.name} could not be reached`);
        }
        return { [named]: answers[spec.id] } as never;
      },
    },
  });
}

describe("a record route asked for an identifier nobody minted", () => {
  it("answers that nothing was found rather than a card of empty fields", async () => {
    // A card is a record read on the catalogues that hold it. Built where none
    // of them holds one, every field of it is null and every list empty, and
    // the prose around it reads as a record whose editors filled nothing in.
    await expect(holding({ tpdb: null }).getCard("tag", `tpdb:${A}`)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("names the catalogue that looked and the identifier it looked at", async () => {
    const failed = await holding({ stashdb: null })
      .getCard("scene", `stashdb:${A}`)
      .catch((cause: Error) => cause);
    expect(String((failed as Error).message)).toContain("StashDB");
    expect(String((failed as Error).message)).toContain(`stashdb:${A}`);
  });
});

describe("a record route beside one asked for an identifier nobody minted", () => {
  const TAG = { id: A, name: "Brown Hair", deleted: false, aliases: [], description: null };

  it("still answers a card where a catalogue holds the record", async () => {
    const card = await holding({ stashdb: TAG }).getCard("tag", `stashdb:${A}`);
    expect(card.data.read_from).toEqual(["stashdb"]);
  });

  it("still answers a card where the catalogue that holds it could not answer", async () => {
    // A catalogue that failed states nothing about what it holds, so the
    // absence of a record here belongs to the exchange rather than the world.
    const card = await holding({}).getCard("tag", `stashdb:${A}`);
    expect(card.data.held_by.find((one) => one.source === "stashdb")?.state).toBe("failed");
  });

  it("still answers a card where no catalogue was asked at all", async () => {
    const card = await holding({ stashdb: TAG }).getCard("tag", `fansdb:${A}`);
    // Nobody looked, so nothing here is evidence that the record does not
    // exist, and calling it not found would make it one.
    expect(card.data.held_by.find((one) => one.source === "fansdb")?.state).toBe("absent");
  });
});

/* ------------------------- an identifier that names no catalogue at all */

describe("a narrowing written with a uuid and no catalogue", () => {
  it("is refused rather than blamed on another catalogue", async () => {
    const { client, sent } = watching();
    // The same uuid names a different record on each catalogue. Read as one
    // another catalogue minted, the answer states a provenance the string does
    // not carry, and a genuinely foreign identifier receives that same
    // sentence, so the two become impossible to tell apart.
    await expect(client.searchScenes({ performerIds: [A], limit: 1 })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(sent, "a catalogue was asked before the identifier was refused").toEqual([]);
  });

  it("is refused in the words the record route refuses it in", async () => {
    const { client } = watching();
    const said = await client
      .searchScenes({ performerIds: [A], limit: 1 })
      .catch((cause: Error) => cause.message);
    const also = await client.getCard("performer", A).catch((cause: Error) => cause.message);
    // One surface refusing a grammar its sibling invents a reason for is what
    // makes a caller distrust both answers.
    expect(String(said)).toContain("ambiguous");
    expect(String(also)).toContain("ambiguous");
    expect(String(said)).toContain("performer_ids");
  });

  it("is refused where it is written beside one that names a catalogue", async () => {
    const { client } = watching();
    await expect(
      client.searchScenes({ performerIds: [`stashdb:${A}`, A], limit: 1 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("a narrowing written beside one that names no catalogue", () => {
  it("still travels where every identifier names the catalogue that minted it", async () => {
    const { client, sent } = watching();
    await client.searchScenes({ performerIds: [`stashdb:${A}`], limit: 1 });
    const toStashdb = sent.filter((one) => one.instance === "stashdb");
    expect(toStashdb.length).toBeGreaterThan(0);
    expect(toStashdb[0]?.body).toContain(A);
  });

  it("still resolves a bare uuid where one catalogue alone is configured", async () => {
    const sent: { instance: string; body: string }[] = [];
    const client = new StashboxClient({
      keys: { stashdb: "a key this test never sends anywhere" },
      transport: {
        request: async (spec, _apiKey, body) => {
          sent.push({ instance: spec.id, body: JSON.stringify(body.variables ?? {}) });
          return { queryScenes: { count: 0, scenes: [] } } as never;
        },
      },
    });
    // One catalogue is the only one that could have minted it, so nothing is
    // chosen on the caller's behalf by reading it as theirs.
    await client.searchScenes({ performerIds: [A], limit: 1 });
    expect(sent[0]?.body).toContain(A);
  });
});
