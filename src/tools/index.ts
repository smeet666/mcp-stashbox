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
import { renderCard, renderRows } from "../answer/render.js";
import type { Rendered } from "../answer/text.js";
import { MOST_IDENTIFIERS } from "../stashbox/narrowings.js";
import { SORTS } from "../stashbox/queries.js";
import {
  catalogues,
  countryCode,
  calendarDay,
  datedTogether,
  exclusiveQuery,
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
    page: wholeNumber("page", "the page to read", 1, 1000).optional(),
    limit: wholeNumber("limit", "how many rows one page carries", 1, 100).optional(),
    sources: catalogues("sources").optional(),
  };
}

const held = {
  sources: catalogues("sources").optional(),
  prefer: catalogues("prefer")
    .optional()
    .describe(
      "The order the catalogues are preferred in where they disagree on a field. Left out, the order the registry declares stands. Every card states the order that was applied.",
    ),
};

const WORDS =
  "Words for the catalogue's own text index, which reads them as a union. It is exclusive with the typed arguments, which narrow as an intersection.";

/* ---------------------------------------------------------------- the ten */

const sourcesInput = strictInput({});

const sceneSearchShape = {
  query: text("query", "a string of words").optional().describe(WORDS),
  title: text("title", "words a title carries").optional(),
  code: text("code", "the studio's own reference for the release").optional(),
  alias: text("alias", "another title the release is known by").optional(),
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
  match: oneOf("match", "how a list of identifiers is read", ["all", "any"]).optional(),
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
  alias: text("alias", "another name they are known by").optional(),
  disambiguation: text(
    "disambiguation",
    "the text telling two people of one name apart",
  ).optional(),
  gender: text("gender", "the gender the catalogue records").optional(),
  country: countryCode("country").optional(),
  ethnicity: text("ethnicity", "the ethnicity the catalogue records").optional(),
  birth_year: wholeNumber("birth_year", "the year of birth", 1800, 2200).optional(),
  career_start_year: wholeNumber(
    "career_start_year",
    "the year a career opened",
    1800,
    2200,
  ).optional(),
  career_end_year: wholeNumber(
    "career_end_year",
    "the year a career closed",
    1800,
    2200,
  ).optional(),
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

const fingerprintEntry = strictInput({
  hash: text("hash", "one fingerprint as the catalogues store it"),
  algorithm: oneOf("algorithm", "how that hash was computed", ["MD5", "OSHASH", "PHASH"]),
});

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
  ...held,
};

const fingerprintInput = strictInput(fingerprintShape);

const SEARCH_TAIL =
  "A catalogue that failed, one never asked and one that looked and found nothing are three different states, and the answer says which is which per catalogue. Counts belong to the catalogue that published them and are never added.";

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
    outputSchema: rowsOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client, args) => {
      const read = await client[call](asWritten(args));
      const rows = read.data as never as Parameters<typeof renderRows>[0] & { notes?: string[] };
      return renderRows(
        rows,
        what.slice(0, -1),
        rowNotes(rows, what.slice(0, -1), read.cached),
        read.cached,
      );
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
      return renderCard(read.data as never, kind, read.cached);
    },
  };
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
    perSource: { state: string; count?: number; name?: string; source: string }[];
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
    notes.push(
      `These catalogues looked and found nothing for this question: ${named(answered)}. That is an emptiness they established, and it says nothing about the catalogues below.`,
    );
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

/**
 * What a fingerprint answer states, and what each kind of hash claims.
 *
 * The distinction decides the whole answer. An MD5 and an OSHASH are computed
 * from the bytes of a file, so a match on one names the file. A PHASH states a
 * likeness, which a re-encode, a crop and another scene from one shoot all
 * satisfy: rendered under one word, a resemblance reaches a reader as an
 * identity and a caller acts on a file they never had.
 */
function renderMatches(
  result: {
    matches: { scene: never; algorithm: string; hash: string; matchKind: string }[];
    match_count: number;
    scenes_matched: number;
    unattributed: number;
    asked: { hash: string; algorithm: string }[];
    perSource: { source: string; name?: string; state: string; reason?: string }[];
  },
  cached: boolean,
): Rendered {
  const notes: string[] = [];
  if (result.matches.some((one) => one.matchKind === "perceptual_similarity")) {
    notes.push(
      "A perceptual hash states a likeness. A record it reaches may hold a re-encode, a crop, or another scene from one shoot, so a match of that kind establishes a resemblance and says nothing about the bytes of either file.",
    );
  }
  if (result.matches.some((one) => one.matchKind === "exact_file")) {
    notes.push(
      "An MD5 and an OSHASH are computed from the bytes of a file, so a match on one of them names the file the hash was taken from, and two catalogues answering one of them describe the same bytes.",
    );
  }
  const failed = result.perSource.filter((one) => one.state === "failed");
  if (failed.length > 0) {
    notes.push(
      `These catalogues could not answer, so this holds no record of theirs and states nothing about what they hold: ${failed.map((one) => one.name ?? one.source).join(", ")}.`,
    );
  }
  if (result.unattributed > 0) {
    notes.push(
      `${result.unattributed} record(s) the catalogues answered with carry none of the hashes asked. Which hash reached them is unknown, so they stand here as no match and are counted apart.`,
    );
  }
  if (result.matches.length === 0 && result.perSource.some((one) => one.state === "answered")) {
    notes.push(
      "The catalogues that answered hold no record carrying the fingerprints asked, so each of them looked and found nothing.",
    );
  }
  if (cached) {
    notes.push(
      "This answer was replayed from this client's store, so no catalogue was asked for it.",
    );
  }

  const cards = result.matches.map((one) => renderCard(one.scene, "scene"));
  const body = [
    `${result.asked.length} fingerprint(s) asked, ${result.match_count} match(es) on ${result.scenes_matched} record(s).`,
    `Asked: ${result.asked.map((one) => `${one.algorithm} ${one.hash}`).join(", ")}`,
    ...cards.map((one, at) => {
      const match = result.matches[at];
      return `\n${match?.algorithm ?? ""} ${match?.matchKind === "exact_file" ? "names these bytes" : "resembles this"}:\n${one.text}`;
    }),
  ].join("\n");

  return {
    text: `${body}${notes.length === 0 ? "" : `\n\n${notes.map((one) => `Note: ${one}`).join("\n")}`}`,
    structured: {
      matches: result.matches.map((one, at) => ({
        scene: (cards[at]?.structured as { card: unknown }).card,
        algorithm: one.algorithm,
        hash: one.hash,
        match_kind: one.matchKind,
      })),
      match_count: result.match_count,
      scenes_matched: result.scenes_matched,
      unattributed: result.unattributed,
      asked: result.asked,
      per_source: result.perSource,
      ...(cached ? { cached: true } : {}),
      notes,
    },
  };
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
    sections: severalOf("sections", "the blocks each answer carries", [
      "basic",
      "fingerprints",
      "images",
    ]).optional(),
  }),
  cardTool("get_performer", "Get one performer", "performer", "performer", {
    sections: severalOf("sections", "the blocks each answer carries", [
      "basic",
      "appearance",
      "images",
      "studios",
    ]).optional(),
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
        data: {
          matches: { scene: never; algorithm: string; hash: string; matchKind: string }[];
          match_count: number;
          scenes_matched: number;
          unattributed: number;
          asked: { hash: string; algorithm: string }[];
          perSource: { source: string; name?: string; state: string; reason?: string }[];
        };
        cached: boolean;
      };
      return renderMatches(read.data, read.cached);
    },
  },
];
