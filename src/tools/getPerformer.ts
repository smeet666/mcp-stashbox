/**
 * One performer, read from the catalogue its identifier names.
 *
 * The count of scenes is the field a reader most easily misreads, so it is
 * labelled everywhere it appears: it counts what this catalogue has indexed, and
 * a settled record naming a career spanning decades can report none.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { PerformerRecord } from "../types.js";
import { strictInput } from "./arguments.js";
import { getPerformerOutput } from "./schemas.js";
import {
  dateText,
  inline,
  inlineAll,
  joinLines,
  storedNote,
  sourceOffers,
  line,
  notesBlock,
  sourceLine,
  type Rendered,
} from "./shared.js";
import { toolError } from "./errorShape.js";

/**
 * Studios shown for a performer.
 *
 * A busy record credits well over a hundred, and returning them all left this as
 * the one section whose size a caller could not see before receiving it.
 */
const STUDIOS_SHOWN = 25;

export const GET_PERFORMER_SECTIONS = [
  "basic",
  "appearance",
  "images",
  "scenes",
  "studios",
] as const;

export function renderPerformer(
  record: PerformerRecord,
  sections: readonly string[],
  cached = false,
): Rendered {
  const notes: string[] = [];

  if (record.status !== "established") {
    // A folded record answers under its old identifier carrying the name it held
    // then and an emptied body. It names its successor and stops there.
    const structured = {
      id: record.id,
      source: record.source,
      source_url: record.sourceUrl,
      retrieved_at: record.retrievedAt,
      status: record.status,
      merged_into: record.mergedInto,
      merged_ids: record.mergedIds,
      former_name: record.name,
      scene_count: null,
      notes: [] as string[],
      ...(cached ? { cached: true } : {}),
    };
    const text = joinLines([
      record.status === "merged"
        ? `This identifier addresses a record ${record.source} has merged into another.`
        : `This identifier addresses a record ${record.source} has withdrawn.`,
      line("Former name", inline(record.name)),
      line("Continues as", record.mergedInto),
      line(
        "Identifiers folded in here",
        record.mergedIds.length ? record.mergedIds.join(", ") : null,
      ),
      sourceLine(record.sourceUrl),
    ]);
    const unrendered = sections.filter((name) => name !== "basic");
    const markerNotes = [
      record.status === "merged"
        ? "This record is a marker. Its emptiness describes the record and states nothing about the person it once named."
        : "A withdrawn record states nothing about the person it once named.",
      ...(unrendered.length
        ? [
            `A marker carries no body, so ${unrendered.join(", ")} could not be rendered here.${record.mergedInto ? " Ask for them on the record that continues it." : ""}`,
          ]
        : []),
      ...(record.mergedInto ? [`Read ${record.mergedInto} for the record that continues it.`] : []),
    ];
    const stored = storedNote(cached, record.retrievedAt);
    if (stored) markerNotes.push(stored);
    structured.notes = markerNotes;
    return { text: text + notesBlock(markerNotes), structured };
  }

  const structured: Record<string, unknown> = {
    id: record.id,
    source: record.source,
    source_url: record.sourceUrl,
    retrieved_at: record.retrievedAt,
    status: record.status,
    merged_into: record.mergedInto,
    merged_ids: record.mergedIds,
    name: record.name,
    disambiguation: record.disambiguation,
    aliases: record.aliases,
    gender: record.gender,
    country: record.country,
    birth_date: record.birthDate,
    death_date: record.deathDate,
    career_start_year: record.careerStartYear,
    career_end_year: record.careerEndYear,
    scene_count: record.sceneCount,
    ...(record.sceneCount === null
      ? {}
      : {
          scene_count_means: `scenes ${record.source} has indexed crediting this performer`,
        }),
    urls: record.urls.map((link) => ({
      url: link.url,
      site_name: link.siteName,
      site_category: link.siteCategory,
    })),
    created: record.created,
    updated: record.updated,
  };
  if (record.imagesSkipped) {
    structured.images_skipped = record.imagesSkipped;
    notes.push(
      `${record.imagesSkipped} image row(s) this catalogue answered with could not be read and are left out of this section and of the number shown.`,
    );
  }
  if (record.urls.length && record.urls.every((link) => link.siteName === null)) {
    notes.push(
      `No link on this record carries a site ${record.source} names, so none of these addresses is named here. Each one is what the catalogue published, and what it points at is not stated.`,
    );
  }
  const unnamedLinks = record.urls.filter((link) => link.siteName === null).length;
  if (unnamedLinks && unnamedLinks < record.urls.length) {
    notes.push(
      `${unnamedLinks} of these ${record.urls.length} links carry no site ${record.source} names, and are shown by their address alone.`,
    );
  }
  if (record.deathDate && record.deathDate.precision !== "day") {
    notes.push(
      `The death date is recorded to the ${record.deathDate.precision} only, so no day is stated.`,
    );
  }
  if (record.urls.length && !sourceOffers(record.source, "site_categories")) {
    notes.push(
      `${record.source} publishes no table sorting the sites a record links to, so no link here carries a category. Nothing was asked of it about what these addresses point at, and that is no evidence that the catalogue places them in none.`,
    );
  }
  for (const [what, flagged] of [
    ["birth date", record.birthDateUnreadable],
    ["death date", record.deathDateUnreadable],
  ] as const) {
    if (flagged) {
      structured[what === "birth date" ? "birth_date_unreadable" : "death_date_unreadable"] = true;
      notes.push(
        `${record.source} published a ${what} this client could not read, so none is stated here. That is a date dropped and never a record carrying none.`,
      );
    }
  }
  if (record.rowsSkipped) {
    structured.rows_skipped = record.rowsSkipped;
    structured.rows_skipped_in = record.rowsSkippedIn ?? [];
    notes.push(
      `${record.rowsSkipped} row(s) of this record's own lists could not be read and are left out of ${(record.rowsSkippedIn ?? []).join(", ")}. What is shown of those is therefore short of what the catalogue answered with.`,
    );
  }
  if (!sourceOffers(record.source, "pending_edits")) {
    notes.push(
      `${record.source} publishes no count of edits open against a record, so whether this one is under revision there is unknown. Nothing here states that what it says is settled.`,
    );
  }
  if (record.pendingEditsUnreadable) {
    structured.pending_edits_unreadable = true;
    notes.push(
      `${record.source} publishes the edits open against a record and answered them in a shape this client could not read, so whether this one is under revision there is unknown. Nothing here states that what it says is settled.`,
    );
  }
  if (record.pendingEdits) {
    structured.pending_edits = record.pendingEdits;
    notes.push(
      `${record.pendingEdits} edit(s) to this record are open on ${record.source}, so what it states is under revision there.`,
    );
  }
  const storedHere = storedNote(cached, record.retrievedAt);
  if (storedHere) notes.push(storedHere);
  if (cached) structured.cached = true;
  structured.notes = notes;

  const appearanceEmpty = !record.appearance || appearanceLines(record).length === 0;
  if (sections.includes("appearance") && !record.appearance) {
    // A section asked for and absent from the answer reads as a section nobody
    // asked for. The emptiness is published so the two stay apart.
    structured.appearance = {
      ethnicity: null,
      eye_color: null,
      hair_color: null,
      height_cm: null,
      breast_type: null,
      cup_size: null,
      band_size: null,
      waist_size: null,
      hip_size: null,
      tattoos: null,
      piercings: null,
    };
  }
  if (sections.includes("appearance") && appearanceEmpty) {
    notes.push(
      `${record.source} publishes none of the fields the appearance section holds for this record, so the section is empty rather than unread.`,
    );
  }
  if (sections.includes("appearance") && record.appearance) {
    // Only what the record carries. Printing a placeholder for an absent
    // measurement would state more than the catalogue holds.
    const present = {
      ethnicity: record.appearance.ethnicity,
      eye_color: record.appearance.eyeColor,
      hair_color: record.appearance.hairColor,
      height_cm: record.appearance.heightCm,
      breast_type: record.appearance.breastType,
      cup_size: record.appearance.cupSize,
      band_size: record.appearance.bandSize,
      waist_size: record.appearance.waistSize,
      hip_size: record.appearance.hipSize,
      tattoos: record.appearance.tattoos.length ? record.appearance.tattoos : null,
      piercings: record.appearance.piercings.length ? record.appearance.piercings : null,
    };
    structured.appearance = present;
  }
  if (sections.includes("images") && record.images) structured.images = record.images;
  if (sections.includes("studios") && record.studiosUnavailable) {
    structured.studios_unavailable = record.studiosUnavailable;
    notes.push(
      `The studios section was asked for and could not be read (${record.studiosUnavailable}). Its absence here says nothing about what ${record.source} holds.`,
    );
  }
  if (sections.includes("studios") && record.studiosSkipped) {
    structured.studios_skipped = record.studiosSkipped;
    notes.push(
      `${record.studiosSkipped} studio row(s) this catalogue answered with could not be read and are left out of this section, while the number credited counts them.`,
    );
  }
  if (sections.includes("studios") && record.studios) {
    const shown = record.studios.slice(0, STUDIOS_SHOWN);
    structured.studios = shown.map((studio) => ({
      id: studio.id,
      name: studio.name,
      scene_count: studio.sceneCount,
      status: studio.status,
    }));
    if (record.studiosTotal !== undefined) {
      structured.studios_total = record.studiosTotal;
      if (record.studiosTotal - (record.studiosSkipped ?? 0) > shown.length) {
        notes.push(
          `This record credits ${record.studiosTotal} studios and ${shown.length} are shown here, in the order the catalogue returned them. They are the first it named and not the ones it credits most.`,
        );
      }
    }
  }
  if (sections.includes("scenes") && record.scenesUnavailable) {
    structured.scenes_unavailable = record.scenesUnavailable;
    notes.push(
      `The scenes section was asked for and is not here: ${record.scenesUnavailable}. Its absence says nothing about what ${record.source} holds.`,
    );
  }
  if (sections.includes("scenes") && record.scenesSkipped) {
    structured.scenes_skipped = record.scenesSkipped;
    notes.push(
      `${record.scenesSkipped} scene(s) this catalogue answered with could not be read and are left out of this section and of the number shown.`,
    );
  }
  if (sections.includes("scenes") && record.scenes) {
    if (record.scenesTotal !== null && record.scenesTotal !== undefined) {
      structured.scenes_total = record.scenesTotal;
      if (record.scenesTotal > (record.scenesShown ?? 0)) {
        notes.push(
          `This section shows ${record.scenesShown ?? 0} of the ${record.scenesTotal} scenes ${record.source} indexes for this performer.`,
        );
      }
    }
    structured.scenes = record.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      status: scene.status,
      release_date: scene.releaseDate,
      studio: scene.studio?.name ?? null,
      source_url: scene.sourceUrl,
    }));
  }

  // What a catalogue publishes is read from what it declares, never from one
  // record's null: a supporting catalogue answering a null on one row would
  // otherwise make the server state a fact about the catalogue.
  if (record.status === "established" && !sourceOffers(record.source, "scene_count")) {
    notes.push(
      `${record.source} publishes no count of the scenes it indexes for a performer, so this record carries none. That is this catalogue's silence and states nothing about the person's work.`,
    );
  }
  if (record.sceneCount === 0) {
    notes.push(
      `${record.source} has indexed no scenes crediting this performer. That counts this catalogue's coverage and states nothing about the person's work.`,
    );
  }
  if (record.birthDate && record.birthDate.precision !== "day") {
    notes.push(
      `The birth date is recorded to the ${record.birthDate.precision} only, so no day is stated.`,
    );
  }
  if (record.mergedIds.length > 0) {
    notes.push(
      `This record has absorbed ${record.mergedIds.length} other identifier(s), which still resolve to it.`,
    );
  }

  const text =
    joinLines([
      record.name ? `# ${inline(record.name)}` : "# (this record states no name)",
      line("Catalogue", `${record.source} (${record.status})`),
      line("Told apart by", inline(record.disambiguation)),
      line("Also credited as", record.aliases.length ? inlineAll(record.aliases) : null),
      line("Gender", record.gender),
      line("Country", record.country),
      line("Born", dateText(record.birthDate)),
      line("Died", dateText(record.deathDate)),
      line(
        "Career",
        record.careerStartYear || record.careerEndYear
          ? `${record.careerStartYear ?? "?"}–${record.careerEndYear ?? "?"}`
          : null,
      ),
      line(
        "Scenes indexed here",
        record.sceneCount === null ? null : `${record.sceneCount} on ${record.source}`,
      ),
      sections.includes("appearance")
        ? `\nAppearance:\n${appearanceLines(record).join("\n") || "  (this catalogue publishes none of the fields this section holds)"}`
        : null,
      record.urls.length
        ? `\nLinks:\n${record.urls
            .map(
              (link) =>
                `  - ${link.siteName === null ? "(this catalogue names no site)" : inline(link.siteName)}${link.siteCategory ? ` [${inline(link.siteCategory)}]` : ""}: ${link.url}`,
            )
            .join("\n")}`
        : null,
      sections.includes("studios") && record.studios
        ? `\nStudios (${record.studiosTotal === undefined ? "count not published" : `${record.studiosTotal} credited`}, ${Math.min(record.studios.length, STUDIOS_SHOWN)} shown):\n${record.studios
            .slice(0, STUDIOS_SHOWN)
            .map(
              (studio) =>
                `  - ${inline(studio.name)}${studio.status === "established" ? "" : " (this identifier is withdrawn)"}: ${studio.sceneCount === null ? "scenes not counted here" : `${studio.sceneCount} scene(s) indexed`}`,
            )
            .join("\n")}`
        : null,
      sections.includes("scenes") && record.scenes
        ? `\nScenes (${record.scenesTotal === null || record.scenesTotal === undefined ? "count not published" : `${record.scenesTotal} indexed`}, ${record.scenes.length} shown):\n${record.scenes
            .map(
              (scene) =>
                `  - ${inline(scene.title) ?? "(untitled)"}${scene.status === "established" ? "" : scene.status === "merged" ? " (merged into another record)" : " (withdrawn)"}: ${scene.sourceUrl}`,
            )
            .join("\n")}`
        : null,
      sections.includes("images") && record.images
        ? `\nImages (${record.images.length}):\n${record.images.map((image) => `  - ${image.url}`).join("\n")}`
        : null,
      `\n${sourceLine(record.sourceUrl)}`,
    ]) + notesBlock(notes);

  return { text, structured };
}

