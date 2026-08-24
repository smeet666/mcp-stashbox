import { parseFailure, type StashboxError } from "../errors.js";
import type { InstanceId, InstanceSpec } from "./instances.js";
import { isUuid } from "./identifiers.js";
import { instanceByUrl, supports } from "./instances.js";
import { readContested, readDate, readStatus } from "./normalise.js";
import type {
  Appearance,
  CreditRef,
  FingerprintRow,
  ImageRow,
  PerformerRecord,
  SceneRecord,
  SiteLink,
  StudioRecord,
  StudioRef,
  TagRecord,
  TagRef,
} from "../types.js";

/**
 * The reading an answer gets before anything is taken out of it.
 *
 * One rule governs the file: an answer this client cannot read is a failure and
 * never an emptiness. A payload that is a string, a null, a list or a number,
 * one carrying no key the document named, and one whose key holds a shape other
 * than the one declared all leave here as `parse_failure` naming the moment they
 * arrived at. Read as "nothing came back", any of them would state an absence no
 * catalogue expressed, and a caller would stop looking for a record that exists.
 *
 * The message carries the sentence a caller acts on: a shape this client could
 * not read states nothing about what the catalogue holds.
 */

/** An object as a payload carries one, which a list and a null are not. */
export function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/** The one failure every unreadable shape leaves as, whatever route it came on. */
export function unreadable(spec: InstanceSpec, moment: string): StashboxError {
  return parseFailure(
    `${spec.name} answered ${moment} in a shape this client cannot read, which states nothing about whether the record exists or about what the catalogue holds.`,
    { instance: spec.name, url: spec.endpoint },
  );
}

/**
 * The container a document named, read from the payload that should carry it.
 *
 * The key is required to be present before its value is read: a payload naming
 * another query answers about something nobody asked, and taking rows out of it
 * would attribute one question's answer to another.
 */
export function objectUnder(
  payload: unknown,
  key: string,
  spec: InstanceSpec,
  moment: string,
): Record<string, unknown> {
  const body = asObject(payload);
  if (body === undefined || !(key in body)) {
    throw unreadable(spec, moment);
  }
  const held = asObject(body[key]);
  if (held === undefined) {
    throw unreadable(spec, moment);
  }
  return held;
}

/** The rows a container holds, which have to be a list before they are rows. */
export function arrayUnder(
  container: Record<string, unknown>,
  key: string,
  spec: InstanceSpec,
  moment: string,
): unknown[] {
  const rows = container[key];
  if (!Array.isArray(rows)) {
    throw unreadable(spec, moment);
  }
  return rows;
}

/**
 * The rows a route answers with at the top of a payload.
 *
 * A key the answer does not carry, or one holding anything other than a list,
 * is an answer this client cannot read. Reading either as an empty page would
 * state that a catalogue looked and found nothing, which it never said.
 */
export function rowsUnder(
  payload: unknown,
  key: string,
  spec: InstanceSpec,
  moment: string,
): unknown[] {
  const body = asObject(payload);
  if (body === undefined) {
    throw unreadable(spec, moment);
  }
  return arrayUnder(body, key, spec, moment);
}

/**
 * One record, or the absence of one.
 *
 * A key the answer does not carry is a record this client could not read. The
 * key present and null is the catalogue saying it holds nothing at that
 * identifier, and only that second reading is an absence.
 */
export function recordUnder(
  payload: unknown,
  key: string,
  spec: InstanceSpec,
  moment: string,
): Record<string, unknown> | null {
  const body = asObject(payload);
  if (body === undefined || !(key in body)) {
    throw unreadable(spec, moment);
  }
  const held = body[key];
  if (held === null || held === undefined) {
    return null;
  }
  const record = asObject(held);
  if (record === undefined) {
    throw unreadable(spec, moment);
  }
  return record;
}

/**
 * The groups a fingerprint lookup answers with.
 *
 * The answer is a list of groups, and every member of it has to be a group. A
 * bare record among them is a record this client cannot attribute to any hash,
 * and filing it anyway would name a file the catalogue never matched.
 */
