/**
 * Performers across every configured catalogue.
 *
 * A search for a full name reports how many records the index touched, and the
 * rows below the first can share a single word of what was asked. The answer
 * says so wherever it prints a count.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { PerformerRecord, RowsResult } from "../types.js";
import { strictInput } from "./arguments.js";
import { searchPerformersOutput } from "./schemas.js";
import {
  coverageNote,
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

export function renderPerformerRows(
  result: RowsResult<PerformerRecord>,
  query: string | null,
  window?: { page: number; limit: number },
): Rendered {
  const notes: string[] = [
    `Rows are ${result.ordering}.`,
    "Counts are reported per catalogue and are never added.",
  ];
  if (query) {
    notes.push(
      "A count reports how many records a catalogue's index touched for these words. A search for a full name reaches people sharing one word of it.",
    );
  }
  if (result.rows.some((row) => row.sceneCount === 0)) {
    notes.push(
      "A scene count of zero counts what that catalogue has indexed. A settled record naming a long career can report none.",
    );
  }
  if (window) {
    notes.push(
      `This answer covers page ${window.page} at ${window.limit} row(s) per catalogue. An emptiness here is an emptiness inside that window.`,
    );
  }
  const narrowings = narrowingNote(result.perSource);
  if (narrowings) notes.push(narrowings);
  const coverage = coverageNote(result.perSource);
  if (coverage) notes.push(coverage);

  const structured: Record<string, unknown> = {
    query,
    results: result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      name: row.name,
      disambiguation: row.disambiguation,
      aliases: row.aliases,
      country: row.country,
      birth_date: row.birthDate,
      career_start_year: row.careerStartYear,
      career_end_year: row.careerEndYear,
      scene_count: row.sceneCount,
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
      `# ${result.rows.length} performer(s)${query ? ` for "${query}"` : ""}`,
      ...result.rows.map((row) =>
        joinLines([
          `\n- ${inline(row.name) ?? "(unnamed)"}${row.disambiguation ? ` (${inline(row.disambiguation)})` : ""} [${row.source}]`,
          row.aliases.length ? `    also credited as: ${inlineAll(row.aliases)}` : null,
          row.birthDate ? `    born: ${dateText(row.birthDate)}` : null,
          row.careerStartYear || row.careerEndYear
            ? `    career: ${row.careerStartYear ?? "?"}–${row.careerEndYear ?? "?"}`
            : null,
          row.sceneCount === null ? null : `    scenes indexed on ${row.source}: ${row.sceneCount}`,
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

export function registerSearchPerformers(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "search_performers",
    {
      title: "Search performers",
      description:
        "Ask every configured catalogue for performers. The two paths are exclusive: 'query' runs the full-text search over names and aliases, and every typed argument is then reported as not received. A catalogue offering no full-text search is named as absent from a 'query' search, and dropping 'query' for 'name' reaches it. 'scene_count' counts what each catalogue has indexed and never a person's work.",
      inputSchema: strictInput({
        query: z.string().optional().describe("Free text matched against names and aliases."),
        name: z.string().optional(),
        disambiguation: z
          .string()
          .optional()
          .describe("Free text a catalogue uses to tell two people of one name apart."),
        country: z.string().optional().describe("Two-letter country code."),
        performed_with: z
          .string()
          .optional()
          .describe("Namespaced identifier of another performer."),
        studio_id: z.string().optional().describe("Namespaced studio identifier."),
        sort: z.enum(["name", "birthdate", "scene_count", "created", "updated"]).optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).max(10_000).optional(),
        sources: z.array(z.string()).optional(),
      }),
      outputSchema: searchPerformersOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const read = await client.searchPerformers({
          ...(args.query ? { query: args.query } : {}),
          ...(args.name ? { name: args.name } : {}),
          ...(args.disambiguation ? { disambiguation: args.disambiguation } : {}),
          ...(args.country ? { country: args.country } : {}),
          ...(args.performed_with ? { performedWith: args.performed_with } : {}),
          ...(args.studio_id ? { studioId: args.studio_id } : {}),
          ...(args.sort ? { sort: args.sort } : {}),
          ...(args.direction ? { direction: args.direction } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
          ...(args.page ? { page: args.page } : {}),
          ...(args.sources ? { sources: args.sources as never } : {}),
        });
        const rendered = renderPerformerRows(read.data, args.query ?? null, {
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
