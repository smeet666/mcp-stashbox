/**
 * Scenes read out of every catalogue that can take the question.
 *
 * The tool publishes two exclusive paths. A `query` runs each catalogue's own
 * text index, which receives nothing else: every typed argument written beside
 * it is reported as one no catalogue was given. The typed arguments run the
 * faceted query, where a list of identifiers reaches only the catalogue that
 * minted them.
 *
 * Nothing here composes a sequence of notes. What qualifies an answer made of
 * rows is one ordered list, held in `answer/rows.ts` and run by both searches,
 * so a rule reaches this answer and its sibling together or reaches neither.
 * What only a scene answer can say travels as an extra rule.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ROWS_PER_PAGE, rowsFacts, rowsNotes } from "../answer/rows.js";
import { queryUncarriedRule, unreadableDatesRule, type Rule } from "../answer/notes.js";
import { markerSuffix } from "../answer/marker.js";
import { dateText, durationText, headLine, scenePayload, tagsText } from "../answer/records.js";
import { reportBlock, reportPayload } from "../answer/report.js";
import {
  inline,
  joinLines,
  line,
  lostRows,
  notesBlock,
  pendingEdits,
  section,
  type Rendered,
} from "../answer/text.js";
import type { InstanceId } from "../stashbox/instances.js";
import { SCENE_SORTS } from "../stashbox/queries.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { RowsResult, SceneRecord } from "../types.js";
import {
  calendarDay,
  catalogues,
  identifiers,
  oneOf,
  severalOf,
  strictInput,
  text as textArgument,
  wholeNumber,
} from "./arguments.js";
import { toolFailure } from "./errorShape.js";
import { searchScenesOutput } from "./schemas.js";

/** What the caller wrote, as the renderer receives it beside the rows. */
export interface SceneAsked {
  identifiersGiven: boolean;
  match: "all" | "any";
  /** The question was ordered on a field the rows can carry, so they carry it. */
  sorted?: boolean;
  sortedOn?: string;
  /** A limit was written, which the window states. */
  bounded?: boolean;
  cached?: boolean;
  /** Something was written to narrow on, which the rows answer. */
  narrowed?: boolean;
  /** When a replayed answer was first read. */
  readAt?: string | null;
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
export function renderSceneRows(
  result: RowsResult<SceneRecord>,
  query: string | null,
  window?: Window,
  asked?: SceneAsked,
): Rendered {
  const identifiersGiven = asked?.identifiersGiven ?? false;
  const facts = rowsFacts<SceneRecord>(
    result,
    {
      query,
      narrowedOnAnything: asked?.narrowed ?? (query !== null || identifiersGiven),
      identifiersGiven,
      match: asked?.match ?? "all",
      ...(asked?.sortedOn === undefined ? {} : { sortedOn: asked.sortedOn }),
      bounded: asked?.bounded ?? false,
      cached: asked?.cached ?? false,
    },
    window,
  );

  const notes = rowsNotes<SceneRecord>(facts, "scene", asked?.readAt ?? null, EXTRA_RULES);
  const times = asked?.sorted === true;
  const rows = result.rows.map((row) => sceneLines(row, times, orderedOn(result, row.source)));

  const body = joinLines([
    `${result.rows.length} scene row(s) from the catalogues that answered.`,
    section("Scenes", rows, "no catalogue that answered returned a row"),
    reportBlock(result.perSource),
  ]);

  return {
    text: `${body}${notesBlock(notes)}`,
    structured: {
      results: result.rows.map((row) => sceneRow(row, times && orderedOn(result, row.source))),
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
 * What only a scene answer can say. Anything a performer answer can say too
 * belongs to the shared list and never here.
 */
const EXTRA_RULES: readonly Rule<SceneRecord>[] = [
  queryUncarriedRule<SceneRecord>((row) => [row.title, row.details, row.code]),
  unreadableDatesRule<SceneRecord>((row) => [
    ...(row.releaseDateUnreadable === true ? ["a release date"] : []),
    ...(row.productionDateUnreadable === true ? ["a production date"] : []),
  ]),
];

/**
 * Whether the catalogue behind a row received the sort.
 *
 * The fields an order is read on are carried only where the catalogue applied
 * that order, since a row stamped with them elsewhere offers a reader a check
 * on something nobody performed.
 */
function orderedOn(result: RowsResult<SceneRecord>, source: string): boolean {
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

function sceneLines(row: SceneRecord, times: boolean, ordered: boolean): string {
  const tags = tagsText(row.tags);
  const credits = row.performers
    .map((credit) => `${inline(credit.name) ?? credit.id}${markerSuffix(credit.status)}`)
    .join(", ");

  return joinLines([
    `- ${headLine(row.title, row.id)}${markerSuffix(row.status)} [${row.id}]`,
    line(
      "  Studio",
      row.studio === null
        ? null
        : `${inline(row.studio.name) ?? row.studio.id}${markerSuffix(row.studio.status)}`,
    ),
    line("  Released", dateText(row.releaseDate)),
    line("  Duration", durationText(row.durationSeconds)),
    line("  Code", inline(row.code)),
    line("  Director", inline(row.director)),
    line("  Credited", credits === "" ? null : credits),
    line("  Tags", tags === "" ? null : tags),
    line("  Created", times && ordered ? row.created : null),
    line("  Updated", times && ordered ? row.updated : null),
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
function sceneRow(row: SceneRecord, times: boolean): Record<string, unknown> {
  const payload = scenePayload(row, ["basic", "fingerprints", "images"]);
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
  title: textArgument("title", "words a title carries").optional(),
  code: textArgument("code", "the studio's own reference for the release").optional(),
  date_from: calendarDay("date_from", "the earliest release date to answer with").optional(),
  date_to: calendarDay("date_to", "the latest release date to answer with").optional(),
  performer_ids: identifiers("performer_ids")
    .optional()
    .describe(
      "Record identifiers of the performers credited. Each reaches the catalogue that minted it and no other.",
    ),
  studio_ids: identifiers("studio_ids").optional(),
  tag_ids: identifiers("tag_ids").optional(),
  match: oneOf("match", "how a list of identifiers is read", ["all", "any"])
    .optional()
    .describe(
      "How a list of record identifiers is read: 'all' answers with rows carrying every one of them, 'any' with rows carrying one. It reads a list, so it selects nothing where none was written.",
    ),
  sort: oneOf("sort", "the order each catalogue applies", SCENE_SORTS).optional(),
  direction: oneOf("direction", "which way that order runs", ["asc", "desc"]).optional(),
  page: wholeNumber("page", "the page to read", 1, 1000).optional(),
  limit: wholeNumber("limit", "how many rows one page carries", 1, 100).optional(),
  sources: catalogues("sources").optional(),
  sections: severalOf("sections", "the blocks each row carries", [
    "basic",
    "fingerprints",
    "images",
  ]).optional(),
});

type Input = z.infer<typeof input>;

const DESCRIPTION =
  "Search scenes across every configured stash-box catalogue. Two exclusive paths: 'query' runs each catalogue's own text index and every typed argument beside it is reported as one no catalogue received; the typed arguments run the faceted query. Counts belong to the catalogue that published them and are never added. A catalogue that failed, one never asked and one that looked and found nothing are three different states, and the answer says which is which per catalogue.";

export function registerSearchScenes(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "search_scenes",
    {
      title: "Search scenes",
      description: DESCRIPTION,
      inputSchema: input,
      outputSchema: searchScenesOutput,
    },
    async (args: Input) => {
      try {
        const read = await client.searchScenes({
          ...(args.query === undefined ? {} : { query: args.query }),
          ...(args.title === undefined ? {} : { title: args.title }),
          ...(args.code === undefined ? {} : { code: args.code }),
          ...(args.date_from === undefined ? {} : { dateFrom: args.date_from }),
          ...(args.date_to === undefined ? {} : { dateTo: args.date_to }),
          ...(args.performer_ids === undefined ? {} : { performerIds: args.performer_ids }),
          ...(args.studio_ids === undefined ? {} : { studioIds: args.studio_ids }),
          ...(args.tag_ids === undefined ? {} : { tagIds: args.tag_ids }),
          ...(args.match === undefined ? {} : { match: args.match }),
          ...(args.sort === undefined ? {} : { sort: args.sort }),
          ...(args.direction === undefined ? {} : { direction: args.direction }),
          ...(args.page === undefined ? {} : { page: args.page }),
          ...(args.limit === undefined ? {} : { limit: args.limit }),
          // The enum is built from the registry, so a name it accepts is one.
          ...(args.sources === undefined ? {} : { sources: args.sources as InstanceId[] }),
          ...(args.sections === undefined ? {} : { sections: args.sections }),
        });

        const identifiersGiven =
          args.performer_ids !== undefined ||
          args.studio_ids !== undefined ||
          args.tag_ids !== undefined;
        // A window states a page a catalogue paged through. Where every
        // catalogue asked failed, the emptiness is the failure's and sits
        // inside no window at all.
        const answered = read.data.perSource.some((report) => report.state === "answered");
        const rendered = renderSceneRows(
          read.data,
          args.query ?? null,
          answered ? { page: args.page ?? 1, limit: args.limit ?? ROWS_PER_PAGE } : undefined,
          {
            identifiersGiven,
            match: args.match ?? "all",
            sorted: args.sort === "created" || args.sort === "updated",
            ...(args.sort === undefined ? {} : { sortedOn: args.sort }),
            bounded: args.limit !== undefined,
            cached: read.cached,
            narrowed:
              args.query !== undefined ||
              args.title !== undefined ||
              args.code !== undefined ||
              args.date_from !== undefined ||
              args.date_to !== undefined ||
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
