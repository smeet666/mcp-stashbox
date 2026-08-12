/**
 * One catalogue's answer, read into the records this client hands back.
 *
 * The rule that governs every line here: the server never states anything the
 * data does not carry. Three readings of it decide what this file does with a
 * value.
 *
 * **A value this client could not read is a loss, and a loss is counted.** One
 * accumulator travels through the whole of a record and every list feeds it by
 * name, so the count that comes out says which lists lost something. A row
 * dropped in silence turns a record this client failed to read into a record the
 * catalogue holds nothing for, and the two are the difference between a caller
 * asking again and a caller concluding.
 *
 * **Every identifier printed is one this server would accept back.** A nested id
 * that is no uuid is a lost row: printing it would offer a caller an identifier
 * the next call refuses, and printing the record without it would state a scene
 * with no studio.
 *
 * **A field a catalogue does not publish is read from the registry.** A null
 * from a catalogue that publishes the field is a record carrying none. A null
 * from one that does not is a question nobody asked, so the field is never read
 * there and the answer says so elsewhere.
 *
 * Two measured facts shape the marker branches. These catalogues fold a
 * performer into a successor and publish which one. They withdraw a scene, a
 * studio and a tag without naming anything in its place, so a scene is held or
 * withdrawn and never merged. A withdrawn scene keeps its fingerprints, since a
 * hash states what a file is and never what a scene holds.
 */

import type {
  FingerprintAlgorithm,
  FingerprintRow,
  ImageRow,
  Losses,
  PerformerAppearance,
  PerformerAppearanceDetails,
  PerformerRecord,
  SceneRecord,
  SiteLink,
  StudioRef,
  TagRow,
} from "../types.js";
import { formatId, isUuid } from "./identifiers.js";
import { supports, type InstanceSpec } from "./instances.js";
import { positiveOrNull, readContested, readDate, readStatus } from "./normalise.js";

/**
 * The names a loss is counted under, which are the words an answer says it in.
 *
 * They name the list a row came from rather than the field of the payload it sat
 * in, because the reader of a count is reading prose.
 */
const LIST = {
  title: "title",
  name: "name",
  details: "details",
  director: "director",
  sceneCode: "code",
  duration: "duration",
  gender: "gender",
  country: "country",
  disambiguation: "disambiguation",
  timestamps: "timestamps",
  links: "links",
  tags: "tags",
  credits: "credited performers",
  studio: "studio",
  studioParent: "studio parent",
  aliases: "aliases",
  absorbed: "absorbed identifiers",
  successor: "successor",
  images: "images",
  fingerprints: "fingerprints",
  appearance: "appearance",
  marks: "body modifications",
  careerYears: "career years",
  sceneCount: "scene count",
  studios: "studios",
} as const;

/**
 * Everything one record lost while it was read.
 *
 * The counters are held in one place and named as they are added, so a list
 * added to a record is counted the day it is read rather than the day somebody
 * remembers to count it.
 */
class Discarded {
  private readonly lists = new Map<string, number>();

  lost(list: string, howMany = 1): void {
    if (howMany <= 0) return;
    this.lists.set(list, (this.lists.get(list) ?? 0) + howMany);
  }

  /** How many rows were lost in one list, which a section states beside itself. */
  in(list: string): number {
    return this.lists.get(list) ?? 0;
  }

  /** The counters a record carries, absent where the record lost nothing. */
  fields(): Losses {
    let total = 0;
    for (const count of this.lists.values()) total += count;
    if (total === 0) return {};
    return { rowsSkipped: total, rowsSkippedIn: [...this.lists.keys()] };
  }
}

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Row;
}

/**
 * Text as the catalogue published it, byte for byte.
 *
 * A value that is absent or null is an absence. A value that is there and is no
 * text is a loss: reading it as an absence would state a record carrying no
 * title where the catalogue published one this client could not read.
 */
function readText(value: unknown, list: string, lost: Discarded): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value === "" ? null : value;
  lost.lost(list);
  return null;
}

/** A whole number of things, zero included, since a count of none is a count. */
function readTally(value: unknown, list: string, lost: Discarded): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  lost.lost(list);
  return null;
}

