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
  windowNote,
  indexTotalNote,
  orderingNote,
  pastTheEndNote,
  failureNote,
  skippedNote,
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

export function renderPerformerRows(
  result: RowsResult<PerformerRecord>,
  query: string | null,
  window?: { page: number; limit: number },
  asked?: { sorted?: boolean; cached?: boolean; sortedOn?: string },
): Rendered {
  const sorted = asked?.sorted ?? false;
  const cached = asked?.cached ?? false;
  const stamped = asked?.sortedOn === "created" || asked?.sortedOn === "updated";
  const notes: string[] = [];

  // How the order was built is worth saying whatever answered: a reader takes
  // the first row for the best one, and no row here was ranked against another.
  notes.push(`Rows are ${result.ordering}.`);

  // A count belongs to the catalogue that answered it, and the answer names
  // catalogues that did not: a reader summing them would count a total nobody
  // published.
  notes.push("Counts are reported per catalogue and are never added.");

  // The sentence describes the rows below the first, so it belongs to an
  // answer that has one.
  const counted =
    result.rows.length > 0 && result.perSource.some((entry) => entry.state === "answered");
  if (query && counted) {
    notes.push(
      "A count reports how many records a catalogue's index touched for these words. A search for a full name reaches people sharing one word of it.",
    );

    // A row reaching the index on one word is not a row carrying the name that
    // was asked. Without this, a name nobody holds and a name somebody does
    // produce answers of the same shape, and the question a caller actually put
    // goes unanswered.
    const wanted = query.trim().toLowerCase();
    const carried = result.rows.filter((row) =>
      [row.name, row.disambiguation, ...row.aliases]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(wanted)),
    ).length;
    if (result.rows.length > 0 && carried === 0) {
      notes.push(
        `No row here carries "${query.trim()}" in a name, an alias or a disambiguation. They reached the index on part of it, so this answer establishes nothing about whether these catalogues hold that person.`,
      );
    } else if (carried > 0 && carried < result.rows.length) {
      notes.push(
        `${carried} of ${result.rows.length} row(s) carry "${query.trim()}" in a name, an alias or a disambiguation. The rest reached the index on part of it.`,
      );
    }
  }
  // The count is qualified wherever it appears. Saying so only on a zero would
  // put the caution where a reader already hesitates and drop it where they
  // would read a career total.
  if (result.rows.some((row) => row.sceneCount !== null)) {
    notes.push(
      "A scene count is what the catalogue naming it has indexed for that performer, and never a career total. A settled record naming a long career can report none, and two catalogues count different corpora.",
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
  const lost = skippedNote(result.perSource);
  if (lost) notes.push(lost);
  const failures = failureNote(result.perSource);
  if (failures) notes.push(failures);
  const coverage = coverageNote(result.perSource);
  if (coverage) notes.push(coverage);
  const stored = storedNote(cached);
  if (stored) notes.push(stored);

  const structured: Record<string, unknown> = {
    ...(query === null ? {} : { query }),
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
        "Ask every configured catalogue for performers. The two paths are exclusive: 'query' runs the full-text search over names and aliases, and every typed argument is then reported as not received. A catalogue whose search narrows nothing is named as absent from this tool altogether, since its unnarrowed first page is no answer to a name. 'scene_count' counts what each catalogue has indexed and never a person's work.",
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
        const rendered = renderPerformerRows(
          read.data,
          args.query ?? null,
          { page: args.page ?? 1, limit: args.limit ?? 10 },
          {
            sorted: Boolean(args.sort),
            cached: read.cached,
            ...(args.sort ? { sortedOn: args.sort } : {}),
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
