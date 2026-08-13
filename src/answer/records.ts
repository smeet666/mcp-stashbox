/**
 * How one record is published, and how it is printed.
 *
 * A record answered for on its own is published under the names the schema
 * declares and printed under the words a reader reads, and the two lists have to
 * be the same list. Written at each tool that answers with a record, the two
 * drifted: a field added to the payload reached one prose block and not the
 * other, and a caller reading only the text lost the qualification the payload
 * carried. Everything either tool would otherwise write twice lives here.
 *
 * Three rules shape the file, and all three are the one rule this server keeps.
 * **A silence is named for what caused it**, which is why every note asks the
 * capability registry rather than a record's own null. **A section asked for
 * states its zero** rather than vanishing, since a section that vanishes is
 * indistinguishable from one nobody loaded. And **a record named inside an
 * answer carries its marker**, wherever in the answer it was named.
 */

import { instanceById, supports, type Capability, type InstanceId } from "../stashbox/instances.js";
import type { ReadDate, RecordStatus } from "../stashbox/normalise.js";
import type {
  FingerprintRow,
  ImageRow,
  PerformerRecord,
  SceneRecord,
  SiteLink,
  TagRow,
} from "../types.js";
import {
  isFolded,
  markerEmptinessNote,
  markerOpening,
  markerSectionsNote,
  markerSuffix,
} from "./marker.js";
import { LINKS, TAGS, noTable, nothingRecorded, type Categorised } from "./categories.js";
import { inline } from "./text.js";

/* ------------------------------------------------------- the catalogue */

/** What a record's answer needs to know about the catalogue that holds it. */
export interface Catalogue {
  name: string;
  publishes: (capability: Capability) => boolean;
}

/**
 * The catalogue a record came off, read from the registry.
 *
 * A catalogue the registry does not declare is one nothing is claimed about: a
 * field missing there is left unexplained rather than explained by a limit
 * nobody measured.
 */
export function catalogueOf(id: InstanceId): Catalogue {
  const spec = instanceById(id);
  return {
    name: spec?.name ?? id,
    publishes: (capability) => spec === undefined || supports(spec, capability),
  };
}

/* ------------------------------------------------------------ printing */

/** The line a record opens with, which is its own name or the identifier. */
export function headLine(name: string | null, id: string): string {
  return inline(name) ?? id;
}

/** A date as the catalogue entered it, at the precision it was entered with. */
export function dateText(date: ReadDate | null): string | null {
  return date === null ? null : date.value;
}

/** A runtime published as a count of seconds, with the unit it counts in. */
export function durationText(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const spelt = hours > 0 ? `${hours}h ${minutes}m ${rest}s` : `${minutes}m ${rest}s`;
  return `${seconds} seconds (${spelt})`;
}

/** Where a record links, each address with the site and category behind it. */
export function linksText(links: readonly SiteLink[]): string {
  return links
    .map((link) => {
      const about = [inline(link.siteName), inline(link.siteCategory)].filter(
        (part): part is string => part !== null,
      );
      return about.length === 0 ? link.url : `${link.url} (${about.join(", ")})`;
    })
    .join("; ");
}

/** One image as an address and the size the catalogue published for it. */
export function imageRows(images: readonly ImageRow[]): string[] {
  return images.map((image) => {
    const size =
      image.width !== null && image.height !== null ? ` (${image.width}x${image.height})` : "";
    return `  - ${image.url}${size}`;
  });
}

/** One fingerprint, with what the catalogue counted for it. */
export function fingerprintRows(rows: readonly FingerprintRow[]): string[] {
  return rows.map((row) => {
    const counted = [
      row.submissions === null ? null : `${row.submissions} submission(s)`,
      row.reports === null ? null : `${row.reports} report(s)`,
      row.durationSeconds === null ? null : `${row.durationSeconds} seconds`,
    ].filter((part): part is string => part !== null);
    const about = counted.length === 0 ? "" : ` (${counted.join(", ")})`;
    return `  - ${row.algorithm} ${row.hash}${about}`;
  });
}

