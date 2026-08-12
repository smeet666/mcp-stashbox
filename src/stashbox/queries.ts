/**
 * The documents this client sends, one request at a time.
 *
 * Two things decide what a document looks like, and they decide different
 * things. **The registry decides which fields are asked for**: a catalogue that
 * publishes no table of site categories refuses the whole request when a
 * category is selected on it, so every field that one catalogue publishes and
 * another does not is written behind `supports`. **The dialect decides how a
 * request is written**: a catalogue reimplementing the published interface
 * requires a page, a sort and a direction on a scene query and refuses a request
 * that leaves them out. Asking on the dialect and reading on the capability
 * would leave two registers for one fact, and the answer would eventually be
 * read against the wrong one.
 *
 * A field is selected here because an answer depends on it. `deleted` says what
 * an identifier addresses now, wherever a record is named. `merged_into_id` and
 * `merged_ids` say which record a folded performer continues into and which
 * identifiers still resolve to it. The rest is what the record states about
 * itself.
 */

import type { FingerprintAlgorithm } from "../types.js";
import type { GraphQLRequest } from "./graphql.js";
import { supports, type InstanceSpec } from "./instances.js";

/** The blocks of a scene a caller can ask for, which decide what is selected. */
export type SceneSection = "basic" | "fingerprints" | "images";

/**
 * The blocks of a performer a caller can ask for. The scenes crediting one are
 * read with a scene query, so they select nothing on the record itself.
 */
export type PerformerSection = "basic" | "appearance" | "images" | "scenes" | "studios";

export const SCENE_SORTS = ["date", "title", "trending", "created", "updated"] as const;
export type SceneSort = (typeof SCENE_SORTS)[number];

export const PERFORMER_SORTS = ["name", "birth_date", "scene_count", "created", "updated"] as const;
export type PerformerSort = (typeof PERFORMER_SORTS)[number];

export type Direction = "asc" | "desc";

/** Whether every row must carry the identifiers, or any one of them. */
export type MatchMode = "all" | "any";

/** A scene query as the tools write one, in the words they publish. */
export interface SceneNarrowing {
  title?: string;
  code?: string;
  /** The earliest release date a row may carry, as published. */
  dateFrom?: string;
  dateTo?: string;
  /** Bare uuids: an identifier travels namespaced and is resolved before it is sent. */
  performerIds?: readonly string[];
  studioIds?: readonly string[];
  tagIds?: readonly string[];
  match?: MatchMode;
  sort?: SceneSort;
  direction?: Direction;
  page?: number;
  limit?: number;
}

export interface PerformerNarrowing {
  name?: string;
  /**
   * The free text a catalogue writes to tell two people of one name apart. It
   * reads and never parses, so it narrows on what the catalogue wrote and
   * carries no meaning of its own.
   */
  disambiguation?: string;
  /** A two-letter country code, as the catalogues store one. */
  country?: string;
  performedWith?: string;
  studioId?: string;
  sort?: PerformerSort;
  direction?: Direction;
  page?: number;
  limit?: number;
}

export interface FingerprintQuery {
  hash: string;
  algorithm: FingerprintAlgorithm;
}

/** The sort words a caller writes, and the names the catalogues take. */
const SCENE_SORT_NAMES: Record<SceneSort, string> = {
  date: "DATE",
  title: "TITLE",
  trending: "TRENDING",
  created: "CREATED_AT",
  updated: "UPDATED_AT",
};

const PERFORMER_SORT_NAMES: Record<PerformerSort, string> = {
  name: "NAME",
  birth_date: "BIRTHDATE",
  scene_count: "SCENE_COUNT",
  created: "CREATED_AT",
  updated: "UPDATED_AT",
};

/** What a catalogue reimplementing the interface is given where a caller wrote none. */
const REQUIRED_BY_THE_REIMPLEMENTATION = {
  page: 1,
  limit: 25,
  sceneSort: "DATE",
  performerSort: "NAME",
  direction: "DESC",
} as const;

