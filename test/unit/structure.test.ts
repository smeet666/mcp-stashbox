/**
 * Rules about the source itself, checked by reading it.
 *
 * The recurring defect of this project is a rule honoured at six sites out of
 * seven. A test written from an example can only ever assert the six a reviewer
 * listed. These read the source and enumerate the sites, so the seventh fails
 * the suite on the day it appears rather than on the day someone looks for it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { INSTANCES, type Capability } from "../../src/stashbox/instances.js";

const SRC = new URL("../../src", import.meta.url).pathname;

function sourceFiles(directory: string = SRC): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });
}

const FILES = sourceFiles().map((path) => ({
  path: path.slice(SRC.length + 1),
  text: readFileSync(path, "utf8"),
}));

const ALL = FILES.map((file) => file.text).join("\n");

/** The lines a file emits as prose, which is every template literal and string. */
function emittedStrings(text: string): string[] {
  return [...text.matchAll(/`([^`]*)`/g), ...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("every capability the registry declares is consulted", () => {
  // A capability declared and never read is a silence a caller takes for an
  // answer: the field comes back null from a catalogue nobody asked, and
  // nothing in the answer says which of the two it was.
  const declared = [...new Set(INSTANCES.flatMap((spec) => spec.capabilities))] as Capability[];

  for (const capability of declared) {
    it(`reads '${capability}' somewhere other than the registry`, () => {
      const readers = FILES.filter(
        (file) => file.path !== "stashbox/instances.ts" && file.text.includes(`"${capability}"`),
      ).map((file) => file.path);

      expect(
        readers,
        `'${capability}' is declared in the registry and consulted nowhere, so a catalogue that lacks it answers a silence nothing explains`,
      ).not.toHaveLength(0);
    });
  }
});

describe("a note never names a field the prose does not print", () => {
  // A reader of the text block cannot look up a key. Naming one sends them to a
  // value the answer withheld from them.
  const KEYS = [
    "scenes_matched",
    "contested",
    "index_total",
    "per_source",
    "narrowings_not_received",
    "rows_skipped",
    "match_count",
    "unattributed",
    "records",
    "result_count",
    "fingerprints_shown",
    "pending_edits",
  ];

  for (const file of FILES.filter((entry) => entry.path.startsWith("tools/"))) {
    it(`${file.path} names no payload key inside a note`, () => {
      // Only what a tool pushes as a note. A schema description names keys on
      // purpose, since its reader is reading the schema.
      const notes = [...file.text.matchAll(/notes\.push\(\s*([\s\S]*?)\n\s*\);/g)].map(
        (match) => match[1] ?? "",
      );
      const offending = KEYS.filter((key) =>
        notes.some((note) => note.includes(`'${key}'`) || note.includes(`"${key}"`)),
      );

      expect(
        offending,
        `${file.path} writes a note naming ${offending.join(", ")}, which a reader of the text block never sees`,
      ).toHaveLength(0);
    });
  }
});

describe("prose stands on its own and carries no history", () => {
  // Every string this server emits is read by someone who has never seen an
  // earlier version of it. A comparison to a past state describes nothing they
  // can check.
  const BANNED = [
    "as before",
    "previously",
    "now uses",
    "used to",
    "no longer than before",
    "désormais",
    "comme avant",
    "contrairement à",
  ];

  for (const file of FILES) {
    it(`${file.path} compares nothing to a past state`, () => {
      const lower = file.text.toLowerCase();
      const found = BANNED.filter((phrase) => lower.includes(phrase));
      expect(
        found,
        `${file.path} carries ${found.join(", ")}, which reads against a version its reader has not seen`,
      ).toHaveLength(0);
    });
  }
});

describe("no server names a neighbour", () => {
  // A server does not know the others exist. The sites it reads are named; the
  // servers that read them are not.
  const NEIGHBOURS = [
    "mcp-marmiton",
    "mcp-recipes",
    "mcp-books",
    "mcp-archiveorg",
    "mcp-metacritic",
    "mcp-lrclib",
    "mcp-libraryofcongress",
    "mcp-wikibooks",
    "mcp-animenewsnetwork",
    "glama",
  ];

  it("mentions no sibling server and no aggregator", () => {
    const found = NEIGHBOURS.filter((name) => ALL.toLowerCase().includes(name));
    expect(
      found,
      `the source names ${found.join(", ")}, and a server that names another has learned something no reader of it can check`,
    ).toHaveLength(0);
  });
});

describe("the em dash stays in the attribution line", () => {
  // House rule: elsewhere a comma or a colon carries the same break without the
  // typographic weight.
  for (const file of FILES.filter((entry) => entry.path.startsWith("tools/"))) {
    it(`${file.path} uses no em dash in an emitted line`, () => {
      const offending = emittedStrings(file.text).filter(
        (value) => value.includes("—") && !value.toLowerCase().includes("credit"),
      );
      expect(
        offending.map((value) => value.slice(0, 70)),
        `${file.path} emits an em dash outside an attribution line`,
      ).toHaveLength(0);
    });
  }
});

describe("every error this server raises carries one of the six codes", () => {
  it("opens every issue the validator is given with a code a caller branches on", () => {
    // A message the validator writes on its own arrives without one, so every
    // issue this server adds carries the code in the words a caller reads.
    for (const found of ALL.matchAll(/addIssue\(\{[\s\S]{0,400}?\}\)/g)) {
      expect(
        /\$\{CODE\}/.test(found[0]) || /\[[a-z_]+\]/.test(found[0]),
        `an issue reaches a caller with no code: ${found[0].slice(0, 80)}`,
      ).toBe(true);
    }
  });

  it("constructs no error outside the declared taxonomy", () => {
    // Six and not one more. A seventh would be a state a caller has no branch
    // for, and would reach them as prose alone.
    const constructors = [
      ...ALL.matchAll(/new StashboxError\(\s*"([a-z_]+)"/g),
      ...ALL.matchAll(/\bcode:\s*"([a-z_]+)"/g),
    ]
      .map((match) => match[1])
      // The validator has a vocabulary of its own for the kind of issue it
      // raises, which is not this server's taxonomy. What a caller reads from
      // one is held to the six codes by the case below, and by the whole of
      // the refusal suite.
      .filter((code) => code !== "custom");
    const allowed = new Set([
      "not_found",
      "invalid_input",
      "rate_limited",
      "parse_failure",
      "network_error",
      "timeout",
    ]);
    const outside = [...new Set(constructors.filter((code) => code && !allowed.has(code)))];

    expect(outside, `the source raises ${outside.join(", ")}, outside the six codes`).toHaveLength(
      0,
    );
  });
});
