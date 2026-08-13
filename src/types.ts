/**
 * The shapes an answer is made of, and what each of them is allowed to claim.
 *
 * Three of them carry the whole design.
 *
 * A **record** is one catalogue's reading of one thing. It names the catalogue
 * that holds it in its identifier and in its address, so nothing read off it can
 * be attributed to a catalogue that never said it.
 *
 * A **card** is what a record route answers with once every catalogue holding
 * that record has been read. A scalar on it carries the catalogues that said it,
 * and the readings nobody preferred beside the one that won. A list on it is the
 * union, each entry naming who published it. Nothing on it is a count: counts
 * stay one per catalogue, because these corpora overlap by an amount none of
 * them publishes.
 *
 * A **report** is what one catalogue did with a question. Its three states are
 * the reason this server exists: a catalogue that failed, one that was never
 * asked, and one that looked and found nothing are three different facts, and
 * only the last is evidence about the world.
 *
 * A loss is carried wherever a list can lose a row this client could not read.
 * Dropped in silence it becomes a record holding less than the catalogue holds,
 * and nothing in the answer says so.
 */

import type { InstanceId } from "./stashbox/instances.js";
import type { DatePrecision, ReadDate, RecordStatus } from "./stashbox/normalise.js";

export type { DatePrecision, ReadDate, RecordStatus };

/** Every read hands back what it found, whether it was replayed, and what it lost. */
export interface Read<T> {
  data: T;
  /** The answer was replayed from this client's store, so no catalogue was asked. */
  cached: boolean;
  /** Rows a catalogue answered with that this client could not read. */
  skipped?: number;
}

/** The one code a caller branches on. Only `not_found` is about the world. */
export type ErrorCode =
  "not_found" | "invalid_input" | "rate_limited" | "parse_failure" | "network_error" | "timeout";

/* ------------------------------------------------------------ what was lost */

/** A loss, counted and named, so a number never says less than it means. */
export interface Losses {
  /** Rows of a record's own lists that came back unreadable. */
  rowsSkipped?: number;
  /** Which lists lost them, so the count can say what it counts. */
  rowsSkippedIn?: string[];
}

/* -------------------------------------------------------------- the records */

/** What every record carries, whatever kind of thing it is a record of. */
export interface BaseRecord extends Losses {
  /** Written `instance:uuid`, which is the form this server takes back. */
  id: string;
  source: InstanceId;
  /** The address on the catalogue that holds it, which an answer credits. */
  sourceUrl: string;
  retrievedAt: string;
  status: RecordStatus;
  /** The same record on another catalogue, read from a link that catalogue publishes. */
  alsoHeldAt?: { source: InstanceId; id: string }[];
  /** Edits open against it, null where the catalogue publishes no count. */
  pendingEdits?: number | null;
  pendingEditsUnreadable?: boolean;
}

/** A link a record carries, with what its catalogue knows about the site behind it. */
export interface SiteLink {
  url: string;
  siteName: string | null;
  /** Null where the catalogue keeps no table sorting the sites it links to. */
  siteCategory: string | null;
}

/** An image, at the size the catalogue recorded, null where it recorded none. */
export interface ImageRow {
  url: string;
  width: number | null;
  height: number | null;
}

/**
 * One fingerprint a record carries.
 *
 * `durationSeconds` is the runtime submitted with the hash, which is its own
 * measurement and not the runtime the catalogue holds for the release.
 */
export interface FingerprintRow {
  algorithm: "MD5" | "OSHASH" | "PHASH";
  hash: string;
  durationSeconds: number | null;
  submissions: number | null;
  /** Null where the catalogue counts no report, so a contest is unknown there. */
  reports: number | null;
  contested: boolean | null;
  /** Whether a person submitted it, where the catalogue says. */
  userSubmitted?: boolean | null;
}

/** A tag as a record names one, with the category its catalogue placed it in. */
export interface TagRef {
  id: string;
  name: string | null;
  /** Null where the catalogue keeps no taxonomy, and where it left one out. */
  category: string | null;
  status: RecordStatus;
}

/** A studio as a record names one. */
export interface StudioRef {
  id: string;
  name: string | null;
  parent: string | null;
  status: RecordStatus;
  parentWithdrawn?: boolean;
}

/** Someone a scene credits, under their own name and the one it printed. */
export interface CreditRef {
  id: string;
  name: string | null;
  creditedAs: string | null;
  disambiguation: string | null;
  status: RecordStatus;
}

export interface SceneRecord extends BaseRecord {
  title: string | null;
  details: string | null;
  code: string | null;
  director: string | null;
  durationSeconds: number | null;
  releaseDate: ReadDate | null;
  productionDate: ReadDate | null;
  releaseDateUnreadable?: boolean;
  productionDateUnreadable?: boolean;
  studio: StudioRef | null;
  performers: CreditRef[];
  tags: TagRef[];
  urls: SiteLink[];
  images?: ImageRow[];
  imagesSkipped?: number;
  fingerprints?: FingerprintRow[];
  fingerprintsSkipped?: number;
  created: string | null;
  updated: string | null;
}

