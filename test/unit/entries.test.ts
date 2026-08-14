/**
 * What a united list is allowed to claim about the entries it holds.
 *
 * A list entry that carries a catalogue-minted identifier is a record on the
 * catalogue that minted it, and every catalogue that names one tag mints its
 * own. Two of those entries are one entry only where the data carries the join:
 * the same identifier, or the link one catalogue publishes to the other's
 * record. Keyed on a name instead, a card would establish an identity no editor
 * wrote, publish one catalogue's identifier as though the other had published
 * it, and drop the identifier a reader would chain to.
 *
 * Two entries of one name across two catalogues is a fact worth reading, and it
 * is a resemblance: it is published as one, beside two entries a reader can
 * follow separately.
 *
 * An entry carrying no identifier is its own content. Two catalogues publishing
 * one alias published one alias, and that union stands.
 */

import { describe, expect, it } from "vitest";

import { consolidate, type CardListEntry, type Reading } from "../../src/answer/card.js";
import type { CardValue } from "../../src/types.js";

const REGISTRY_ORDER = ["stashdb", "tpdb", "fansdb"] as const;

/** The two records the catalogues answered with for one tag, each with its own address. */
const TAG_ON_STASHDB = "stashdb:fe7f4d46-966e-4a36-bf6a-61ccf7d3734d";
const TAG_ON_TPDB = "tpdb:dd622a8a-3c3f-4f1a-9a17-2b0c5c9b8e4d";

const PERFORMER_ON_STASHDB = "stashdb:90a42491-f3f6-4764-8da8-564be11140f6";
const PERFORMER_ON_TPDB = "tpdb:26d101c0-9b52-4f0a-8e4a-33a1a2b0d7f5";

function answered(source: string, record: Record<string, unknown>): Reading {
  return { source, id: `${source}:${record.id as string}`, state: "answered", record };
}

const SHAPE = {
  scalars: ["title", "studio"],
  lists: ["tags", "performers", "urls", "aliases"],
  perSource: [],
} as const;

function card(readings: Reading[], prefer: readonly string[] = REGISTRY_ORDER) {
  return consolidate({ readings, prefer, ...SHAPE });
}

function entries(held: ReturnType<typeof card>, name: string): CardListEntry[] {
  return held.fields[name] as CardListEntry[];
}

/**
 * What an entry holds, which is the record a catalogue published rather than a
 * name for it.
 */
function record(entry: CardListEntry): { id: string; name: string } {
  return entry.value as unknown as { id: string; name: string };
}

/** What each entry is named, in the order the union holds them. */
function named(list: readonly CardListEntry[]): string[] {
  return list.map((entry) => record(entry).name);
}

/* --------------------------------------------- an identifier names the entry */

describe("an entry carrying an identifier is that identifier's record", () => {
  const stashdb = answered("stashdb", {
    id: "scene-a",
    tags: [{ id: TAG_ON_STASHDB, name: "Ass to Mouth", category: null, status: "established" }],
  });
  const tpdb = answered("tpdb", {
    id: "scene-b",
    tags: [{ id: TAG_ON_TPDB, name: "Ass To Mouth", category: null, status: "established" }],
  });

  it("keeps two catalogues' records apart where nothing joins them but a name", () => {
    const list = entries(card([stashdb, tpdb]), "tags");
    expect(list).toHaveLength(2);
    expect(list.map((entry) => record(entry).id)).toEqual([TAG_ON_STASHDB, TAG_ON_TPDB]);
  });

  it("attributes each record to the catalogue that published it and to no other", () => {
    const list = entries(card([stashdb, tpdb]), "tags");
    expect(list[0]?.published_by).toEqual(["stashdb"]);
    expect(list[1]?.published_by).toEqual(["tpdb"]);
  });

  it("carries every catalogue's own identifier, so a reader can chain to either", () => {
    const scene = answered("stashdb", {
      id: "scene-a",
      performers: [{ id: PERFORMER_ON_STASHDB, name: "Riley Reid", status: "established" }],
    });
    const other = answered("tpdb", {
      id: "scene-b",
      performers: [{ id: PERFORMER_ON_TPDB, name: "Riley Reid", status: "established" }],
    });
    expect(entries(card([scene, other]), "performers").map((entry) => record(entry).id)).toEqual([
      PERFORMER_ON_STASHDB,
      PERFORMER_ON_TPDB,
    ]);
  });

  it("holds one entry where one catalogue published one record twice", () => {
    const twice = answered("stashdb", {
      id: "scene-a",
      tags: [
        { id: TAG_ON_STASHDB, name: "Ass to Mouth", status: "established" },
        { id: TAG_ON_STASHDB, name: "Ass to Mouth", status: "established" },
      ],
    });
    const list = entries(card([twice]), "tags");
    expect(list).toHaveLength(1);
    expect(list[0]?.published_by).toEqual(["stashdb"]);
  });

  it("meets the preferred catalogue's entries first, then what the others add", () => {
    const rich = answered("stashdb", {
      id: "scene-a",
      tags: [
        { id: TAG_ON_STASHDB, name: "Ass to Mouth", status: "established" },
        { id: "stashdb:11111111-1111-4111-8111-111111111111", name: "Anal", status: "established" },
      ],
    });
    const list = entries(card([rich, tpdb]), "tags");
    expect(named(list)).toEqual(["Ass to Mouth", "Anal", "Ass To Mouth"]);
  });
});

