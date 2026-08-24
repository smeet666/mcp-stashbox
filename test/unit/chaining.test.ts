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
          tags: [
            { id: `stashdb:${A}`, name: "Outdoors", category: "Action", status: "established" },
          ],
          studio: { id: `stashdb:${A}`, name: "Northgate", parent: null, status: "established" },
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

/* ------------------------------------ what the prose says about two entries */

const TAG_ON_STASHDB = "stashdb:fe7f4d46-966e-4a36-bf6a-61ccf7d3734d";
const TAG_ON_TPDB = "tpdb:dd622a8a-3c3f-4f1a-9a17-2b0c5c9b8e4d";

/** A card holding the tags two catalogues published, whatever joins them. */
function tagCard(stashdb: unknown[], tpdb: unknown[]) {
  return consolidate({
    readings: [reading("stashdb", { tags: stashdb }), reading("tpdb", { tags: tpdb })],
    prefer: ["stashdb", "tpdb"],
    scalars: [],
    lists: ["tags"],
    perSource: [],
  });
}

describe("two entries of one name across two catalogues", () => {
  const said = renderCard(
    tagCard(
      [{ id: TAG_ON_STASHDB, name: "Behind the Scenes", status: "established" }],
      [{ id: TAG_ON_TPDB, name: "Behind The Scenes", status: "established" }],
    ),
    "scene",
  ).text;

  it("names the other catalogue and the identifier its record carries", () => {
    // Two entries of one name printed one after another with no word about
    // why read as a duplicate, and a reader who wants the other catalogue's
    // record has nothing to call the next tool with.
    expect(said).toContain(TAG_ON_STASHDB);
    expect(said).toContain(TAG_ON_TPDB);
    expect(said).toContain("ThePornDB");
    expect(said).toContain("StashDB");
  });

  it("words it so it cannot be read as an established identity", () => {
    expect(said).toContain("nothing here establishes");
  });
});

describe("one record two catalogues are joined on by a link", () => {
  it("prints both identifiers, so a reader can chain to either", () => {
    const card = consolidate({
      readings: [
        reading("stashdb", {
          performers: [
            {
              id: `stashdb:${A}`,
              name: "Nadia Kerr",
              status: "established",
              alsoHeldAt: [{ source: "tpdb", id: `tpdb:${B}` }],
            },
          ],
        }),
        reading("tpdb", {
          performers: [{ id: `tpdb:${B}`, name: "Nadia Kerr", status: "established" }],
        }),
      ],
      prefer: ["stashdb", "tpdb"],
      scalars: [],
      lists: ["performers"],
      perSource: [],
    });
    const said = renderCard(card, "scene").text;
    expect(said).toContain(`stashdb:${A}`);
    expect(said).toContain(`tpdb:${B}`);
  });
});

describe("a long list whose entries carry resemblances", () => {
  it("is written in lines a reader can follow", () => {
    const forty = (source: string, mark: string) =>
      Array.from({ length: 40 }, (_, at) => ({
        id: `${source}:${at.toString().padStart(8, "0")}-1bb1-7383-8782-ea0e678f6de0`,
        name: `Tag ${at}${mark}`,
        status: "established",
      }));
    const said = renderCard(tagCard(forty("stashdb", ""), forty("tpdb", "")), "scene").text;
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

  it("names every catalogue folded into that sentence and every key to set", () => {
    const held = (source: string, name: string, variable: string): Reading => ({
      source,
      state: "absent",
      reason: `No key is configured for ${name}, so it was never asked. Set ${variable} to read it.`,
    });
    const card = consolidate({
      readings: [
        reading("stashdb", { name: "A" }),
        reading("tpdb", { name: "A" }),
        held("fansdb", "FansDB", "STASHBOX_FANSDB_KEY"),
        held("pmv", "PMV Stash", "STASHBOX_PMV_KEY"),
        held("javstash", "JAVStash", "STASHBOX_JAVSTASH_KEY"),
      ],
      prefer: ["stashdb", "tpdb", "fansdb", "pmv", "javstash"],
      scalars: ["name"],
      lists: [],
      perSource: [],
    });
    const line = renderCard(card, "performer")
      .text.split("\n")
      .find((one) => one.includes("No key is configured"));
    expect(line, "the catalogues held out for one reason reach no line at all").toBeDefined();
    // The reason is one shape and three facts. Folded on the shape and printed
    // with the catalogue and the variable stripped out of it, it names neither
    // what was not read nor what to set to read it.
    for (const name of ["FansDB", "PMV Stash", "JAVStash"]) {
      expect(line).toContain(name);
    }
    for (const variable of ["STASHBOX_FANSDB_KEY", "STASHBOX_PMV_KEY", "STASHBOX_JAVSTASH_KEY"]) {
      expect(line).toContain(variable);
    }
  });
});
