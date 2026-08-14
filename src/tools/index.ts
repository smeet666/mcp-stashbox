/**
 * The ten tools this server publishes, declared in one place.
 *
 * They are declared as a list rather than registered one by one, and that is
 * the point of the file. A rule stated over the list reaches every tool or
 * reaches none: the hint that says this server writes nowhere, the schema every
 * answer is shaped by, the code every refusal opens with. A registrar written
 * per tool honours each of those wherever somebody remembered it, and the suite
 * runs its assertions over this same list.
 *
 * The order is fixed on purpose: a client caches the list it is given, and an
 * order that varies between two runs invalidates that cache for nothing.
 */

import { z } from "zod";

import { describeSources } from "../answer/sources.js";
import { renderCard, renderMatches, renderRows, type Matches } from "../answer/render.js";
import type { Rendered } from "../answer/text.js";
import { instanceById } from "../stashbox/instances.js";
import { MOST_IDENTIFIERS } from "../stashbox/narrowings.js";
import { SORTS } from "../stashbox/queries.js";
import {
  catalogues,
  countryCode,
  calendarDay,
  datedTogether,
  exclusiveQuery,
  hexadecimalHash,
  identifier,
  identifiers,
  oneOf,
  severalOf,
  strictInput,
  text,
  trueOrFalse,
  wholeNumber,
} from "./arguments.js";
import { cardOutput, fingerprintOutput, rowsOutput, sourcesOutput } from "./schemas.js";

/**
 * What a caller wrote, under the names the layer below reads.
 *
 * The published names of this server hold more than one word, and the layer
 * that builds a request names the same things in one. Handed across unchanged,
 * every argument whose name holds two words is read as absent: the request goes
 * out narrowed by nothing and the first page of the whole index comes back as
 * the answer to a question nobody asked. The translation happens here, once,
 * for every tool.
 */
function asWritten(args: Record<string, unknown>): Record<string, unknown> {
  const held: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined) continue;
    held[name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return held;
}

/** What a tool needs of the layer that reaches the catalogues. */
export interface Catalogues {
  configured: readonly string[];
  searchScenes: (input: Record<string, unknown>) => Promise<{ data: unknown; cached: boolean }>;
  searchPerformers: (input: Record<string, unknown>) => Promise<{ data: unknown; cached: boolean }>;
  searchStudios: (input: Record<string, unknown>) => Promise<{ data: unknown; cached: boolean }>;
  searchTags: (input: Record<string, unknown>) => Promise<{ data: unknown; cached: boolean }>;
  getCard: (
    kind: "scene" | "performer" | "studio" | "tag",
    id: string,
    held: Record<string, unknown>,
  ) => Promise<{ data: unknown; cached: boolean }>;
  findByFingerprint: (
    input: Record<string, unknown>,
  ) => Promise<{ data: unknown; cached: boolean }>;
}

/** One tool, with everything a client is told about it before it is called. */
export interface Tool {
  name: string;
  title: string;
  description: string;
  /** The whole declaration, refinements included, which every call is read by. */
  inputSchema: z.ZodTypeAny;
  /**
   * The object the declaration is published as.
   *
   * The protocol layer publishes an object of fields, and a rule reading two
   * arguments against each other is no field. That rule is applied by reading
   * every call through `inputSchema` before the tool runs, so what is
   * announced and what is enforced stay the one declaration.
   */
  declared: z.ZodObject<z.ZodRawShape>;
  outputSchema: z.ZodRawShape;
  annotations: { readOnlyHint: true; openWorldHint: true };
  run: (client: Catalogues, args: Record<string, unknown>) => Promise<Rendered>;
}

/* ------------------------------------------------------- shared arguments */

const SORT_DIRECTIONS = ["asc", "desc"] as const;

