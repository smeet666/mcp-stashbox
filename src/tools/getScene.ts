/**
 * One scene, answered for the identifier that names it.
 *
 * Two readings of the one rule decide everything here. **A marker describes the
 * record and never the scene it once named**: a withdrawn identifier renders
 * what the catalogue still holds, which is the identifier and the title the
 * record carried, and the sections a caller asked for are named as unrenderable
 * rather than answered with a record holding none of them. **A section asked for
 * always renders**, with its zero stated on the heading line, because a section
 * that vanishes when it is empty reads exactly like one nobody loaded.
 *
 * These catalogues publish no successor for a scene, so a scene is held or
 * withdrawn and this answer names nothing in its place.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  catalogueOf,
  dateText,
  durationText,
  fingerprintRows,
  headLine,
  imageRows,
  linksText,
  markerHead,
  recordNotes,
  scenePayload,
  tagsText,
  type Catalogue,
} from "../answer/records.js";
import { isFolded, markerSuffix } from "../answer/marker.js";
import {
  joinLines,
  line,
  notesBlock,
  quoted,
  section,
  sourceLine,
  type Rendered,
} from "../answer/text.js";
import { inline } from "../answer/text.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { SceneSection } from "../stashbox/queries.js";
import type { SceneRecord, StudioRef } from "../types.js";
import { identifier, severalOf, strictInput } from "./arguments.js";
import { toolFailure } from "./errorShape.js";
import { getSceneOutput } from "./schemas.js";

/** The blocks a caller can ask for, in the order an answer renders them. */
const SECTIONS = ["basic", "fingerprints", "images"] as const;

/** What a caller asked for, an empty list read as the block that identifies a record. */
function asked(sections: readonly string[]): readonly string[] {
  return sections.length === 0 ? ["basic"] : sections;
}

/** The studio credited, with the mark a withdrawn record carries. */
function studioText(studio: StudioRef | null): string | null {
  if (studio === null) return null;
  const named = `${inline(studio.name) ?? studio.id}${markerSuffix(studio.status)}`;
  const parent = inline(studio.parent);
  if (parent === null) return named;
  const withdrawn = studio.parentWithdrawn === true ? ", a record the catalogue withdrew" : "";
  return `${named}, under ${parent}${withdrawn}`;
}

/** Who is credited, under the name this release printed and under their own. */
function creditsText(record: SceneRecord): string {
  return record.performers
    .map((credit) => {
      const own = inline(credit.name) ?? credit.id;
      const about = inline(credit.disambiguation);
      const printed = inline(credit.creditedAs);
      const parts = [
        about === null ? null : ` (${about})`,
        printed === null ? null : `, credited as ${printed}`,
        markerSuffix(credit.status),
      ].filter((part): part is string => part !== null && part !== "");
      return `${own}${parts.join("")}`;
    })
    .join("; ");
}

/** The heavy blocks, each stating its own zero where it holds nothing. */
function sceneSections(
  record: SceneRecord,
  catalogue: Catalogue,
  sections: readonly string[],
): (string | null)[] {
  const parts: (string | null)[] = [];
  if (sections.includes("fingerprints")) {
    parts.push(
      section(
        "Fingerprints",
        fingerprintRows(record.fingerprints ?? []),
        `${catalogue.name} published none with this record.`,
      ),
    );
  }
  if (sections.includes("images")) {
    parts.push(
      section(
        "Images",
        imageRows(record.images ?? []),
        `${catalogue.name} published none with this record.`,
      ),
    );
  }
  return parts;
}

/** What a scene owes a reader beyond the fields a scene carries. */
function sceneExtras(
  record: SceneRecord,
  catalogue: Catalogue,
  sections: readonly string[],
): (string | null)[] {
  const notes: (string | null)[] = [];
  const shown = sections.includes("fingerprints") ? (record.fingerprints ?? []) : [];

  if (shown.length > 0 && !catalogue.publishes("fingerprint_reports")) {
    notes.push(
      `${catalogue.name} counts no disputes against a fingerprint, so whether one here is disputed was never recorded, and none of them is a hash nobody has questioned.`,
    );
  }
  if (record.fingerprintsSkipped !== undefined && sections.includes("fingerprints")) {
    notes.push(
      `${record.fingerprintsSkipped} fingerprint(s) ${catalogue.name} answered with could not be read and are left out of the block here.`,
    );
  }
  if (record.imagesSkipped !== undefined && sections.includes("images")) {
    notes.push(
      `${record.imagesSkipped} image(s) ${catalogue.name} answered with could not be read and are left out of the block here.`,
    );
  }
  return notes;
}