/**
 * A measurement, which is a positive quantity or an absence. A folded record
 * publishes a height of zero, and no person is nought centimetres tall.
 */
function readMeasure(value: unknown, list: string, lost: Discarded): number | null {
  if (value === undefined || value === null) return null;
  // A measurement here counts whole units: seconds of running time, centimetres
  // of height, the size of a band. A fraction of one of those, and a magnitude
  // past what integers hold exactly, have already lost the digits that would
  // say what was measured, so neither is published as a measurement.
  if (typeof value === "number" && Number.isSafeInteger(value)) return positiveOrNull(value);
  lost.lost(list);
  return null;
}

/** A year, which counts nothing and is a number a calendar carries. */
function readYear(value: unknown, list: string, lost: Discarded): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  lost.lost(list);
  return null;
}

/** The uuid a nested record is named by, or nothing, which is a lost row. */
function uuidOf(value: unknown): string | undefined {
  return typeof value === "string" && isUuid(value) ? value.toLowerCase() : undefined;
}

/**
 * A date, with whether the catalogue published one this client could not read.
 *
 * The two are kept apart because a record carrying no date and a date written in
 * an order whose year could only be guessed are different facts, and one null
 * would report them as the same.
 */
function readPublishedDate(value: unknown): {
  date: ReturnType<typeof readDate>;
  unreadable: boolean;
} {
  if (value === undefined || value === null || value === "") {
    return { date: null, unreadable: false };
  }
  const date = readDate(typeof value === "string" ? value : "");
  return { date, unreadable: date === null };
}

/** What a catalogue says of a record it no longer holds as itself. */
function withdrawn(value: unknown): boolean {
  return value === true;
}

/** The successor a record names, as text, which is what a status is read from. */
function namedSuccessor(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * How many edits are open against a record.
 *
 * A catalogue publishing no edits is read from the registry and answers null, so
 * a record under revision is never presented as one nobody has proposed a change
 * to. A catalogue that publishes them and answers a shape this client cannot
 * read says that instead of counting what it managed to recognise.
 */
function readPendingEdits(
  row: Row,
  spec: InstanceSpec,
): { pendingEdits: number | null; pendingEditsUnreadable?: true } {
  if (!supports(spec, "pending_edits")) return { pendingEdits: null };
  const edits = row.edits;
  if (edits === undefined || edits === null) return { pendingEdits: null };
  if (!Array.isArray(edits)) return { pendingEdits: null, pendingEditsUnreadable: true };

  let open = 0;
  for (const entry of edits) {
    const edit = asRow(entry);
    const status = edit?.status;
    if (typeof status !== "string") return { pendingEdits: null, pendingEditsUnreadable: true };
    if (status.toUpperCase() === "PENDING") open += 1;
  }
  return { pendingEdits: open };
}

/* --------------------------------------------------------------- the lists */

function readLinks(value: unknown, spec: InstanceSpec, lost: Discarded): SiteLink[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    lost.lost(LIST.links);
    return [];
  }

  const links: SiteLink[] = [];
  for (const entry of value) {
    const row = asRow(entry);
    const url = row === undefined ? undefined : row.url;
    if (typeof url !== "string" || url === "") {
      lost.lost(LIST.links);
      continue;
    }
    const site = row?.site;
    let siteName: string | null = null;
    let siteCategory: string | null = null;
    if (site !== undefined && site !== null) {
      const named = asRow(site);
      if (named === undefined) {
        lost.lost(LIST.links);
      } else {
        siteName = readText(named.name, LIST.links, lost);
        // The category is read only where the catalogue publishes the table it
        // comes from: elsewhere its silence is a question nobody put.
        if (supports(spec, "site_categories") && named.category !== undefined) {
          const category = asRow(named.category);
          if (named.category === null) {
            siteCategory = null;
          } else if (category === undefined) {
            lost.lost(LIST.links);
          } else {
            siteCategory = readText(category.name, LIST.links, lost);
          }
        }
      }
    }
    links.push({ url, siteName, siteCategory });
  }
  return links;
}