/** What a search takes beside its narrowings, with the orders each entity declares. */
function paging(kind: keyof typeof SORTS) {
  return {
    // A closed set, measured: an order outside it is refused by the catalogue,
    // and the refusal would read as a limit the catalogue does not have.
    sort: oneOf("sort", "the order the catalogue applies", SORTS[kind] as never).optional(),
    direction: oneOf("direction", "which way that order runs", SORT_DIRECTIONS).optional(),
    page: wholeNumber("page", "the page to read", 1, 1000)
      .optional()
      .describe(
        "Which page of its own order every catalogue asked is read at, counted from 1. A search written with words alone reads the first rows each text index answers with, since those routes take no page.",
      ),
    limit: wholeNumber("limit", "how many rows one page carries", 1, 100)
      .optional()
      .describe(
        "How many rows one page of one catalogue carries. An answer holding several carries up to this many from each: their pages are their own and nothing here interleaves them into one.",
      ),
    sources: catalogues("sources").optional(),
  };
}

const held = {
  sources: catalogues("sources").optional(),
  prefer: catalogues("prefer")
    .optional()
    .describe(
      "The order the catalogues are preferred in where they disagree on a field. Left out, the registry's own order stands, and every card states the order applied.",
    ),
};

const WORDS =
  "Words for the catalogue's own text index, which reads them as a union. It is exclusive with the typed arguments, which narrow as an intersection.";

/**
 * A narrowing every faceted input declares and no route reads.
 *
 * Measured on 2026-08-14: written into a request, each of these answers the
 * count, the page and the first row of a request carrying no narrowing at all,
 * while its siblings cut the count to a fraction of the corpus. The answer
 * names it after the fact as a narrowing the route did not receive, and a
 * caller reads the argument list before they call, so the declaration says it
 * too.
 */
const APPLIED_BY_NOBODY =
  "No catalogue's faceted route applies it, though every faceted input declares it: a request carrying it answers as wide as one carrying none, so it is never sent and the answer names it as a narrowing nobody received.";

/**
 * The readings a performer's gender and ethnicity are recorded under.
 *
 * Read on 2026-08-14 off the enumerations the catalogues' own performer input
 * declares, in the spellings a row of an answer publishes, so a value taken from
 * one answer is a value the next call takes.
 */
const GENDERS = [
  "UNKNOWN",
  "MALE",
  "FEMALE",
  "TRANSGENDER_MALE",
  "TRANSGENDER_FEMALE",
  "INTERSEX",
  "NON_BINARY",
] as const;

const ETHNICITIES = [
  "UNKNOWN",
  "CAUCASIAN",
  "BLACK",
  "ASIAN",
  "INDIAN",
  "LATIN",
  "MIDDLE_EASTERN",
  "MIXED",
  "OTHER",
] as const;

/* ---------------------------------------------------------------- the ten */

const sourcesInput = strictInput({});

const sceneSearchShape = {
  query: text("query", "a string of words").optional().describe(WORDS),
  title: text("title", "words a title carries").optional(),
  code: text("code", "the studio's own reference for the release").optional(),
  alias: text("alias", "another title the release is known by")
    .optional()
    .describe(APPLIED_BY_NOBODY),
  date: calendarDay("date", "the release date to compare against").optional(),
  date_compare: oneOf("date_compare", "how the date is read", ["on", "before", "after"])
    .optional()
    .describe(
      "These catalogues compare a date against one bound and answer no range, so the comparison is written rather than assumed.",
    ),
  performer_ids: identifiers("performer_ids").optional(),
  studio_ids: identifiers("studio_ids").optional(),
  parent_studio_id: identifier("parent_studio_id").optional(),
  tag_ids: identifiers("tag_ids").optional(),
  match: oneOf("match", "how a list of identifiers is read", ["all", "any"])
    .optional()
    .describe(
      "How performer_ids and tag_ids are read, which are the only arguments it governs. 'all', the default, asks for scenes carrying every identifier of a list; 'any' for scenes carrying at least one, which answers counts an order of magnitude wider. A scene names one studio, so studio_ids asks for any of its identifiers under both readings. The lists narrow against each other as an intersection either way.",
    ),
  ...paging("scenes"),
};

const sceneSearchObject = strictInput(sceneSearchShape);

const sceneSearchInput = datedTogether(
  exclusiveQuery(sceneSearchObject, [
    "title",
    "code",
    "alias",
    "date",
    "date_compare",
    "performer_ids",
    "studio_ids",
    "parent_studio_id",
    "tag_ids",
    "match",
  ]),
);

