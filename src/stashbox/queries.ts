/**
 * What a question becomes on the wire, catalogue by catalogue.
 *
 * Two rules decide this file, and both come from failures that no other kind of
 * test could see. A request refused by a catalogue is reported honestly, and
 * every schema in the answer validates, because **a failed answer is perfectly
 * schema-conformant**: six routes once reached no catalogue at all under six
 * hundred green tests.
 *
 * **A catalogue is asked in its own spelling.** The route names live in the
 * registry, one per catalogue, and nothing here writes one out. Two catalogues
 * name the same route plural and singular, and a request written in the other's
 * spelling comes back refused; read as a limit, that refusal became a published
 * claim that one of them answered no search at all.
 *
 * **A filter is written the way the schema declares it.** A criterion is an
 * object carrying a value and a comparison. A scene carries one studio, so a
 * list of studios is a union whatever the caller meant. A date takes one
 * comparison, because the enumeration of comparisons declares no range.
 *
 * A field is selected only where the catalogue publishes it: asking for one it
 * has no column for fails the whole request rather than the one field.
 */

import { invalidInput } from "../errors.js";
import {
  answersWith,
  routeFor,
  supports,
  type Capability,
  type InstanceSpec,
} from "./instances.js";

/** A request as the transport takes one, with the route it was built for. */
export interface Request {
  operation: string;
  query: string;
  variables: Record<string, unknown>;
}

export type Kind = "scenes" | "performers" | "studios" | "tags";
export type RecordKind = "scene" | "performer" | "studio" | "tag";

const SEARCHES: Record<Kind, Capability> = {
  scenes: "search_scenes",
  performers: "search_performers",
  studios: "search_studios",
  tags: "search_tags",
};

const RECORDS: Record<RecordKind, Capability> = {
  scene: "get_scene",
  performer: "get_performer",
  studio: "get_studio",
  tag: "get_tag",
};

/** The route a catalogue answers a capability on, or a refusal to build one. */
function routeOn(spec: InstanceSpec, capability: Capability): string {
  const route = routeFor(spec, capability);
  if (route === undefined || !supports(spec, capability)) {
    // Building a request for a route a catalogue does not answer would send it
    // one, and the refusal would come back as a fact about the catalogue. The
    // layer above chooses which catalogues a question reaches, so this is the
    // backstop for a question that got past it.
    throw invalidInput(
      `${spec.name} was not measured answering ${capability}, so this client asks it nothing on that route and its silence is no evidence about it.`,
      `Ask ${capability} of a catalogue get_sources names as answering it.`,
    );
  }
  return route;
}

/* ---------------------------------------------------------- the selections */

const lines = (parts: readonly string[]): string =>
  parts.filter((part) => part !== "").join("\n    ");

/**
 * The site behind a link, and the category its catalogue placed that site in.
 *
 * A site declares a description of its own and a category of its own, and they
 * are different things: the description is a paragraph about the site, and the
 * category is the table entry a catalogue sorted it under. Read one for the
 * other and every link in an answer carries a blurb labelled as a category.
 */
function siteSelection(spec: InstanceSpec): string {
  return supports(spec, "site_categories")
    ? "site { id name category { id name } }"
    : "site { id name }";
}

/**
 * The edits open against a record, selected where they can be.
 *
 * Two facts have to hold at once. The catalogue publishes a count of open
 * edits, which the registry says; and the kind of record declares the field at
 * all. Measured on 2026-08-13: a scene, a performer and a tag each declare it,
 * and a studio declares none, so asking a studio for it fails the whole
 * request rather than the one field.
 */
const CARRIES_EDITS: Record<RecordKind, boolean> = {
  scene: true,
  performer: true,
  tag: true,
  studio: false,
};

function editsSelection(spec: InstanceSpec, kind: RecordKind): string {
  return supports(spec, "pending_edits") && CARRIES_EDITS[kind] ? "edits { id }" : "";
}

const SCENE_BASIC = [
  "id",
  "title",
  "details",
  "code",
  "director",
  "duration",
  "release_date",
  "production_date",
  "deleted",
  "created",
  "updated",
  "studio { id name deleted parent { id name deleted } }",
  "performers { as performer { id name disambiguation deleted merged_into_id } }",
];

const IMAGES = "images { id url width height }";

export type SceneSection = "basic" | "fingerprints" | "images";
export type PerformerSection = "basic" | "appearance" | "images" | "studios";

