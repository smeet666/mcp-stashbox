/** What the client layer produces, independent of how any tool renders it. */

import type { ErrorCode } from "./errors.js";
import type { InstanceId } from "./stashbox/instances.js";
import type { ReadDate, RecordStatus } from "./stashbox/normalise.js";

export interface Read<T> {
  data: T;
  /** Served from the in-memory store rather than from a catalogue. */
  cached: boolean;
  /** Rows that came back unreadable and were left out. */
  skipped?: number;
}

/**
 * What became of one catalogue on one question.
 *
 * `answered` with a count of zero is a catalogue that looked and found nothing.
 * `failed` is a catalogue that could not answer. `absent` is a catalogue that
 * was never asked. An answer that collapsed these would let a caller read a
 * failure as an emptiness.
 */
export type SourceState = "answered" | "failed" | "absent";

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
  /** What the catalogue's index holds for this question, beyond the page shown. */
  indexTotal?: number;
  /** Rows this catalogue answered that came back unreadable and were left out. */
  skipped?: number;
  /** Rows it answered with while returning none of the fingerprints asked for. */
  unattributed?: number;
  /**
   * Distinct scenes behind this catalogue's matches, where one scene answered
   * more than one of the hashes asked and so contributed more than one match.
   */
  records?: number;
  /** Narrowings this catalogue could not receive, each one named. */
  narrowingsNotReceived?: string[];
  /** What its index reads, since two catalogues answer a name differently. */
  fieldsSearched?: string[];
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
  /** Null where the catalogue publishes no report count. */
  contested: boolean | null;
}

export interface StudioRef {
  id: string;
  name: string;
  parent: string | null;
}

export interface TagRow {
  id: string;
  name: string;
  category: string | null;
}

/**
 * One scene.
 *
 * A `merged` status makes this a marker: it carries the
 * identifier, the catalogue, the successor and the title the record held before
 * the merge, and every other field is null or empty. The emptiness of a marker
 * describes the record, never the world.
 */
export interface SceneRecord {
  id: string;
  source: InstanceId;
  sourceUrl: string;
  /** When this record came off the catalogue, ISO 8601. */
  retrievedAt: string;
  status: RecordStatus;
  mergedInto: string | null;
  pendingEdits: number | null;
  title: string | null;
  details: string | null;
  code: string | null;
  /** Free text, which can name several people. */
  director: string | null;
  durationSeconds: number | null;
  releaseDate: ReadDate | null;
  /** When the scene was made, which is a different question from its release. */
  productionDate: ReadDate | null;
  /** Set where the catalogue published a date this client could not read. */
  releaseDateUnreadable?: boolean;
  productionDateUnreadable?: boolean;
  studio: StudioRef | null;
  performers: PerformerAppearance[];
  tags: TagRow[];
  urls: SiteLink[];
  /** Rows of this record's own lists that came back unreadable and were left out. */
  rowsSkipped?: number;
  /** Which of those lists lost rows, so the count can say what it counts. */
  rowsSkippedIn?: string[];
  images?: ImageRow[];
  /** Image rows the catalogue answered with that came back unreadable. */
  imagesSkipped?: number;
  fingerprints?: FingerprintRow[];
  /** Fingerprint rows the catalogue answered with that came back unreadable. */
  fingerprintsSkipped?: number;
  fingerprintCount?: Partial<Record<FingerprintAlgorithm, number>>;
  created: string | null;
  updated: string | null;
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

/**
 * One performer.
 *
 * `sceneCount` counts what this catalogue has indexed. A settled record can
 * report zero while naming a career spanning decades, so the number reports
 * coverage and never a person's work. On a marker it is null, since the count
 * belongs to the successor.
 */
export interface PerformerRecord {
  id: string;
  source: InstanceId;
  sourceUrl: string;
  /** When this record came off the catalogue, ISO 8601. */
  retrievedAt: string;
  status: RecordStatus;
  mergedInto: string | null;
  mergedIds: string[];
  pendingEdits: number | null;
  name: string | null;
  /** Free text telling two people apart, which reads and never parses. */
  disambiguation: string | null;
  aliases: string[];
  gender: string | null;
  country: string | null;
  birthDate: ReadDate | null;
  deathDate: ReadDate | null;
  careerStartYear: number | null;
  careerEndYear: number | null;
  sceneCount: number | null;
  urls: SiteLink[];
  /** A birth date the catalogue published that this client could not read. */
  birthDateUnreadable?: boolean;
  /** A death date the catalogue published that this client could not read. */
  deathDateUnreadable?: boolean;
  /** Rows of this record's own lists that came back unreadable and were left out. */
  rowsSkipped?: number;
  /** Which of those lists lost rows, so the count can say what it counts. */
  rowsSkippedIn?: string[];
  appearance?: PerformerAppearanceDetails;
  images?: ImageRow[];
  /** Image rows the catalogue answered with that came back unreadable. */
  imagesSkipped?: number;
  scenes?: SceneRecord[];
  /** What the catalogue holds behind the one page the section shows. */
  scenesTotal?: number | null;
  scenesShown?: number;
  /** Why the section is missing, when it was asked for and could not be read. */
  scenesUnavailable?: string;
  /** Scenes the catalogue answered with that came back unreadable and were left out. */
  scenesSkipped?: number;
  studios?: { id: string; name: string; sceneCount: number | null }[];
  /** Why the studios section is missing, where it was asked for and not read. */
  studiosUnavailable?: string;
  /** Studio rows the catalogue answered with that came back unreadable. */
  studiosSkipped?: number;
  /** How many the record credits, where the section shows a page of them. */
  studiosTotal?: number;
  created: string | null;
  updated: string | null;
}

export type MatchKind = "exact_file" | "perceptual_similarity";

export interface FingerprintMatch {
  scene: SceneRecord;
  algorithm: FingerprintAlgorithm;
  matchKind: MatchKind;
  /** The fingerprint as this catalogue holds it, when it returned one. */
  fingerprint: FingerprintRow | null;
}

export interface RowsResult<T> {
  rows: T[];
  perSource: SourceReport[];
  /** How the order was built, since no score is shared across catalogues. */
  ordering: string;
}

export interface FingerprintResult {
  matches: FingerprintMatch[];
  perSource: SourceReport[];
  /**
   * Scenes a catalogue answered with while returning none of the fingerprints
   * asked for. Which hash reached them is unknown, and counting them keeps that
   * apart from a catalogue that found nothing.
   */
  unattributed: number;
  /** The distinct questions actually put, a hash given twice being one. */
  asked: readonly { hash: string; algorithm: string }[];
}
