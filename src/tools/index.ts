/**
 * The ten tools this server publishes, declared in one place.
 *
 * They are declared as a list rather than registered one by one, and that is
 * the point of the file. A rule honoured at three registrars out of five is the
 * defect this project has met in every review: the hint that says this server
 * writes nowhere, the schema every answer is shaped by, the code every refusal
 * opens with. Stated over a list, a rule reaches every tool or reaches none,
 * and the suite runs its assertions over the same list.
 *
 * The order is fixed on purpose: a client caches the list it is given, and an
 * order that varies between two runs invalidates that cache for nothing.
 */

import { z } from "zod";

import { describeSources } from "../answer/sources.js";
import { renderCard } from "../answer/render.js";
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
  wholeNumber,
} from "./arguments.js";
import { cardOutput, fingerprintOutput, rowsOutput, sourcesOutput } from "./schemas.js";

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
  inputSchema: z.ZodTypeAny;
  outputSchema: Record<string, unknown>;
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

const sceneSearchInput = datedTogether(
  exclusiveQuery(
    strictInput({
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
    }),
    [
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
    ],
  ),
);

const performerSearchInput = exclusiveQuery(
  strictInput({
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
  }),
  [
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
  ],
);

const studioSearchInput = exclusiveQuery(
  strictInput({
    query: text("query", "a string of words").optional().describe(WORDS),
    name: text("name", "words a name carries").optional(),
    parent_id: identifier("parent_id").optional(),
    has_parent: z.boolean().optional().describe("Whether the studio sits under another."),
    ...paging("studios"),
  }),
  ["name", "parent_id", "has_parent"],
);

const tagSearchInput = exclusiveQuery(
  strictInput({
    query: text("query", "a string of words").optional().describe(WORDS),
    name: text("name", "words a name carries").optional(),
    category_id: identifier("category_id").optional(),
    ...paging("tags"),
  }),
  ["name", "category_id"],
);

const CODE = "[invalid_input]";

const fingerprintEntry = strictInput({
  hash: text("hash", "one fingerprint as the catalogues store it"),
  algorithm: oneOf("algorithm", "how that hash was computed", ["MD5", "OSHASH", "PHASH"]),
});

const fingerprintInput = strictInput({
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
});

const SEARCH_TAIL =
  "A catalogue that failed, one never asked and one that looked and found nothing are three different states, and the answer says which is which per catalogue. Counts belong to the catalogue that published them and are never added.";

const CARD_TAIL =
  "The answer is one card, read on every catalogue that holds the record and reached by the link each of them publishes to the same record elsewhere. Every value names the catalogues that said it, and where they disagree the reading nobody preferred is published beside the one that won. Name 'sources' to read one catalogue alone.";

function searchTool(
  name: string,
  title: string,
  what: string,
  inputSchema: z.ZodTypeAny,
  call: keyof Pick<
    Catalogues,
    "searchScenes" | "searchPerformers" | "searchStudios" | "searchTags"
  >,
): Tool {
  return {
    name,
    title,
    description: `Search ${what} across every configured stash-box catalogue. Two exclusive paths: 'query' runs each catalogue's own text index, which reads the words as a union, and the typed arguments narrow as an intersection. Writing both is refused. ${SEARCH_TAIL}`,
    inputSchema,
    outputSchema: rowsOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client, args) => {
      const read = await client[call](args);
      return read.data as Rendered;
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
    outputSchema: cardOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client, args) => {
      const read = await client.getCard(kind, String(args.id), args);
      return renderCard(read.data as never, kind);
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
    outputSchema: sourcesOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client) => {
      const said = describeSources({ configured: client.configured as never });
      const lines = said.sources.map(
        (one) =>
          `  - ${one.name} (${one.identifier_prefix}): ${one.key_configured ? "a key is held" : `no key is held, set ${one.env_var}`}; answers ${one.answers.join(", ")}; publishes none of ${one.lacks.join(", ") || "nothing"}; measured ${one.measured_at}`,
      );
      return {
        text: `Catalogues:\n${lines.join("\n")}\n\n${said.notes.map((one) => `Note: ${one}`).join("\n")}`,
        structured: said as unknown as Record<string, unknown>,
      };
    },
  },
  searchTool("search_scenes", "Search scenes", "scenes", sceneSearchInput, "searchScenes"),
  searchTool(
    "search_performers",
    "Search performers",
    "performers",
    performerSearchInput,
    "searchPerformers",
  ),
  searchTool("search_studios", "Search studios", "studios", studioSearchInput, "searchStudios"),
  searchTool("search_tags", "Search tags", "tags", tagSearchInput, "searchTags"),
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
    outputSchema: fingerprintOutput,
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (client, args) => {
      const read = await client.findByFingerprint(args);
      return read.data as Rendered;
    },
  },
];