function readTags(value: unknown, spec: InstanceSpec, lost: Discarded): TagRow[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    lost.lost(LIST.tags);
    return [];
  }

  const tags: TagRow[] = [];
  for (const entry of value) {
    const row = asRow(entry);
    const uuid = uuidOf(row?.id);
    const name = row === undefined ? null : readText(row.name, LIST.tags, lost);
    if (row === undefined || uuid === undefined || name === null) {
      lost.lost(LIST.tags);
      continue;
    }
    let category: string | null = null;
    if (supports(spec, "tag_categories") && row.category !== undefined && row.category !== null) {
      const named = asRow(row.category);
      if (named === undefined) lost.lost(LIST.tags);
      else category = readText(named.name, LIST.tags, lost);
    }
    tags.push({
      id: formatId(spec.id, uuid),
      name,
      category,
      // A tag is held or withdrawn: these catalogues name no tag in the place of one.
      status: readStatus(withdrawn(row.deleted), null),
    });
  }
  return tags;
}

function readCredits(value: unknown, spec: InstanceSpec, lost: Discarded): PerformerAppearance[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    lost.lost(LIST.credits);
    return [];
  }

  const credits: PerformerAppearance[] = [];
  for (const entry of value) {
    const row = asRow(entry);
    const performer = asRow(row?.performer);
    const uuid = uuidOf(performer?.id);
    const name = performer === undefined ? null : readText(performer.name, LIST.credits, lost);
    if (performer === undefined || uuid === undefined || name === null) {
      lost.lost(LIST.credits);
      continue;
    }
    const credited = readText(row?.as, LIST.credits, lost);
    credits.push({
      id: formatId(spec.id, uuid),
      name,
      // The name printed on a release is stated where it differs from the
      // performer's own, since repeating it would read as a second name.
      creditedAs: credited === null || credited === name ? null : credited,
      disambiguation: readText(performer.disambiguation, LIST.credits, lost),
      status: readStatus(withdrawn(performer.deleted), namedSuccessor(performer.merged_into_id)),
    });
  }
  return credits;
}

function readStudio(
  value: unknown,
  spec: InstanceSpec,
  lost: Discarded,
  list: string = LIST.studio,
): StudioRef | null {
  if (value === undefined || value === null) return null;
  const row = asRow(value);
  const uuid = uuidOf(row?.id);
  const name = row === undefined ? null : readText(row.name, list, lost);
  if (row === undefined || uuid === undefined || name === null) {
    lost.lost(list);
    return null;
  }

  let parent: string | null = null;
  let parentWithdrawn = false;
  if (row.parent !== undefined && row.parent !== null) {
    const above = asRow(row.parent);
    const parentName = above === undefined ? null : readText(above.name, LIST.studioParent, lost);
    // The parent is a record of its own. One answered with an identifier this
    // catalogue could not have minted was not read, and naming it anyway would
    // print a studio nothing here can be followed back to.
    const parentId = above === undefined ? null : readText(above.id, LIST.studioParent, lost);
    if (above === undefined || parentName === null || parentId === null || !isUuid(parentId)) {
      lost.lost(LIST.studioParent);
    } else {
      parent = parentName;
      parentWithdrawn = above.deleted === true;
    }
  }

  return {
    id: formatId(spec.id, uuid),
    name,
    parent,
    // A studio is held or withdrawn: these catalogues name no studio in the place of one.
    status: readStatus(withdrawn(row.deleted), null),
    ...(parentWithdrawn ? { parentWithdrawn: true } : {}),
  };
}

function readImages(row: Row, lost: Discarded): { images?: ImageRow[]; imagesSkipped?: number } {
  if (!("images" in row) || row.images === undefined || row.images === null) return {};
  if (!Array.isArray(row.images)) {
    lost.lost(LIST.images);
    return { images: [], imagesSkipped: 1 };
  }

  const before = lost.in(LIST.images);
  const images: ImageRow[] = [];
  for (const entry of row.images) {
    const image = asRow(entry);
    const url = image === undefined ? undefined : image.url;
    if (typeof url !== "string" || url === "") {
      lost.lost(LIST.images);
      continue;
    }
    images.push({
      url,
      width: readMeasure(image?.width, LIST.images, lost),
      height: readMeasure(image?.height, LIST.images, lost),
    });
  }
  const skipped = lost.in(LIST.images) - before;
  return { images, ...(skipped > 0 ? { imagesSkipped: skipped } : {}) };
}