function appearanceLines(record: PerformerRecord): string[] {
  const appearance = record.appearance;
  if (!appearance) return [];
  return [
    line("  Height", appearance.heightCm === null ? null : `${appearance.heightCm} cm`),
    line("  Ethnicity", inline(appearance.ethnicity)),
    line("  Eyes", appearance.eyeColor),
    line("  Hair", appearance.hairColor),
    line("  Breast type", appearance.breastType),
    line("  Cup size", inline(appearance.cupSize)),
    line("  Band size", appearance.bandSize === null ? null : String(appearance.bandSize)),
    line("  Waist", appearance.waistSize === null ? null : String(appearance.waistSize)),
    line("  Hips", appearance.hipSize === null ? null : String(appearance.hipSize)),
    line("  Tattoos", appearance.tattoos.length ? inlineAll(appearance.tattoos) : null),
    line("  Piercings", appearance.piercings.length ? inlineAll(appearance.piercings) : null),
  ].filter((entry): entry is string => entry !== null);
}

export function registerGetPerformer(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "get_performer",
    {
      title: "Read one performer",
      description:
        "Read one catalogued performer by its identifier. 'scene_count' counts what that catalogue has indexed: a settled record naming a career spanning decades can report none, and that states the catalogue's coverage, never a career. An identifier folded into another answers as a marker naming its successor.",
      inputSchema: strictInput({
        id: z.string().describe("Identifier as returned by another tool, such as stashdb:<uuid>."),
        sections: z
          .array(z.enum(GET_PERFORMER_SECTIONS))
          .min(1, {
            error:
              "[invalid_input] An empty list names no block to load. Leave the argument out for the basic block, or name the blocks you want.",
          })
          .optional()
          .describe("Which blocks to load. Defaults to basic when the argument is left out."),
      }),
      outputSchema: getPerformerOutput,
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
        const read = await client.getPerformer(id, wanted);
        const rendered = renderPerformer(read.data, wanted, read.cached);
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