/** The tags a record carries, each with the category its catalogue placed it in. */
export function tagsText(tags: readonly TagRow[]): string {
  return tags
    .map((tag) => {
      const category = inline(tag.category);
      const named = `${inline(tag.name) ?? tag.id}${markerSuffix(tag.status)}`;
      return category === null ? named : `${named} (${category})`;
    })
    .join("; ");
}

/* ------------------------------------------------------------ the payload */

export function datePayload(date: ReadDate | null): Record<string, string> | null {
  return date === null ? null : { value: date.value, precision: date.precision };
}

/**
 * A studio as every answer naming one publishes it.
 *
 * A studio is named by a scene read on its own and by a scene a hash reached,
 * and the two publish one shape: a caller reading a studio out of either answer
 * reads the same fields, and a mark added here reaches both.
 */
export function studioPayload(studio: SceneRecord["studio"]): Record<string, unknown> | null {
  if (studio === null) return null;
  return {
    id: studio.id,
    name: studio.name,
    parent: studio.parent,
    status: studio.status,
    ...(studio.parentWithdrawn === true ? { parent_withdrawn: true } : {}),
  };
}

/**
 * The cast a scene credits, each with what its own identifier addresses now.
 *
 * A credit whose record the catalogue has folded is held under another
 * identifier, so the status travels wherever the cast does.
 */
export function creditsPayload(credits: SceneRecord["performers"]): Record<string, unknown>[] {
  return credits.map((credit) => ({
    id: credit.id,
    name: credit.name,
    credited_as: credit.creditedAs,
    disambiguation: credit.disambiguation,
    status: credit.status,
  }));
}

function linksPayload(links: readonly SiteLink[]): Record<string, unknown>[] {
  return links.map((link) => ({
    url: link.url,
    site_name: link.siteName,
    site_category: link.siteCategory,
  }));
}

function imagesPayload(images: readonly ImageRow[]): Record<string, unknown>[] {
  return images.map((image) => ({ url: image.url, width: image.width, height: image.height }));
}

/** What every record publishes, whatever it is a record of. */
function basePayload(record: SceneRecord | PerformerRecord): Record<string, unknown> {
  return {
    id: record.id,
    source: record.source,
    source_url: record.sourceUrl,
    retrieved_at: record.retrievedAt,
    status: record.status,
    pending_edits: record.pendingEdits,
    ...(record.pendingEditsUnreadable === true ? { pending_edits_unreadable: true } : {}),
    ...(record.rowsSkipped === undefined || record.rowsSkipped === 0
      ? {}
      : { rows_skipped: record.rowsSkipped, rows_skipped_in: record.rowsSkippedIn ?? [] }),
  };
}

/**
 * One scene as an answer publishes it.
 *
 * The heavy blocks are published where they were asked for. A key present and
 * empty states that the record holds none of them, which is a different claim
 * from a block nobody loaded.
 */
export function scenePayload(
  record: SceneRecord,
  sections: readonly string[],
): Record<string, unknown> {
  return {
    ...basePayload(record),
    title: record.title,
    details: record.details,
    code: record.code,
    director: record.director,
    duration_seconds: record.durationSeconds,
    release_date: datePayload(record.releaseDate),
    production_date: datePayload(record.productionDate),
    ...(record.releaseDateUnreadable === true ? { release_date_unreadable: true } : {}),
    ...(record.productionDateUnreadable === true ? { production_date_unreadable: true } : {}),
    studio: studioPayload(record.studio),
    performers: creditsPayload(record.performers),
    tags: record.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      category: tag.category,
      status: tag.status,
    })),
    urls: linksPayload(record.urls),
    ...(sections.includes("images") && record.images !== undefined
      ? {
          images: imagesPayload(record.images),
          ...(record.imagesSkipped ? { images_skipped: record.imagesSkipped } : {}),
        }
      : {}),
    ...(sections.includes("fingerprints") && record.fingerprints !== undefined
      ? {
          fingerprints: record.fingerprints.map((row) => ({
            algorithm: row.algorithm,
            hash: row.hash,
            duration_seconds: row.durationSeconds,
            submissions: row.submissions,
            reports: row.reports,
            contested: row.contested,
          })),
          ...(record.fingerprintsSkipped
            ? { fingerprints_skipped: record.fingerprintsSkipped }
            : {}),
          ...(record.fingerprintCount === undefined
            ? {}
            : { fingerprints_shown: record.fingerprintCount }),
        }
      : {}),
    created: record.created,
    updated: record.updated,
  };
}