const APPEARANCE = [
  "ethnicity",
  "eye_color",
  "hair_color",
  "height",
  "cup_size",
  "band_size",
  "waist_size",
  "hip_size",
  "breast_type",
  "tattoos { location description }",
  "piercings { location description }",
];

function sceneSelection(spec: InstanceSpec, sections: readonly SceneSection[]): string {
  const tagCategory = supports(spec, "tag_categories") ? "category { id name }" : "";
  return lines([
    ...SCENE_BASIC,
    `tags { id name deleted ${tagCategory} }`,
    `urls { url ${siteSelection(spec)} }`,
    editsSelection(spec, "scene"),
    sections.includes("images") ? IMAGES : "",
    sections.includes("fingerprints") ? fingerprintSelection(spec) : "",
  ]);
}

function fingerprintSelection(spec: InstanceSpec): string {
  const reports = supports(spec, "fingerprint_reports") ? "reports" : "";
  return `fingerprints { hash algorithm duration submissions ${reports} user_submitted }`;
}

function performerSelection(spec: InstanceSpec, sections: readonly PerformerSection[]): string {
  return lines([
    "id",
    "name",
    "disambiguation",
    "aliases",
    "gender",
    "country",
    "birth_date",
    "death_date",
    "career_start_year",
    "career_end_year",
    "deleted",
    "merged_into_id",
    "merged_ids",
    "created",
    "updated",
    supports(spec, "scene_count") ? "scene_count" : "",
    `urls { url ${siteSelection(spec)} }`,
    editsSelection(spec, "performer"),
    sections.includes("appearance") ? lines(APPEARANCE) : "",
    sections.includes("images") ? IMAGES : "",
    sections.includes("studios") && supports(spec, "performer_studios")
      ? "studios { scene_count studio { id name deleted } }"
      : "",
  ]);
}

function studioSelection(spec: InstanceSpec): string {
  return lines([
    "id",
    "name",
    "aliases",
    "deleted",
    "parent { id name deleted }",
    `urls { url ${siteSelection(spec)} }`,
    editsSelection(spec, "studio"),
    IMAGES,
  ]);
}

function tagSelection(spec: InstanceSpec): string {
  return lines([
    "id",
    "name",
    "description",
    "aliases",
    "deleted",
    supports(spec, "tag_categories") ? "category { id name group description }" : "",
    editsSelection(spec, "tag"),
  ]);
}

function selectionFor(spec: InstanceSpec, kind: RecordKind, sections: readonly string[]): string {
  if (kind === "scene") {
    return sceneSelection(spec, sections as SceneSection[]);
  }
  if (kind === "performer") {
    return performerSelection(spec, sections as PerformerSection[]);
  }
  if (kind === "studio") {
    return studioSelection(spec);
  }
  return tagSelection(spec);
}

/* ------------------------------------------------------------- the criteria */

/** A comparison as the catalogues declare one. There is no range among them. */
type Modifier =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "IS_NULL"
  | "NOT_NULL"
  | "INCLUDES_ALL"
  | "INCLUDES"
  | "EXCLUDES";

/**
 * Free text a route compares rather than matches.
 *
 * One catalogue takes it wrapped in a criterion carrying a comparison, and
 * another takes the value itself and declares no comparison at all. The shape
 * is read from the registry, since a request written in the other's shape is
 * refused before a row is seen.
 */
function textCriterion(spec: InstanceSpec, value: string | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }
  return spec.filters === "plain" ? value : { value, modifier: "EQUALS" };
}

/**
 * A list of identifiers, read as an intersection or as a union.
 *
 * `all` asks for a row carrying every one of them, `any` for a row carrying one.
 * An empty list narrows nothing, so it shapes no key at all rather than a
 * criterion asking for a row carrying none.
 */
function identifierCriterion(
  spec: InstanceSpec,
  values: readonly string[] | undefined,
  match: "all" | "any",
): unknown {
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  if (spec.filters === "plain") {
    return values.join(",");
  }
  return { value: [...values], modifier: match === "all" ? "INCLUDES_ALL" : "INCLUDES" };
}

/**
 * The orders each entity declares, measured on the reference instance.
 *
 * A caller writes one of these and no other: an order outside the set is
 * refused by the catalogue, and the refusal would read as a limit it does not
 * have.
 */