/**
 * One scene as a caller reads it: the prose and the payload, carrying the same
 * facts and the same qualifications.
 */
export function renderScene(
  record: SceneRecord,
  sections: readonly string[] = ["basic"],
  read: { cached?: boolean } = {},
): Rendered {
  const wanted = asked(sections);
  const catalogue = catalogueOf(record.source);
  const folded = isFolded(record.status);
  const unrendered = wanted.filter((name) => name !== "basic");
  const payload = scenePayload(record, folded ? ["basic"] : wanted);

  const notes = recordNotes(
    {
      catalogue,
      kind: "scene",
      status: record.status,
      // These catalogues name no scene in the place of a scene they withdrew.
      successor: null,
      unrendered,
      dates: [
        {
          what: "release date",
          date: record.releaseDate,
          unreadable: record.releaseDateUnreadable === true,
        },
        {
          what: "production date",
          date: record.productionDate,
          unreadable: record.productionDateUnreadable === true,
        },
      ],
      links: record.urls,
      tags: record.tags,
      pendingEdits: record.pendingEdits,
      pendingEditsUnreadable: record.pendingEditsUnreadable === true,
      rowsSkipped: record.rowsSkipped ?? 0,
      rowsSkippedIn: record.rowsSkippedIn ?? [],
      cached: read.cached === true,
      retrievedAt: record.retrievedAt,
      payload,
    },
    folded ? [] : sceneExtras(record, catalogue, wanted),
  );

  const parts: (string | null)[] = folded
    ? markerHead(catalogue, "scene", record, inline(record.title), null)
    : [
        headLine(record.title, record.id),
        `${catalogue.name}, scene ${record.id}`,
        line("Released", dateText(record.releaseDate)),
        line("Produced", dateText(record.productionDate)),
        line("Duration", durationText(record.durationSeconds)),
        line("Code", inline(record.code)),
        line("Director", inline(record.director)),
        line("Studio", studioText(record.studio)),
        `Performers: ${record.performers.length === 0 ? `${catalogue.name} credits nobody on this record.` : creditsText(record)}`,
        `Tags: ${record.tags.length === 0 ? `${catalogue.name} carries none on this record.` : tagsText(record.tags)}`,
        `Links: ${record.urls.length === 0 ? `${catalogue.name} links this record nowhere else.` : linksText(record.urls)}`,
        record.details === null ? null : `Details:\n${quoted(record.details) ?? ""}`,
        ...sceneSections(record, catalogue, wanted),
      ];

  parts.push(sourceLine(record.sourceUrl));
  parts.push(`Read from ${catalogue.name} at ${record.retrievedAt}`);

  return {
    text: joinLines(parts) + notesBlock(notes),
    structured: { ...payload, ...(read.cached === true ? { cached: true } : {}), notes },
  };
}

/* --------------------------------------------------------- the declaration */

const input = strictInput({
  id: identifier("id"),
  sections: severalOf("sections", "the blocks of the record to render", SECTIONS).optional(),
});

const DESCRIPTION = [
  "Read one scene from the catalogue its identifier names, written instance:uuid.",
  "The answer states what the catalogue holds and what it publishes no field for, and it never turns one into the other.",
  "An identifier the catalogue withdrew still resolves: what comes back describes the record rather than the scene it once named, and says so.",
].join(" ");

export function registerGetScene(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "get_scene",
    {
      title: "Get one scene",
      description: DESCRIPTION,
      inputSchema: input,
      outputSchema: getSceneOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args: { id: string; sections?: SceneSection[] | undefined }) => {
      try {
        const wanted = asked(args.sections ?? ["basic"]) as readonly SceneSection[];
        const read = await client.getScene(args.id, wanted);
        const rendered = renderScene(read.data, wanted, { cached: read.cached });
        return {
          content: [{ type: "text" as const, text: rendered.text }],
          structuredContent: rendered.structured,
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  );
}