export function groupsUnder(
  payload: unknown,
  key: string,
  spec: InstanceSpec,
  moment: string,
): unknown[][] {
  const body = asObject(payload);
  if (body === undefined || !(key in body)) {
    throw unreadable(spec, moment);
  }
  const groups = body[key];
  if (!Array.isArray(groups)) {
    throw unreadable(spec, moment);
  }
  if (!groups.every((group) => Array.isArray(group))) {
    throw unreadable(spec, moment);
  }
  return groups as unknown[][];
}

/* ------------------------------------------------------------ the records */

/**
 * How an answer becomes a record, and what a record is allowed to claim.
 *
 * Four rules govern everything below, and all four are the one rule this server
 * keeps.
 *
 * **A row this client cannot read is counted and named.** Dropped in silence it
 * becomes a record holding less than the catalogue holds, with nothing saying
 * so, and a reader takes the shorter list for the whole of it.
 *
 * **A number that cannot mean what it says is unknown.** A catalogue answers -1
 * for the dimensions of an image whose size it never recorded. Carried through,
 * that becomes an image one pixel wide in the wrong direction.
 *
 * **A field a catalogue publishes no table for is told apart from one a record
 * leaves empty.** The first is read from the registry, the second from the
 * record, and collapsing them states a silence as a measurement.
 *
 * **An identifier printed is one this server would take back.** A record whose
 * identifier is no uuid can be addressed by nobody, so it is a loss rather than
 * a row carrying a broken address.
 */

/** What a reading hands back: the record, or nothing where it holds no address. */
export interface Reading<T> {
  record: T | null;
  /** Whether the catalogue keeps the table the record's categories come from. */
  publishesCategories?: boolean;
}

/** Rows lost while reading, gathered so a count can name the list it counts. */
class Lost {
  #count = 0;
  readonly #lists = new Set<string>();

  lost(list: string): void {
    this.#count += 1;
    this.#lists.add(list);
  }

  get losses(): { rowsSkipped?: number; rowsSkippedIn?: string[] } {
    return this.#count === 0 ? {} : { rowsSkipped: this.#count, rowsSkippedIn: [...this.#lists] };
  }
}

const row = (value: unknown): Record<string, unknown> | undefined => asObject(value);

/** Text a catalogue published, or nothing where it published none. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * A whole number of things, or nothing.
 *
 * A count is never negative and never fractional. A value that is either
 * describes no quantity of anything, so it is unknown rather than carried.
 */
function tally(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * A measurement, or nothing.
 *
 * Zero and below are the sentinels a catalogue answers where it recorded no
 * size, and neither describes an image or a runtime.
 */
function measure(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** A list of the strings a catalogue published, with anything else counted lost. */
function strings(value: unknown, list: string, lost: Lost): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    lost.lost(list);
    return [];
  }
  const held: string[] = [];
  for (const entry of value) {
    const one = text(entry);
    if (one === null) {
      lost.lost(list);
    } else {
      held.push(one);
    }
  }
  return held;
}

/** The identifier this server prints for a record, naming the catalogue that holds it. */
function identify(value: unknown, spec: InstanceSpec): string | null {
  const uuid = typeof value === "string" ? value : undefined;
  return uuid !== undefined && isUuid(uuid) ? `${spec.id}:${uuid}` : null;
}

/** Where a record lives on the catalogue that holds it. */
function addressOf(spec: InstanceSpec, kind: string, uuid: string): string {
  return `${spec.webBase}/${kind}/${uuid}`;
}

/** A date as the catalogue entered it, with a mark where it entered one unreadable. */
function dateOf(value: unknown): { date: ReturnType<typeof readDate>; unreadable: boolean } {
  const written = text(value);
  if (written === null) {
    return { date: null, unreadable: false };
  }
  const read = readDate(written);
  return { date: read, unreadable: read === null };
}

/* ------------------------------------------------------------- the pieces */