/** The body a catalogue records, each field in the unit it publishes. */
export interface Appearance {
  ethnicity: string | null;
  eyeColor: string | null;
  hairColor: string | null;
  heightCm: number | null;
  cupSize: string | null;
  bandSize: number | null;
  waistSize: number | null;
  hipSize: number | null;
  breastType: string | null;
  tattoos: string[];
  piercings: string[];
}

export interface PerformerRecord extends BaseRecord {
  name: string | null;
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
  /** What this catalogue has indexed, which reports its coverage and no career. */
  sceneCount: number | null;
  urls: SiteLink[];
  appearance?: Appearance;
  images?: ImageRow[];
  imagesSkipped?: number;
  studios?: { id: string; name: string | null; sceneCount: number | null; status: RecordStatus }[];
  studiosSkipped?: number;
  /** The record it was folded into, where the catalogue publishes one. */
  mergedInto: string | null;
  mergedIds: string[];
  created: string | null;
  updated: string | null;
}

export interface StudioRecord extends BaseRecord {
  name: string | null;
  aliases: string[];
  parent: { id: string; name: string | null; status: RecordStatus } | null;
  urls: SiteLink[];
  images?: ImageRow[];
  imagesSkipped?: number;
  sceneCount: number | null;
}

export interface TagRecord extends BaseRecord {
  name: string | null;
  description: string | null;
  aliases: string[];
  /** The category and the group of things it sorts, where a catalogue keeps one. */
  category: { id: string; name: string | null; group: string | null } | null;
}

export type AnyRecord = SceneRecord | PerformerRecord | StudioRecord | TagRecord;

/* --------------------------------------------------------------- the report */

export type SourceState = "answered" | "failed" | "absent";

/** What one catalogue did with one question. */
export interface SourceReport {
  source: InstanceId;
  /** The catalogue's own name, for prose. Derived from `source` when absent. */
  name?: string;
  state: SourceState;
  /** Rows it contributed. Present where it answered. */
  count?: number;
  /** Why it was not asked, or what went wrong where it was. */
  reason?: string;
  /** Which moment failed, such as the search or the reading of a record. */
  moment?: string;
  error?: ErrorCode;
  /** What its index holds for the question, the page returned included. */
  indexTotal?: number;
  /** Rows it answered with that came back unreadable and were left out. */
  skipped?: number;
  /** Distinct records behind its rows, where one record can answer more than once. */
  records?: number;
  /** Rows it answered with while carrying none of what was asked about. */
  unattributed?: number;
  /** Narrowings it could not receive, which is a limit of the catalogue. */
  narrowingsNotReceived?: string[];
  /** Narrowings written with identifiers no record of its own carries. */
  narrowingsNamingNoRecord?: string[];
  /** Narrowings it received short, the rest of the list naming other catalogues. */
  narrowingsReceivedInPart?: string[];
  /** Fingerprint algorithms its lookup does not search, so it was never asked. */
  algorithmsNotSearched?: string[];
  /** The fields its text index read, claimed only where one was consulted. */
  fieldsSearched?: string[];
}

/** A page of rows, with what each catalogue did and how they were laid out. */
export interface RowsResult<T> {
  rows: T[];
  perSource: SourceReport[];
  /** How the rows were laid out, which a reader needs before the first one. */
  ordering: string;
}

/* ----------------------------------------------------------------- the card */

/** One catalogue's reading of a record, as the consolidation receives it. */
export interface Reading<T = Record<string, unknown>> {
  source: InstanceId | string;
  /** The identifier the record carries there. Absent where nobody asked. */
  id?: string;
  state: SourceState;
  record?: T;
  error?: string;
  reason?: string;
}

/** A scalar, with the catalogues that said it and the readings that lost. */
export interface CardValue<T = unknown> {
  value: T | null;
  agreed_by: string[];
  disagreed?: { source: string; value: T }[];
}

/** One entry of a united list, naming every catalogue that published it. */
export interface CardEntry<T = string> {
  value: T;
  published_by: string[];
}

/**
 * A count, beside the catalogue that published it and what became of that
 * catalogue.
 *
 * A null means three different things, and a reader acts on which: the
 * catalogue publishes no such count, it could not answer, or nobody asked it.
 * Folded into one null they read alike, and the last two would be reported as
 * a limit the catalogue does not have.
 */
export interface CardCount {
  source: string;
  value: number | null;
  state: SourceState;
}

/** What became of each catalogue asked for one record. */
export interface CardHolder {
  source: string;
  id?: string;
  state: SourceState;
  status?: RecordStatus;
  error?: string;
  reason?: string;
}

/** One record, read on every catalogue that holds it. */
export interface Card {
  fields: Record<string, CardValue | CardEntry[]>;
  counts: Record<string, CardCount[]>;
  held_by: CardHolder[];
  /** The order the readings were preferred in, which is the policy applied. */
  preferred: string[];
  /** The catalogues that answered, in that order, which is what came back. */
  read_from: string[];
  notes: string[];
  perSource?: SourceReport[];
}
