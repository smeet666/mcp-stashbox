/**
 * The catalogues this client reads, and what each of them can answer.
 *
 * Four instances run one published open-source catalogue server. A fifth
 * reimplements its interface from a source of its own, which is close enough to
 * share this adapter and far enough that the adapter has to know which one it is
 * talking to. Every divergence below was measured against a live endpoint, and
 * each exists because an answer would otherwise have described an instance as
 * something it is not.
 */

export type InstanceId = "stashdb" | "tpdb" | "fansdb" | "pmv" | "javstash";

export type Capability =
  /** The plural full-text search over scenes. */
  | "search_scenes"
  /** The plural full-text search over performers. */
  | "search_performers"
  | "get_scene"
  | "get_performer"
  | "find_by_fingerprint"
  /** Publishes the table sorting the sites its records link to. */
  | "site_categories"
  /** Publishes how many people disputed a fingerprint. */
  | "fingerprint_reports"
  /**
   * Publishes, beside a page of rows, how many records its index holds for the
   * question. A catalogue whose count echoes the page size publishes none.
   */
  | "index_total"
  /** Publishes the status of an edit, which is what makes an open one countable. */
  | "pending_edits";

/**
 * How strictly an instance types its interface.
 *
 * `strict` is the published software: a fingerprint algorithm is an enumeration,
 * and a scene query's paging arguments are optional. `loose` takes the algorithm
 * as free text and requires the page, the sort and the direction. Sending one
 * request shape to both makes one of them refuse it.
 */
export type Dialect = "strict" | "loose";

export interface InstanceSpec {
  id: InstanceId;
  /** The name the instance calls itself, used wherever an answer names it. */
  name: string;
  endpoint: string;
  /** Address a record's `source_url` is built from. */
  webBase: string;
  /** Environment variable carrying this instance's key. */
  envVar: string;
  capabilities: readonly Capability[];
  dialect: Dialect;
}

const FULL: readonly Capability[] = [
  "search_scenes",
  "search_performers",
  "get_scene",
  "get_performer",
  "find_by_fingerprint",
  "site_categories",
  "fingerprint_reports",
  "index_total",
  "pending_edits",
];

export const INSTANCES: readonly InstanceSpec[] = [
  {
    id: "stashdb",
    name: "StashDB",
    endpoint: "https://stashdb.org/graphql",
    webBase: "https://stashdb.org",
    envVar: "STASHBOX_STASHDB_KEY",
    capabilities: FULL,
    dialect: "strict",
  },
  {
    id: "tpdb",
    name: "ThePornDB",
    endpoint: "https://theporndb.net/graphql",
    webBase: "https://theporndb.net",
    envVar: "STASHBOX_TPDB_KEY",
    // The plural text searches are absent, it publishes no table of sites, a
    // fingerprint there carries no report count, and the count beside a page of
    // rows echoes the page size instead of stating what its index holds.
    capabilities: ["get_scene", "get_performer", "find_by_fingerprint"],
    dialect: "loose",
  },
  {
    id: "fansdb",
    name: "FansDB",
    endpoint: "https://fansdb.cc/graphql",
    webBase: "https://fansdb.cc",
    envVar: "STASHBOX_FANSDB_KEY",
    capabilities: FULL,
    dialect: "strict",
  },
  {
    id: "pmv",
    name: "PMV Stash",
    endpoint: "https://pmvstash.org/graphql",
    webBase: "https://pmvstash.org",
    envVar: "STASHBOX_PMV_KEY",
    capabilities: FULL,
    dialect: "strict",
  },
  {
    id: "javstash",
    name: "JAVStash",
    endpoint: "https://javstash.org/graphql",
    webBase: "https://javstash.org",
    envVar: "STASHBOX_JAVSTASH_KEY",
    capabilities: FULL,
    dialect: "strict",
  },
];

export const INSTANCE_IDS: readonly InstanceId[] = INSTANCES.map((spec) => spec.id);

export function instanceById(id: string): InstanceSpec | undefined {
  return INSTANCES.find((spec) => spec.id === id);
}

export function supports(spec: InstanceSpec, capability: Capability): boolean {
  return spec.capabilities.includes(capability);
}

/** The name to use when an answer has to say which catalogue it means. */
export function instanceName(id: InstanceId): string {
  return instanceById(id)?.name ?? id;
}
