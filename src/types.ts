/**
 * The shapes this client hands back, independent of how any tool renders them.
 *
 * Two ideas run through every type here.
 *
 * **A record says what became of its identifier.** `status` is on every record
 * and every place a record is named, because an identifier that resolves to a
 * marker still resolves: what comes back describes the record rather than the
 * thing it once named, and a caller pivoting on it would look for something
 * that moved.
 *
 * **A loss is carried, never dropped.** Wherever a list can lose a row this
 * client could not read, a counter travels beside it and names the list it came
 * from. A row silently dropped turns a record this client failed to read into a
 * record the catalogue holds nothing for.
 */

import type { ErrorCode } from "./errors.js";
import type { InstanceId } from "./stashbox/instances.js";
import type { ReadDate, RecordStatus } from "./stashbox/normalise.js";

/** Anything read, with whether a catalogue was asked for it. */
export interface Read<T> {
  data: T;
  /** Served from the in-memory store, so no catalogue was asked. */
  cached: boolean;
  /** Rows that came back unreadable and were left out of the answer. */
  skipped?: number;
}

/**
 * What became of one catalogue on one question.
 *
 * The three states are kept apart because collapsing them is the failure this
 * server exists to prevent: `answered` with a count of zero is a catalogue that
 * looked and found nothing, `failed` could not answer at all, and `absent` was
 * never asked. Only the first is evidence about the world.
 */
export type SourceState = "answered" | "failed" | "absent";

/**
 * What one catalogue did with one question.
 *
 * The narrowing fields look alike and mean different things, which is why there
 * are four of them. A narrowing a catalogue **cannot receive** is a limit of the
 * catalogue. One **naming no record of its own** says only that nothing it holds
 * was named. One **received in part** reached it shorn of another catalogue's
 * identifiers. An argument with **nothing to do** shaped no request at all.
 * Collapsed into one field, the first reading is what a caller takes away, and
 * it is the only one that says a catalogue cannot do something.
 */
export interface SourceReport {
  source: InstanceId;
  /** The catalogue's own name, for prose. Derived from `source` when absent. */
  name?: string;
  state: SourceState;
  /** Rows this catalogue contributed. Present when it answered. */
  count?: number;
  /** Why it was not asked, or what went wrong. */
  reason?: string;
  /** Which moment failed, such as the search or the reading of a record. */
  moment?: string;
  error?: ErrorCode;
  /** What its index holds for the question, beyond the page returned. */
  indexTotal?: number;
  /** Rows it answered with that came back unreadable and were left out. */
  skipped?: number;
  /** Rows it answered with while carrying none of what was asked about. */
  unattributed?: number;
  /** Distinct records behind its rows, where one record can answer more than once. */
  records?: number;
  /** Narrowings it could not receive, which is a limit of the catalogue. */
  narrowingsNotReceived?: string[];
  /**
   * Narrowings this route does not take, where another route of the same
   * catalogue does. Writing words and typed arguments together picks the
   * full-text route, which reads words alone: the catalogue can be given these,
   * and this question was not the one that gave them.
   */
  narrowingsOutsideThisRoute?: string[];
  /** Narrowings written with identifiers no record of its own carries. */
  narrowingsNamingNoRecord?: string[];
  /** Narrowings it received short, the rest of the list naming other catalogues. */
  narrowingsReceivedInPart?: string[];
  /** Arguments this question gave nothing to select on. */
  argumentsWithNothingToDo?: string[];
  /** Fingerprint algorithms its lookup does not search, so it was never asked. */
  algorithmsNotSearched?: string[];
  /**
   * Blocks a caller asked each row to carry that this route never asks for. A
   * block reached by a follow-up read per record is one a page of rows cannot
   * carry, and its absence is the route rather than a record holding none of it.
   */
  sectionsNotCarried?: string[];
  /** The fields its text index read, claimed only where one was consulted. */
  fieldsSearched?: string[];
}

/** A loss, counted and named, so a number never says less than it means. */
export interface Losses {
  /** Rows of a record's own lists that came back unreadable. */
  rowsSkipped?: number;
  /** Which lists lost them, so the count can say what it counts. */
  rowsSkippedIn?: string[];
}

export interface SiteLink {
  url: string;
  /** Null where the catalogue attaches no site to the link. */
  siteName: string | null;
  /** The catalogue's own category for that site, null where it publishes none. */
  siteCategory: string | null;
}

export interface ImageRow {
  url: string;
  width: number | null;
  height: number | null;
}

export interface StudioRef {
  id: string;
  name: string;
  parent: string | null;
  /** What the identifier addresses now. A studio is held or withdrawn. */
  status: RecordStatus;
  /** Set where the parent named here is a record the catalogue withdrew. */
  parentWithdrawn?: boolean;
}

export interface TagRow {
  id: string;
  name: string;
  /** Null on a catalogue publishing no taxonomy, which is not a tag without one. */
  category: string | null;
  /** What the identifier addresses now. A tag is held or withdrawn. */
  status: RecordStatus;
}

export interface PerformerAppearance {
  id: string;
  name: string;
  /** The name printed on this release, null where it matches the performer's. */
  creditedAs: string | null;
  disambiguation: string | null;
  /** What the credited identifier addresses now, which a folded record changes. */
  status: RecordStatus;
}

export type FingerprintAlgorithm = "MD5" | "OSHASH" | "PHASH";

export interface FingerprintRow {
  algorithm: FingerprintAlgorithm;
  hash: string;
  durationSeconds: number | null;
  submissions: number | null;
  /** How many disputed it, null on a catalogue that counts no disputes. */
  reports: number | null;
  /** Null where the catalogue publishes no report count: unknown, never false. */
  contested: boolean | null;
}