/* -------------------------------------------------- a name is a resemblance */

describe("two entries of one name across two catalogues", () => {
  const stashdb = answered("stashdb", {
    id: "scene-a",
    tags: [{ id: TAG_ON_STASHDB, name: "Ass to Mouth", status: "established" }],
  });
  const tpdb = answered("tpdb", {
    id: "scene-b",
    tags: [{ id: TAG_ON_TPDB, name: "Ass To Mouth", status: "established" }],
  });

  it("is published as a resemblance, naming the other catalogue and its identifier", () => {
    const list = entries(card([stashdb, tpdb]), "tags");
    expect(list[0]?.same_name_as).toEqual([{ source: "tpdb", id: TAG_ON_TPDB }]);
    expect(list[1]?.same_name_as).toEqual([{ source: "stashdb", id: TAG_ON_STASHDB }]);
  });

  it("leaves the entries themselves apart, since a resemblance joins nothing", () => {
    const list = entries(card([stashdb, tpdb]), "tags");
    expect(list[0]?.published_by).toEqual(["stashdb"]);
    expect(list[1]?.published_by).toEqual(["tpdb"]);
  });

  it("says nothing where the two catalogues named two different things", () => {
    const other = answered("tpdb", {
      id: "scene-b",
      tags: [{ id: TAG_ON_TPDB, name: "Deepthroat", status: "established" }],
    });
    for (const entry of entries(card([stashdb, other]), "tags")) {
      expect(entry.same_name_as).toBeUndefined();
    }
  });

  it("says nothing about two records one catalogue published under one name", () => {
    const twice = answered("stashdb", {
      id: "scene-a",
      tags: [
        { id: TAG_ON_STASHDB, name: "Ass to Mouth", status: "established" },
        {
          id: "stashdb:22222222-2222-4222-8222-222222222222",
          name: "Ass to mouth",
          status: "established",
        },
      ],
    });
    for (const entry of entries(card([twice]), "tags")) {
      expect(entry.same_name_as).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------- what does join them */

describe("a join the data carries", () => {
  it("unites two catalogues' entries where one publishes a link to the other's record", () => {
    const stashdb = answered("stashdb", {
      id: "scene-a",
      performers: [
        {
          id: PERFORMER_ON_STASHDB,
          name: "Riley Reid",
          status: "established",
          alsoHeldAt: [{ source: "tpdb", id: PERFORMER_ON_TPDB }],
        },
      ],
    });
    const tpdb = answered("tpdb", {
      id: "scene-b",
      performers: [{ id: PERFORMER_ON_TPDB, name: "Riley Reid", status: "established" }],
    });
    const list = entries(card([stashdb, tpdb]), "performers");
    expect(list).toHaveLength(1);
    expect(list[0]?.published_by).toEqual(["stashdb", "tpdb"]);
    // The other catalogue's identifier is what a reader chains to there, and it
    // is nowhere else on the entry once the two are published as one.
    expect(list[0]?.also_at).toEqual([{ source: "tpdb", id: PERFORMER_ON_TPDB }]);
    expect(list[0]?.same_name_as).toBeUndefined();
  });

  it("unites two entries carrying one identifier", () => {
    const held = { id: TAG_ON_STASHDB, name: "Ass to Mouth", status: "established" };
    const list = entries(
      card([
        answered("stashdb", { id: "scene-a", tags: [held] }),
        answered("tpdb", { id: "scene-b", tags: [held] }),
      ]),
      "tags",
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.published_by).toEqual(["stashdb", "tpdb"]);
  });
});

/* ------------------------------------------- an entry that is its own content */

describe("an entry carrying no identifier", () => {
  it("unites on what it holds, since there is nothing else it could be", () => {
    const stashdb = answered("stashdb", {
      id: "scene-a",
      aliases: ["Angie", "Aussie Angela"],
      urls: [{ url: "https://example.test/a", siteName: "A", siteCategory: null }],
    });
    const tpdb = answered("tpdb", {
      id: "scene-b",
      aliases: ["Angie", "Angelia White"],
      urls: [{ url: "https://example.test/a", siteName: "A", siteCategory: null }],
    });
    const held = card([stashdb, tpdb]);
    expect(entries(held, "aliases").map((entry) => entry.value)).toEqual([
      "Angie",
      "Aussie Angela",
      "Angelia White",
    ]);
    expect(entries(held, "aliases")[0]?.published_by).toEqual(["stashdb", "tpdb"]);
    expect(entries(held, "urls")).toHaveLength(1);
    expect(entries(held, "urls")[0]?.published_by).toEqual(["stashdb", "tpdb"]);
  });
});

/* ---------------------------------------------------------- the scalar path */

const STUDIO_UUID = "915dd307-a440-4578-b83f-699b9706faea";
const STUDIO_ON_TPDB = "tpdb:1dafafd3-da8f-47f3-aca2-e6bb9f354292";

/** One studio at one identifier, which two catalogues address under their own prefix. */
function studioAt(id: string, name = "Vixen"): Record<string, unknown> {
  return { id, name, parent: null, status: "established" };
}

describe("a scalar whose value is a record two catalogues joined", () => {
  it("stays one value where the two addresses name one identifier", () => {
    const stashdb = answered("stashdb", {
      id: "scene-a",
      studio: studioAt(`stashdb:${STUDIO_UUID}`),
    });
    // The two catalogues spell the name differently, so what joins them is the
    // identifier alone.
    const tpdb = answered("tpdb", {
      id: "scene-b",
      studio: studioAt(`tpdb:${STUDIO_UUID}`, "Vixen.com"),
    });
    const held = card([stashdb, tpdb]).fields.studio as CardValue;
    expect(held.agreed_by).toEqual(["stashdb", "tpdb"]);
    expect(held.disagreed).toBeUndefined();
  });

  it("stays one value where one catalogue publishes a link to the other's record", () => {
    const stashdb = answered("stashdb", {
      id: "scene-a",
      studio: {
        ...studioAt(`stashdb:${STUDIO_UUID}`),
        alsoHeldAt: [{ source: "tpdb", id: STUDIO_ON_TPDB }],
      },
    });
    const tpdb = answered("tpdb", {
      id: "scene-b",
      studio: studioAt(STUDIO_ON_TPDB, "Vixen.com"),
    });
    const held = card([stashdb, tpdb]).fields.studio as CardValue;
    expect(held.agreed_by).toEqual(["stashdb", "tpdb"]);
    expect(held.disagreed).toBeUndefined();
  });
});

describe("a scalar whose value is a record each catalogue minted its own of", () => {
  const stashdb = answered("stashdb", {
    id: "scene-a",
    studio: studioAt(`stashdb:${STUDIO_UUID}`),
  });
  const tpdb = answered("tpdb", { id: "scene-b", studio: studioAt(STUDIO_ON_TPDB) });

  it("names only the catalogue that published the identifier the card carries", () => {
    // Naming the other catalogue here credits it with an identifier it never
    // published, and a reader chaining on that identifier asks it for a record
    // it does not hold.
    expect((card([stashdb, tpdb]).fields.studio as CardValue).agreed_by).toEqual(["stashdb"]);
  });

  it("publishes the other catalogue's record beside it, at the identifier it minted", () => {
    const held = card([stashdb, tpdb]).fields.studio as CardValue;
    expect(held.disagreed).toEqual([{ source: "tpdb", value: studioAt(STUDIO_ON_TPDB) }]);
  });

  it("says in words that a matching name establishes no identity between the two", () => {
    const said = card([stashdb, tpdb]).notes.join(" ");
    expect(said).toContain(`stashdb:${STUDIO_UUID}`);
    expect(said).toContain(STUDIO_ON_TPDB);
    expect(said).toMatch(/establishes/);
  });

  it("carries both readings under a written preference, whichever of them won", () => {
    const held = card([stashdb, tpdb], ["tpdb", "stashdb"]).fields.studio as CardValue;
    expect(held.agreed_by).toEqual(["tpdb"]);
    expect(held.disagreed).toEqual([
      { source: "stashdb", value: studioAt(`stashdb:${STUDIO_UUID}`) },
    ]);
  });

  it("qualifies nothing where the two catalogues named two different studios", () => {
    const other = answered("tpdb", { id: "scene-b", studio: studioAt(STUDIO_ON_TPDB, "Tushy") });
    const held = card([stashdb, other]);
    expect((held.fields.studio as CardValue).agreed_by).toEqual(["stashdb"]);
    expect(held.notes.join(" ")).not.toMatch(/one name/);
  });

  it("leaves a catalogue that published no studio out of the dispute", () => {
    const quiet = answered("tpdb", { id: "scene-b", studio: null });
    const held = card([stashdb, quiet]).fields.studio as CardValue;
    expect(held.agreed_by).toEqual(["stashdb"]);
    expect(held.disagreed).toBeUndefined();
  });
});

describe("a scalar that is its own content", () => {
  it("agrees on the value, since a title is what it holds and no record elsewhere", () => {
    const stashdb = answered("stashdb", { id: "scene-a", title: "Riley Reid: Deeper" });
    const tpdb = answered("tpdb", { id: "scene-b", title: "Riley Reid: Deeper" });
    const held = card([stashdb, tpdb]).fields.title as CardValue;
    expect(held.value).toBe("Riley Reid: Deeper");
    expect(held.agreed_by).toEqual(["stashdb", "tpdb"]);
  });
});
