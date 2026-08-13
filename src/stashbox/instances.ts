/**
 * The catalogues this server holds an address for, and what each was measured
 * to answer.
 *
 * **Every capability here was measured, and names the route it was measured
 * on.** Nothing is inherited from the software a catalogue is believed to run.
 * That inference is not a shortcut, it is the defect: a constant naming every
 * route was applied to a catalogue whose route names differ, its requests came
 * back refused, and the refusals were published as a claim that the catalogue
 * answered no search at all. It answers two, under names of its own.
 *
 * A capability is therefore three things at once: the name a caller reads, the
 * route it was seen on, and the day it was seen. A claim with no date behind it
 * is a claim nobody can check, and this file is what `get_sources` publishes.
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
  /** What this catalogue was measured answering. A route absent here is never asked. */
  capabilities: readonly Capability[];
  /** The route each capability was measured on, in that catalogue's own spelling. */
  routes: Partial<Record<Capability, string>>;
  /** The day the surface above was read from the catalogue itself. */
  measuredAt: string;
  /**
   * Fields a faceted query of this catalogue refuses to be written without.
   * One of them requires an order on every faceted route it answers.
   */
  requiresOrder?: boolean;
}

/**
 * The routes the published open-source server was measured answering, on the
 * instance that runs it in its reference form.
 *
 * Three catalogues below share this set because each was measured, not because
 * one of them was taken as a model for the others. A catalogue whose surface has
 * never been read carries no capability at all, and a route absent from a spec
 * is a route this server never puts to it.
 */
const READ_ON_STASHDB: Partial<Record<Capability, string>> = {
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

export const INSTANCES: readonly InstanceSpec[] = [
  {
    id: "stashdb",
    name: "StashDB",
    endpoint: "https://stashdb.org/graphql",
    webBase: "https://stashdb.org",
    envVar: "STASHBOX_STASHDB_KEY",
    capabilities: Object.keys(READ_ON_STASHDB) as Capability[],
    routes: READ_ON_STASHDB,
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
    measuredAt: "2026-08-13",
    requiresOrder: true,
  },
  {
    id: "fansdb",
    name: "FansDB",
    endpoint: "https://fansdb.cc/graphql",
    webBase: "https://fansdb.cc",
    envVar: "STASHBOX_FANSDB_KEY",
    capabilities: Object.keys(READ_ON_STASHDB) as Capability[],
    routes: READ_ON_STASHDB,
    measuredAt: "2026-08-13",
  },
  {
    id: "pmv",
    name: "PMV Stash",
    endpoint: "https://pmvstash.org/graphql",
    webBase: "https://pmvstash.org",
    envVar: "STASHBOX_PMV_KEY",
    capabilities: Object.keys(READ_ON_STASHDB) as Capability[],
    routes: READ_ON_STASHDB,
    measuredAt: "2026-08-13",
  },
  {
    id: "javstash",
    name: "JAVStash",
    endpoint: "https://javstash.org/graphql",
    webBase: "https://javstash.org",
    envVar: "STASHBOX_JAVSTASH_KEY",
    capabilities: Object.keys(READ_ON_STASHDB) as Capability[],
    routes: READ_ON_STASHDB,
    measuredAt: "2026-08-13",
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

/** The route a catalogue answers a capability on, in its own spelling. */
export function routeFor(spec: InstanceSpec, capability: Capability): string | undefined {
  return spec.routes[capability];
}

/** The catalogue a web address names, where the registry holds one for that host. */
export function instanceByUrl(url: string): InstanceSpec | undefined {
  return INSTANCES.find((instance) => url.startsWith(`${instance.webBase}/`));
}
