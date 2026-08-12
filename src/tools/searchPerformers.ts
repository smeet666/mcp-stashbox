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
import { strictInput, narrowingText, countryArgument, sourcesArgument } from "./arguments.js";
import { searchPerformersOutput } from "./schemas.js";
import {
  coverageNote,
  reportPayload,
  nobodyAskedNote,
  windowNote,
  pageWasHonoured,
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

/**
 * The words of a name, for comparing one name against another.
 *
 * A catalogue credits a person in whatever order it writes names, and a caller
 * types them in whatever order they remember, so comparing the two as strings
 * makes a record carrying every word asked for read as a record carrying none.
 */
function nameWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

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
  if (counting > 1) notes.push("Counts are reported per catalogue and are never added.");

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
    const wanted = nameWords(query);
    const carried = result.rows.filter((row) => {
      const written = [row.name, row.disambiguation, ...row.aliases]
        .filter((value): value is string => Boolean(value))
        .flatMap((value) => nameWords(value));
      return wanted.every((word) => written.some((held) => held.includes(word)));
    }).length;
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
  const silent = [
    ...new Set(
      result.rows
        .filter((row) => row.sceneCount === null && row.status === "established")
        .map((row) => row.source),
    ),
  ];
  if (silent.length && result.rows.length) {
    notes.push(
      `No scene count is carried for rows from ${silent.join(", ")}, which publish none. That silence states nothing about those performers' work.`,
    );
  }
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
  let damagedRows = 0;
  const damaged = result.rows.reduce((total, row) => total + (row.rowsSkipped ?? 0), 0);
  if (damaged) {
    damagedRows = damaged;
    notes.push(
      `${damaged} row(s) inside the records listed here could not be read and are left out of what each one shows of its own lists. Read a record for what it says about its own losses.`,
    );
  }
  const lost = skippedNote(result.perSource);
  if (lost) notes.push(lost);
  const failures = failureNote(result.perSource);
  if (failures) notes.push(failures);
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
    ...(window && !nobody
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
      `# ${result.rows.length} performer(s)${query ? ` for "${query}"` : ""}`,
      ...result.rows.map((row) =>
        joinLines([
          `\n- ${inline(row.name) ?? "(unnamed)"}${row.disambiguation ? ` (${inline(row.disambiguation)})` : ""} [${row.source}]${row.status === "established" ? "" : `${row.status === "merged" ? " — merged, so this identifier now addresses the record it was folded into" : " — withdrawn, so this identifier states nothing about what it once named"}`}`,
          row.aliases.length ? `    also credited as: ${inlineAll(row.aliases)}` : null,
          row.birthDate ? `    born: ${dateText(row.birthDate)}` : null,
          row.careerStartYear || row.careerEndYear
            ? `    career: ${row.careerStartYear ?? "?"}–${row.careerEndYear ?? "?"}`
            : null,
          row.sceneCount === null ? null : `    scenes indexed on ${row.source}: ${row.sceneCount}`,
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

export function registerSearchPerformers(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "search_performers",
    {
      title: "Search performers",
      description:
        "Ask every configured catalogue for performers. The two paths are exclusive: 'query' runs the full-text search over names and aliases, and every typed argument is then reported as not received. A catalogue whose search narrows nothing is named as absent from this tool altogether, since its unnarrowed first page is no answer to a name. 'scene_count' counts what each catalogue has indexed and never a person's work.",
      inputSchema: strictInput({
        query: narrowingText("Free text matched against names and aliases.").optional(),
        name: narrowingText().optional(),
        disambiguation: narrowingText(
          "Free text a catalogue uses to tell two people of one name apart.",
        ).optional(),
        country: countryArgument("Two-letter country code, such as 'AU'.").optional(),
        performed_with: narrowingText("Namespaced identifier of another performer.").optional(),
        studio_id: narrowingText("Namespaced studio identifier.").optional(),
        sort: z.enum(["name", "birthdate", "scene_count", "created", "updated"]).optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).max(10_000).optional(),
        sources: sourcesArgument(
          "Narrow to named catalogues. Every configured catalogue is asked by default.",
        ).optional(),
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