const performerSearchShape = {
  query: text("query", "a string of words").optional().describe(WORDS),
  name: text("name", "words a name carries").optional(),
  alias: text("alias", "another name they are known by").optional().describe(APPLIED_BY_NOBODY),
  disambiguation: text(
    "disambiguation",
    "the text telling two people of one name apart",
  ).optional(),
  // Closed sets, measured: each of these is an enumeration on the catalogue's
  // own input, and a value outside one is refused with a status. Sent, that
  // refusal comes back as a catalogue that could not answer, and a caller reads
  // their own typo as an outage. The spellings are the ones a row publishes, so
  // a value read off an answer is one this argument takes.
  gender: oneOf("gender", "the gender the catalogue records", GENDERS).optional(),
  country: countryCode("country").optional(),
  ethnicity: oneOf("ethnicity", "the ethnicity the catalogue records", ETHNICITIES).optional(),
  birth_year: wholeNumber("birth_year", "the year of birth", 1800, 2200).optional(),
  career_start_year: wholeNumber("career_start_year", "the year a career opened", 1800, 2200)
    .optional()
    .describe(APPLIED_BY_NOBODY),
  career_end_year: wholeNumber("career_end_year", "the year a career closed", 1800, 2200)
    .optional()
    .describe(APPLIED_BY_NOBODY),
  performed_with: identifier("performed_with").optional(),
  studio_id: identifier("studio_id").optional(),
  ...paging("performers"),
};

const performerSearchObject = strictInput(performerSearchShape);

const performerSearchInput = exclusiveQuery(performerSearchObject, [
  "name",
  "alias",
  "disambiguation",
  "gender",
  "country",
  "ethnicity",
  "birth_year",
  "career_start_year",
  "career_end_year",
  "performed_with",
  "studio_id",
]);

const studioSearchShape = {
  query: text("query", "a string of words").optional().describe(WORDS),
  name: text("name", "words a name carries").optional(),
  parent_id: identifier("parent_id").optional(),
  has_parent: trueOrFalse("has_parent", "whether the studio sits under another").optional(),
  ...paging("studios"),
};

const studioSearchObject = strictInput(studioSearchShape);

const studioSearchInput = exclusiveQuery(studioSearchObject, ["name", "parent_id", "has_parent"]);

const tagSearchShape = {
  query: text("query", "a string of words").optional().describe(WORDS),
  name: text("name", "words a name carries").optional(),
  category_id: identifier("category_id").optional(),
  ...paging("tags"),
};

const tagSearchObject = strictInput(tagSearchShape);

const tagSearchInput = exclusiveQuery(tagSearchObject, ["name", "category_id"]);

const CODE = "[invalid_input]";

/**
 * What a list of blocks decides, said in the words a caller plans a call from.
 *
 * The record's own fields are read on every call: a caller reading that this
 * argument chooses what comes back would narrow a card they pay for whole, and
 * plan the rest of their session on a page that never gets smaller. What the
 * argument decides is the heavy blocks beside those fields, each of which costs
 * a request of its own or hundreds of rows.
 */
const BLOCKS =
  "The blocks read beside the record's own fields, which come back whatever is written here. Each name adds a block, and 'basic' asks for those fields alone.";

const fingerprintEntry = hexadecimalHash(
  strictInput({
    hash: text("hash", "one fingerprint as the catalogues store it"),
    algorithm: oneOf("algorithm", "how that hash was computed", ["MD5", "OSHASH", "PHASH"]),
  }),
);

const fingerprintShape = {
  fingerprints: z
    .array(fingerprintEntry, {
      error: `${CODE} fingerprints takes one to ${MOST_IDENTIFIERS} entries, each a hash and the algorithm it was computed with.`,
    })
    .min(
      1,
      `${CODE} fingerprints was written as an empty list, so nothing was asked about, and an emptiness nobody was asked for is no evidence about any file.`,
    )
    .max(
      MOST_IDENTIFIERS,
      `${CODE} fingerprints takes at most ${MOST_IDENTIFIERS} entries in one call. A longer list asks every configured catalogue about each of them at once, which is a run of reads rather than a lookup.`,
    ),
  // One call answers a card per record reached, so a block written per match
  // reaches a reader as many times as there are matches.
  sections: severalOf("sections", "the blocks read beside the card", [
    "basic",
    "fingerprints",
    "images",
  ])
    .optional()
    .describe(BLOCKS),
  ...held,
};