/** One performer as an answer publishes it, with the blocks that were asked for. */
export function performerPayload(
  record: PerformerRecord,
  sections: readonly string[],
): Record<string, unknown> {
  const appearance = record.appearance;
  return {
    ...basePayload(record),
    merged_into: record.mergedInto,
    merged_ids: record.mergedIds,
    name: record.name,
    disambiguation: record.disambiguation,
    aliases: record.aliases,
    gender: record.gender,
    country: record.country,
    birth_date: datePayload(record.birthDate),
    death_date: datePayload(record.deathDate),
    ...(record.birthDateUnreadable === true ? { birth_date_unreadable: true } : {}),
    ...(record.deathDateUnreadable === true ? { death_date_unreadable: true } : {}),
    career_start_year: record.careerStartYear,
    career_end_year: record.careerEndYear,
    scene_count: record.sceneCount,
    urls: linksPayload(record.urls),
    ...(sections.includes("appearance") && appearance !== undefined
      ? {
          appearance: {
            ethnicity: appearance.ethnicity,
            eye_color: appearance.eyeColor,
            hair_color: appearance.hairColor,
            height_cm: appearance.heightCm,
            tattoos: appearance.tattoos,
            piercings: appearance.piercings,
            breast_type: appearance.breastType,
            cup_size: appearance.cupSize,
            band_size: appearance.bandSize,
            waist_size: appearance.waistSize,
            hip_size: appearance.hipSize,
          },
        }
      : {}),
    ...(sections.includes("images") && record.images !== undefined
      ? {
          images: imagesPayload(record.images),
          ...(record.imagesSkipped ? { images_skipped: record.imagesSkipped } : {}),
        }
      : {}),
    ...(sections.includes("scenes")
      ? {
          ...(record.scenes === undefined
            ? {}
            : {
                scenes: record.scenes.map((scene) => scenePayload(scene, ["basic"])),
                scenes_shown: record.scenesShown ?? record.scenes.length,
                scenes_total: record.scenesTotal ?? null,
              }),
          ...(record.scenesSkipped ? { scenes_skipped: record.scenesSkipped } : {}),
          ...(record.scenesUnavailable === undefined
            ? {}
            : { scenes_unavailable: record.scenesUnavailable }),
        }
      : {}),
    ...(sections.includes("studios")
      ? {
          ...(record.studios === undefined
            ? {}
            : {
                studios: record.studios.map((studio) => ({
                  id: studio.id,
                  name: studio.name,
                  scene_count: studio.sceneCount,
                  status: studio.status,
                })),
                ...(record.studiosTotal === undefined
                  ? {}
                  : { studios_answered_with: record.studiosTotal }),
              }),
          ...(record.studiosSkipped ? { studios_skipped: record.studiosSkipped } : {}),
          ...(record.studiosUnavailable === undefined
            ? {}
            : { studios_unavailable: record.studiosUnavailable }),
        }
      : {}),
    created: record.created,
    updated: record.updated,
  };
}

/* -------------------------------------------------------------- the marker */

/** What a marker's answer opens with, which is all a marker carries. */
export function markerHead(
  catalogue: Catalogue,
  kind: "scene" | "performer",
  record: { id: string; status: RecordStatus },
  formerName: string | null,
  successor: string | null,
): (string | null)[] {
  return [
    formerName === null ? null : `${formerName} (former ${kind === "scene" ? "title" : "name"})`,
    markerOpening(catalogue.name, record.status, successor),
    `Identifier: ${record.id} (${catalogue.name})`,
  ];
}

/* --------------------------------------------------------------- the notes */