function readLinks(value: unknown, spec: InstanceSpec, lost: Lost): SiteLink[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    lost.lost("urls");
    return [];
  }
  const links: SiteLink[] = [];
  for (const entry of value) {
    const one = row(entry);
    const url = one === undefined ? null : text(one.url);
    if (url === null) {
      lost.lost("urls");
      continue;
    }
    const site = row(one?.site);
    links.push({
      url,
      siteName: site === undefined ? null : text(site.name),
      // The category is read only where the catalogue keeps the table it comes
      // from, so a null here is that table's absence and never a site nobody
      // sorted.
      // The table entry the catalogue sorted this site under, which is not the
      // paragraph the site publishes about itself.
      siteCategory:
        supports(spec, "site_categories") && site !== undefined
          ? text(asObject(site.category)?.name)
          : null,
    });
  }
  return links;
}

function readImages(value: unknown, lost: Lost): { images: ImageRow[]; imagesSkipped?: number } {
  if (value === undefined || value === null) {
    return { images: [] };
  }
  if (!Array.isArray(value)) {
    lost.lost("images");
    return { images: [], imagesSkipped: 1 };
  }
  const images: ImageRow[] = [];
  let skipped = 0;
  for (const entry of value) {
    const one = row(entry);
    const url = one === undefined ? null : text(one.url);
    if (url === null) {
      lost.lost("images");
      skipped += 1;
      continue;
    }
    images.push({ url, width: measure(one?.width), height: measure(one?.height) });
  }
  return { images, ...(skipped > 0 ? { imagesSkipped: skipped } : {}) };
}

const ALGORITHMS = ["MD5", "OSHASH", "PHASH"] as const;

function readFingerprints(
  value: unknown,
  spec: InstanceSpec,
  lost: Lost,
): { fingerprints: FingerprintRow[]; fingerprintsSkipped?: number } {
  if (value === undefined || value === null) {
    return { fingerprints: [] };
  }
  if (!Array.isArray(value)) {
    lost.lost("fingerprints");
    return { fingerprints: [], fingerprintsSkipped: 1 };
  }
  const fingerprints: FingerprintRow[] = [];
  let skipped = 0;
  for (const entry of value) {
    const one = row(entry);
    const written = typeof one?.algorithm === "string" ? one.algorithm.toUpperCase() : "";
    const algorithm = ALGORITHMS.find((name) => name === written);
    const hash = one === undefined ? null : text(one.hash);
    if (algorithm === undefined || hash === null) {
      lost.lost("fingerprints");
      skipped += 1;
      continue;
    }
    const submissions = tally(one?.submissions);
    // A catalogue counting no dispute is read from the registry, so its silence
    // leaves the contest unknown rather than settled.
    const reports = supports(spec, "fingerprint_reports") ? tally(one?.reports) : null;
    fingerprints.push({
      algorithm,
      hash,
      // Its own measurement: the runtime submitted with the hash, which is not
      // the runtime the catalogue holds for the release.
      durationSeconds: measure(one?.duration),
      submissions,
      reports,
      contested: readContested(submissions, reports),
      ...(typeof one?.user_submitted === "boolean" ? { userSubmitted: one.user_submitted } : {}),
    });
  }
  return { fingerprints, ...(skipped > 0 ? { fingerprintsSkipped: skipped } : {}) };
}

function readTags(value: unknown, spec: InstanceSpec, lost: Lost): TagRef[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    lost.lost("tags");
    return [];
  }
  const tags: TagRef[] = [];
  for (const entry of value) {
    const one = row(entry);
    const id = identify(one?.id, spec);
    if (id === null) {
      lost.lost("tags");
      continue;
    }
    const category = row(one?.category);
    tags.push({
      id,
      name: one === undefined ? null : text(one.name),
      category:
        supports(spec, "tag_categories") && category !== undefined ? text(category.name) : null,
      status: readStatus(one?.deleted, undefined),
    });
  }
  return tags;
}

function readCredits(value: unknown, spec: InstanceSpec, lost: Lost): CreditRef[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    lost.lost("performers");
    return [];
  }
  const credits: CreditRef[] = [];
  for (const entry of value) {
    const one = row(entry);
    const who = row(one?.performer) ?? one;
    const id = identify(who?.id, spec);
    if (id === null) {
      lost.lost("performers");
      continue;
    }
    credits.push({
      id,
      name: who === undefined ? null : text(who.name),
      creditedAs: one === undefined ? null : text(one.as),
      disambiguation: who === undefined ? null : text(who.disambiguation),
      status: readStatus(who?.deleted, who?.merged_into_id),
    });
  }
  return credits;
}

