/**
 * Performers read out of every catalogue that can take the question.
 *
 * The tool publishes two exclusive paths. A `query` runs each catalogue's own
 * text index, which receives nothing else: every typed argument written beside
 * it is reported as one no catalogue was given. The typed arguments run the
 * faceted query, where an identifier reaches only the catalogue that minted it.
 *
 * Nothing here composes a sequence of notes. What qualifies an answer made of
 * rows is one ordered list, held in `answer/rows.ts` and run by both searches,
 * so a rule reaches this answer and its sibling together or reaches neither.
 * What only a performer answer can say travels as an extra rule.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ROWS_PER_PAGE, rowsFacts, rowsNotes, windowFor } from "../answer/rows.js";
import {
  queryUncarriedRule,
  sceneCountRule,
  unreadableDatesRule,
  type Rule,
} from "../answer/notes.js";
import { markerSuffix } from "../answer/marker.js";
import { catalogueOf, dateText, headLine, performerPayload } from "../answer/records.js";
import { reportBlock, reportPayload } from "../answer/report.js";
import {
  inline,
  inlineAll,
  joinLines,
  line,
  lostRows,
  notesBlock,
  pendingEdits,
  section,
  type Rendered,
} from "../answer/text.js";
import type { InstanceId } from "../stashbox/instances.js";
import { PERFORMER_SORTS } from "../stashbox/queries.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { PerformerRecord, RowsResult } from "../types.js";
import {
  catalogues,
  countryCode,
  identifier,
  oneOf,
  severalOf,
  strictInput,
  text as textArgument,
  wholeNumber,
} from "./arguments.js";
import { toolFailure } from "./errorShape.js";
import { searchPerformersOutput } from "./schemas.js";

/** What the caller wrote, as the renderer receives it beside the rows. */
export interface PerformerAsked {
  /** The question was ordered on a field the rows can carry, so they carry it. */
  sorted?: boolean;
  sortedOn?: string;
  /** A record identifier was written to narrow on. */
  identifiersGiven?: boolean;
  /** A limit was written, which the window states. */
  bounded?: boolean;
  cached?: boolean;
  /** Something was written to narrow on, which the rows answer. */
  narrowed?: boolean;
  /** When a replayed answer was first read. */
  readAt?: string | null;
  /** The blocks the caller asked each row to carry. */
  sections?: readonly string[];
}

interface Window {
  page: number;
  limit: number;
}

/* ------------------------------------------------------------ the rendering */

/**
 * The rows, what each catalogue did with the question, and what the answer
 * does not establish.
 */
export function renderPerformerRows(
  result: RowsResult<PerformerRecord>,
  query: string | null,
  window?: Window,
  asked?: PerformerAsked,
): Rendered {
  const identifiersGiven = asked?.identifiersGiven ?? false;
  const facts = rowsFacts<PerformerRecord>(
    result,
    {
      query,
      narrowedOnAnything: asked?.narrowed ?? (query !== null || identifiersGiven),
      identifiersGiven,
      // A performer search reads one identifier per narrowing, so a row it
      // answers with carries every one of them.
      match: "all",
      ...(asked?.sortedOn === undefined ? {} : { sortedOn: asked.sortedOn }),
      bounded: asked?.bounded ?? false,
      cached: asked?.cached ?? false,
      ...(asked?.sections === undefined ? {} : { sections: asked.sections }),
    },
    window,
  );

  const notes = rowsNotes<PerformerRecord>(facts, "person", asked?.readAt ?? null, EXTRA_RULES);
  const times = asked?.sorted === true;
  const rows = result.rows.map((row) =>
    performerLines(row, times && orderedOn(result, row.source)),
  );

  const body = joinLines([
    `${result.rows.length} performer row(s) from the catalogues that answered.`,
    section("Performers", rows, "no catalogue that answered returned a row"),
    reportBlock(result.perSource),
  ]);

  return {
    text: `${body}${notesBlock(notes)}`,
    structured: {
      results: result.rows.map((row) => performerRow(row, times && orderedOn(result, row.source))),
      per_source: reportPayload(result.perSource),
      ordering: result.ordering,
      result_count: result.rows.length,
      ...(window === undefined ? {} : { window }),
      ...(facts.rowsSkipped === 0 ? {} : { rows_skipped: facts.rowsSkipped }),
      ...(result.foldedNarrowings === undefined
        ? {}
        : { folded_narrowings: result.foldedNarrowings }),
      ...(result.absentNarrowings === undefined
        ? {}
        : { absent_narrowings: result.absentNarrowings }),
      ...(result.uncheckedNarrowings === undefined
        ? {}
        : { unchecked_narrowings: result.uncheckedNarrowings }),
      ...(asked?.cached === true ? { cached: true } : {}),
      notes,
    },
  };
}