/** A date printed, named as a reader names it. */
export interface PrintedDate {
  what: string;
  date: ReadDate | null;
  unreadable: boolean;
}

/** What a record knows about itself, which is all these rules read. */
export interface RecordFacts {
  catalogue: Catalogue;
  kind: "scene" | "performer";
  status: RecordStatus;
  /** The record a folded identifier addresses, null where none is published. */
  successor: string | null;
  /** Sections asked for that a marker cannot carry. */
  unrendered: readonly string[];
  dates: readonly PrintedDate[];
  links: readonly SiteLink[];
  tags: readonly TagRow[];
  pendingEdits: number | null;
  pendingEditsUnreadable: boolean;
  rowsSkipped: number;
  rowsSkippedIn: readonly string[];
  cached: boolean;
  retrievedAt: string;
  /** The answer as it is published, read for the records named inside it. */
  payload: Record<string, unknown>;
}

/**
 * Every sentence a record owes a reader, in the order they are met.
 *
 * `extra` carries what one kind of record alone can say, placed after the
 * shared sentences and before the two that qualify everything above them.
 */
export function recordNotes(facts: RecordFacts, extra: readonly (string | null)[]): string[] {
  const { catalogue } = facts;
  const notes: (string | null)[] = [];

  if (isFolded(facts.status)) {
    notes.push(markerEmptinessNote(facts.kind));
    notes.push(markerSectionsNote(facts.unrendered, facts.successor));
  }

  notes.push(precisionNote(facts.dates));
  for (const date of facts.dates) {
    if (!date.unreadable) continue;
    notes.push(
      `${catalogue.name} published a ${date.what} this client could not read, so the ${date.what} is missing here rather than absent from the record.`,
    );
  }

  notes.push(editNote(facts));
  notes.push(siteCategoryNote(facts));
  notes.push(tagCategoryNote(facts));

  if (facts.rowsSkipped > 0) {
    notes.push(
      `${facts.rowsSkipped} row(s) of this record could not be read and are left out, in: ${facts.rowsSkippedIn.join(", ")}. That is this client failing to read them and says nothing about what ${catalogue.name} holds.`,
    );
  }

  notes.push(nestedLossNote(facts));
  notes.push(...extra);
  notes.push(foldedNamesNote(facts));

  if (facts.cached) {
    notes.push(
      `This answer was replayed from this client's store, so no catalogue was asked for it. It is what ${catalogue.name} said when it was first read, at ${facts.retrievedAt}.`,
    );
  }

  return notes.filter((note): note is string => note !== null && note !== "");
}

/** Dates entered short, so no reader takes a year for a day nobody entered. */
function precisionNote(dates: readonly PrintedDate[]): string | null {
  const short = dates.filter((entry) => entry.date !== null && entry.date.precision !== "day");
  if (short.length === 0) return null;
  const each = short
    .map((entry) => `the ${entry.what} was entered as a ${entry.date?.precision ?? ""}`)
    .join("; ");
  return `A date is shown at the precision it was entered with: ${each}. A month or a day nobody entered is shown nowhere here.`;
}

/** What is open against a record, or why nothing here says. */
function editNote(facts: RecordFacts): string | null {
  const { catalogue } = facts;
  if (!catalogue.publishes("pending_edits")) {
    return `${catalogue.name} publishes no count of the edits open against a record, so nothing here says whether one is pending against this one.`;
  }
  if (facts.pendingEditsUnreadable) {
    return `${catalogue.name} publishes a count of the edits pending against a record and answered one this client could not read, so no number is shown here.`;
  }
  if (facts.pendingEdits === null) {
    return `${catalogue.name} publishes a count of the edits pending against a record and published none for this one, so nothing here counts what is open against it.`;
  }
  if (facts.pendingEdits > 0) {
    return `${facts.pendingEdits} edit(s) are open against this record, so it may be about to change. An open edit says nothing about whether what it holds is wrong.`;
  }
  return null;
}

/** Why a link carries no category, which two different silences answer. */
function siteCategoryNote(facts: RecordFacts): string | null {
  return categoryNote(
    facts,
    LINKS,
    facts.links.map((link) => link.siteCategory),
  );
}