const fingerprintInput = strictInput(fingerprintShape);

const SEARCH_TAIL =
  "The answer says per catalogue which of three it met: a failure, a catalogue nobody asked, and an emptiness it established. Counts are never added across them.";

const CARD_TAIL =
  "The answer is one card, read on every catalogue that holds the record and reached by the link each of them publishes to the same record elsewhere. Every value names the catalogues that said it, and where they disagree the reading nobody preferred is published beside the one that won. Name 'sources' to read one catalogue alone.";

function searchTool(
  name: string,
  title: string,
  what: string,
  built: { schema: z.ZodTypeAny; declared: z.ZodObject<z.ZodRawShape> },
  call: keyof Pick<
    Catalogues,
    "searchScenes" | "searchPerformers" | "searchStudios" | "searchTags"
  >,
): Tool {
  return {
    name,
    title,
    description: `Search ${what} across every configured stash-box catalogue. Two exclusive paths: 'query' runs each catalogue's own text index, which reads the words as a union, and the typed arguments narrow as an intersection. Writing both is refused. ${SEARCH_TAIL}`,
    inputSchema: built.schema,
    declared: built.declared,
    outputSchema: rowsOutput(what.slice(0, -1) as "scene" | "performer" | "studio" | "tag"),
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client, args) => {
      const read = await client[call](asWritten(args));
      const answered = read.data as never as Parameters<typeof renderRows>[0] & {
        notes?: string[];
      };
      const kind = what.slice(0, -1);
      const rows = { ...answered, rows: answered.rows.map((row) => asRow(kind, row as never)) };
      return renderRows(rows, kind, rowNotes(rows, kind, read.cached), read.cached);
    },
  };
}

function cardTool(
  name: string,
  title: string,
  what: string,
  kind: "scene" | "performer" | "studio" | "tag",
  extra: z.ZodRawShape = {},
): Tool {
  return {
    name,
    title,
    description: `Read one ${what} from the catalogue its identifier names, written instance:uuid. ${CARD_TAIL}`,
    inputSchema: strictInput({ id: identifier("id"), ...extra, ...held }),
    declared: strictInput({ id: identifier("id"), ...extra, ...held }),
    outputSchema: cardOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client, args) => {
      const read = await client.getCard(kind, String(args.id), asWritten(args));
      const card = read.data as { fields: Record<string, unknown>; notes: string[] };
      noteUnboundedBlocks(card);
      return renderCard(card as never, kind, read.cached);
    },
  };
}

/**
 * The fields a record route answers with and a row leaves to it.
 *
 * A search answers with identifiers and a record route answers with the record.
 * A row carrying the whole card spends a caller's page on the answer rather
 * than on the question: measured on 2026-08-14 over twenty scenes read from one
 * catalogue, the synopses, the link lists and the editing stamps came to a
 * fifth of the payload, and none of them separates two releases. What stays is
 * what a row is read for, which is picking one record out of twenty and calling
 * the route that reads it whole.
 */
const LEFT_TO_THE_CARD: Record<string, readonly string[]> = {
  scene: ["details", "urls", "created", "updated", "director", "productionDate"],
  performer: ["urls", "created", "updated"],
  studio: ["urls", "images"],
  tag: [],
};

/**
 * One row, cut to what names the record.
 *
 * Anything the reading puts on a record travels unless it is named above, so a
 * field added to a record reaches a caller until somebody decides it does not
 * belong on a row. The reverse default would drop the sentence a reading writes
 * about what it could not read, which is the half of an answer this server
 * exists to keep.
 */
function asRow(kind: string, row: Record<string, unknown>): Record<string, unknown> {
  const left = LEFT_TO_THE_CARD[kind] ?? [];
  const held: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(row)) {
    if (left.includes(name)) continue;
    held[name] = name === "tags" && Array.isArray(value) ? value.map(taggedAs) : value;
  }
  return held;
}

