/**
 * One performer, answered for the identifier that names them.
 *
 * Two readings of the one rule decide everything here. **A marker describes the
 * record and never the person it once named**: a folded identifier renders what
 * the catalogue still holds, which is the identifier, the name the record
 * carried and the successor the catalogue publishes, and the sections a caller
 * asked for are named as unrenderable rather than answered with a record holding
 * none of them. **A count of scenes is what this catalogue indexed**: a settled
 * record naming a career of forty years can report none, so the number is
 * printed with the catalogue it counts on, on the line that carries it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { isFolded, markerSuffix } from "../answer/marker.js";
import { SCENE_COUNT_CAUTION } from "../answer/notes.js";
import {
  catalogueOf,
  dateText,
  headLine,
  imageRows,
  linksText,
  markerHead,
  performerPayload,
  recordNotes,
  type Catalogue,
} from "../answer/records.js";
import {
  inline,
  inlineAll,
  joinLines,
  line,
  notesBlock,
  section,
  sourceLine,
  type Rendered,
} from "../answer/text.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { PerformerSection } from "../stashbox/queries.js";
import type { PerformerAppearanceDetails, PerformerRecord } from "../types.js";
import { identifier, severalOf, strictInput } from "./arguments.js";
import { toolFailure } from "./errorShape.js";
import { getPerformerOutput } from "./schemas.js";

/** The blocks a caller can ask for, in the order an answer renders them. */
const SECTIONS = ["basic", "appearance", "images", "scenes", "studios"] as const;

/** What a caller asked for, an empty list read as the block that identifies a record. */
function asked(sections: readonly string[]): readonly string[] {
  return sections.length === 0 ? ["basic"] : sections;
}

/** The years a record carries for a career, in whichever of them it carries. */
function careerText(record: PerformerRecord): string | null {
  const { careerStartYear: from, careerEndYear: to } = record;
  if (from !== null && to !== null) return `${from} to ${to}`;
  if (from !== null) return `from ${from}`;
  if (to !== null) return `to ${to}`;
  return null;
}

/** The fields of a body the record carries, each named with its unit. */
function appearanceRows(appearance: PerformerAppearanceDetails): string[] {
  const rows: (string | null)[] = [
    line("  Height", appearance.heightCm === null ? null : `${appearance.heightCm} cm`),
    line("  Ethnicity", inline(appearance.ethnicity)),
    line("  Eye colour", inline(appearance.eyeColor)),
    line("  Hair colour", inline(appearance.hairColor)),
    line("  Breast type", inline(appearance.breastType)),
    line("  Cup size", inline(appearance.cupSize)),
    line("  Band size", appearance.bandSize === null ? null : `${appearance.bandSize} inches`),
    line("  Waist", appearance.waistSize === null ? null : `${appearance.waistSize} inches`),
    line("  Hips", appearance.hipSize === null ? null : `${appearance.hipSize} inches`),
    appearance.tattoos.length === 0 ? null : `  Tattoos: ${inlineAll(appearance.tattoos)}`,
    appearance.piercings.length === 0 ? null : `  Piercings: ${inlineAll(appearance.piercings)}`,
  ];
  return rows.filter((row): row is string => row !== null);
}

/** One scene the catalogue indexes for this performer, with the mark it carries. */
function sceneRows(record: PerformerRecord): string[] {
  return (record.scenes ?? []).map((scene) => {
    const named = `${inline(scene.title) ?? scene.id}${markerSuffix(scene.status)}`;
    const when = scene.releaseDate === null ? "" : `, ${scene.releaseDate.value}`;
    return `  - ${named}${when} [${scene.id}]`;
  });
}

/** One studio this catalogue credits the performer on, with the mark it carries. */
function studioRows(record: PerformerRecord, catalogue: Catalogue): string[] {
  return (record.studios ?? []).map((studio) => {
    const named = `${inline(studio.name) ?? studio.id}${markerSuffix(studio.status)}`;
    const counted =
      studio.sceneCount === null
        ? ""
        : `, ${studio.sceneCount} scene(s) indexed on ${catalogue.name}`;
    return `  - ${named}${counted} [${studio.id}]`;
  });
}

