/**
 * Scenes across every configured catalogue.
 *
 * Nothing here ranks a row against a row from another catalogue: they publish no
 * score in common, so an order built from one would rank on a quantity half the
 * rows cannot have. Rows interleave, and the answer says so.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { RowsResult, SceneRecord } from "../types.js";
import { strictInput } from "./arguments.js";
import { searchScenesOutput } from "./schemas.js";
import {
  coverageNote,
  windowNote,
  indexTotalNote,
  orderingNote,
  pastTheEndNote,
  failureNote,
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
    identifiersGiven: boolean;
    match: "all" | "any";
    sorted?: boolean;
    bounded?: boolean;
    cached?: boolean;
    sortedOn?: string;
  },
): Rendered {
  const identifiersGiven = asked?.identifiersGiven ?? false;
  const match = asked?.match ?? "all";
  const sorted = asked?.sorted ?? false;
  const cached = asked?.cached ?? false;
  const stamped = asked?.sortedOn === "created" || asked?.sortedOn === "updated";
  const bounded = asked?.bounded ?? false;
  // Only what qualifies this answer. The ordering and the per-catalogue counts
  // are in the payload beside the rows they describe, and repeating them on
  // every call is what stops a reader reading the notes that matter.
  const notes: string[] = [];

  // How the order was built is worth saying whatever answered: a reader takes
  // the first row for the best one, and no row here was ranked against another.
  notes.push(`Rows are ${result.ordering}.`);

  // A count belongs to the catalogue that answered it, and the answer names
  // catalogues that did not: a reader summing them would count a total nobody
  // published.
  notes.push(
    "Counts are reported per catalogue and are never added: the catalogues index overlapping corpora, and one scene held by two of them carries two identifiers there.",
  );
  // Only where a catalogue received the narrowing and answered with rows: a
  // note built from the argument would assert a filter on rows nobody filtered.
  const filtered = result.perSource.some(
    (entry) =>
      entry.state === "answered" &&
      entry.count &&
      !(entry.narrowingsNotReceived ?? []).some((name) => name.endsWith("_ids")),
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
  const covered = windowNote(result.perSource, window);
  if (covered) notes.push(covered);
  const narrowings = narrowingNote(result.perSource);
  if (narrowings) notes.push(narrowings);
  const reach = indexTotalNote(result.perSource);
  if (reach) notes.push(reach);
  const ordering = orderingNote(result.perSource, sorted);
  if (ordering) notes.push(ordering);
  const pastEnd = pastTheEndNote(result.perSource, window);
  if (pastEnd) notes.push(pastEnd);
  const failures = failureNote(result.perSource);
  if (failures) notes.push(failures);
  const coverage = coverageNote(result.perSource);
  if (coverage) notes.push(coverage);

  const structured: Record<string, unknown> = {
    ...(query === null ? {} : { query }),
    results: result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      release_date: row.releaseDate,
      duration_seconds: row.durationSeconds,
      studio: row.studio?.name ?? null,
      performers: row.performers.map((entry) => entry.name),
      status: row.status,
      ...(stamped ? { created: row.created, updated: row.updated } : {}),
      retrieved_at: row.retrievedAt,
      source_url: row.sourceUrl,
    })),
    result_count: result.rows.length,
    ordering: result.ordering,
    ...(window ? { window } : {}),
    per_source: result.perSource,
    ...(cached ? { cached: true } : {}),
    notes,
  };

  const text =
    joinLines([
      `# ${result.rows.length} scene(s)${query ? ` for "${query}"` : ""}`,
      ...result.rows.map((row) =>
        joinLines([
          `\n- ${inline(row.title) ?? "(untitled)"} [${row.source}]`,
          row.releaseDate ? `    released: ${dateText(row.releaseDate)}` : null,
          row.studio ? `    studio: ${inline(row.studio.name)}` : null,
          row.performers.length
            ? `    performers: ${inlineAll(row.performers.map((entry) => entry.name))}`
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
        query: z.string().optional().describe("Free text matched against a scene's own fields."),
        title: z.string().optional(),
        code: z.string().optional().describe("The studio's own reference for the scene."),
        performer_ids: z.array(z.string()).optional().describe("Namespaced performer identifiers."),
        match: z
          .enum(["all", "any"])
          .optional()
          .describe(
            "How a list of identifiers reads. 'all' returns scenes carrying every one of them and is the default; 'any' returns scenes carrying at least one.",
          ),
        studio_ids: z.array(z.string()).optional(),
        tag_ids: z.array(z.string()).optional(),
        date_from: z
          .string()
          .optional()
          .describe(
            "Released strictly after this date, as YYYY-MM-DD. A catalogue takes one date comparison at a time, so giving both bounds sends this one and reports the other as not received.",
          ),
        date_to: z
          .string()
          .optional()
          .describe("Released strictly before this date, as YYYY-MM-DD."),
        sort: z.enum(["title", "date", "duration", "created", "updated"]).optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).max(10_000).optional(),
        sources: z.array(z.string()).optional(),
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
            identifiersGiven: Boolean(
              args.performer_ids?.length || args.studio_ids?.length || args.tag_ids?.length,
            ),
            match: args.match ?? "all",
            sorted: Boolean(args.sort),
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