export const SORTS = {
  scenes: ["title", "date", "duration", "trending", "popularity", "created_at", "updated_at"],
  performers: [
    "name",
    "birthdate",
    "deathdate",
    "scene_count",
    "career_start_year",
    "debut",
    "last_scene",
    "popularity",
    "created_at",
    "updated_at",
  ],
  studios: ["name", "created_at", "updated_at"],
  tags: ["name", "created_at", "updated_at"],
} as const;

/** How a caller reads a date, in the one comparison a catalogue takes. */
export type DateCompare = "on" | "before" | "after";

const COMPARISON: Record<DateCompare, Modifier> = {
  on: "EQUALS",
  before: "LESS_THAN",
  after: "GREATER_THAN",
};

function dateCriterion(
  spec: InstanceSpec,
  value: string | undefined,
  compare: DateCompare | undefined,
): unknown {
  if (value === undefined || compare === undefined) {
    return undefined;
  }
  return spec.filters === "plain" ? value : { value, modifier: COMPARISON[compare] };
}

/**
 * The filters a faceted input declares and its route reads nothing of.
 *
 * Measured on 2026-08-14 against StashDB: `queryPerformers` written with
 * `alias`, `career_start_year` or `career_end_year`, and `queryScenes` written
 * with `alias`, each answer the same count, the same page and the same first
 * row as a request carrying no narrowing at all, while their siblings
 * `birth_year`, `name` and `title` cut the count to a fraction of the corpus.
 * The field is in the schema and the resolver reads none of it.
 *
 * A request is refused nothing for carrying one, so no failure marks it. Left
 * in, the whole index comes back as the answer to the question a caller
 * narrowed, which is the one thing this server exists not to do, so they travel
 * as narrowings the route does not receive and reach a caller as that.
 */
const ANSWERED_BY_NO_ROUTE = new Set(["alias", "career_start_year", "career_end_year"]);

/**
 * Writes a key where the caller gave it something and the catalogue both
 * declares the field and answers it.
 *
 * A field a catalogue's own input does not declare is one it cannot receive,
 * and writing it fails the whole request rather than that one narrowing. A
 * field the input declares and the route reads nothing of narrows nothing at
 * all. The name is handed back either way, so the answer can say the catalogue
 * received nothing for it.
 */
/**
 * A writer that puts narrowings into one request, for one catalogue.
 *
 * The catalogue, the request being built and the list of what it will not
 * receive are the same at every call, so they are closed over once and each
 * call states only the narrowing it is writing.
 */
function putterFor(
  spec: InstanceSpec,
  input: Record<string, unknown>,
  unreceived: string[],
): (name: string, value: unknown, as?: string) => void {
  return (name, value, as = name) => {
    if (value === undefined) {
      return;
    }
    if (ANSWERED_BY_NO_ROUTE.has(name)) {
      unreceived.push(as);
      return;
    }
    if (spec.facets !== undefined && !spec.facets.includes(name)) {
      unreceived.push(as);
      return;
    }
    input[name] = value;
  };
}

/**
 * The order a faceted route is read in.
 *
 * One catalogue refuses a faceted request written without one, so it is given
 * the order its own route requires rather than left to fail on it.
 */
function ordering(
  spec: InstanceSpec,
  input: Record<string, unknown>,
  sort: string | undefined,
  direction: string | undefined,
  standing: string,
): void {
  const named = sort ?? (spec.requiresOrder ? standing : undefined);
  const way = direction ?? (spec.requiresOrder ? "asc" : undefined);
  if (named !== undefined) {
    input.sort = named.toUpperCase();
  }
  if (way !== undefined) {
    input.direction = way.toUpperCase();
  }
}

/* -------------------------------------------------------------- the inputs */

/** A faceted request, with the narrowings the catalogue's own input cannot take. */
export interface Faceted {
  input: Record<string, unknown>;
  unreceived: string[];
}

/**
 * A whole number, written as the catalogue's input declares it.
 *
 * Measured: the reference instance takes a year as a criterion carrying a
 * comparison, and the catalogue that reimplements the interface takes the
 * number written as text.
 */
function numberFilter(spec: InstanceSpec, value: number | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }
  return spec.filters === "plain" ? String(value) : { value, modifier: "EQUALS" };
}

