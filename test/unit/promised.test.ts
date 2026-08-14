/**
 * What a caller is told before they ask, held against what they are given.
 *
 * A description is read once, at the opening of a session, and every call after
 * it is planned from that reading. So a description is a claim like any other,
 * and the rule that governs the server governs it: **a rule announced and not
 * applied is worse than none.**
 *
 * Three claims are held here, each one a place where the words a caller reads
 * and the answer they receive can drift apart.
 *
 * **An argument naming blocks says which blocks it decides.** A caller who reads
 * that a list chooses what comes back, and receives the whole record whatever
 * they wrote, paid for a page they narrowed and did not get.
 *
 * **The table of what a catalogue answers carries the limits measured beside a
 * capability.** A capability stated flatly is planned against, and a limit that
 * only reaches a caller once the call comes back reaches them too late.
 *
 * **A list whose length nobody bounded says so.** A block of hundreds of rows,
 * published with no word on whether it is the whole of the table, is a claim of
 * completeness nothing in the data carries.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TOOLS } from "../../src/tools/index.js";
import { describeSources } from "../../src/answer/sources.js";
import { INSTANCES } from "../../src/stashbox/instances.js";
import { StashboxClient } from "../../src/stashbox/client.js";

const UUID = "94ef9c17-82c6-48b0-8dcc-063b69231960";

const tool = (name: string) => {
  const found = TOOLS.find((one) => one.name === name);
  if (found === undefined) throw new Error(`no tool is named ${name}`);
  return found;
};

/** A client that reaches no catalogue and keeps the requests it would have sent. */
function watching(answer?: (query: string) => unknown) {
  const sent: string[] = [];
  const client = new StashboxClient({
    keys: { stashdb: "a key this test never sends anywhere" },
    transport: {
      request: async (_spec, _apiKey, body) => {
        sent.push(body.query);
        if (answer === undefined)
          throw new Error("this test reads the request and never an answer");
        return answer(body.query) as never;
      },
    },
  });
  return { client, sent };
}

/* ------------------------------------------- the blocks an answer carries */

describe("what 'sections' says it decides is what it decides", () => {
  const carried: [string, string[]][] = [
    ["get_scene", ["title", "code", "director", "tags", "urls"]],
    ["get_performer", ["name", "gender", "country", "urls"]],
  ];

  for (const [name, fields] of carried) {
    it(`${name} reads the record's own fields whatever sections names`, async () => {
      const { client, sent } = watching();
      const read = tool(name).inputSchema.parse({ id: `stashdb:${UUID}`, sections: ["images"] });
      await tool(name).run(client as never, read as Record<string, unknown>);

      expect(sent.length, `${name} put no request to the catalogue`).toBeGreaterThan(0);
      for (const field of fields) {
        expect(
          sent[0]?.includes(field),
          `${name} asked for one block and the request left ${field} out`,
        ).toBe(true);
      }
    });
  }

  /** Every tool declaring the argument, so one added tomorrow is read tomorrow. */
  const declaring = TOOLS.filter(
    (one) => (one.declared as z.ZodObject<z.ZodRawShape>).shape.sections !== undefined,
  );

  it("is declared by the tools that answer with a card", () => {
    // A tool answering several cards at once is the one that most needs it: a
    // block written per match reaches a reader as many times as there are
    // matches.
    expect(declaring.map((one) => one.name)).toContain("find_by_fingerprint");
  });

  for (const one of declaring) {
    it(`${one.name} tells a caller the record's own fields come back whatever sections names`, () => {
      const shape = (one.declared as z.ZodObject<z.ZodRawShape>).shape;
      const said = (shape.sections as z.ZodTypeAny | undefined)?.description ?? "";
      expect(said, `${one.name} publishes 'sections' with nothing said about it`).not.toBe("");
      // The card is read whatever this argument holds, and a description
      // saying the argument chooses the blocks sends a caller to narrow a
      // request they pay for whole.
      expect(
        said,
        `${one.name} describes 'sections' without saying the card comes back whatever it names`,
      ).toContain("come back whatever is written here");
    });
  }
});

/* ------------------------------- the limits measured beside a capability */