export interface PerformerAppearanceDetails {
  ethnicity: string | null;
  eyeColor: string | null;
  hairColor: string | null;
  heightCm: number | null;
  tattoos: string[];
  piercings: string[];
  breastType: string | null;
  cupSize: string | null;
  bandSize: number | null;
  waistSize: number | null;
  hipSize: number | null;
}

/** What every record carries, whatever it is a record of. */
interface RecordBase extends Losses {
  id: string;
  source: InstanceId;
  sourceUrl: string;
  /** When this record came off the catalogue, ISO 8601. */
  retrievedAt: string;
  status: RecordStatus;
  /** Open edits against it, null where the catalogue publishes no count. */
  pendingEdits: number | null;
  /** The catalogue publishes them and answered a shape this client could not read. */
  pendingEditsUnreadable?: boolean;
}

/**
 * One scene.
 *
 * A `deleted` status makes this a marker: it carries the identifier, the
 * catalogue and the title the record held before, and every other field is null
 * or empty. The emptiness of a marker describes the record, never the world.
 * These catalogues publish no successor for a scene, so a scene is held or
 * withdrawn and names nothing in its place.
 */
export interface SceneRecord extends RecordBase {
  title: string | null;
  details: string | null;
  code: string | null;
  /** Free text, which can name several people. */
  director: string | null;
  durationSeconds: number | null;
  releaseDate: ReadDate | null;
  /** When the scene was made, a different question from when it was released. */
  productionDate: ReadDate | null;
  /** Set where the catalogue published a date this client could not read. */
  releaseDateUnreadable?: boolean;
  productionDateUnreadable?: boolean;
  studio: StudioRef | null;
  performers: PerformerAppearance[];
  tags: TagRow[];
  urls: SiteLink[];
  images?: ImageRow[];
  imagesSkipped?: number;
  fingerprints?: FingerprintRow[];
  fingerprintsSkipped?: number;
  /** How many the record holds per algorithm, which counts held and never shown. */
  fingerprintCount?: Partial<Record<FingerprintAlgorithm, number>>;
  created: string | null;
  updated: string | null;
}

/**
 * One performer.
 *
 * `sceneCount` counts what this catalogue has indexed. A settled record can
 * report zero while naming a career spanning decades, so the number reports
 * coverage and never a person's work. On a marker it is null, since the count
 * belongs to the successor.
 */
export interface PerformerRecord extends RecordBase {
  /** The record this identifier was folded into, which a caller reads next. */
  mergedInto: string | null;
  /** Identifiers folded into this record, which still resolve to it. */
  mergedIds: string[];
  name: string | null;
  /** Free text telling two people apart, which reads and never parses. */
  disambiguation: string | null;
  aliases: string[];
  gender: string | null;
  country: string | null;
  birthDate: ReadDate | null;
  deathDate: ReadDate | null;
  birthDateUnreadable?: boolean;
  deathDateUnreadable?: boolean;
  careerStartYear: number | null;
  careerEndYear: number | null;
  sceneCount: number | null;
  urls: SiteLink[];
  appearance?: PerformerAppearanceDetails;
  images?: ImageRow[];
  imagesSkipped?: number;
  scenes?: SceneRecord[];
  /** What the catalogue holds behind the one page the section shows. */
  scenesTotal?: number | null;
  scenesShown?: number;
  scenesSkipped?: number;
  /** Why the section is missing where it was asked for and is not here. */
  scenesUnavailable?: string;
  studios?: { id: string; name: string; sceneCount: number | null; status: RecordStatus }[];
  studiosTotal?: number;
  studiosSkipped?: number;
  studiosUnavailable?: string;
  created: string | null;
  updated: string | null;
}

/** An identifier a narrowing was written with that its catalogue has folded. */
export interface FoldedNarrowing {
  given: string;
  /** The record it now addresses, null on one the catalogue withdrew. */
  successor: string | null;
  status: RecordStatus;
}

export interface RowsResult<T> {
  rows: T[];
  perSource: SourceReport[];
  /** How the order was built, since no score is shared across catalogues. */
  ordering: string;
  /** Narrowing identifiers their catalogue has folded, which narrow to nothing. */
  foldedNarrowings?: FoldedNarrowing[];
  /** Narrowing identifiers whose record could not be read, so nothing is settled. */
  uncheckedNarrowings?: string[];
  /** Narrowing identifiers their catalogue holds no record for. */
  absentNarrowings?: string[];
}

export type MatchKind = "exact_file" | "perceptual_similarity";

export interface FingerprintMatch {
  scene: SceneRecord;
  algorithm: FingerprintAlgorithm;
  /**
   * What the match claims. `exact_file` is the same bytes. A perceptual
   * similarity covers a re-encode, a crop and a different scene from one shoot,
   * and is no evidence that two files are the same.
   */
  matchKind: MatchKind;
  /** The fingerprint the record carries, so a caller knows which hash reached it. */
  fingerprint: FingerprintRow | null;
}

export interface FingerprintResult {
  matches: FingerprintMatch[];
  perSource: SourceReport[];
  /**
   * Records a catalogue answered with while returning none of the fingerprints
   * asked for. Which hash reached them is unknown, and counting them keeps that
   * apart from a catalogue that found nothing.
   */
  unattributed: number;
  /** The fingerprints put to the catalogues, each named once. */
  asked: readonly { hash: string; algorithm: FingerprintAlgorithm }[];
}