export interface SceneNarrowing {
  title?: string;
  code?: string;
  alias?: string;
  date?: string;
  dateCompare?: DateCompare;
  performerIds?: readonly string[];
  studioIds?: readonly string[];
  parentStudioId?: string;
  tagIds?: readonly string[];
  match?: "all" | "any";
  sort?: string;
  direction?: string;
  page: number;
  limit: number;
}

export function sceneQueryInput(spec: InstanceSpec, narrowing: SceneNarrowing): Faceted {
  const input: Record<string, unknown> = {};
  const unreceived: string[] = [];
  const put = putterFor(spec, input, unreceived);
  const match = narrowing.match ?? "all";
  put("title", narrowing.title);
  put("alias", textCriterion(spec, narrowing.alias));
  put("code", textCriterion(spec, narrowing.code));
  put("date", dateCriterion(spec, narrowing.date, narrowing.dateCompare));
  put("performers", identifierCriterion(spec, narrowing.performerIds, match), "performer_ids");
  // A scene carries one studio, so a row carrying two is a row nothing holds,
  // whatever the caller meant by asking for every one of them.
  put("studios", identifierCriterion(spec, narrowing.studioIds, "any"), "studio_ids");
  put("parentStudio", narrowing.parentStudioId, "parent_studio_id");
  put("tags", identifierCriterion(spec, narrowing.tagIds, match), "tag_ids");
  // The reading of a list travels on the performer and tag criteria alone: a
  // scene carries one studio, so a list of them is read as a union whatever
  // was written. A request carrying neither criterion reaches the catalogue
  // with nothing that reading decided, and the answer names it among what the
  // route did not receive rather than accepting it in silence.
  const decided = ["performers", "tags"].some((name) => {
    const criterion = input[name];
    return typeof criterion === "object" && criterion !== null && "modifier" in criterion;
  });
  if (narrowing.match !== undefined && !decided) {
    unreceived.push("match");
  }
  ordering(spec, input, narrowing.sort, narrowing.direction, "date");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return { input, unreceived };
}

export interface PerformerNarrowing {
  name?: string;
  alias?: string;
  disambiguation?: string;
  gender?: string;
  country?: string;
  ethnicity?: string;
  birthYear?: number;
  careerStartYear?: number;
  careerEndYear?: number;
  performedWith?: string;
  studioId?: string;
  sort?: string;
  direction?: string;
  page: number;
  limit: number;
}

export function performerQueryInput(spec: InstanceSpec, narrowing: PerformerNarrowing): Faceted {
  const input: Record<string, unknown> = {};
  const unreceived: string[] = [];
  const put = putterFor(spec, input, unreceived);
  put("name", narrowing.name);
  // Measured: a performer's alias is a plain string where a scene's is a
  // criterion, and the two enumerated fields take the value itself.
  put("alias", narrowing.alias);
  put("disambiguation", textCriterion(spec, narrowing.disambiguation));
  put("gender", narrowing.gender?.toUpperCase());
  put("country", textCriterion(spec, narrowing.country));
  put("ethnicity", narrowing.ethnicity?.toUpperCase());
  put("birth_year", numberFilter(spec, narrowing.birthYear));
  put("career_start_year", numberFilter(spec, narrowing.careerStartYear));
  put("career_end_year", numberFilter(spec, narrowing.careerEndYear));
  put("performed_with", narrowing.performedWith);
  put("studio_id", narrowing.studioId);
  ordering(spec, input, narrowing.sort, narrowing.direction, "name");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return { input, unreceived };
}

export interface StudioNarrowing {
  name?: string;
  parentId?: string;
  hasParent?: boolean;
  sort?: string;
  direction?: string;
  page: number;
  limit: number;
}

export function studioQueryInput(spec: InstanceSpec, narrowing: StudioNarrowing): Faceted {
  const input: Record<string, unknown> = {};
  const unreceived: string[] = [];
  const put = putterFor(spec, input, unreceived);
  put("name", narrowing.name);
  // Measured: a studio names one parent, so its filter is a criterion carrying
  // one identifier rather than a list of them.
  put("parent", textCriterion(spec, narrowing.parentId), "parent_id");
  put("has_parent", narrowing.hasParent);
  ordering(spec, input, narrowing.sort, narrowing.direction, "name");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return { input, unreceived };
}

export interface TagNarrowing {
  name?: string;
  categoryId?: string;
  sort?: string;
  direction?: string;
  page: number;
  limit: number;
}