/* ------------------------------------------------------------ field selection */

/** The category of a site, selected where the catalogue publishes the table. */
function siteSelection(spec: InstanceSpec): string {
  return supports(spec, "site_categories")
    ? "site { id name category { id name } }"
    : "site { id name }";
}

function tagSelection(spec: InstanceSpec): string {
  const category = supports(spec, "tag_categories") ? " category { id name }" : "";
  return `tags { id name deleted${category} }`;
}

/**
 * The count of edits open against a record, selected where the catalogue
 * publishes them. A catalogue that publishes none answers a null that would read
 * as a record nobody has proposed a change to.
 */
function editsSelection(spec: InstanceSpec): string {
  return supports(spec, "pending_edits") ? "edits { status }" : "";
}

/**
 * The reports against a fingerprint, selected where the catalogue counts them.
 * Their absence is what leaves a contest unknown rather than settled.
 */
function fingerprintSelection(spec: InstanceSpec): string {
  const reports = supports(spec, "fingerprint_reports") ? " reports" : "";
  return `fingerprints { hash algorithm duration submissions${reports} }`;
}

const IMAGES = "images { id url width height }";

/** A studio, with the parent it hangs under and what each identifier addresses now. */
const STUDIO = "studio { id name deleted parent { id name deleted } }";

const CREDITS = "performers { as performer { id name disambiguation deleted merged_into_id } }";

/** The lines a selection is written from, blank ones dropped so the document reads. */
function lines(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join("\n    ");
}

export function sceneSelection(
  spec: InstanceSpec,
  sections: readonly SceneSection[] = ["basic"],
): string {
  return lines([
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
    STUDIO,
    CREDITS,
    tagSelection(spec),
    `urls { url ${siteSelection(spec)} }`,
    editsSelection(spec),
    sections.includes("fingerprints") ? fingerprintSelection(spec) : "",
    sections.includes("images") ? IMAGES : "",
  ]);
}

/** The measurements a record carries about a person, and the marks on them. */
const APPEARANCE = lines([
  "ethnicity",
  "eye_color",
  "hair_color",
  "height",
  "breast_type",
  "cup_size",
  "band_size",
  "waist_size",
  "hip_size",
  "tattoos { location description }",
  "piercings { location description }",
]);

export function performerSelection(
  spec: InstanceSpec,
  sections: readonly PerformerSection[] = ["basic"],
): string {
  const sceneCount = supports(spec, "scene_count") ? "scene_count" : "";
  const studios =
    sections.includes("studios") && supports(spec, "performer_studios")
      ? `studios { scene_count ${STUDIO} }`
      : "";
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
    sceneCount,
    `urls { url ${siteSelection(spec)} }`,
    editsSelection(spec),
    sections.includes("appearance") ? APPEARANCE : "",
    sections.includes("images") ? IMAGES : "",
    studios,
  ]);
}

/**
 * The count beside a page of rows, selected where the catalogue publishes one.
 * A page that carries no count says how many rows it holds and nothing about
 * what the index holds behind it.
 */
function resultSelection(spec: InstanceSpec, rows: string, selection: string): string {
  const count = supports(spec, "index_total") ? "count\n    " : "";
  return `${count}${rows} {\n    ${selection}\n  }`;
}

/* ----------------------------------------------------------------- documents */

/** One record, named by its uuid on the catalogue that minted it. */
export function findSceneRequest(
  spec: InstanceSpec,
  uuid: string,
  sections: readonly SceneSection[] = ["basic"],
): GraphQLRequest {
  return {
    query: `query FindScene($id: ID!) {
  findScene(id: $id) {
    ${sceneSelection(spec, sections)}
  }
}`,
    variables: { id: uuid },
  };
}

