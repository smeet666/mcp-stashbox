/**
 * The catalogues this server holds an address for, and what each was read to
 * answer.
 *
 * **Every capability here was read from the catalogue itself, and names the
 * route it was read on.** Nothing is inherited from the software a catalogue is
 * believed to run. Two catalogues answering one capability name the route
 * differently, one plural and one singular, so a request written in the other's
 * spelling comes back refused, and a refusal read as a limit publishes a claim
 * about a catalogue that nothing measured.
 *
 * A capability is therefore four things at once: the name a caller reads, the
 * route it was seen on, the kind of evidence it was seen by, and the day it was
 * seen. A claim with no date behind it is a claim nobody can check, a claim
 * with no evidence named beside it is a claim a caller reads as stronger than
 * it is, and this file is what `get_sources` publishes.
 *
 * **What a catalogue answers and what this operator can reach are two facts.**
 * Nothing here knows about keys. A catalogue with no key is a catalogue nobody
 * asked, which the answer states in its own words.
 */

/**
 * The closed set of things a catalogue can be said to do.
 *
 * The first nine are routes. The rest are fields a record carries, and a
 * catalogue lacking one publishes no such thing at all, which is a different
 * fact from a record leaving it empty.
 */
export const CAPABILITIES = [
  "search_scenes",
  "search_performers",
  "search_studios",
  "search_tags",
  "get_scene",
  "get_performer",
  "get_studio",
  "get_tag",
  "find_by_fingerprint",
  /** A table sorting the sites a record links to, so a link can name a category. */
  "site_categories",
  /** A taxonomy sorting the tags a record carries, so a tag can name a category. */
  "tag_categories",
  /** A count of the reports against a fingerprint, without which a contest is unknown. */
  "fingerprint_reports",
  /** A count of what the index holds for a question, the page returned included. */
  "index_total",
  /** A count of the edits open against a record, without which revision is unknown. */
  "pending_edits",
  /** A fingerprint route that searches perceptual hashes and not only exact ones. */
  "perceptual_lookup",
  /** A count of the scenes indexed crediting a performer. */
  "scene_count",
  /** The table of studios a performer is credited on. */
  "performer_studios",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * What the capabilities of one catalogue rest on.
 *
 * `measured_answering` names routes this server put to the catalogue and saw
 * answered, and a nightly suite puts every one of them again. `declared_in_schema`
 * names routes the catalogue's own GraphQL schema publishes, read from its
 * endpoint by introspection: the catalogue declares them, and no request has
 * shown what comes back. The two are different evidence, and folding them into
 * one word tells a caller a call has been exercised when nothing has.
 */
export const EVIDENCE = ["measured_answering", "declared_in_schema"] as const;

export type Evidence = (typeof EVIDENCE)[number];

/**
 * The typed narrowing, named as the table names a capability.
 *
 * A capability answers what a catalogue does and cannot qualify it. One
 * catalogue takes a search of scenes and of performers and answers only the
 * text form of either: its faceted routes accept a request carrying narrowings
 * and answer rows that ignore them, which `facetedSearch` records. A table
 * listing those searches with nothing beside them states a capability a caller
 * plans a typed call against, and the limit reaches them once the call comes
 * back. The word is declared here so the table publishes what was measured.
 */
export const FACETED_SEARCH = "faceted_search";

export type InstanceId = "stashdb" | "tpdb" | "fansdb" | "pmv" | "javstash";

export interface InstanceSpec {
  id: InstanceId;
  /** The name the catalogue calls itself, which is the name an answer credits. */
  name: string;
  endpoint: string;
  /** The address a source_url is built from, with no trailing slash. */
  webBase: string;
  /** The environment variable holding the key for this catalogue alone. */
  envVar: string;
  /** What this catalogue was read to answer. A route absent here is never asked. */
  capabilities: readonly Capability[];
  /** The route each capability was read on, in that catalogue's own spelling. */
  routes: Partial<Record<Capability, string>>;
  /**
   * What a text search route was measured answering with.
   *
   * A `page` carries the rows under a key of its own beside a count of what the
   * index holds; a `list` is the rows and nothing else. Two catalogues answer
   * one capability in the two different shapes, so reading either as the other
   * makes the request fail validation before a row is ever seen.
   */
  answersWith: Partial<Record<Capability, "list" | "page">>;
  /**
   * How a faceted filter has to be written for this catalogue to take it.
   *
   * `criteria` wraps a filter in an object carrying a value and a comparison.
   * `plain` takes the value itself, and declares no comparison at all: a
   * catalogue reading one shape refuses the other outright, before a row is
   * ever seen.
   */
  filters: "criteria" | "plain";
  /**
   * The faceted filters this catalogue's input declares, where it declares
   * fewer than the reference instance. A filter absent here is one the
   * catalogue cannot receive, which is a limit of the catalogue and is
   * reported as one.
   */
  facets?: readonly string[];
  /**
   * Whether this catalogue's faceted routes answer the narrowings written to
   * them.
   *
   * Measured on 2026-08-13: one of them answers a page whose rows are null on
   * every scene query, and answers a performer query with rows that ignore the
   * name written. Rows that ignore a narrowing are worse than none, since a
   * caller reads them as the answer to what they asked. A catalogue marked
   * false here is asked through its text route alone, and a question written
   * with typed arguments reports it as never asked.
   */
  facetedSearch: boolean;
  /**
   * What the table above rests on, which a caller planning calls needs as much
   * as the table. A catalogue read by introspection alone carries every word of
   * it as a declaration, `facetedSearch` included: whether a faceted route
   * applies the narrowings written to it is a thing a request shows and a
   * schema cannot state.
   */
  evidence: Evidence;
  /** The day that evidence was gathered from the catalogue itself. */
  measuredAt: string;
  /**
   * Fields a faceted query of this catalogue refuses to be written without.
   * One of them requires an order on every faceted route it answers.
   */
  requiresOrder?: boolean;
}

/**
 * The surface four of these catalogues each declare.
 *
 * Every one of them was introspected on its own endpoint on the day named in
 * its entry, and the four declare the same route names, the same record fields
 * and the same result shapes. They share this constant because four readings
 * agreed, and a catalogue whose surface has never been read carries no
 * capability at all: a route absent from a spec is one this server never puts
 * to that catalogue.
 *
 * One of the four was also put every one of these routes and answered them.
 * That difference is the `evidence` of each entry rather than a difference of
 * route names, and where a reading disagreed the entry says so on its own
 * rather than bending this constant to fit.
 */
const READ_ON_FOUR: Partial<Record<Capability, string>> = {
  search_scenes: "searchScenes",
  search_performers: "searchPerformers",
  search_studios: "searchStudio",
  search_tags: "searchTag",
  get_scene: "findScene",
  get_performer: "findPerformer",
  get_studio: "findStudio",
  get_tag: "findTag",
  find_by_fingerprint: "findScenesBySceneFingerprints",
  site_categories: "querySiteCategories",
  tag_categories: "queryTagCategories",
  fingerprint_reports: "findScene.fingerprints.reports",
  index_total: "queryScenes.count",
  pending_edits: "findScene.edits",
  perceptual_lookup: "findScenesBySceneFingerprints",
  scene_count: "findPerformer.scene_count",
  performer_studios: "findPerformer.studios",
};

/** The shape each search route of those four declares its answer in. */
const SHAPES_ON_FOUR: Partial<Record<Capability, "list" | "page">> = {
  search_scenes: "page",
  search_performers: "page",
  search_studios: "list",
  search_tags: "list",
};

export const INSTANCES: readonly InstanceSpec[] = [
  {
    id: "stashdb",
    name: "StashDB",
    endpoint: "https://stashdb.org/graphql",
    webBase: "https://stashdb.org",
    envVar: "STASHBOX_STASHDB_KEY",
    capabilities: Object.keys(READ_ON_FOUR) as Capability[],
    routes: READ_ON_FOUR,
    answersWith: SHAPES_ON_FOUR,
    filters: "criteria",
    facetedSearch: true,
    // Every route above was put to it and answered, and the live suite puts
    // each of them again on every run.
    evidence: "measured_answering",
    measuredAt: "2026-08-13",
  },
  {
    id: "tpdb",
    name: "ThePornDB",
    endpoint: "https://theporndb.net/graphql",
    webBase: "https://theporndb.net",
    envVar: "STASHBOX_TPDB_KEY",
    // Measured on its own query type, which declares eleven routes. It searches
    // scenes and performers under names of its own, reads one studio and one
    // tag by identifier or by name, and offers no search of either. It counts
    // fingerprint submissions and never disputes, publishes no table of the
    // sites it links to and no taxonomy of the tags it carries, and its
    // faceted routes refuse a request written without an order.
    capabilities: [
      "search_scenes",
      "search_performers",
      "get_scene",
      "get_performer",
      "get_studio",
      "get_tag",
      "find_by_fingerprint",
    ],
    routes: {
      search_scenes: "searchScene",
      search_performers: "searchPerformer",
      get_scene: "findScene",
      get_performer: "findPerformer",
      get_studio: "findStudio",
      get_tag: "findTag",
      find_by_fingerprint: "findScenesBySceneFingerprints",
    },
    // Its two search routes answer with the rows alone, where the reference
    // instance wraps them in a page carrying a count of its own.
    answersWith: { search_scenes: "list", search_performers: "list" },
    // It reimplements the field names of the reference instance and takes each
    // of them as the value itself, declaring no comparison anywhere. A request
    // written as a criterion is refused before a row is seen.
    filters: "plain",
    facetedSearch: false,
    // Its scene input declares no reference of the studio's own, so that
    // narrowing is one it cannot receive.
    facets: [
      "text",
      "title",
      "url",
      "date",
      "production_date",
      "studios",
      "parentStudio",
      "tags",
      "performers",
      "alias",
      "fingerprints",
      "page",
      "per_page",
      "direction",
      "sort",
      "names",
      "name",
      "disambiguation",
      "gender",
      "birthdate",
      "deathdate",
      "birth_year",
      "age",
      "ethnicity",
      "country",
      "career_start_year",
      "career_end_year",
      "performed_with",
      "studio_id",
    ],
    // Its routes were read from its schema and then put to it, which is how
    // the two searches it answers were found under names of its own.
    evidence: "measured_answering",
    measuredAt: "2026-08-13",
    requiresOrder: true,
  },
  {
    id: "fansdb",
    name: "FansDB",
    endpoint: "https://fansdb.cc/graphql",
    webBase: "https://fansdb.cc",
    envVar: "STASHBOX_FANSDB_KEY",
    capabilities: Object.keys(READ_ON_FOUR) as Capability[],
    routes: READ_ON_FOUR,
    answersWith: SHAPES_ON_FOUR,
    filters: "criteria",
    facetedSearch: true,
    // Introspected on its own endpoint, which needs no key. No request has
    // been put to it from here, so every word of its table is what it
    // declares.
    evidence: "declared_in_schema",
    measuredAt: "2026-08-14",
  },
  {
    id: "pmv",
    name: "PMV Stash",
    endpoint: "https://pmvstash.org/graphql",
    webBase: "https://pmvstash.org",
    envVar: "STASHBOX_PMV_KEY",
    capabilities: Object.keys(READ_ON_FOUR) as Capability[],
    routes: READ_ON_FOUR,
    answersWith: SHAPES_ON_FOUR,
    filters: "criteria",
    facetedSearch: true,
    // Its records carry the studio's own reference for a release, and its
    // scene input declares no field to narrow on one. Every other faceted
    // field it declares matches what the other three answer.
    facets: [
      "text",
      "title",
      "url",
      "date",
      "production_date",
      "studios",
      "parentStudio",
      "tags",
      "performers",
      "alias",
      "fingerprints",
      "favorites",
      "has_fingerprint_submissions",
      "page",
      "per_page",
      "direction",
      "sort",
      "names",
      "name",
      "disambiguation",
      "gender",
      "birthdate",
      "deathdate",
      "birth_year",
      "age",
      "ethnicity",
      "country",
      "career_start_year",
      "career_end_year",
      "performed_with",
      "studio_id",
      "parent",
      "has_parent",
      "category_id",
    ],
    // Introspected on its own endpoint, which needs no key. No request has
    // been put to it from here, so every word of its table is what it
    // declares.
    evidence: "declared_in_schema",
    measuredAt: "2026-08-14",
  },
  {
    id: "javstash",
    name: "JAVStash",
    endpoint: "https://javstash.org/graphql",
    webBase: "https://javstash.org",
    envVar: "STASHBOX_JAVSTASH_KEY",
    capabilities: Object.keys(READ_ON_FOUR) as Capability[],
    routes: READ_ON_FOUR,
    answersWith: SHAPES_ON_FOUR,
    filters: "criteria",
    facetedSearch: true,
    // Introspected on its own endpoint, which needs no key. No request has
    // been put to it from here, so every word of its table is what it
    // declares.
    evidence: "declared_in_schema",
    measuredAt: "2026-08-14",
  },
];

/**
 * The spec an identifier names, or nothing.
 *
 * The match is exact: an identifier travels inside a record identifier and in
 * configuration, and folding case here would let two spellings of one catalogue
 * circulate.
 */
export function instanceById(id: string): InstanceSpec | undefined {
  return INSTANCES.find((instance) => instance.id === id);
}

/**
 * Whether a catalogue was measured answering something.
 *
 * Callers ask this. What a route is called on that catalogue is `routes`, and
 * the two are apart because two catalogues answering one capability can name it
 * differently, which is exactly the case that made this file what it is.
 */
export function supports(spec: InstanceSpec, capability: Capability): boolean {
  return spec.capabilities.includes(capability);
}

/** What a catalogue's text search answers with, which two of them shape differently. */
export function answersWith(spec: InstanceSpec, capability: Capability): "list" | "page" {
  return spec.answersWith[capability] ?? "list";
}

/** The route a catalogue answers a capability on, in its own spelling. */
export function routeFor(spec: InstanceSpec, capability: Capability): string | undefined {
  return spec.routes[capability];
}

/** The catalogue a web address names, where the registry holds one for that host. */
export function instanceByUrl(url: string): InstanceSpec | undefined {
  return INSTANCES.find((instance) => url.startsWith(`${instance.webBase}/`));
}