/** The heavy blocks, each stating its own zero where it holds nothing. */
function performerSections(
  record: PerformerRecord,
  catalogue: Catalogue,
  sections: readonly string[],
): (string | null)[] {
  const parts: (string | null)[] = [];
  if (sections.includes("appearance")) {
    parts.push(
      section(
        "Appearance",
        record.appearance === undefined ? [] : appearanceRows(record.appearance),
        `this record carries none of what ${catalogue.name} records here.`,
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
  if (sections.includes("scenes")) {
    parts.push(
      section(
        "Scenes",
        sceneRows(record),
        record.scenesUnavailable ?? `${catalogue.name} has indexed none crediting this performer.`,
      ),
    );
  }
  if (sections.includes("studios")) {
    parts.push(
      section(
        "Studios",
        studioRows(record, catalogue),
        record.studiosUnavailable ?? `${catalogue.name} credits this performer on none.`,
      ),
    );
  }
  return parts;
}

/** What a performer owes a reader beyond the fields a record carries. */
function performerExtras(
  record: PerformerRecord,
  catalogue: Catalogue,
  sections: readonly string[],
): (string | null)[] {
  const notes: (string | null)[] = [];

  if (!catalogue.publishes("scene_count")) {
    notes.push(
      `${catalogue.name} publishes no count of the scenes crediting a performer, so nothing here counts them.`,
    );
  } else if (record.sceneCount === null) {
    notes.push(
      `${catalogue.name} publishes a count of the scenes crediting a performer and this record carries none, so nothing here counts them.`,
    );
  } else {
    notes.push(SCENE_COUNT_CAUTION);
  }

  if (sections.includes("images")) notes.push(unread(record.imagesSkipped, "image", catalogue));

  if (sections.includes("scenes")) {
    if (record.scenesUnavailable !== undefined) notes.push(record.scenesUnavailable);
    else if (record.scenes !== undefined) {
      notes.push(
        record.scenesTotal === null || record.scenesTotal === undefined
          ? `${catalogue.name} publishes no count of what its index holds behind this page, so the scenes here are what came back and no number says how many more it indexes.`
          : `${catalogue.name} has indexed ${record.scenesTotal} scene(s) crediting this performer and ${record.scenesShown ?? record.scenes.length} are shown here. That counts what the catalogue indexed and never a person's work.`,
      );
    }
    notes.push(unread(record.scenesSkipped, "scene", catalogue));
  }

  if (sections.includes("studios")) {
    if (record.studiosUnavailable !== undefined) notes.push(record.studiosUnavailable);
    notes.push(unread(record.studiosSkipped, "studio", catalogue));
  }

  return notes;
}

/**
 * What a block of this record lost on its way here, said the one way.
 *
 * Every block loses rows the same way and owes a reader the same sentence, so
 * the sentence is written once: a block that phrased its loss differently from
 * its neighbour would read as a different kind of loss.
 */
function unread(count: number | undefined, what: string, catalogue: Catalogue): string | null {
  if (count === undefined || count === 0) return null;
  return `${count} ${what}(s) ${catalogue.name} answered with could not be read and are left out of the block here.`;
}

/**
 * One performer as a caller reads them: the prose and the payload, carrying the
 * same facts and the same qualifications.
 */
export function renderPerformer(
  record: PerformerRecord,
  sections: readonly string[] = ["basic"],
  read: { cached?: boolean } = {},
): Rendered {
  const wanted = asked(sections);
  const catalogue = catalogueOf(record.source);
  const folded = isFolded(record.status);
  const unrendered = wanted.filter((name) => name !== "basic");
  const payload = performerPayload(record, folded ? ["basic"] : wanted);

  const notes = recordNotes(
    {
      catalogue,
      kind: "performer",
      status: record.status,
      successor: record.mergedInto,
      unrendered,
      dates: [
        {
          what: "birth date",
          date: record.birthDate,
          unreadable: record.birthDateUnreadable === true,
        },
        {
          what: "death date",
          date: record.deathDate,
          unreadable: record.deathDateUnreadable === true,
        },
      ],
      links: record.urls,
      tags: [],
      pendingEdits: record.pendingEdits,
      pendingEditsUnreadable: record.pendingEditsUnreadable === true,
      rowsSkipped: record.rowsSkipped ?? 0,
      rowsSkippedIn: record.rowsSkippedIn ?? [],
      cached: read.cached === true,
      retrievedAt: record.retrievedAt,
      payload,
    },
    folded ? [] : performerExtras(record, catalogue, wanted),
  );

  const about = inline(record.disambiguation);
  const parts: (string | null)[] = folded
    ? [
        ...markerHead(catalogue, "performer", record, inline(record.name), record.mergedInto),
        record.mergedIds.length === 0 ? null : `Folded into it: ${record.mergedIds.join(", ")}`,
      ]
    : [
        `${headLine(record.name, record.id)}${about === null ? "" : ` (${about})`}`,
        `${catalogue.name}, performer ${record.id}`,
        record.aliases.length === 0 ? null : `Aliases: ${inlineAll(record.aliases)}`,
        line("Gender", inline(record.gender)),
        line("Country", inline(record.country)),
        line("Born", dateText(record.birthDate)),
        line("Died", dateText(record.deathDate)),
        line("Career", careerText(record)),
        record.sceneCount === null
          ? null
          : `Scenes indexed on ${catalogue.name}: ${record.sceneCount}`,
        `Links: ${record.urls.length === 0 ? `${catalogue.name} links this record nowhere else.` : linksText(record.urls)}`,
        ...performerSections(record, catalogue, wanted),
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
  "Read one performer from the catalogue its identifier names, written instance:uuid.",
  "A count of scenes reports what that catalogue has indexed and never a person's work: a settled record can report none while naming a career spanning decades.",
  "An identifier the catalogue folded still resolves: what comes back describes the record rather than the person it once named, and names the record that continues it.",
].join(" ");

export function registerGetPerformer(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "get_performer",
    {
      title: "Get one performer",
      description: DESCRIPTION,
      inputSchema: input,
      outputSchema: getPerformerOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args: { id: string; sections?: PerformerSection[] | undefined }) => {
      try {
        const wanted = asked(args.sections ?? ["basic"]) as readonly PerformerSection[];
        const read = await client.getPerformer(args.id, wanted);
        const rendered = renderPerformer(read.data, wanted, { cached: read.cached });
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