export function findPerformerRequest(
  spec: InstanceSpec,
  uuid: string,
  sections: readonly PerformerSection[] = ["basic"],
): GraphQLRequest {
  return {
    query: `query FindPerformer($id: ID!) {
  findPerformer(id: $id) {
    ${performerSelection(spec, sections)}
  }
}`,
    variables: { id: uuid },
  };
}

/**
 * What a narrowing identifier addresses on its own catalogue.
 *
 * A narrowing written with an identifier the catalogue has folded selects
 * nothing, and an empty answer to it would read as an index holding no such
 * scene. These carry the least a caller needs to tell the two apart.
 */
export function performerLookupRequest(uuid: string): GraphQLRequest {
  return {
    query: `query FindPerformer($id: ID!) {
  findPerformer(id: $id) {
    id
    name
    deleted
    merged_into_id
  }
}`,
    variables: { id: uuid },
  };
}

export function studioLookupRequest(uuid: string): GraphQLRequest {
  return {
    query: `query FindStudio($id: ID!) {
  findStudio(id: $id) {
    id
    name
    deleted
    parent { id name deleted }
  }
}`,
    variables: { id: uuid },
  };
}

export function tagLookupRequest(spec: InstanceSpec, uuid: string): GraphQLRequest {
  const category = supports(spec, "tag_categories") ? "\n    category { id name }" : "";
  return {
    query: `query FindTag($id: ID!) {
  findTag(id: $id) {
    id
    name
    deleted${category}
  }
}`,
    variables: { id: uuid },
  };
}

/** The faceted scene query, written in the shape the catalogue accepts. */
export function queryScenesRequest(
  spec: InstanceSpec,
  narrowing: SceneNarrowing,
  sections: readonly SceneSection[] = ["basic"],
): GraphQLRequest {
  return {
    query: `query QueryScenes($input: SceneQueryInput!) {
  queryScenes(input: $input) {
    ${resultSelection(spec, "scenes", sceneSelection(spec, sections))}
  }
}`,
    variables: { input: sceneQueryInput(spec, narrowing) },
  };
}

/**
 * The full-text scene search, which reads one page of what its index holds for a
 * string of words.
 */
export function searchScenesRequest(
  spec: InstanceSpec,
  term: string,
  limit: number,
  sections: readonly SceneSection[] = ["basic"],
): GraphQLRequest {
  return {
    query: `query SearchScenes($term: String!, $limit: Int) {
  searchScenes(term: $term, limit: $limit) {
    ${resultSelection(spec, "scenes", sceneSelection(spec, sections))}
  }
}`,
    variables: { term, limit },
  };
}

export function queryPerformersRequest(
  spec: InstanceSpec,
  narrowing: PerformerNarrowing,
  sections: readonly PerformerSection[] = ["basic"],
): GraphQLRequest {
  return {
    query: `query QueryPerformers($input: PerformerQueryInput!) {
  queryPerformers(input: $input) {
    ${resultSelection(spec, "performers", performerSelection(spec, sections))}
  }
}`,
    variables: { input: performerQueryInput(spec, narrowing) },
  };
}

export function searchPerformersRequest(
  spec: InstanceSpec,
  term: string,
  limit: number,
  sections: readonly PerformerSection[] = ["basic"],
): GraphQLRequest {
  return {
    query: `query SearchPerformers($term: String!, $limit: Int) {
  searchPerformers(term: $term, limit: $limit) {
    ${resultSelection(spec, "performers", performerSelection(spec, sections))}
  }
}`,
    variables: { term, limit },
  };
}

/**
 * The records a set of hashes reaches, answered as one group per hash asked, so
 * a record that came back can be attributed to the hash that found it.
 */
