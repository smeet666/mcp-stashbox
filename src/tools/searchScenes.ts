/**
 * Scenes across every configured catalogue.
 *
 * Nothing here ranks a row against a row from another catalogue: they publish no
 * score in common, so an order built from one would rank on a quantity half the
 * rows cannot have. Rows interleave, and the answer says so.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { RowsResult, SceneRecord } from "../types.js";
import {
  strictInput,
  narrowingText,
  narrowingList,
  dayArgument,
  sourcesArgument,
  boundedInteger,
  optionSet,
} from "./arguments.js";
import { searchScenesOutput } from "./schemas.js";
import {
  coverageNote,
  reportPayload,
  nobodyAskedNote,
  windowNote,
  pageWasHonoured,
  indexTotalNote,
  emptyDespiteReachNote,
  orderingNote,
  pastTheEndNote,
  failureNote,
  skippedNote,
  foldedNarrowingNote,
  uncheckedNarrowingNote,
  absentNarrowingNote,
  foldedCreditsNote,
  storedNote,
  narrowingNote,
  dateText,
  joinLines,
  notesBlock,
  perSourceText,
  inline,
  inlineAll,
  type Rendered,
} from "./shared.js";
import { toolError } from "./errorShape.js";

export function renderSceneRows(
  result: RowsResult<SceneRecord>,
  query: string | null,
  window?: { page: number; limit: number },
  asked?: {
    narrowedOnAnything?: boolean;
    identifiersGiven: boolean;
    match: "all" | "any";
    sorted?: boolean;
    bounded?: boolean;
    cached?: boolean;
    sortedOn?: string;
  },
): Rendered {
  const identifiersGiven = asked?.identifiersGiven ?? false;
  const narrowedOnAnything = asked?.narrowedOnAnything ?? true;
  const match = asked?.match ?? "all";
  const sorted = asked?.sorted ?? false;
  const cached = asked?.cached ?? false;
  // The stamps exist so the order can be read on the rows. Carried where the
  // catalogue refused the sort, they describe an order nothing was put in.
  const sortReached = result.perSource.some(
    (entry) => entry.state === "answered" && !(entry.narrowingsNotReceived ?? []).includes("sort"),
  );
  const stamped = sortReached && (asked?.sortedOn === "created" || asked?.sortedOn === "updated");
  const bounded = asked?.bounded ?? false;
  // Only what qualifies this answer. The ordering and the per-catalogue counts
  // are in the payload beside the rows they describe, and repeating them on
  // every call is what stops a reader reading the notes that matter.
  const answeringCount = Math.max(
    1,
    result.perSource.filter((entry) => entry.state === "answered").length,
  );
  const notes: string[] = [];

  // How the order was built belongs to an answer that has rows to order: a
  // reader takes the first row for the best one, and no row here was ranked
  // against another.
  if (result.rows.length) notes.push(`Rows are ${result.ordering}.`);

  // A count belongs to the catalogue that answered it. The warning against
  // adding them is owed to an answer holding more than one to add, and read
  // beside a single count it describes an arithmetic nobody could perform.
  const counting = result.perSource.filter(
    (entry) => entry.state === "answered" && entry.count,
  ).length;
  if (counting > 1) {
    notes.push(
      "Counts are reported per catalogue and are never added: the catalogues index overlapping corpora, and one scene held by two of them carries two identifiers there.",
    );
  }
  // Only where a catalogue received the narrowing and answered with rows: a
  // note built from the argument would assert a filter on rows nobody filtered.
  const filtered = result.perSource.some(
    (entry) =>
      entry.state === "answered" &&
      entry.count &&
      !(entry.narrowingsNotReceived ?? []).some(
        (name) => name.endsWith("_ids") || name === "match",
      ) &&
      // A list received short narrowed on part of itself, so a row of that
      // catalogue's satisfies the part and never the list as it was written.
      !(entry.narrowingsNamingNoRecord ?? []).length &&
      !(entry.narrowingsReceivedInPart ?? []).length,
  );
  if (identifiersGiven && filtered) {
    notes.push(
      match === "any"
        ? "A row from a catalogue that received the list carries at least one of the identifiers given."
        : "A row from a catalogue that received the list carries every identifier given.",
    );
  }
  // A statement about counts belongs to an answer that carries one.
  // The sentence describes the rows below the first, so it belongs to an
  // answer that has one.
  const counted =
    result.rows.length > 0 && result.perSource.some((entry) => entry.state === "answered");
  if (query && counted) {
    notes.push(
      "A count reports how many records a catalogue's index touched for these words. Rows below the first can share a single word of what was asked.",
    );
  }
  // A record dated to the year is compared as though it were the first day of
  // that year, so a bound written as a day admits records whose date names none.
  if (
    bounded &&
    result.rows.some((row) => row.releaseDate && row.releaseDate.precision !== "day")
  ) {
    notes.push(
      "Some rows carry a date recorded to the month or the year. A catalogue compares those as the first day of the period, so a bound written as a day admits records whose own date names none.",
    );
  }
  // A search given nothing to narrow on is a page of the whole index. Read
  // without that said, its rows look like the answer to a question.
  if (!narrowedOnAnything && result.rows.length) {
    notes.push(
      "Nothing was given to narrow this search, so these rows are a page of each catalogue's whole index, in its own order. They answer no question beyond that.",
    );
  }
  // A catalogue answering past the limit makes the stated window describe a
  // page the answer does not hold, and a caller paging on it skips rows.
  const overRunning = window
    ? result.perSource.filter(
        (entry) => entry.state === "answered" && (entry.count ?? 0) > window.limit,
      )
    : [];
  if (window && (overRunning.length || result.rows.length > window.limit * answeringCount)) {
    const named = overRunning.length
      ? overRunning.map((entry) => entry.name ?? entry.source).join(", ")
      : "a catalogue";
    notes.push(
      `${named} returned more rows than the limit asked for: this answer carries ${result.rows.length} where ${window.limit} per catalogue were asked. Page on what is shown here rather than on that limit.`,
    );
  }
  const undated = [
    ...new Set(result.rows.filter((row) => row.releaseDateUnreadable).map((row) => row.source)),
  ];
  if (undated.length) {
    notes.push(
      `Some rows from ${undated.join(", ")} carry a release date this client could not read, so none is stated on them. That is a date dropped and never a record carrying none.`,
    );
  }
  const covered = windowNote(result.perSource, window);
  if (covered) notes.push(covered);
  const narrowings = narrowingNote(result.perSource);
  if (narrowings) notes.push(narrowings);
  const reach = indexTotalNote(result.perSource);
  if (reach) notes.push(reach);
  const disagreeing = emptyDespiteReachNote(result.perSource, window);
  if (disagreeing) notes.push(disagreeing);
  const ordering = orderingNote(result.perSource, sorted);
  if (ordering) notes.push(ordering);
  const pastEnd = pastTheEndNote(result.perSource, window);
  if (pastEnd) notes.push(pastEnd);
  let damagedRows = 0;
  const damaged = result.rows.reduce((total, row) => total + (row.rowsSkipped ?? 0), 0);
  if (damaged) {
    damagedRows = damaged;
    notes.push(
      `${damaged} row(s) inside the records listed here could not be read and are left out of what each one shows of its own lists. Read a record for what it says about its own losses.`,
    );
  }
  const folded = foldedCreditsNote(result.rows);
  if (folded) notes.push(folded);
  const foldedNarrowing = foldedNarrowingNote(result.foldedNarrowings);
  if (foldedNarrowing) notes.push(foldedNarrowing);
  const absentHere = absentNarrowingNote(result.absentNarrowings);
  if (absentHere) notes.push(absentHere);
  const unchecked = uncheckedNarrowingNote(result.uncheckedNarrowings);
  if (unchecked) notes.push(unchecked);
  const lost = skippedNote(result.perSource);
  if (lost) notes.push(lost);
  const failures = failureNote(result.perSource);
  if (failures) notes.push(failures);
  // A window describes rows a catalogue read. Where every catalogue asked
  // failed, the emptiness is the failure and not an emptiness inside a window.
  const answeredAny = result.perSource.some((entry) => entry.state === "answered");
  const nobody = nobodyAskedNote(result.perSource);
  if (nobody) notes.push(nobody);
  const coverage = coverageNote(result.perSource);
  if (!nobody && coverage) notes.push(coverage);
  const stored = storedNote(cached, result.rows[0]?.retrievedAt ?? null);
  if (stored) notes.push(stored);

  const structured: Record<string, unknown> = {
    ...(query === null ? {} : { query }),
    results: result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      release_date: row.releaseDate,
      duration_seconds: row.durationSeconds,
      studio: row.studio?.name ?? null,
      // A name alone cannot be fed back into a narrowing, and says nothing
      // about whether the catalogue still holds the record under it.
      studio_id: row.studio?.id ?? null,
      studio_status: row.studio?.status ?? null,
      performers: row.performers.map((entry) => entry.name),
      status: row.status,
      ...(stamped ? { created: row.created, updated: row.updated } : {}),
      retrieved_at: row.retrievedAt,
      source_url: row.sourceUrl,
    })),
    result_count: result.rows.length,
    ordering: result.ordering,
    ...(window && !nobody && answeredAny
      ? {
          window: {
            ...window,
            ...(pageWasHonoured(result.perSource) ? {} : { page_received_by_all: false }),
          },
        }
      : {}),
    ...(damagedRows ? { rows_skipped: damagedRows } : {}),
    per_source: reportPayload(result.perSource),
    ...(cached ? { cached: true } : {}),
    notes,
  };

  const text =
    joinLines([
      `# ${result.rows.length} scene(s)${query ? ` for "${query}"` : ""}`,
      ...result.rows.map((row) =>
        joinLines([
          `\n- ${inline(row.title) ?? "(untitled)"} [${row.source}]${row.status === "established" ? "" : `${row.status === "merged" ? " — merged, so this identifier now addresses the record it was folded into" : " — withdrawn, so this identifier states nothing about what it once named"}`}`,
          row.releaseDate ? `    released: ${dateText(row.releaseDate)}` : null,
          row.studio ? `    studio: ${inline(row.studio.name)}` : null,
          row.performers.length
            ? `    performers: ${inlineAll(row.performers.map((entry) => entry.name))}`
            : null,
          stamped && (row.created || row.updated)
            ? `    catalogued: ${row.created ?? "?"}, last touched: ${row.updated ?? "?"}`
            : null,
          `    id: ${row.id}`,
          `    Source: ${row.sourceUrl}`,
        ]),
      ),
      `\nCatalogues:\n${perSourceText(result.perSource)
        .map((entry) => `  - ${entry}`)
        .join("\n")}`,
    ]) + notesBlock(notes);

  return { text, structured };
}

export function registerSearchScenes(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "search_scenes",
    {
      title: "Search scenes",
      description:
        "Ask every configured catalogue for scenes. The two paths are exclusive: giving 'query' runs the full-text search and every typed argument is reported as not received, while omitting it runs the faceted query on the typed arguments. A catalogue whose search narrows nothing is named as absent from this tool altogether. Counts are per catalogue and are never added, and a catalogue that failed, one never asked and one that found nothing are three different states an answer names.",
      inputSchema: strictInput({
        query: narrowingText("Free text matched against a scene's own fields.").optional(),
        title: narrowingText().optional(),
        code: narrowingText("The studio's own reference for the scene.").optional(),
        performer_ids: narrowingList("Namespaced performer identifiers.").optional(),
        match: optionSet(["all", "any"], "")
          .optional()
          .describe(
            "How a list of identifiers reads. 'all' returns scenes carrying every one of them and is the default; 'any' returns scenes carrying at least one.",
          ),
        studio_ids: narrowingList().optional(),
        tag_ids: narrowingList().optional(),
        date_from: dayArgument(
          "Released strictly after this date, as YYYY-MM-DD. A catalogue takes one date comparison at a time, so giving both bounds sends this one and reports the other as not received.",
        ).optional(),
        date_to: dayArgument("Released strictly before this date, as YYYY-MM-DD.").optional(),
        sort: optionSet(
          ["title", "date", "duration", "created", "updated"],
          "Which field each catalogue orders its own rows on.",
        ).optional(),
        direction: optionSet(["asc", "desc"], "Which way that order runs.").optional(),
        limit: boundedInteger(1, 100, "Rows asked of each catalogue.").optional(),
        page: boundedInteger(1, 10_000, "Which page of those rows.").optional(),
        sources: sourcesArgument(
          "Narrow to named catalogues. Every configured catalogue is asked by default.",
        ).optional(),
      }).refine((args) => !(args.date_from && args.date_to && args.date_from >= args.date_to), {
        error:
          "[invalid_input] 'date_from' names a day at or after 'date_to', so the two bounds enclose no day. A catalogue asked for that interval finds nothing, and the emptiness would read as a catalogue holding none.",
      }),
      outputSchema: searchScenesOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const read = await client.searchScenes({
          ...(args.query ? { query: args.query } : {}),
          ...(args.match ? { match: args.match } : {}),
          ...(args.title ? { title: args.title } : {}),
          ...(args.code ? { code: args.code } : {}),
          ...(args.performer_ids ? { performerIds: args.performer_ids } : {}),
          ...(args.studio_ids ? { studioIds: args.studio_ids } : {}),
          ...(args.tag_ids ? { tagIds: args.tag_ids } : {}),
          ...(args.date_from ? { dateFrom: args.date_from } : {}),
          ...(args.date_to ? { dateTo: args.date_to } : {}),
          ...(args.sort ? { sort: args.sort } : {}),
          ...(args.direction ? { direction: args.direction } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
          ...(args.page ? { page: args.page } : {}),
          ...(args.sources ? { sources: args.sources as never } : {}),
        });
        const rendered = renderSceneRows(
          read.data,
          args.query ?? null,
          { page: args.page ?? 1, limit: args.limit ?? 10 },
          {
            narrowedOnAnything: Boolean(
              args.query ||
              args.title ||
              args.code ||
              args.performer_ids ||
              args.studio_ids ||
              args.tag_ids ||
              args.date_from ||
              args.date_to,
            ),
            identifiersGiven: Boolean(
              args.performer_ids?.length || args.studio_ids?.length || args.tag_ids?.length,
            ),
            match: args.match ?? "all",
            sorted: Boolean(args.sort),
            ...(args.sort ? { sortedOn: args.sort } : {}),
            bounded: Boolean(args.date_from || args.date_to),
            cached: read.cached,
          },
        );
        return {
          content: [{ type: "text" as const, text: rendered.text }],
          structuredContent: rendered.structured,
        };
      } catch (cause) {
        return toolError(cause);
      }
    },
  );
}
