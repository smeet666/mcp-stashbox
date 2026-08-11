/**
 * One scene, read from the catalogue its identifier names.
 *
 * Sections exist because a scene's fingerprints weigh more than everything else
 * it carries put together.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { SceneRecord } from "../types.js";
import { strictInput } from "./arguments.js";
import { getSceneOutput } from "./schemas.js";
import {
  dateText,
  durationText,
  joinLines,
  storedNote,
  line,
  notesBlock,
  quoted,
  sourceLine,
  inline,
  inlineAll,
  type Rendered,
} from "./shared.js";
import { toolError } from "./errorShape.js";

export const GET_SCENE_SECTIONS = ["basic", "fingerprints", "images"] as const;

/**
 * Fingerprints rendered at once.
 *
 * A heavily submitted scene carries hundreds, and the whole list is the largest
 * single-record answer this server can produce. The count of what the record
 * holds travels beside the page, so a shortened list never reads as a complete
 * one.
 */
const FINGERPRINTS_SHOWN = 25;

export function renderScene(
  record: SceneRecord,
  sections: readonly string[],
  cached = false,
): Rendered {
  const notes: string[] = [];

  if (record.status !== "established") {
    // A withdrawn record describes itself. Rendering what it still carries as a
    // scene would state facts the catalogue withdrew.
    const structured = {
      id: record.id,
      source: record.source,
      source_url: record.sourceUrl,
      retrieved_at: record.retrievedAt,
      status: record.status,
      merged_into: record.mergedInto,
      former_title: record.title,
      notes: [] as string[],
    };
    const text = joinLines([
      record.status === "merged"
        ? `This identifier addresses a record ${record.source} has merged into another.`
        : `This identifier addresses a record ${record.source} has withdrawn.`,
      line("Former title", inline(record.title)),
      line("Continues as", record.mergedInto),
      sourceLine(record.sourceUrl),
    ]);
    const unrendered = sections.filter((name) => name !== "basic");
    const markerNotes = [
      record.status === "merged"
        ? "This record is a marker. Its emptiness describes the record and states nothing about the scene it once described."
        : "A withdrawn record states nothing about the scene it once described.",
      ...(unrendered.length
        ? [
            `A marker carries no body, so ${unrendered.join(", ")} could not be rendered here.${record.mergedInto ? " Ask for them on the record that continues it." : ""}`,
          ]
        : []),
      ...(record.mergedInto ? [`Read ${record.mergedInto} for the record that continues it.`] : []),
    ];
    const stored = storedNote(cached);
    if (stored) markerNotes.push(stored);
    structured.notes = markerNotes;
    return { text: text + notesBlock(markerNotes), structured };
  }

  const wantsFingerprints = sections.includes("fingerprints");
  const wantsImages = sections.includes("images");

  const structured: Record<string, unknown> = {
    id: record.id,
    source: record.source,
    source_url: record.sourceUrl,
    retrieved_at: record.retrievedAt,
    status: record.status,
    title: record.title,
    details: record.details,
    code: record.code,
    director: record.director,
    duration_seconds: record.durationSeconds,
    release_date: record.releaseDate,
    production_date: record.productionDate,
    studio: record.studio,
    performers: record.performers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      credited_as: entry.creditedAs,
      disambiguation: entry.disambiguation,
    })),
    tags: record.tags,
    urls: record.urls.map((link) => ({
      url: link.url,
      site_name: link.siteName,
      site_category: link.siteCategory,
    })),
    created: record.created,
    updated: record.updated,
  };
  const storedHere = storedNote(cached);
  if (storedHere) notes.push(storedHere);
  if (cached) structured.cached = true;
  structured.notes = notes;

  // A section nobody asked for is absent from the payload rather than present
  // and empty: an empty list reads as a catalogue holding none.
  if (wantsFingerprints && record.fingerprintsSkipped) {
    structured.fingerprints_skipped = record.fingerprintsSkipped;
    notes.push(
      `${record.fingerprintsSkipped} fingerprint row(s) this catalogue answered with could not be read and are left out of the list and of every count here.`,
    );
  }
  if (wantsFingerprints && record.fingerprints) {
    const shown = record.fingerprints.slice(0, FINGERPRINTS_SHOWN);
    if (record.fingerprints.length > shown.length) {
      notes.push(
        `This record holds ${record.fingerprints.length} fingerprints and ${shown.length} are shown here.`,
      );
    }
    structured.fingerprints_held = record.fingerprints.length;
    structured.fingerprints = shown.map((row) => ({
      algorithm: row.algorithm,
      hash: row.hash,
      duration_seconds: row.durationSeconds,
      submissions: row.submissions,
      reports: row.reports,
      contested: row.contested,
    }));
    structured.fingerprint_count = record.fingerprintCount ?? {};
    if (shown.some((row) => row.reports === null)) {
      notes.push(
        `${record.source} publishes no count of reports against a fingerprint, so 'contested' is unknown there.`,
      );
    }
  }
  if (wantsImages && record.images) {
    structured.images = record.images;
  }

  if (record.releaseDate && record.releaseDate.precision !== "day") {
    notes.push(
      `The release date is recorded to the ${record.releaseDate.precision} only, so no day is stated.`,
    );
  }
  if (record.productionDate !== null) {
    // Worth a note only when both dates exist, which is where a reader could
    // take one for the other.
    notes.push(
      "This record carries both dates. When a scene was made is a different question from when it was published.",
    );
  }

  const text =
    joinLines([
      record.title ? `# ${inline(record.title)}` : "# (this record states no title)",
      line("Catalogue", `${record.source} (${record.status})`),
      line("Studio", record.studio ? formatStudio(record.studio) : null),
      line("Released", dateText(record.releaseDate)),
      line("Produced", dateText(record.productionDate)),
      line("Duration", durationText(record.durationSeconds)),
      line("Director", inline(record.director)),
      line("Studio code", inline(record.code)),
      line(
        "Performers",
        record.performers.length
          ? record.performers
              .map(
                (entry) =>
                  [
                    inline(entry.name),
                    entry.disambiguation ? ` (${inline(entry.disambiguation)})` : "",
                    entry.creditedAs ? ` (credited as ${inline(entry.creditedAs)})` : "",
                  ].join("") || null,
              )
              .filter((entry): entry is string => entry !== null)
              .join(", ")
          : null,
      ),
      line("Tags", record.tags.length ? inlineAll(record.tags.map((tag) => tag.name)) : null),
      record.details ? `\n${quoted(record.details)}` : null,
      record.urls.length
        ? `\nLinks:\n${record.urls
            .map(
              (link) =>
                `  - ${inline(link.siteName)}${link.siteCategory ? ` [${inline(link.siteCategory)}]` : ""}: ${link.url}`,
            )
            .join("\n")}`
        : null,
      wantsFingerprints && record.fingerprints
        ? `\nFingerprints (${record.fingerprints.length} held, ${Math.min(record.fingerprints.length, FINGERPRINTS_SHOWN)} shown):\n${record.fingerprints
            .slice(0, FINGERPRINTS_SHOWN)
            .map(
              (row) =>
                `  - ${row.algorithm} ${row.hash}, ${row.submissions === null ? "submissions not counted" : `${row.submissions} submission(s)`}, ${
                  row.reports === null ? "reports not counted here" : `${row.reports} report(s)`
                }`,
            )
            .join("\n")}`
        : null,
      wantsImages && record.images
        ? `\nImages:\n${record.images.map((image) => `  - ${image.url}`).join("\n")}`
        : null,
      `\n${sourceLine(record.sourceUrl)}`,
    ]) + notesBlock(notes);

  return { text, structured };
}

function formatStudio(studio: { name: string; parent: string | null }): string {
  const name = inline(studio.name) ?? "(unnamed studio)";
  const parent = inline(studio.parent);
  return parent ? `${name} (part of ${parent})` : name;
}

export function registerGetScene(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "get_scene",
    {
      title: "Read one scene",
      description:
        "Read one catalogued scene by its identifier. The identifier names the catalogue that minted it, as returned by search_scenes or find_by_fingerprint. Sections are opt-in because a scene's fingerprints weigh more than everything else it carries.",
      inputSchema: strictInput({
        id: z.string().describe("Identifier as returned by another tool, such as stashdb:<uuid>."),
        sections: z
          .array(z.enum(GET_SCENE_SECTIONS))
          .optional()
          .describe("Which blocks to load. Defaults to basic."),
      }),
      outputSchema: getSceneOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id, sections }) => {
      try {
        const wanted = sections?.length ? sections : ["basic"];
        const read = await client.getScene(id, wanted);
        const rendered = renderScene(read.data, wanted, read.cached);
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