describe("the table names the limit measured beside a capability", () => {
  const narrowed = INSTANCES.filter((spec) => !spec.facetedSearch);
  const applying = INSTANCES.filter((spec) => spec.facetedSearch);

  it("holds a catalogue whose faceted routes were measured ignoring their narrowings", () => {
    expect(narrowed.length, "no catalogue carries the limit this case is about").toBeGreaterThan(0);
  });

  for (const spec of narrowed) {
    it(`${spec.name} states the search it answers and the limit that goes with it`, () => {
      const said = describeSources({ configured: [spec.id] });
      const row = said.sources.find((one) => one.id === spec.id);
      // The capability is real: it answers a search of scenes. The limit is
      // real beside it, and a table stating the first alone sends a caller to
      // plan a call that cannot work.
      expect(row?.answers).toContain("search_scenes");
      expect(
        row?.lacks,
        `${spec.name} answers a search whose typed form it refuses, and the table says nothing of it`,
      ).toContain("faceted_search");
      expect(said.notes.join(" ")).toContain(spec.name);
      expect(said.notes.join(" ")).toContain("a search of words alone");
    });
  }

  for (const spec of applying) {
    it(`${spec.name} carries no such limit, since its faceted routes answer their narrowings`, () => {
      const said = describeSources({ configured: [spec.id] });
      const row = said.sources.find((one) => one.id === spec.id);
      expect(row?.answers).toContain("faceted_search");
      expect(row?.lacks).not.toContain("faceted_search");
    });
  }

  it("says in the answer a caller reads what the payload says", async () => {
    const { client } = watching();
    const rendered = await tool("get_sources").run(client as never, {});
    for (const spec of narrowed) {
      expect(rendered.text).toContain("faceted_search");
      expect(rendered.text).toContain(spec.name);
    }
  });
});

/* --------------------------------------- a list nobody bounded says so */

describe("a block of many rows says what it holds", () => {
  /** A performer credited on more studios than a reader walks through. */
  function performerHolding(rows: number): (query: string) => unknown {
    const studios = Array.from({ length: rows }, (_, at) => ({
      scene_count: at,
      studio: {
        id: `${at.toString(16).padStart(8, "0")}-82c6-48b0-8dcc-063b69231960`,
        name: `Studio ${at}`,
        deleted: false,
      },
    }));
    return () => ({
      findPerformer: {
        id: UUID,
        name: "A performer this test invented",
        aliases: [],
        urls: [],
        deleted: false,
        studios,
      },
    });
  }

  it("states how many rows the studios block holds and that none were left out", async () => {
    const { client } = watching(performerHolding(300));
    const read = tool("get_performer").inputSchema.parse({
      id: `stashdb:${UUID}`,
      sections: ["basic", "studios"],
    });
    const rendered = await tool("get_performer").run(client as never, read as never);

    const notes = (rendered.structured as { card: { notes: string[] } }).card.notes.join(" ");
    // A list of unknown completeness stated flatly is a claim the data does
    // not carry: a reader counting 300 rows cannot tell the whole of a table
    // from the head of one.
    expect(notes, "the studios block states neither its length nor its completeness").toContain(
      "300",
    );
    expect(notes).toContain("nothing here caps");
    expect(rendered.text).toContain("300");
  });

  it("names the catalogues that published the block, not every one that answered", async () => {
    // One catalogue publishes this table and another answers the same record
    // without it. A note crediting the block to the catalogues that answered
    // credits it to one that lists it among what it lacks.
    const { client } = watching(performerHolding(4));
    const read = tool("get_performer").inputSchema.parse({
      id: `stashdb:${UUID}`,
      sections: ["basic", "studios"],
      sources: ["stashdb"],
    });
    const rendered = await tool("get_performer").run(client as never, read as never);

    const notes = (rendered.structured as { card: { notes: string[] } }).card.notes.join(" ");
    expect(notes).toContain("StashDB");
    expect(notes, "the note credits the block to every catalogue that answered").not.toContain(
      "the catalogues that answered credit",
    );
  });

  it("says nothing of a block the call never asked for", async () => {
    const { client } = watching(performerHolding(0));
    const read = tool("get_performer").inputSchema.parse({ id: `stashdb:${UUID}` });
    const rendered = await tool("get_performer").run(client as never, read as never);

    const notes = (rendered.structured as { card: { notes: string[] } }).card.notes.join(" ");
    expect(notes).not.toContain("nothing here caps");
  });
});