export function fingerprintRequest(
  spec: InstanceSpec,
  fingerprints: readonly FingerprintQuery[],
  sections: readonly SceneSection[] = ["basic", "fingerprints"],
): GraphQLRequest {
  return {
    query: `query FindScenesBySceneFingerprints($fingerprints: [FingerprintQueryInput!]!) {
  findScenesBySceneFingerprints(fingerprints: $fingerprints) {
    ${sceneSelection(spec, sections)}
  }
}`,
    variables: {
      fingerprints: fingerprints.map((print) => ({
        hash: print.hash,
        algorithm: print.algorithm,
      })),
    },
  };
}

/* -------------------------------------------------------------------- inputs */

/** A list of identifiers, with what it takes for a row to satisfy it. */
function identifierCriterion(
  ids: readonly string[] | undefined,
  match: MatchMode | undefined,
): Record<string, unknown> | undefined {
  if (ids === undefined || ids.length === 0) return undefined;
  return { value: [...ids], modifier: match === "any" ? "INCLUDES" : "INCLUDES_ALL" };
}

/**
 * A window on release dates, written as the one criterion the catalogues take.
 * A single bound is an open interval on that side, and naming the other bound
 * would narrow the question past what was asked.
 */
function dateCriterion(
  from: string | undefined,
  to: string | undefined,
): Record<string, unknown> | undefined {
  if (from !== undefined && to !== undefined) {
    return { value: from, value2: to, modifier: "BETWEEN" };
  }
  if (from !== undefined) return { value: from, modifier: "GREATER_THAN" };
  if (to !== undefined) return { value: to, modifier: "LESS_THAN" };
  return undefined;
}

function put(input: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) input[key] = value;
}

function sceneQueryInput(spec: InstanceSpec, narrowing: SceneNarrowing): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  put(input, "title", narrowing.title);
  put(input, "code", narrowing.code);
  put(input, "date", dateCriterion(narrowing.dateFrom, narrowing.dateTo));
  put(input, "performers", identifierCriterion(narrowing.performerIds, narrowing.match));
  put(input, "studios", identifierCriterion(narrowing.studioIds, narrowing.match));
  put(input, "tags", identifierCriterion(narrowing.tagIds, narrowing.match));
  put(input, "page", narrowing.page);
  put(input, "per_page", narrowing.limit);
  put(input, "sort", narrowing.sort === undefined ? undefined : SCENE_SORT_NAMES[narrowing.sort]);
  put(input, "direction", narrowing.direction?.toUpperCase());

  if (spec.dialect === "loose") {
    // This interface refuses a scene query written without them, so the request
    // carries what the caller asked for and the catalogue's own requirement
    // where the caller asked for nothing.
    input.page ??= REQUIRED_BY_THE_REIMPLEMENTATION.page;
    input.per_page ??= REQUIRED_BY_THE_REIMPLEMENTATION.limit;
    input.sort ??= REQUIRED_BY_THE_REIMPLEMENTATION.sceneSort;
    input.direction ??= REQUIRED_BY_THE_REIMPLEMENTATION.direction;
  }
  return input;
}

function performerQueryInput(
  spec: InstanceSpec,
  narrowing: PerformerNarrowing,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  put(input, "name", narrowing.name);
  put(input, "disambiguation", narrowing.disambiguation);
  put(input, "country", narrowing.country);
  put(input, "performed_with", narrowing.performedWith);
  put(input, "studio_id", narrowing.studioId);
  put(input, "page", narrowing.page);
  put(input, "per_page", narrowing.limit);
  put(
    input,
    "sort",
    narrowing.sort === undefined ? undefined : PERFORMER_SORT_NAMES[narrowing.sort],
  );
  put(input, "direction", narrowing.direction?.toUpperCase());

  if (spec.dialect === "loose") {
    input.page ??= REQUIRED_BY_THE_REIMPLEMENTATION.page;
    input.per_page ??= REQUIRED_BY_THE_REIMPLEMENTATION.limit;
    input.sort ??= REQUIRED_BY_THE_REIMPLEMENTATION.performerSort;
    input.direction ??= REQUIRED_BY_THE_REIMPLEMENTATION.direction;
  }
  return input;
}