/**
 * What only a performer answer can say. Anything a scene answer can say too
 * belongs to the shared list and never here.
 */
const EXTRA_RULES: readonly Rule<PerformerRecord>[] = [
  queryUncarriedRule<PerformerRecord>((row) => [row.name, row.disambiguation, ...row.aliases]),
  unreadableDatesRule<PerformerRecord>((row) => [
    ...(row.birthDateUnreadable === true ? ["a birth date"] : []),
    ...(row.deathDateUnreadable === true ? ["a death date"] : []),
  ]),
  sceneCountRule,
];

/**
 * Whether the catalogue behind a row received the sort.
 *
 * The fields an order is read on are carried only where the catalogue applied
 * that order, since a row stamped with them elsewhere offers a reader a check
 * on something nobody performed.
 */
function orderedOn(result: RowsResult<PerformerRecord>, source: string): boolean {
  const report = result.perSource.find((entry) => entry.source === source);
  // A sort the route did not take ordered the rows as little as one the
  // catalogue could not receive, so a stamp read off either would describe an
  // order nothing was put in.
  const away = [
    ...(report?.narrowingsNotReceived ?? []),
    ...(report?.narrowingsOutsideThisRoute ?? []),
  ];
  return report !== undefined && !away.includes("sort");
}

function performerLines(row: PerformerRecord, times: boolean): string {
  const who = catalogueOf(row.source).name;

  return joinLines([
    `- ${headLine(row.name, row.id)}${markerSuffix(row.status)} [${row.id}]`,
    line("  Told apart by", inline(row.disambiguation)),
    line("  Also known as", row.aliases.length === 0 ? null : inlineAll(row.aliases)),
    line("  Gender", inline(row.gender)),
    line("  Country", inline(row.country)),
    line("  Born", dateText(row.birthDate)),
    line("  Died", dateText(row.deathDate)),
    line(`  Scenes indexed on ${who}`, row.sceneCount === null ? null : String(row.sceneCount)),
    line("  Folded into", row.mergedInto),
    line("  Created", times ? row.created : null),
    line("  Updated", times ? row.updated : null),
    line("  Pending edits", pendingEdits(row.pendingEdits, row.pendingEditsUnreadable)),
    line("  Rows left unread inside this record", lostRows(row.rowsSkipped, row.rowsSkippedIn)),
    `  Source: ${row.sourceUrl}`,
  ]);
}

/**
 * One row, under the names the published schema declares.
 *
 * Every block the row carries is named, since a block a record does not carry
 * is published nowhere. The two fields an order is read on are dropped where
 * the catalogue never applied that order.
 */
function performerRow(row: PerformerRecord, times: boolean): Record<string, unknown> {
  const payload = performerPayload(row, ["basic", "appearance", "images", "scenes", "studios"]);
  if (times) return payload;
  const { created: _created, updated: _updated, ...rest } = payload;
  return rest;
}

/* ---------------------------------------------------------- the declaration */