const ALGORITHMS: readonly FingerprintAlgorithm[] = ["MD5", "OSHASH", "PHASH"];

function readAlgorithm(value: unknown): FingerprintAlgorithm | undefined {
  if (typeof value !== "string") return undefined;
  const written = value.toUpperCase();
  return ALGORITHMS.find((algorithm) => algorithm === written);
}

interface Prints {
  fingerprints?: FingerprintRow[];
  fingerprintsSkipped?: number;
  fingerprintCount?: Partial<Record<FingerprintAlgorithm, number>>;
}

function readFingerprints(row: Row, spec: InstanceSpec, lost: Discarded): Prints {
  if (!("fingerprints" in row) || row.fingerprints === undefined || row.fingerprints === null) {
    return {};
  }
  if (!Array.isArray(row.fingerprints)) {
    lost.lost(LIST.fingerprints);
    return { fingerprints: [], fingerprintsSkipped: 1 };
  }

  const before = lost.in(LIST.fingerprints);
  const fingerprints: FingerprintRow[] = [];
  const held: Partial<Record<FingerprintAlgorithm, number>> = {};
  for (const entry of row.fingerprints) {
    const print = asRow(entry);
    const algorithm = readAlgorithm(print?.algorithm);
    const hash = print === undefined ? undefined : print.hash;
    if (print === undefined || algorithm === undefined || typeof hash !== "string" || hash === "") {
      lost.lost(LIST.fingerprints);
      continue;
    }
    const submissions = readTally(print.submissions, LIST.fingerprints, lost);
    // A catalogue counting no disputes is read from the registry, and its
    // silence leaves the contest unknown rather than settled.
    const reports = supports(spec, "fingerprint_reports")
      ? readTally(print.reports, LIST.fingerprints, lost)
      : null;
    fingerprints.push({
      algorithm,
      hash,
      durationSeconds: readMeasure(print.duration, LIST.fingerprints, lost),
      submissions,
      reports,
      contested: readContested(submissions, reports),
    });
    held[algorithm] = (held[algorithm] ?? 0) + 1;
  }

  const skipped = lost.in(LIST.fingerprints) - before;
  return {
    fingerprints,
    ...(skipped > 0 ? { fingerprintsSkipped: skipped } : {}),
    fingerprintCount: held,
  };
}

/* ------------------------------------------------------------------ a scene */

/**
 * One scene, as this client can state it.
 *
 * A record whose own identifier is no uuid is nothing this client can address,
 * and it comes back as nothing: an identifier is what every other call is
 * written with, so a record without one has no answer to give.
 */
export function mapScene(
  raw: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): SceneRecord | null {
  const row = asRow(raw);
  if (row === undefined) return null;
  const uuid = uuidOf(row.id);
  if (uuid === undefined) return null;

  const lost = new Discarded();
  const title = readText(row.title, LIST.title, lost);
  // These catalogues name no scene in the place of a scene they withdrew.
  const status = readStatus(withdrawn(row.deleted), null);
  const prints = readFingerprints(row, spec, lost);

  const base = {
    id: formatId(spec.id, uuid),
    source: spec.id,
    sourceUrl: `${spec.webBase}/scenes/${uuid}`,
    retrievedAt,
    status,
    title,
    ...readPendingEdits(row, spec),
  };

  if (status === "deleted") {
    // A marker describes the record, never the world: the emptiness below is
    // this client saying the catalogue holds the identifier and no body behind
    // it. The fingerprints stay, since a hash states what a file is.
    return {
      ...base,
      details: null,
      code: null,
      director: null,
      durationSeconds: null,
      releaseDate: null,
      productionDate: null,
      studio: null,
      performers: [],
      tags: [],
      urls: [],
      ...prints,
      created: null,
      updated: null,
      ...lost.fields(),
    };
  }

  const release = readPublishedDate(row.release_date);
  const production = readPublishedDate(row.production_date);

  return {
    ...base,
    details: readText(row.details, LIST.details, lost),
    code: readText(row.code, LIST.sceneCode, lost),
    director: readText(row.director, LIST.director, lost),
    durationSeconds: readMeasure(row.duration, LIST.duration, lost),
    releaseDate: release.date,
    productionDate: production.date,
    ...(release.unreadable ? { releaseDateUnreadable: true } : {}),
    ...(production.unreadable ? { productionDateUnreadable: true } : {}),
    studio: readStudio(row.studio, spec, lost),
    performers: readCredits(row.performers, spec, lost),
    tags: readTags(row.tags, spec, lost),
    urls: readLinks(row.urls, spec, lost),
    ...readImages(row, lost),
    ...prints,
    created: readText(row.created, LIST.timestamps, lost),
    updated: readText(row.updated, LIST.timestamps, lost),
    ...lost.fields(),
  };
}