function readStudioRef(value: unknown, spec: InstanceSpec, lost: Lost): StudioRef | null {
  const one = row(value);
  if (one === undefined) {
    return null;
  }
  const id = identify(one.id, spec);
  if (id === null) {
    lost.lost("studio");
    return null;
  }
  const parent = row(one.parent);
  // A parent naming no record of its own can be addressed by nobody, so the
  // name alone would be a claim a reader cannot follow.
  if (parent !== undefined && identify(parent.id, spec) === null) {
    lost.lost("studio");
  }
  return {
    id,
    name: text(one.name),
    parent: parent === undefined || identify(parent.id, spec) === null ? null : text(parent.name),
    status: readStatus(one.deleted, undefined),
    ...(parent !== undefined && readStatus(parent.deleted, undefined) !== "established"
      ? { parentWithdrawn: true }
      : {}),
  };
}

/**
 * The same record on another catalogue, read from a link this one publishes.
 *
 * Each catalogue keeps, among a record's links, the address of that record
 * elsewhere. Following it is not a guess: it is an assertion an editor wrote,
 * and it carries the identifier the record holds there. A link to a host the
 * registry does not name, or one whose path carries no uuid, joins nothing.
 */
function readAlsoHeldAt(
  links: readonly SiteLink[],
  spec: InstanceSpec,
  kind: string,
): {
  alsoHeldAt: { source: InstanceId; id: string }[];
  linkedUnfollowed: { source: InstanceId; url: string }[];
} {
  const alsoHeldAt: { source: InstanceId; id: string }[] = [];
  const linkedUnfollowed: { source: InstanceId; url: string }[] = [];
  for (const link of links) {
    const other = instanceByUrl(link.url);
    if (other === undefined || other.id === spec.id) {
      continue;
    }
    const expected = `${other.webBase}/${kind}/`;
    if (!link.url.startsWith(expected)) {
      continue;
    }
    const uuid = link.url.slice(expected.length).split(/[/?#]/)[0] ?? "";
    if (!isUuid(uuid)) {
      // The link is written, and it names the record by something this client
      // cannot address. Reported as no link at all, it states the opposite of
      // what the record carries on its face.
      if (!linkedUnfollowed.some((one) => one.source === other.id)) {
        linkedUnfollowed.push({ source: other.id, url: link.url });
      }
      continue;
    }
    if (!alsoHeldAt.some((one) => one.id === `${other.id}:${uuid}`)) {
      alsoHeldAt.push({ source: other.id, id: `${other.id}:${uuid}` });
    }
  }
  return { alsoHeldAt, linkedUnfollowed };
}

/** What every record carries, gathered once for all four kinds. */
function base(
  one: Record<string, unknown>,
  spec: InstanceSpec,
  about: { kind: string; id: string; retrievedAt: string; links: readonly SiteLink[] },
) {
  const { kind, id, retrievedAt, links } = about;
  const uuid = id.slice(spec.id.length + 1);
  const edits = supports(spec, "pending_edits") ? one.edits : undefined;
  return {
    id,
    source: spec.id,
    sourceUrl: addressOf(spec, kind, uuid),
    retrievedAt,
    status: readStatus(one.deleted, one.merged_into_id),
    ...readAlsoHeldAt(links, spec, kind),
    ...(supports(spec, "pending_edits")
      ? { pendingEdits: Array.isArray(edits) ? edits.length : tally(edits) }
      : {}),
  };
}

/* ------------------------------------------------------------ the readings */

export function readScene(
  value: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): Reading<SceneRecord> {
  const one = row(value);
  const id = one === undefined ? null : identify(one.id, spec);
  if (one === undefined || id === null) {
    return { record: null };
  }

  const lost = new Lost();
  const urls = readLinks(one.urls, spec, lost);
  const release = dateOf(one.release_date);
  const production = dateOf(one.production_date);
  const { images, imagesSkipped } = readImages(one.images, lost);
  const { fingerprints, fingerprintsSkipped } = readFingerprints(one.fingerprints, spec, lost);

  const record: SceneRecord = {
    ...base(one, spec, { kind: "scenes", id, retrievedAt, links: urls }),
    // These catalogues name no scene in the place of one they withdrew, so a
    // scene is held or withdrawn and this record names no successor.
    status: readStatus(one.deleted, undefined),
    title: text(one.title),
    details: text(one.details),
    code: text(one.code),
    director: text(one.director),
    durationSeconds: measure(one.duration),
    releaseDate: release.date,
    productionDate: production.date,
    ...(release.unreadable ? { releaseDateUnreadable: true } : {}),
    ...(production.unreadable ? { productionDateUnreadable: true } : {}),
    studio: readStudioRef(one.studio, spec, lost),
    performers: readCredits(one.performers, spec, lost),
    tags: readTags(one.tags, spec, lost),
    urls,
    ...(one.images === undefined ? {} : { images }),
    ...(imagesSkipped === undefined ? {} : { imagesSkipped }),
    ...(one.fingerprints === undefined ? {} : { fingerprints }),
    ...(fingerprintsSkipped === undefined ? {} : { fingerprintsSkipped }),
    created: text(one.created),
    updated: text(one.updated),
    ...lost.losses,
  };
  return { record };
}

export function readPerformer(
  value: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): Reading<PerformerRecord> {
  const one = row(value);
  const id = one === undefined ? null : identify(one.id, spec);
  if (one === undefined || id === null) {
    return { record: null };
  }

  const lost = new Lost();
  const urls = readLinks(one.urls, spec, lost);
  const birth = dateOf(one.birth_date);
  const death = dateOf(one.death_date);
  const { images, imagesSkipped } = readImages(one.images, lost);
  const appearance = readAppearance(one, lost);

  const record: PerformerRecord = {
    ...base(one, spec, { kind: "performers", id, retrievedAt, links: urls }),
    name: text(one.name),
    disambiguation: text(one.disambiguation),
    aliases: strings(one.aliases, "aliases", lost),
    gender: text(one.gender),
    country: text(one.country),
    birthDate: birth.date,
    deathDate: death.date,
    ...(birth.unreadable ? { birthDateUnreadable: true } : {}),
    ...(death.unreadable ? { deathDateUnreadable: true } : {}),
    careerStartYear: tally(one.career_start_year),
    careerEndYear: tally(one.career_end_year),
    sceneCount: supports(spec, "scene_count") ? tally(one.scene_count) : null,
    urls,
    ...(appearance === undefined ? {} : { appearance }),
    ...(one.images === undefined ? {} : { images }),
    ...(imagesSkipped === undefined ? {} : { imagesSkipped }),
    ...(one.studios === undefined ? {} : readStudioTable(one.studios, spec, lost)),
    mergedInto: identify(one.merged_into_id, spec),
    mergedIds: (Array.isArray(one.merged_ids) ? one.merged_ids : [])
      .map((entry) => identify(entry, spec))
      .filter((entry): entry is string => entry !== null),
    created: text(one.created),
    updated: text(one.updated),
    ...lost.losses,
  };
  return { record };
}

/** The body a catalogue records, read only where it published any of it. */
function readAppearance(one: Record<string, unknown>, lost: Lost): Appearance | undefined {
  const named = [
    "ethnicity",
    "eye_color",
    "hair_color",
    "height",
    "cup_size",
    "band_size",
    "waist_size",
    "hip_size",
    "breast_type",
    "tattoos",
    "piercings",
  ];
  if (!named.some((name) => one[name] !== undefined)) {
    return undefined;
  }
  const marks = (value: unknown, list: string): string[] => {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      lost.lost(list);
      return [];
    }
    return value
      .map((entry) => {
        const mark = row(entry);
        const where = mark === undefined ? null : text(mark.location);
        const what = mark === undefined ? null : text(mark.description);
        if (where === null && what === null) {
          lost.lost(list);
          return null;
        }
        return [where, what].filter((part) => part !== null).join(": ");
      })
      .filter((entry): entry is string => entry !== null);
  };
  return {
    ethnicity: text(one.ethnicity),
    eyeColor: text(one.eye_color),
    hairColor: text(one.hair_color),
    heightCm: measure(one.height),
    cupSize: text(one.cup_size),
    bandSize: measure(one.band_size),
    waistSize: measure(one.waist_size),
    hipSize: measure(one.hip_size),
    breastType: text(one.breast_type),
    tattoos: marks(one.tattoos, "tattoos"),
    piercings: marks(one.piercings, "piercings"),
  };
}

/**
 * The studios a catalogue credits a performer on, with what it counts on each.
 *
 * A line naming no studio of its own can be addressed by nobody, so it is a
 * loss rather than a name a reader cannot follow.
 */
function readStudioTable(
  value: unknown,
  spec: InstanceSpec,
  lost: Lost,
): { studios: NonNullable<PerformerRecord["studios"]>; studiosSkipped?: number } {
  if (!Array.isArray(value)) {
    lost.lost("studios");
    return { studios: [], studiosSkipped: 1 };
  }
  const studios: NonNullable<PerformerRecord["studios"]> = [];
  let skipped = 0;
  for (const entry of value) {
    const line = row(entry);
    const held = row(line?.studio);
    const id = held === undefined ? null : identify(held.id, spec);
    if (id === null) {
      lost.lost("studios");
      skipped += 1;
      continue;
    }
    studios.push({
      id,
      name: text(held?.name),
      sceneCount: supports(spec, "scene_count") ? tally(line?.scene_count) : null,
      status: readStatus(held?.deleted, undefined),
    });
  }
  return { studios, ...(skipped > 0 ? { studiosSkipped: skipped } : {}) };
}

export function readStudio(
  value: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): Reading<StudioRecord> {
  const one = row(value);
  const id = one === undefined ? null : identify(one.id, spec);
  if (one === undefined || id === null) {
    return { record: null };
  }

  const lost = new Lost();
  const urls = readLinks(one.urls, spec, lost);
  const { images, imagesSkipped } = readImages(one.images, lost);
  const parentRow = row(one.parent);
  const parentId = parentRow === undefined ? null : identify(parentRow.id, spec);
  if (parentRow !== undefined && parentId === null) {
    lost.lost("parent");
  }

  const record: StudioRecord = {
    ...base(one, spec, { kind: "studios", id, retrievedAt, links: urls }),
    name: text(one.name),
    aliases: strings(one.aliases, "aliases", lost),
    parent:
      parentRow === undefined || parentId === null
        ? null
        : {
            id: parentId,
            name: text(parentRow.name),
            status: readStatus(parentRow.deleted, undefined),
          },
    urls,
    ...(one.images === undefined ? {} : { images }),
    ...(imagesSkipped === undefined ? {} : { imagesSkipped }),
    sceneCount: supports(spec, "scene_count") ? tally(one.scene_count) : null,
    ...lost.losses,
  };
  return { record };
}

export function readTag(
  value: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): Reading<TagRecord> {
  const one = row(value);
  const id = one === undefined ? null : identify(one.id, spec);
  if (one === undefined || id === null) {
    return { record: null, publishesCategories: false };
  }

  const lost = new Lost();
  const publishes = supports(spec, "tag_categories");
  const category = row(one.category);

  const record: TagRecord = {
    ...base(one, spec, { kind: "tags", id, retrievedAt, links: [] }),
    name: text(one.name),
    description: text(one.description),
    aliases: strings(one.aliases, "aliases", lost),
    // Read from the registry: a catalogue keeping no taxonomy placed this tag
    // in no category, and that is a fact about the catalogue.
    category:
      publishes && category !== undefined
        ? {
            id: identify(category.id, spec) ?? "",
            name: text(category.name),
            group: text(category.group),
          }
        : null,
    ...lost.losses,
  };
  return { record, publishesCategories: publishes };
}
