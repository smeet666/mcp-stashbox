/**
 * The five catalogues this server reads, and what each of them answers.
 *
 * The capability list is the single register of truth for what a catalogue
 * offers. It exists because a field a catalogue was never asked for comes back
 * empty, and an emptiness that was never a question reads as an answer: a
 * caller must be able to tell a record that holds nothing from a catalogue that
 * was never in a position to say. Every route consults `supports` before it
 * asks, so a silence in an answer can always be named.
 */

/**
 * The things a catalogue can be asked for, each one a route or a field that can
 * be absent.
 *
 * The first five are whole routes. The rest are fields a catalogue either
 * publishes or does not, and each earned its place by being measured: a field
 * one catalogue carries and another leaves empty comes back as a null that
 * reads like an answer, so the answer has to be able to say which of the two it
 * was.
 */
export const CAPABILITIES = [
  "search_scenes",
  "search_performers",
  "get_scene",
  "get_performer",
  "find_by_fingerprint",
  /** A table sorting the sites a record links to, so a link can name a category. */
  "site_categories",
  /** A taxonomy sorting the tags a record carries, so a tag can name a category. */
  "tag_categories",
  /** A count of the reports against a fingerprint, without which a contest is unknown. */
  "fingerprint_reports",
  /** A count of what the index holds for a question, beyond the page returned. */
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
 * How a request has to be written for a catalogue to accept it.
 *
 * `strict` is the shape the published open-source server takes. `loose` marks a
 * catalogue that reimplements that interface over a source of its own: it names
 * fingerprint algorithms in free text and requires a page, a sort and a
 * direction on a scene query, so a request built for the published shape is
 * refused outright.
 */
export type Dialect = "strict" | "loose";

export type InstanceId = "stashdb" | "tpdb" | "fansdb" | "pmv" | "javstash";

export interface InstanceSpec {
  id: InstanceId;
  /** The name the catalogue calls itself, which is the name an answer credits. */
  name: string;
  endpoint: string;
  /** The address a source_url is built from, with no trailing slash so a path appends cleanly. */
  webBase: string;
  /** The environment variable holding the key for this catalogue alone. */
  envVar: string;
  /** What this catalogue answers. A route absent from here is never asked for. */
  capabilities: readonly Capability[];
  dialect: Dialect;
}

/** Everything the published open-source server answers, which is every route. */
const PUBLISHED_SOFTWARE_CAPABILITIES: readonly Capability[] = CAPABILITIES;

export const INSTANCES: readonly InstanceSpec[] = [
  {
    id: "stashdb",
    name: "StashDB",
    endpoint: "https://stashdb.org/graphql",
    webBase: "https://stashdb.org",
    envVar: "STASHBOX_STASHDB_KEY",
    capabilities: PUBLISHED_SOFTWARE_CAPABILITIES,
    dialect: "strict",
  },
  {
    id: "tpdb",
    name: "ThePornDB",
    endpoint: "https://theporndb.net/graphql",
    webBase: "https://theporndb.net",
    envVar: "STASHBOX_TPDB_KEY",
    // It answers a record it is handed an identifier for, and it joins on a
    // fingerprint. It offers no plural search over its own index, publishes no
    // table of the sites it knows, and counts fingerprint submissions without
    // ever counting disputes, so a category and a report count stay null on
    // its records instead of being borrowed from a catalogue that has them.
    capabilities: ["get_scene", "get_performer", "find_by_fingerprint"],
    dialect: "loose",
  },
  {
    id: "fansdb",
    name: "FansDB",
    endpoint: "https://fansdb.cc/graphql",
    webBase: "https://fansdb.cc",
    envVar: "STASHBOX_FANSDB_KEY",
    capabilities: PUBLISHED_SOFTWARE_CAPABILITIES,
    dialect: "strict",
  },
  {
    id: "pmv",
    name: "PMV Stash",
    endpoint: "https://pmvstash.org/graphql",
    webBase: "https://pmvstash.org",
    envVar: "STASHBOX_PMV_KEY",
    capabilities: PUBLISHED_SOFTWARE_CAPABILITIES,
    dialect: "strict",
  },
  {
    id: "javstash",
    name: "JAVStash",
    endpoint: "https://javstash.org/graphql",
    webBase: "https://javstash.org",
    envVar: "STASHBOX_JAVSTASH_KEY",
    capabilities: PUBLISHED_SOFTWARE_CAPABILITIES,
    dialect: "strict",
  },
];

/**
 * The spec an identifier names, or nothing.
 *
 * The match is exact: an identifier travels inside a record identifier and in
 * configuration, and folding case here would let two spellings of one
 * catalogue circulate.
 */
export function instanceById(id: string): InstanceSpec | undefined {
  return INSTANCES.find((instance) => instance.id === id);
}

/**
 * Whether a catalogue answers a route.
 *
 * Callers ask this and never read the dialect: the dialect says how a request
 * is written, and two catalogues sharing a dialect can still answer different
 * routes.
 */
export function supports(spec: InstanceSpec, capability: Capability): boolean {
  return spec.capabilities.includes(capability);
}