/**
 * A tag as a row names one.
 *
 * The identifier travels with the name because the next call takes it and
 * refuses the name. What the catalogue filed the tag under and what its record
 * says of itself are facts about the tag rather than about the record this row
 * is, they are repeated on every tag of every row, and get_tag answers them.
 */
function taggedAs(tag: unknown): unknown {
  const one = tag as { id?: unknown; name?: unknown };
  if (typeof one !== "object" || one === null) return tag;
  return { id: one.id, name: one.name };
}

/**
 * What a block of many rows owes a reader beyond the rows.
 *
 * The studios a catalogue credits a performer on run to hundreds of rows on a
 * long career, and the field publishes no page: the table is read whole and
 * nothing here caps or samples it. A long list published without that sentence
 * is a claim of completeness the data does not carry, and a reader who takes it
 * for the head of a table looks elsewhere for the rest of what is already here.
 */
function noteUnboundedBlocks(card: { fields: Record<string, unknown>; notes: string[] }): void {
  const studios = card.fields.studios;
  if (!Array.isArray(studios) || studios.length === 0) return;
  const publishing = named(publishersOf(studios));
  card.notes.push(
    `The studios block holds ${studios.length} row(s), published by ${publishing}, and they are every studio ${publishing} credits this performer on: the table it publishes carries no page of its own, so it is read whole and nothing here caps or samples it. A catalogue that answered without publishing this table contributed no row to it.`,
  );
}

/** The catalogues that published at least one entry of a united list. */
function publishersOf(entries: readonly unknown[]): string[] {
  const sources = new Set<string>();
  for (const entry of entries) {
    const published = (entry as { published_by?: unknown }).published_by;
    if (!Array.isArray(published)) continue;
    for (const source of published) if (typeof source === "string") sources.add(source);
  }
  return [...sources];
}

/** The catalogues, in the words they call themselves, as a reader reads a list. */
function named(sources: readonly string[]): string {
  const spelt = sources.map((source) => instanceById(source)?.name ?? source);
  return spelt.length === 0 ? "no catalogue" : spelt.join(", ");
}

/**
 * What a page of rows owes a reader beyond the rows.
 *
 * Every sentence is one a reader needs before concluding anything from the
 * page: which catalogues are missing from it, what a count beside a catalogue
 * measures, and why it is empty where it is.
 */
function rowNotes(
  result: {
    rows: unknown[];
    perSource: {
      state: string;
      count?: number;
      indexTotal?: number;
      name?: string;
      source: string;
    }[];
  },
  what: string,
  cached: boolean,
): string[] {
  const notes: string[] = [];
  const answered = result.perSource.filter((one) => one.state === "answered");
  const failed = result.perSource.filter((one) => one.state === "failed");
  const missing = result.perSource.filter((one) => one.state !== "answered");
  const named = (rows: typeof result.perSource) =>
    rows.map((one) => one.name ?? one.source).join(", ");

  if (answered.filter((one) => one.count).length > 1) {
    notes.push(
      `Counts are reported per catalogue and are never added: the catalogues index corpora that overlap by an amount none of them publishes, and one ${what} held by two of them is a record on each.`,
    );
  }
  if (result.rows.length === 0 && answered.length > 0) {
    // A page past the end and a question nothing answers are two emptinesses.
    // A catalogue whose own index holds rows for this question found them, and
    // reporting the page as its answer denies what it just said.
    const holding = answered.filter((one) => (one.indexTotal ?? 0) > 0);
    const found = answered.filter((one) => (one.indexTotal ?? 0) === 0);
    if (holding.length > 0) {
      notes.push(
        `This page is past everything these catalogues hold for the question, so its emptiness belongs to the page rather than to the question: ${named(holding)}. Each of them names above how many rows its own index holds for it.`,
      );
    }
    if (found.length > 0) {
      notes.push(
        `These catalogues looked and found nothing for this question: ${named(found)}. That is an emptiness they established, and it says nothing about the catalogues below.`,
      );
    }
  }
  if (failed.length > 0) {
    notes.push(
      `These catalogues could not answer, so this page holds no row of theirs and states nothing about what they hold: ${named(failed)}.`,
    );
  }
  if (missing.length > 0 && missing.length < result.perSource.length) {
    notes.push(
      `${missing.length} catalogue(s) did not contribute to this answer, so it is no evidence about what they hold. Each is named above with the reason.`,
    );
  }
  if (missing.length === result.perSource.length) {
    notes.push(
      "No catalogue answered this question, so its emptiness is the question reaching none of them and is no evidence that what you asked about does not exist.",
    );
  }
  if (cached) {
    notes.push(
      "This answer was replayed from this client's store, so no catalogue was asked for it. What each is reported as saying is what it said when the answer was first read.",
    );
  }
  return notes;
}

