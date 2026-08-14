/**
 * What a card may say about a catalogue it never read.
 *
 * A card names every catalogue the registry declares, and each of them carries
 * the reason it is not on the card. That reason is read off the record the
 * first catalogue published, so it is only as good as that reading: where the
 * first catalogue refused the key it was given, it published nothing, and a
 * sentence reporting what it publishes about its links states a fact nobody
 * established.
 *
 * The second rule here is about which fact is the operative one. A key this
 * install does not hold stops a catalogue from being read; a link nobody wrote
 * stops it from being reached at all. Where no link exists, the key was never
 * the reason, and naming it sends a reader to set a variable that changes
 * nothing about this record.
 */

import { describe, expect, it } from "vitest";

import { StashboxClient } from "../../src/stashbox/client.js";

const A = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const B = "019fec3f-1bb1-7383-8782-ea0e678f6de0";

/** One performer as a catalogue answers its record route with. */
const PERFORMER = {
  id: A,
  name: "Tawny Swain",
  deleted: false,
  aliases: [],
  urls: [],
  images: [],
};

/**
 * A client whose catalogues answer a record route with what a case hands them,
 * and fail where a case hands them nothing.
 */
function holding(answers: Partial<Record<string, unknown>>, keys?: Record<string, string>) {
  return new StashboxClient({
    keys: (keys ?? {
      stashdb: "a key this test never sends anywhere",
      tpdb: "another",
    }) as never,
    transport: {
      request: async (spec, _apiKey, body) => {
        const named = /(?:query|mutation)\s+\w+[^{]*\{\s*(\w+)/.exec(body.query)?.[1] ?? "";
        if (!(spec.id in answers)) throw new Error(`${spec.name} could not be reached`);
        return { [named]: answers[spec.id] } as never;
      },
    },
  });
}

const heldBy = (card: { data: { held_by: { source: string }[] } }, source: string) =>
  card.data.held_by.find((one) => one.source === source) as unknown as {
    state: string;
    reason?: string;
  };

describe("a catalogue whose read failed", () => {
  it("states no link of its own for the catalogues it was read to reach", async () => {
    const card = await holding({}).getCard("performer", `stashdb:${A}`);
    // The catalogue the identifier names refused, so whether it links this
    // record anywhere is unknown. A reason reading its silence as a link nobody
    // wrote states what a catalogue publishes out of an exchange that carried
    // nothing.
    expect(heldBy(card, "stashdb").state).toBe("failed");
    expect(heldBy(card, "tpdb").reason ?? "").not.toContain("publishes no link");
  });

  it("says a link is unknown where the record it would be read off failed", async () => {
    const card = await holding({}).getCard("performer", `stashdb:${A}`);
    expect(heldBy(card, "tpdb").reason ?? "").toMatch(/unknown|published nothing/i);
  });

  it("still says a link was never written where the record was read", async () => {
    const card = await holding({ stashdb: PERFORMER }).getCard("performer", `stashdb:${A}`);
    // The record came back and carries no link to that catalogue, which is a
    // fact the reading established.
    expect(heldBy(card, "tpdb").reason ?? "").toContain("publishes no link");
  });
});

describe("a catalogue this install holds no key for", () => {
  it("is not blamed on the key where the record links to it nowhere", async () => {
    const card = await holding({ stashdb: PERFORMER }).getCard("performer", `stashdb:${A}`);
    const fansdb = heldBy(card, "fansdb");
    // Setting the variable would change nothing here: nothing links this record
    // to a record there, so the key was never what stopped the reading.
    expect(fansdb.reason ?? "").toContain("publishes no link");
    expect(fansdb.reason ?? "").not.toContain("STASHBOX_FANSDB_KEY");
  });

  it("is named on the key where the record does link to it", async () => {
    const linked = {
      ...PERFORMER,
      urls: [{ url: `https://fansdb.cc/performers/${B}`, site: { name: "FansDB" } }],
    };
    const card = await holding({ stashdb: linked }).getCard("performer", `stashdb:${A}`);
    const fansdb = heldBy(card, "fansdb");
    // A link is written and this install cannot follow it, so the key is what
    // stands between the caller and that reading.
    expect(fansdb.reason ?? "").toContain("STASHBOX_FANSDB_KEY");
  });
});

describe("a block of a card nobody asked for", () => {
  it("is left off the card rather than published as a value nobody holds", async () => {
    const card = await holding({ stashdb: PERFORMER }).getCard("performer", `stashdb:${A}`, {
      sections: ["basic"],
    });
    // Published as a null with nobody agreeing, an unread block reads exactly
    // as a field every catalogue left empty.
    expect(Object.keys(card.data.fields)).not.toContain("appearance");
  });

  it("is on the card where the caller asked for it", async () => {
    const card = await holding({ stashdb: PERFORMER }).getCard("performer", `stashdb:${A}`, {
      sections: ["basic", "appearance"],
    });
    expect(Object.keys(card.data.fields)).toContain("appearance");
  });
});