/* -------------------------------------------------------------- a performer */

/** A mark on a body, as one line naming where it is and what it is. */
function readMarks(value: unknown, lost: Discarded): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    lost.lost(LIST.marks);
    return [];
  }

  const marks: string[] = [];
  for (const entry of value) {
    const mark = asRow(entry);
    const where = mark === undefined ? null : readText(mark.location, LIST.marks, lost);
    const what = mark === undefined ? null : readText(mark.description, LIST.marks, lost);
    const written = [where, what].filter((part): part is string => part !== null).join(", ");
    if (written === "") {
      lost.lost(LIST.marks);
      continue;
    }
    marks.push(written);
  }
  return marks;
}

function readAppearance(row: Row, lost: Discarded): PerformerAppearanceDetails | undefined {
  const published = [
    "ethnicity",
    "eye_color",
    "hair_color",
    "height",
    "breast_type",
    "cup_size",
    "band_size",
    "waist_size",
    "hip_size",
    "tattoos",
    "piercings",
  ];
  // A block nobody asked for is absent rather than empty: an appearance of
  // nulls built from fields no request carried would read as a record holding
  // none of them.
  if (!published.some((field) => field in row)) return undefined;

  return {
    ethnicity: readText(row.ethnicity, LIST.appearance, lost),
    eyeColor: readText(row.eye_color, LIST.appearance, lost),
    hairColor: readText(row.hair_color, LIST.appearance, lost),
    heightCm: readMeasure(row.height, LIST.appearance, lost),
    tattoos: readMarks(row.tattoos, lost),
    piercings: readMarks(row.piercings, lost),
    breastType: readText(row.breast_type, LIST.appearance, lost),
    cupSize: readText(row.cup_size, LIST.appearance, lost),
    bandSize: readMeasure(row.band_size, LIST.appearance, lost),
    waistSize: readMeasure(row.waist_size, LIST.appearance, lost),
    hipSize: readMeasure(row.hip_size, LIST.appearance, lost),
  };
}

/** The studios a performer is credited on, with what the table lost. */
type StudioLine = NonNullable<PerformerRecord["studios"]>[number];

interface StudioTable {
  studios?: StudioLine[];
  studiosTotal?: number;
  studiosSkipped?: number;
}

function readStudioTable(row: Row, spec: InstanceSpec, lost: Discarded): StudioTable {
  // The table is read where the catalogue publishes one. Elsewhere its absence
  // is a route nobody has, which the answer states in its own words.
  if (!supports(spec, "performer_studios")) return {};
  if (!("studios" in row) || row.studios === undefined || row.studios === null) return {};
  if (!Array.isArray(row.studios)) {
    lost.lost(LIST.studios);
    return { studios: [], studiosTotal: 0, studiosSkipped: 1 };
  }

  const before = lost.in(LIST.studios);
  const studios: StudioLine[] = [];
  for (const entry of row.studios) {
    const line = asRow(entry);
    const studio = line === undefined ? null : readStudio(line.studio, spec, lost, LIST.studios);
    if (studio === null) {
      // A line naming no studio at all is a studio this client cannot address,
      // and readStudio counted the ones it read and could not use.
      if (line === undefined || line.studio === null) lost.lost(LIST.studios);
      continue;
    }
    studios.push({
      id: studio.id,
      name: studio.name,
      sceneCount: supports(spec, "scene_count")
        ? readTally(line?.scene_count, LIST.studios, lost)
        : null,
      status: studio.status,
    });
  }

  const skipped = lost.in(LIST.studios) - before;
  return {
    studios,
    studiosTotal: row.studios.length,
    ...(skipped > 0 ? { studiosSkipped: skipped } : {}),
  };
}