export const TOOLS: Tool[] = [
  {
    name: "get_sources",
    title: "What each catalogue answers",
    description:
      "What each configured stash-box catalogue was measured answering, and the day its surface was read from it. Whether a key is held for a catalogue is a fact about this install and changes nothing about what the catalogue does. Reaches no catalogue and takes no argument.",
    inputSchema: sourcesInput,
    declared: sourcesInput,
    outputSchema: sourcesOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client) => {
      const said = describeSources({ configured: client.configured as never });
      const lines = said.sources.map((one) =>
        [
          `  - ${one.name} (${one.identifier_prefix}): ${
            one.key_configured ? "a key is held here" : `no key is held here, set ${one.env_var}`
          }`,
          `    answers: ${one.answers.join(", ")}`,
          // A catalogue that lacks nothing says so, since a line missing
          // from a table reads as a line nobody filled in.
          one.lacks.length === 0
            ? "    lacks nothing this server reads"
            : `    lacks: ${one.lacks.join(", ")}`,
          `    measured ${one.measured_at}`,
        ].join("\n"),
      );
      return {
        text: `Catalogues:\n${lines.join("\n")}\n\n${said.notes.map((one) => `Note: ${one}`).join("\n")}`,
        structured: said as unknown as Record<string, unknown>,
      };
    },
  },
  searchTool(
    "search_scenes",
    "Search scenes",
    "scenes",
    { schema: sceneSearchInput, declared: sceneSearchObject },
    "searchScenes",
  ),
  searchTool(
    "search_performers",
    "Search performers",
    "performers",
    { schema: performerSearchInput, declared: performerSearchObject },
    "searchPerformers",
  ),
  searchTool(
    "search_studios",
    "Search studios",
    "studios",
    { schema: studioSearchInput, declared: studioSearchObject },
    "searchStudios",
  ),
  searchTool(
    "search_tags",
    "Search tags",
    "tags",
    { schema: tagSearchInput, declared: tagSearchObject },
    "searchTags",
  ),
  cardTool("get_scene", "Get one scene", "scene", "scene", {
    sections: severalOf("sections", "the blocks read beside the card", [
      "basic",
      "fingerprints",
      "images",
    ])
      .optional()
      .describe(BLOCKS),
  }),
  cardTool("get_performer", "Get one performer", "performer", "performer", {
    sections: severalOf("sections", "the blocks read beside the card", [
      "basic",
      "appearance",
      "images",
      "studios",
    ])
      .optional()
      .describe(
        `${BLOCKS} 'studios' is the whole table of studios they are credited on, which runs to hundreds of rows.`,
      ),
  }),
  cardTool("get_studio", "Get one studio", "studio", "studio"),
  cardTool("get_tag", "Get one tag", "tag", "tag"),
  {
    name: "find_by_fingerprint",
    title: "Find scenes by fingerprint",
    description:
      "Identify a file from the hashes held for it, across every configured stash-box catalogue. MD5 and OSHASH name the bytes of a file; PHASH states a likeness a re-encode, a crop or another scene from one shoot can satisfy. Each record reached is answered as one card, read on every catalogue that holds it.",
    inputSchema: fingerprintInput,
    declared: fingerprintInput,
    outputSchema: fingerprintOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client, args) => {
      const read = (await client.findByFingerprint(asWritten(args))) as {
        data: Matches;
        cached: boolean;
      };
      return renderMatches(read.data, read.cached);
    },
  },
];
