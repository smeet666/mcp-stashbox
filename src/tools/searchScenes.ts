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
): Rendered {
  const notes: string[] = [
    `Rows are ${result.ordering}.`,
    "Counts are reported per catalogue and are never added: the catalogues index overlapping corpora, and one scene held by two of them carries two identifiers there.",
  ];
  if (query) {
    notes.push(
      "A count reports how many records a catalogue's index touched for these words. Rows below the first can share a single word of what was asked.",
    );
  }
  if (window) {
    notes.push(
      `This answer covers page ${window.page} at ${window.limit} row(s) per catalogue. An emptiness here is an emptiness inside that window.`,
    );
  }
  const coverage = coverageNote(result.perSource);
  if (coverage) notes.push(coverage);

  const structured: Record<string, unknown> = {
    query,
    results: result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      release_date: row.releaseDate,
      duration_seconds: row.durationSeconds,
      studio: row.studio?.name ?? null,
      performers: row.performers.map((entry) => entry.name),
      status: row.status,
      retrieved_at: row.retrievedAt,
      source_url: row.sourceUrl,
    })),
    result_count: result.rows.length,
    ordering: result.ordering,
    ...(window ? { window } : {}),
    per_source: result.perSource,
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
        "Ask every configured catalogue for scenes. The two paths are exclusive: giving 'query' runs the full-text search and every typed argument is reported as not received, while omitting it runs the faceted query on the typed arguments. A catalogue offering no full-text search is named as absent from a 'query' search, and dropping 'query' for 'title' reaches it. Counts are per catalogue and are never added, and a catalogue that failed, one never asked and one that found nothing are three different states an answer names.",
      inputSchema: strictInput({
        query: z.string().optional().describe("Free text matched against a scene's own fields."),
        title: z.string().optional(),
        code: z.string().optional().describe("The studio's own reference for the scene."),
        performer_ids: z.array(z.string()).optional().describe("Namespaced performer identifiers."),
        studio_ids: z.array(z.string()).optional(),
        tag_ids: z.array(z.string()).optional(),
        date_from: z.string().optional().describe("Earliest release date, as YYYY-MM-DD."),
        date_to: z.string().optional().describe("Latest release date, as YYYY-MM-DD."),
        sort: z.enum(["title", "date", "duration", "created", "updated"]).optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
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
        const rendered = renderSceneRows(read.data, args.query ?? null, {
          page: args.page ?? 1,
          limit: args.limit ?? 10,
        });
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
