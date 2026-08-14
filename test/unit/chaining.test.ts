/**
 * What a reader of the prose can do next.
 *
 * A caller reading only the text block is the case this server is built for: a
 * model reads it, decides, and calls again. Chaining forward works because a
 * search prints identifiers. Chaining back from a card did not, because a card
 * printed names where the next tool takes identifiers, so the one path a reader
 * walks after being handed an answer was the one path the prose closed.
 *
 * The second rule here is about reading at all. A line carrying seventy
 * addresses is not a line, and a card six of whose twenty-two lines say the
 * same thing about catalogues nobody asked is not a card.
 */

import { describe, expect, it } from "vitest";

import { consolidate, type Reading } from "../../src/answer/card.js";
import { renderCard } from "../../src/answer/render.js";

const A = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const B = "019fec3f-1bb1-7383-8782-ea0e678f6de0";

const reading = (source: string, record: Record<string, unknown>): Reading => ({
  source,
  id: `${source}:${A}`,
  state: "answered",
  record,
});

describe("a record named inside a card", () => {
  it("carries the identifier the next tool takes", () => {
    const card = consolidate({
      readings: [
        reading("stashdb", {
          performers: [{ id: `stashdb:${B}`, name: "Tawny Swain", status: "established" }],
          tags: [{ id: `stashdb:${A}`, name: "Anal", category: "Action", status: "established" }],
          studio: { id: `stashdb:${A}`, name: "Vixen", parent: null, status: "established" },
        }),
      ],
      prefer: ["stashdb"],
      scalars: ["studio"],
      lists: ["performers", "tags"],
      perSource: [],
    });
    const said = renderCard(card, "scene").text;
    // A reader who wants this performer's other scenes needs the identifier,
    // and a name is what the next tool refuses.
    expect(said).toContain(`stashdb:${B}`);
    expect(said).toContain(`stashdb:${A}`);
  });
});

describe("a list too long for one line", () => {
  it("is written as rows a reader can walk", () => {
    const many = Array.from({ length: 30 }, (_, at) => ({
      url: `https://example.invalid/${at}`,
      siteName: `Site ${at}`,
      siteCategory: null,
    }));
    const card = consolidate({
      readings: [reading("stashdb", { urls: many })],
      prefer: ["stashdb"],
      scalars: [],
      lists: ["urls"],
      perSource: [],
    });
    const said = renderCard(card, "performer").text;
    const longest = Math.max(...said.split("\n").map((one) => one.length));
    expect(longest, "a line of an answer runs past what a reader can follow").toBeLessThan(400);
  });
});

describe("a card read on one catalogue", () => {
  it("says the rest in one sentence rather than one line each", () => {
    const card = consolidate({
      readings: [
        reading("stashdb", { name: "A" }),
        { source: "tpdb", state: "absent", reason: "No key is configured for ThePornDB." },
        { source: "fansdb", state: "absent", reason: "No key is configured for FansDB." },
        { source: "pmv", state: "absent", reason: "No key is configured for PMV Stash." },
        { source: "javstash", state: "absent", reason: "No key is configured for JAVStash." },
      ],
      prefer: ["stashdb", "tpdb", "fansdb", "pmv", "javstash"],
      scalars: ["name"],
      lists: [],
      perSource: [],
    });
    const said = renderCard(card, "performer").text;
    // Four catalogues held out for one reason are one fact, and four lines of
    // it push what the card actually holds off the top of a reader's view.
    const lines = said.split("\n").filter((one) => one.includes("No key is configured"));
    expect(lines.length, "the same reason is written once per catalogue").toBeLessThanOrEqual(1);
  });
});