const input = strictInput({
  query: textArgument("query", "a string of words for each catalogue's own text index")
    .optional()
    .describe(
      "Words for each catalogue's own text index. This path takes nothing else: every typed argument written beside it is reported as one no catalogue received.",
    ),
  name: textArgument("name", "words a name carries").optional(),
  disambiguation: textArgument(
    "disambiguation",
    "the free text a catalogue writes to tell two people of one name apart",
  ).optional(),
  country: countryCode("country").optional(),
  performed_with: identifier("performed_with")
    .optional()
    .describe(
      "The record identifier of a performer credited alongside. It reaches the catalogue that minted it and no other.",
    ),
  studio_id: identifier("studio_id")
    .optional()
    .describe(
      "The record identifier of a studio the performer is credited on. It reaches the catalogue that minted it and no other.",
    ),
  sort: oneOf("sort", "the order each catalogue applies", PERFORMER_SORTS).optional(),
  direction: oneOf("direction", "which way that order runs", ["asc", "desc"]).optional(),
  page: wholeNumber("page", "the page to read", 1, 1000).optional(),
  limit: wholeNumber("limit", "how many rows one page carries", 1, 100).optional(),
  sources: catalogues("sources").optional(),
  sections: severalOf("sections", "the blocks each row carries", [
    "basic",
    "appearance",
    "images",
    "scenes",
    "studios",
  ]).optional(),
});

type Input = z.infer<typeof input>;

const DESCRIPTION =
  "Search performers across every configured stash-box catalogue. Two exclusive paths: 'query' runs each catalogue's own text index and every typed argument beside it is reported as one no catalogue received; the typed arguments run the faceted query. Counts belong to the catalogue that published them and are never added. A catalogue that failed, one never asked and one that looked and found nothing are three different states, and the answer says which is which per catalogue.";

export function registerSearchPerformers(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "search_performers",
    {
      title: "Search performers",
      description: DESCRIPTION,
      inputSchema: input,
      outputSchema: searchPerformersOutput,
    },
    async (args: Input) => {
      try {
        const read = await client.searchPerformers({
          ...(args.query === undefined ? {} : { query: args.query }),
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.disambiguation === undefined ? {} : { disambiguation: args.disambiguation }),
          ...(args.country === undefined ? {} : { country: args.country }),
          ...(args.performed_with === undefined ? {} : { performedWith: args.performed_with }),
          ...(args.studio_id === undefined ? {} : { studioId: args.studio_id }),
          ...(args.sort === undefined ? {} : { sort: args.sort }),
          ...(args.direction === undefined ? {} : { direction: args.direction }),
          ...(args.page === undefined ? {} : { page: args.page }),
          ...(args.limit === undefined ? {} : { limit: args.limit }),
          // The enum is built from the registry, so a name it accepts is one.
          ...(args.sources === undefined ? {} : { sources: args.sources as InstanceId[] }),
          ...(args.sections === undefined ? {} : { sections: args.sections }),
        });

        const identifiersGiven = args.performed_with !== undefined || args.studio_id !== undefined;

        const rendered = renderPerformerRows(
          read.data,
          args.query ?? null,
          windowFor(read.data.perSource, args.page ?? 1, args.limit ?? ROWS_PER_PAGE),
          {
            sorted: args.sort === "created" || args.sort === "updated",
            ...(args.sort === undefined ? {} : { sortedOn: args.sort }),
            identifiersGiven,
            bounded: args.limit !== undefined,
            cached: read.cached,
            ...(args.sections === undefined ? {} : { sections: args.sections }),
            narrowed:
              args.query !== undefined ||
              args.name !== undefined ||
              args.disambiguation !== undefined ||
              args.country !== undefined ||
              identifiersGiven,
          },
        );

        return {
          content: [{ type: "text" as const, text: rendered.text }],
          structuredContent: rendered.structured,
        };
      } catch (cause) {
        return toolFailure(cause);
      }
    },
  );
}
