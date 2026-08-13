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

import { routeFor, supports, type Capability, type InstanceSpec } from "./instances.js";

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
    // one, and the refusal would come back as a fact about the catalogue.
    throw new Error(`${spec.name} was not measured answering ${capability}`);
  }
  return route;
}

/* ---------------------------------------------------------- the selections */

const lines = (parts: readonly string[]): string =>
  parts.filter((part) => part !== "").join("\n    ");

function siteSelection(spec: InstanceSpec): string {
  return supports(spec, "site_categories") ? "site { id name description }" : "site { id name }";
}

function editsSelection(spec: InstanceSpec): string {
  return supports(spec, "pending_edits") ? "edits { id }" : "";
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
    editsSelection(spec),
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
    editsSelection(spec),
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
    editsSelection(spec),
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
    editsSelection(spec),
  ]);
}

function selectionFor(spec: InstanceSpec, kind: RecordKind, sections: readonly string[]): string {
  if (kind === "scene") return sceneSelection(spec, sections as SceneSection[]);
  if (kind === "performer") return performerSelection(spec, sections as PerformerSection[]);
  if (kind === "studio") return studioSelection(spec);
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

interface Criterion {
  value: unknown;
  modifier: Modifier;
}

/** Free text a route compares rather than matches, which travels as a criterion. */
function textCriterion(value: string | undefined): Criterion | undefined {
  return value === undefined ? undefined : { value, modifier: "EQUALS" };
}

/**
 * A list of identifiers, read as an intersection or as a union.
 *
 * `all` asks for a row carrying every one of them, `any` for a row carrying one.
 * An empty list narrows nothing, so it shapes no key at all rather than a
 * criterion asking for a row carrying none.
 */
function identifierCriterion(
  values: readonly string[] | undefined,
  match: "all" | "any",
): Criterion | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return { value: [...values], modifier: match === "all" ? "INCLUDES_ALL" : "INCLUDES" };
}

/** How a caller reads a date, in the one comparison a catalogue takes. */
export type DateCompare = "on" | "before" | "after";

const COMPARISON: Record<DateCompare, Modifier> = {
  on: "EQUALS",
  before: "LESS_THAN",
  after: "GREATER_THAN",
};

function dateCriterion(
  value: string | undefined,
  compare: DateCompare | undefined,
): Criterion | undefined {
  if (value === undefined || compare === undefined) return undefined;
  return { value, modifier: COMPARISON[compare] };
}

/** Writes a key only where the caller gave it something to carry. */
function put(input: Record<string, unknown>, name: string, value: unknown): void {
  if (value !== undefined) input[name] = value;
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
  put(input, "sort", named === undefined ? undefined : named.toUpperCase());
  put(input, "direction", way === undefined ? undefined : way.toUpperCase());
}

/* -------------------------------------------------------------- the inputs */

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

export function sceneQueryInput(
  spec: InstanceSpec,
  narrowing: SceneNarrowing,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const match = narrowing.match ?? "all";
  put(input, "title", narrowing.title);
  put(input, "alias", narrowing.alias);
  put(input, "code", textCriterion(narrowing.code));
  put(input, "date", dateCriterion(narrowing.date, narrowing.dateCompare));
  put(input, "performers", identifierCriterion(narrowing.performerIds, match));
  // A scene carries one studio, so a row carrying two is a row nothing holds,
  // whatever the caller meant by asking for every one of them.
  put(input, "studios", identifierCriterion(narrowing.studioIds, "any"));
  put(input, "parentStudio", narrowing.parentStudioId);
  put(input, "tags", identifierCriterion(narrowing.tagIds, match));
  ordering(spec, input, narrowing.sort, narrowing.direction, "date");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return input;
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

export function performerQueryInput(
  spec: InstanceSpec,
  narrowing: PerformerNarrowing,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  put(input, "name", narrowing.name);
  put(input, "alias", narrowing.alias);
  put(input, "disambiguation", textCriterion(narrowing.disambiguation));
  put(input, "gender", narrowing.gender);
  put(input, "country", textCriterion(narrowing.country));
  put(input, "ethnicity", textCriterion(narrowing.ethnicity));
  put(input, "birth_year", narrowing.birthYear);
  put(input, "career_start_year", narrowing.careerStartYear);
  put(input, "career_end_year", narrowing.careerEndYear);
  put(input, "performed_with", narrowing.performedWith);
  put(input, "studio_id", narrowing.studioId);
  ordering(spec, input, narrowing.sort, narrowing.direction, "name");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return input;
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

export function studioQueryInput(
  spec: InstanceSpec,
  narrowing: StudioNarrowing,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  put(input, "name", narrowing.name);
  put(
    input,
    "parent",
    narrowing.parentId === undefined
      ? undefined
      : { value: narrowing.parentId, modifier: "INCLUDES" },
  );
  put(input, "has_parent", narrowing.hasParent);
  ordering(spec, input, narrowing.sort, narrowing.direction, "name");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return input;
}

export interface TagNarrowing {
  name?: string;
  categoryId?: string;
  sort?: string;
  direction?: string;
  page: number;
  limit: number;
}

export function tagQueryInput(
  spec: InstanceSpec,
  narrowing: TagNarrowing,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  put(input, "name", narrowing.name);
  put(input, "category_id", narrowing.categoryId);
  ordering(spec, input, narrowing.sort, narrowing.direction, "name");
  input.page = narrowing.page;
  input.per_page = narrowing.limit;
  return input;
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
): Request {
  const operation = routeOn(spec, SEARCHES[kind]);
  const record: RecordKind = kind.slice(0, -1) as RecordKind;
  return {
    operation,
    query: `query Search($term: String!, $limit: Int) {
  ${operation}(term: $term, limit: $limit) {
    ${selectionFor(spec, record, sections)}
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