export function tagQueryInput(spec: InstanceSpec, narrowing: TagNarrowing): Faceted {
  const input: Record<string, unknown> = {};
  const unreceived: string[] = [];
  const put = putterFor(spec, input, unreceived);
  put("name", narrowing.name);
  put("category_id", narrowing.categoryId);
  ordering(spec, input, narrowing.sort, narrowing.direction, "name");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return { input, unreceived };
}

/* ------------------------------------------------------------ the requests */

const ROWS_UNDER: Record<Kind, string> = {
  scenes: "scenes",
  performers: "performers",
  studios: "studios",
  tags: "tags",
};

/** The words a caller wrote, put to the catalogue's own text index. */
export function searchRequest(
  spec: InstanceSpec,
  kind: Kind,
  term: string,
  limit: number,
  sections: readonly string[] = ["basic"],
): Request & { paged: boolean } {
  const operation = routeOn(spec, SEARCHES[kind]);
  const record: RecordKind = kind.slice(0, -1) as RecordKind;
  // One catalogue wraps the rows of a text search in a page carrying a count
  // of its own, and another answers the rows alone. Reading either as the
  // other makes the request fail validation before a row is ever seen, so the
  // shape is read from the registry rather than assumed.
  const paged = answersWith(spec, SEARCHES[kind]) === "page";
  const count = paged && supports(spec, "index_total") ? "count\n    " : "";
  const rows = paged
    ? `${count}${ROWS_UNDER[kind]} {\n      ${selectionFor(spec, record, sections)}\n    }`
    : selectionFor(spec, record, sections);
  return {
    operation,
    paged,
    query: `query Search($term: String!, $limit: Int) {
  ${operation}(term: $term, limit: $limit) {
    ${rows}
  }
}`,
    variables: { term, limit },
  };
}

/** One record, read on the route the catalogue names it by. */
export function recordRequest(
  spec: InstanceSpec,
  kind: RecordKind,
  uuid: string,
  sections: readonly string[] = ["basic"],
): Request {
  const operation = routeOn(spec, RECORDS[kind]);
  return {
    operation,
    query: `query Read($id: ID!) {
  ${operation}(id: $id) {
    ${selectionFor(spec, kind, sections)}
  }
}`,
    variables: { id: uuid },
  };
}

/** A page of rows, narrowed by the typed filters a caller wrote. */
export function facetedRequest(
  spec: InstanceSpec,
  kind: Kind,
  input: Record<string, unknown>,
  sections: readonly string[] = ["basic"],
): Request {
  const operation = `query${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  const type = `${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}QueryInput!`;
  const count = supports(spec, "index_total") ? "count\n    " : "";
  const record: RecordKind = kind.slice(0, -1) as RecordKind;
  return {
    operation,
    query: `query Page($input: ${type}) {
  ${operation}(input: $input) {
    ${count}${ROWS_UNDER[kind]} {
      ${selectionFor(spec, record, sections)}
    }
  }
}`,
    variables: { input },
  };
}

export interface Fingerprint {
  hash: string;
  algorithm: "MD5" | "OSHASH" | "PHASH";
}

/**
 * The hashes held for one file, in the shape the route declares.
 *
 * The argument is a list of groups, one per hash, so a single flat list is
 * refused outright. A catalogue is put only the algorithms its own lookup
 * searches: the rest were never asked, and its silence about them is no
 * evidence.
 */
export function fingerprintRequest(
  spec: InstanceSpec,
  fingerprints: readonly Fingerprint[],
  sections: readonly SceneSection[] = ["basic", "fingerprints"],
): Request & { notSearched: string[] } {
  const operation = routeOn(spec, "find_by_fingerprint");
  const searches = supports(spec, "perceptual_lookup");
  const asked = fingerprints.filter((one) => one.algorithm !== "PHASH" || searches);
  const notSearched = searches
    ? []
    : [
        ...new Set(
          fingerprints.filter((one) => one.algorithm === "PHASH").map((one) => one.algorithm),
        ),
      ];

  return {
    operation,
    query: `query ByFingerprint($fingerprints: [[FingerprintQueryInput!]!]!) {
  ${operation}(fingerprints: $fingerprints) {
    ${sceneSelection(spec, sections)}
  }
}`,
    variables: {
      fingerprints: asked.map((one) => [{ hash: one.hash, algorithm: one.algorithm }]),
    },
    notSearched,
  };
}