/** The identifiers folded into a record, every one of them one this server prints. */
function readAbsorbed(value: unknown, spec: InstanceSpec, lost: Discarded): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    lost.lost(LIST.absorbed);
    return [];
  }

  const absorbed: string[] = [];
  for (const entry of value) {
    const uuid = uuidOf(entry);
    if (uuid === undefined) {
      lost.lost(LIST.absorbed);
      continue;
    }
    absorbed.push(formatId(spec.id, uuid));
  }
  return absorbed;
}

/**
 * One performer, as this client can state it.
 *
 * A record the catalogue folded carries the identifier it was folded into, which
 * is the record a caller reads next. A successor this client cannot read leaves
 * the record folded and the successor unnamed: publishing the record as
 * withdrawn outright would state the catalogue lost it, which it did not.
 */
export function mapPerformer(
  raw: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): PerformerRecord | null {
  const row = asRow(raw);
  if (row === undefined) return null;
  const uuid = uuidOf(row.id);
  if (uuid === undefined) return null;

  const lost = new Discarded();
  const id = formatId(spec.id, uuid);
  const name = readText(row.name, LIST.name, lost);
  const status = readStatus(withdrawn(row.deleted), namedSuccessor(row.merged_into_id));

  let mergedInto: string | null = null;
  if (row.merged_into_id !== undefined && row.merged_into_id !== null) {
    const successor = uuidOf(row.merged_into_id);
    // A record is never offered as the record that continues it: a caller sent
    // to the identifier they are already reading is sent nowhere.
    if (successor === undefined || successor === uuid) lost.lost(LIST.successor);
    else mergedInto = formatId(spec.id, successor);
  }

  const base = {
    id,
    source: spec.id,
    sourceUrl: `${spec.webBase}/performers/${uuid}`,
    retrievedAt,
    status,
    name,
    mergedInto,
    mergedIds: readAbsorbed(row.merged_ids, spec, lost),
    ...readPendingEdits(row, spec),
  };

  if (status !== "established") {
    // What a marker holds is its identifier, the record it continues into and
    // the identifiers that still resolve to it. A count of scenes belongs to the
    // successor, and a body belongs to the record that carries the body.
    return {
      ...base,
      disambiguation: null,
      aliases: [],
      gender: null,
      country: null,
      birthDate: null,
      deathDate: null,
      careerStartYear: null,
      careerEndYear: null,
      sceneCount: null,
      urls: [],
      created: null,
      updated: null,
      ...lost.fields(),
    };
  }

  const birth = readPublishedDate(row.birth_date);
  const death = readPublishedDate(row.death_date);
  const appearance = readAppearance(row, lost);

  return {
    ...base,
    disambiguation: readText(row.disambiguation, LIST.disambiguation, lost),
    aliases: readAliases(row.aliases, lost),
    gender: readText(row.gender, LIST.gender, lost),
    country: readText(row.country, LIST.country, lost),
    birthDate: birth.date,
    deathDate: death.date,
    ...(birth.unreadable ? { birthDateUnreadable: true } : {}),
    ...(death.unreadable ? { deathDateUnreadable: true } : {}),
    careerStartYear: readYear(row.career_start_year, LIST.careerYears, lost),
    careerEndYear: readYear(row.career_end_year, LIST.careerYears, lost),
    // The count of scenes is read where the catalogue publishes one. It counts
    // what that index holds and never what a person has worked on.
    sceneCount: supports(spec, "scene_count")
      ? readTally(row.scene_count, LIST.sceneCount, lost)
      : null,
    urls: readLinks(row.urls, spec, lost),
    ...(appearance === undefined ? {} : { appearance }),
    ...readImages(row, lost),
    ...readStudioTable(row, spec, lost),
    created: readText(row.created, LIST.timestamps, lost),
    updated: readText(row.updated, LIST.timestamps, lost),
    ...lost.fields(),
  };
}

function readAliases(value: unknown, lost: Discarded): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    lost.lost(LIST.aliases);
    return [];
  }

  const aliases: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry !== "") aliases.push(entry);
    else lost.lost(LIST.aliases);
  }
  return aliases;
}