/** Why a tag carries no category, which two different silences answer. */
function tagCategoryNote(facts: RecordFacts): string | null {
  return categoryNote(
    facts,
    TAGS,
    facts.tags.map((tag) => tag.category),
  );
}

/**
 * The one answer to a category nobody recorded, given the list that carries it.
 *
 * A page of rows answers this same question about these same lists, and the two
 * read the sentences from one place: a record and a row that worded it
 * differently would read as two different findings about one silence.
 */
function categoryNote(
  facts: RecordFacts,
  kind: Categorised,
  categories: readonly (string | null)[],
): string | null {
  if (categories.length === 0) return null;
  const { catalogue } = facts;
  if (!catalogue.publishes(kind.capability)) return noTable(catalogue.name, kind);
  return categories.some((one) => one === null) ? nothingRecorded(catalogue.name, kind) : null;
}

/* ------------------------------------------------- records named inside one */

/** Every object of a payload below its root, which is where a record is named. */
function* nested(value: unknown, root: boolean): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* nested(item, false);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (!root) yield object;
  for (const item of Object.values(object)) yield* nested(item, false);
}

/**
 * What was lost inside the records an answer names, which a reader cannot see.
 *
 * A record listed inside another shows its own losses nowhere: a reader sees the
 * scene and never the rows that fell out of it. The count is gathered from the
 * answer itself, so a block added tomorrow states its losses the day it appears
 * rather than the day somebody remembers to count them.
 */
function nestedLossNote(facts: RecordFacts): string | null {
  let rows = 0;
  const lists = new Set<string>();
  const lost = new Map<string, number>();
  const unread = new Set<string>();

  for (const object of nested(facts.payload, true)) {
    for (const [key, value] of Object.entries(object)) {
      if (key === "rows_skipped" && typeof value === "number") rows += value;
      else if (key === "rows_skipped_in" && Array.isArray(value)) {
        for (const name of value) if (typeof name === "string") lists.add(name);
      } else if (key.endsWith("_skipped") && typeof value === "number" && value > 0) {
        const what = readable(key, "_skipped");
        lost.set(what, (lost.get(what) ?? 0) + value);
      } else if (key.endsWith("_unreadable") && value === true) {
        unread.add(readable(key, "_unreadable"));
      }
    }
  }

  const parts = [
    rows === 0 ? null : `${rows} row(s) of them could not be read, in: ${[...lists].join(", ")}`,
    ...[...lost].map(([what, count]) => `${count} ${what} could not be read`),
    unread.size === 0 ? null : `published and unreadable: ${[...unread].join(", ")}`,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;

  return `Inside the records named in this answer: ${parts.join("; ")}. That is this client failing to read them and says nothing about what ${facts.catalogue.name} holds.`;
}

/** A payload key as a sentence names the thing it qualifies. */
function readable(key: string, qualifier: string): string {
  return key.slice(0, key.length - qualifier.length).replace(/_/g, " ");
}

/**
 * The records named inside an answer that their catalogue has folded.
 *
 * A name printed without its mark reads as the record it once named, and a
 * caller pivots on an identifier that moved. Collected from the answer itself,
 * so a record named in a block added tomorrow is marked the day it appears.
 */
function foldedNamesNote(facts: RecordFacts): string | null {
  const marked = new Map<string, string>();
  for (const object of nested(facts.payload, true)) {
    const status = object.status;
    if (typeof status !== "string" || status === "established") continue;
    // Any name at all is enough. A short one names a record as surely as a long
    // one, and dropping it leaves that record printed without its mark.
    const name = [object.title, object.name].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (name === undefined) continue;
    marked.set(name, `${name}${markerSuffix(status as RecordStatus)}`);
  }
  if (marked.size === 0) return null;
  return `Named inside this answer and folded on ${facts.catalogue.name}: ${[...marked.values()].join(", ")}. Each of those names a record the catalogue no longer holds as itself, so what it holds about it is under another identifier.`;
}
