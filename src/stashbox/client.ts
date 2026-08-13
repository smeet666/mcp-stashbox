/**
 * The layer that reaches the catalogues, and the only one that does.
 *
 * Nothing above it holds an address, a key or a pace. Four rules shape it, and
 * all four come from the one rule this server keeps.
 *
 * **A catalogue is asked only what it was measured answering.** A question that
 * reaches a route a catalogue does not answer comes back refused, and the
 * refusal reads as a fact about the catalogue. So the registry decides who is
 * asked, and a catalogue left out is reported as never asked rather than
 * dropped from the answer.
 *
 * **Three states, never collapsed.** A catalogue that answered, one that could
 * not, and one nobody asked leave here as three different reports, and only the
 * first is evidence about the world.
 *
 * **A record is read on every catalogue that holds it**, reached by the link
 * each of them publishes to the same record elsewhere. That link is an
 * assertion an editor wrote, so following it states nothing new; a shared name
 * is never followed.
 *
 * **The pace is owed and cannot be lowered.** One request at a time per
 * catalogue, with a floor the configuration may widen and never narrow.
 */

import {
  createLogger,
  loadConfig,
  MIN_ALLOWED_INTERVAL_MS,
  type Config,
  type Logger,
} from "../config.js";
import { StashboxError } from "../errors.js";
import type { Card, Read, Reading, RowsResult, SourceReport } from "../types.js";
import { consolidate } from "../answer/card.js";
import { Cache, cacheKey } from "./cache.js";
import { createHttpTransport, type GraphQLRequest, type HttpTransport } from "./graphql.js";
import { parseId } from "./identifiers.js";
import {
  INSTANCES,
  instanceById,
  supports,
  type Capability,
  type InstanceId,
  type InstanceSpec,
} from "./instances.js";
import {
  facetedRequest,
  fingerprintRequest,
  performerQueryInput,
  recordRequest,
  sceneQueryInput,
  searchRequest,
  studioQueryInput,
  tagQueryInput,
  type Fingerprint,
  type Kind,
  type RecordKind,
} from "./queries.js";
import {
  arrayUnder,
  objectUnder,
  recordUnder,
  readPerformer,
  readScene,
  readStudio,
  readTag,
  rowsUnder,
  groupsUnder,
} from "./read.js";
import { RateLimiter } from "./rateLimiter.js";

const ROWS_PER_PAGE = 25;

/** The kinds of record, and what each is read and consolidated as. */
const SHAPES: Record<RecordKind, { scalars: string[]; lists: string[]; perSource: string[] }> = {
  scene: {
    scalars: [
      "title",
      "details",
      "code",
      "director",
      "durationSeconds",
      "releaseDate",
      "productionDate",
      "studio",
    ],
    lists: ["performers", "tags", "urls", "images", "fingerprints"],
    perSource: [],
  },
  performer: {
    scalars: [
      "name",
      "disambiguation",
      "gender",
      "country",
      "birthDate",
      "deathDate",
      "careerStartYear",
      "careerEndYear",
      "appearance",
    ],
    lists: ["aliases", "urls", "images", "studios"],
    perSource: ["sceneCount"],
  },
  studio: {
    scalars: ["name", "parent"],
    lists: ["aliases", "urls", "images"],
    perSource: ["sceneCount"],
  },
  tag: { scalars: ["name", "description", "category"], lists: ["aliases"], perSource: [] },
};

const READERS = {
  scene: readScene,
  performer: readPerformer,
  studio: readStudio,
  tag: readTag,
} as const;

const ROUTE: Record<RecordKind, Capability> = {
  scene: "get_scene",
  performer: "get_performer",
  studio: "get_studio",
  tag: "get_tag",
};

const SEARCH: Record<Kind, Capability> = {
  scenes: "search_scenes",
  performers: "search_performers",
  studios: "search_studios",
  tags: "search_tags",
};

export interface StashboxClientOptions {
  keys?: Partial<Record<InstanceId, string>>;
  config?: Partial<Config>;
  transport?: HttpTransport;
  fetchImpl?: typeof fetch;
  now?: () => string;
  logger?: Logger;
}

/** What a search or a lookup carries back, with what every catalogue did. */
type Answer<T> = Read<RowsResult<T>>;

/** One hash, and the record it reached on one catalogue. */
export interface FingerprintMatch {
  scene: Card;
  algorithm: string;
  matchKind: string;
}

/** One record a hash reached on one catalogue, before the records are put together. */
interface Raw {
  source: InstanceId;
  scene: Record<string, unknown>;
  algorithm: string;
  hash: string;
}

/** What a set of hashes reached, and what every catalogue did with them. */
export interface FingerprintResult {
  matches: FingerprintMatch[];
  match_count: number;
  scenes_matched: number;
  asked: { hash: string; algorithm: string }[];
  perSource: SourceReport[];
}

export class StashboxClient {
  readonly configured: InstanceId[];
  readonly #config: Config;
  readonly #transport: HttpTransport;
  readonly #cache: Cache<unknown>;
  readonly #limiters = new Map<InstanceId, RateLimiter>();
  readonly #now: () => string;

  constructor(options: StashboxClientOptions = {}) {
    const loaded = loadConfig(process.env);
    // A setting written here goes through the same bounds a setting read from
    // the environment goes through. Spread over the loaded configuration, it
    // would reach the transport unread, and the one that governs the pace owed
    // to a free public site would be a suggestion.
    this.#config = held(loaded, options.config, options.keys);
    this.configured = INSTANCES.filter((spec) => this.#config.keys[spec.id] !== undefined).map(
      (spec) => spec.id,
    );
    this.#cache = new Cache(this.#config.cacheTtlMs, this.#config.cacheMaxEntries);
    this.#now = options.now ?? (() => new Date().toISOString());
    // A transport a caller supplies still owes the catalogues their pace: the
    // debt is to the site, not to whoever writes the fetch. Wrapping it here
    // keeps one request at a time and the interval underneath every path,
    // including the one this package publishes as a library.
    this.#transport =
      (options.transport === undefined
        ? undefined
        : {
            request: <T>(spec: InstanceSpec, apiKey: string, body: GraphQLRequest) =>
              this.#limiterFor(spec).schedule(() =>
                (options.transport as HttpTransport).request<T>(spec, apiKey, body),
              ),
          }) ??
      createHttpTransport({
        fetchImpl: options.fetchImpl ?? fetch,
        userAgent: this.#config.userAgent,
        timeoutMs: this.#config.timeoutMs,
        maxRetries: this.#config.maxRetries,
        limiterFor: (spec) => this.#limiterFor(spec),
        logger: options.logger ?? createLogger(this.#config.logLevel),
      });
  }

  /** The interval this client holds to, which no setting takes below the floor. */
  get pace(): number {
    return Math.max(MIN_ALLOWED_INTERVAL_MS, this.#config.minIntervalMs);
  }

  /** The bounds every setting was read through, so a caller can see them. */
  get bounds(): { timeoutMs: number; maxRetries: number; cacheMaxEntries: number } {
    return {
      timeoutMs: this.#config.timeoutMs,
      maxRetries: this.#config.maxRetries,
      cacheMaxEntries: this.#config.cacheMaxEntries,
    };
  }

  /** One pace per catalogue, with a floor the configuration may widen and never narrow. */
  #limiterFor(spec: InstanceSpec): RateLimiter {
    const held = this.#limiters.get(spec.id);
    if (held !== undefined) return held;
    const made = new RateLimiter({ intervalMs: this.pace });
    this.#limiters.set(spec.id, made);
    return made;
  }

  /**
   * The catalogues a question reaches, and a report for every one it does not.
   *
   * Three reasons keep a catalogue out and each is a different fact: no key is
   * held for it, the caller's own list left it out, or it answers no such
   * route. A caller reading "not asked" needs to know which, since two of the
   * three are theirs to change.
   */
  #chooseSources(
    capability: Capability,
    route: string,
    named: readonly InstanceId[] | undefined,
  ): { asks: { spec: InstanceSpec; apiKey: string }[]; unasked: SourceReport[] } {
    const asks: { spec: InstanceSpec; apiKey: string }[] = [];
    const unasked: SourceReport[] = [];
    for (const spec of INSTANCES) {
      const apiKey = this.#config.keys[spec.id];
      const absent = (reason: string) =>
        unasked.push({ source: spec.id, name: spec.name, state: "absent", reason });
      if (apiKey === undefined) {
        absent(
          `No key is configured for ${spec.name}, so it was never asked. Set ${spec.envVar} to read it.`,
        );
      } else if (named !== undefined && !named.includes(spec.id)) {
        absent(`The catalogues named in this call left ${spec.name} out, so it was never asked.`);
      } else if (!supports(spec, capability)) {
        absent(
          `${spec.name} answers no ${route} of its own, so it was never asked, and its silence is no evidence about what it holds.`,
        );
      } else {
        asks.push({ spec, apiKey });
      }
    }
    return { asks, unasked };
  }

  /** One catalogue's answer, or the report of the failure that came back instead. */
  async #ask<T>(
    spec: InstanceSpec,
    apiKey: string,
    request: GraphQLRequest,
    moment: string,
    read: (payload: unknown) => T,
  ): Promise<{ value: T } | { report: SourceReport }> {
    try {
      const payload = await this.#transport.request<unknown>(spec, apiKey, request);
      return { value: read(payload) };
    } catch (cause) {
      const known = cause instanceof StashboxError ? cause : undefined;
      return {
        report: {
          source: spec.id,
          name: spec.name,
          state: "failed",
          moment,
          // A failure carries no count: a number beside a catalogue that
          // returned nothing reads as a catalogue that looked.
          reason:
            known?.message ??
            `${spec.name} could not answer ${moment}, and what came back states nothing about what it holds.`,
          error: known?.code ?? "parse_failure",
        },
      };
    }
  }

  /* ------------------------------------------------------------- searching */

  async #search<T>(
    kind: Kind,
    input: Record<string, unknown>,
    build: (spec: InstanceSpec) => GraphQLRequest & { faceted: boolean; operation: string },
    reader: (value: unknown, spec: InstanceSpec, at: string) => { record: T | null },
  ): Promise<Answer<T>> {
    const named = input.sources as InstanceId[] | undefined;
    const chosen = this.#chooseSources(SEARCH[kind], `${kind.slice(0, -1)} search`, named);
    // A catalogue whose faceted routes do not apply the narrowings written to
    // them answers rows that ignore the question, and a caller reads those as
    // the answer to it. Such a catalogue is asked through its text route alone,
    // and a question narrowed on typed arguments is never put to it.
    const typed = input.query === undefined;
    const asks = chosen.asks.filter((ask) => !typed || ask.spec.facetedSearch);
    const unasked: SourceReport[] = [
      ...chosen.unasked,
      ...chosen.asks
        .filter((ask) => typed && !ask.spec.facetedSearch)
        .map((ask) => ({
          source: ask.spec.id,
          name: ask.spec.name,
          state: "absent" as const,
          reason: `${ask.spec.name} answers a search of words alone: its faceted routes do not apply the narrowings written to them, so a question narrowed on typed arguments was never put to it.`,
        })),
    ];
    const key = cacheKey({
      instance: asks
        .map((ask) => ask.spec.id)
        .sort()
        .join("+"),
      operation: `search_${kind}`,
      // Every catalogue the question reached and every one it did not belongs
      // in the key: a replayed answer carries a reason per catalogue, and one
      // built for a narrower call would state a reason that was never this
      // call's.
      // The question as it was asked, the standing page and size written in:
      // two calls that build one request would otherwise key differently and
      // the catalogue would be asked the same thing twice. The catalogues left
      // out belong here too, with the reason each was left out, since a
      // replayed answer carries a reason per catalogue and one built for a
      // narrower call would state a reason that was never this call's.
      params: {
        asked: {
          ...input,
          page: (input.page as number | undefined) ?? 1,
          limit: (input.limit as number | undefined) ?? ROWS_PER_PAGE,
        },
        unasked: unasked.map((one) => `${one.source}:${one.reason}`).sort(),
      },
    });
    const held = this.#cache.get(key) as RowsResult<T> | undefined;
    if (held !== undefined) return { data: held, cached: true };

    const rows: T[] = [];
    const reports: SourceReport[] = [];
    const results = await Promise.all(
      asks.map(async (ask) => {
        const request = build(ask.spec);
        const at = this.#now();
        const found = await this.#ask(
          ask.spec,
          ask.apiKey,
          request,
          `the ${kind} search`,
          (payload) => {
            const container = request.faceted
              ? (objectUnder(payload, request.operation, ask.spec, `the ${kind} search`) as Record<
                  string,
                  unknown
                >)
              : { [kind]: rowsUnder(payload, request.operation, ask.spec, `the ${kind} search`) };
            const raw = request.faceted
              ? arrayUnder(container, kind, ask.spec, `the ${kind} search`)
              : (container[kind] as unknown[]);
            const read: T[] = [];
            let skipped = 0;
            for (const entry of raw) {
              const one = reader(entry, ask.spec, at);
              if (one.record === null) skipped += 1;
              else read.push(one.record);
            }
            const total =
              supports(ask.spec, "index_total") &&
              typeof (container as { count?: unknown }).count === "number"
                ? (container as { count: number }).count
                : undefined;
            return { read, skipped, total };
          },
        );
        if ("report" in found) return found.report;
        const report: SourceReport = {
          source: ask.spec.id,
          name: ask.spec.name,
          state: "answered",
          count: found.value.read.length,
          ...(found.value.skipped > 0 ? { skipped: found.value.skipped } : {}),
          ...(found.value.total === undefined ? {} : { indexTotal: found.value.total }),
        };
        rows.push(...found.value.read);
        return report;
      }),
    );
    reports.push(...results);

    const perSource = orderByRegistry([...reports, ...unasked]);
    const data: RowsResult<T> = {
      rows,
      perSource,
      ordering:
        asks.length > 1
          ? "interleaved by catalogue, in the order the registry names them, since the catalogues share no measure to order them together by"
          : "in the order the catalogue that answered holds them",
    };
    // An answer holding a failure is a statement about one exchange. Kept, it
    // would become a statement about the catalogue for a whole lifetime.
    if (!perSource.some((one) => one.state === "failed")) this.#cache.set(key, data);
    return { data, cached: false };
  }

  async searchScenes(input: Record<string, unknown> = {}): Promise<Answer<never>> {
    return this.#searchOf("scenes", input) as never;
  }
  async searchPerformers(input: Record<string, unknown> = {}): Promise<Answer<never>> {
    return this.#searchOf("performers", input) as never;
  }
  async searchStudios(input: Record<string, unknown> = {}): Promise<Answer<never>> {
    return this.#searchOf("studios", input) as never;
  }
  async searchTags(input: Record<string, unknown> = {}): Promise<Answer<never>> {
    return this.#searchOf("tags", input) as never;
  }

  #searchOf(kind: Kind, input: Record<string, unknown>): Promise<Answer<unknown>> {
    const words = input.query as string | undefined;
    const page = (input.page as number | undefined) ?? 1;
    const limit = (input.limit as number | undefined) ?? ROWS_PER_PAGE;
    const record = kind.slice(0, -1) as RecordKind;
    const reader = READERS[record] as (
      value: unknown,
      spec: InstanceSpec,
      at: string,
    ) => { record: unknown };

    return this.#search(
      kind,
      input,
      (spec) => {
        if (words !== undefined) {
          const built = searchRequest(spec, kind, words, limit);
          return { ...built, faceted: built.paged };
        }
        // Every identifier a caller wrote names the catalogue that minted it,
        // so this one receives its own and nothing else. Sending the whole
        // list would put another catalogue's identifiers to it, and the
        // refusal that came back would read as a fact about this one.
        const narrowing = { ...shareOf(input, spec.id), page, limit } as never;
        const shaped =
          kind === "scenes"
            ? sceneQueryInput(spec, narrowing)
            : kind === "performers"
              ? performerQueryInput(spec, narrowing)
              : kind === "studios"
                ? studioQueryInput(spec, narrowing)
                : tagQueryInput(spec, narrowing);
        const built = facetedRequest(spec, kind, shaped.input as Record<string, unknown>);
        return { ...built, faceted: true, unreceived: shaped.unreceived };
      },
      reader as never,
    );
  }

  /* ------------------------------------------------------- one record, read */

  /**
   * One record, read on the catalogue its identifier names and on every
   * catalogue that one publishes a link to.
   *
   * The link is followed once: a catalogue reached that way is read, and the
   * links it publishes in turn are not followed again. One hop is what an
   * editor asserted; a second would be this client chaining assertions nobody
   * made together.
   */
  async getCard(
    kind: RecordKind,
    written: string,
    held: Record<string, unknown> = {},
  ): Promise<Read<Card>> {
    const named = held.sources as InstanceId[] | undefined;
    const prefer = (held.prefer as InstanceId[] | undefined) ?? INSTANCES.map((one) => one.id);
    const sections = (held.sections as string[] | undefined) ?? ["basic"];
    const parsed = parseId(written, this.configured);
    const readings: Reading[] = [];
    const replayed = new Set<string>();

    // The catalogues a caller named govern the first reading as much as the
    // ones reached from it: spending a request on a catalogue they excluded
    // asks a question they did not, and the card would then name a holder
    // they asked to leave out.
    const first = await this.#readOne(kind, parsed.instance, parsed.uuid, sections, named);
    readings.push(first.reading);
    if (first.replayed === true) replayed.add(parsed.instance);

    // The catalogues a link reaches are different catalogues, so they are read
    // together: each holds its own pace, and reading them one after another
    // would make one question take as long as the sum of them all.
    const others = first.alsoAt.filter(
      (other) =>
        (named === undefined || named.includes(other.source)) &&
        !readings.some((one) => one.source === other.source),
    );
    const reached = await Promise.all(
      others.map((other) => this.#readOne(kind, other.source, other.uuid, sections, named)),
    );
    for (const [at, next] of reached.entries()) {
      readings.push(next.reading);
      if (next.replayed === true) replayed.add(others[at]?.source ?? "");
    }

    const shape = SHAPES[kind];
    const card = consolidate({
      readings,
      prefer,
      scalars: [...shape.scalars, "sourceUrl", "retrievedAt", "mergedInto"],
      lists: shape.lists,
      perSource: [...shape.perSource, "pendingEdits", "rowsSkipped"],
    });
    // A loss dropped in silence makes the card a record holding less than the
    // catalogue holds, with nothing saying so.
    for (const one of readings) {
      const lost =
        (one.record as { rowsSkipped?: number; rowsSkippedIn?: string[] } | undefined) ?? {};
      if ((lost.rowsSkipped ?? 0) > 0) {
        card.notes.push(
          `${lost.rowsSkipped} row(s) of this record could not be read on ${one.source} and are left out of what it shows, in: ${(lost.rowsSkippedIn ?? []).join(", ")}. That is this client failing to read them and says nothing about what the catalogue holds.`,
        );
      }
    }
    // Replayed only where every catalogue that answered was answered from the
    // store: one live reading makes the card a reading of this moment.
    const answered = readings.filter((one) => one.state === "answered");
    const cached = answered.length > 0 && answered.every((one) => replayed.has(one.source));
    return { data: card, cached };
  }

  async #readOne(
    kind: RecordKind,
    source: InstanceId,
    uuid: string,
    sections: readonly string[],
    named: readonly InstanceId[] | undefined,
  ): Promise<{
    reading: Reading;
    alsoAt: { source: InstanceId; uuid: string }[];
    replayed?: boolean;
  }> {
    const spec = instanceById(source);
    const apiKey = spec === undefined ? undefined : this.#config.keys[spec.id];
    const id = `${source}:${uuid}`;

    if (spec === undefined || apiKey === undefined) {
      return {
        reading: {
          source,
          id,
          state: "absent",
          reason: `No key is configured for ${spec?.name ?? source}, so it was never asked. Set ${spec?.envVar ?? "its key"} to read it.`,
        },
        alsoAt: [],
      };
    }
    if (!supports(spec, ROUTE[kind])) {
      return {
        reading: {
          source,
          id,
          state: "absent",
          reason: `${spec.name} answers no ${kind} of its own, so it was never asked.`,
        },
        alsoAt: [],
      };
    }
    if (named !== undefined && !named.includes(spec.id)) {
      return {
        reading: {
          source,
          id,
          state: "absent",
          reason: `The catalogues named in this call left ${spec.name} out, so it was never asked.`,
        },
        alsoAt: [],
      };
    }

    const request = recordRequest(spec, kind, uuid, sections);
    const key = cacheKey({
      instance: spec.id,
      operation: request.operation,
      params: { uuid, sections: [...sections].sort() },
    });
    const stored = this.#cache.get(key) as Record<string, unknown> | undefined;
    if (stored !== undefined) {
      return {
        reading: { source, id, state: "answered", record: stored },
        alsoAt: alsoAt(stored),
        replayed: true,
      };
    }

    const at = this.#now();
    const found = await this.#ask(spec, apiKey, request, `the ${kind}`, (payload) => {
      // A key the answer does not carry is a shape this client cannot read.
      // The key present and null is the catalogue saying it holds nothing at
      // that identifier, and only that second reading is an absence.
      const container = recordUnder(payload, request.operation, spec, `the ${kind}`);
      if (container === null) return null;
      return READERS[kind](container, spec, at).record;
    });

    if ("report" in found) {
      return {
        reading: {
          source,
          id,
          state: "failed",
          ...(found.report.error === undefined ? {} : { error: found.report.error }),
          ...(found.report.reason === undefined ? {} : { reason: found.report.reason }),
        },
        alsoAt: [],
      };
    }
    const record = found.value as Record<string, unknown> | null;
    if (record === null) {
      return {
        reading: {
          source,
          id,
          // The catalogue looked and holds nothing there, which is an absence
          // it established rather than a reading this client failed at.
          state: "answered",
          reason: `${spec.name} holds no ${kind} at ${id}. Another catalogue may hold the same thing under an identifier of its own.`,
        },
        alsoAt: [],
      };
    }
    this.#cache.set(key, record);
    return { reading: { source, id, state: "answered", record }, alsoAt: alsoAt(record) };
  }

  /** One scene, read on every catalogue that holds it. */
  getScene = (id: string, sections?: readonly string[]) =>
    this.getCard("scene", id, sections === undefined ? {} : { sections });

  /** One performer, read on every catalogue that holds them. */
  getPerformer = (id: string, held: Record<string, unknown> | readonly string[] = {}) =>
    this.getCard(
      "performer",
      id,
      Array.isArray(held) ? { sections: held } : (held as Record<string, unknown>),
    );

  /** One studio, read on every catalogue that holds it. */
  getStudio = (id: string, held: Record<string, unknown> = {}) => this.getCard("studio", id, held);

  /** One tag, read on every catalogue that holds it. */
  getTag = (id: string, held: Record<string, unknown> = {}) => this.getCard("tag", id, held);

  /* ------------------------------------------------------- by fingerprint */

  async findByFingerprint(input: Record<string, unknown>): Promise<Read<FingerprintResult>> {
    const fingerprints = input.fingerprints as Fingerprint[];
    const named = input.sources as InstanceId[] | undefined;
    const { asks, unasked } = this.#chooseSources(
      "find_by_fingerprint",
      "fingerprint lookup",
      named,
    );

    const prefer = (input.prefer as InstanceId[] | undefined) ?? INSTANCES.map((one) => one.id);
    const reports: SourceReport[] = [];
    const raw: Raw[] = [];

    const answered = await Promise.all(
      asks.map(async (ask) => {
        const request = fingerprintRequest(ask.spec, fingerprints);
        const at = this.#now();
        const found = await this.#ask(
          ask.spec,
          ask.apiKey,
          request,
          "the fingerprint lookup",
          (payload) => {
            // The route answers a list of groups, one per hash asked, so the
            // records are one level down. Reading a group as a record loses
            // every row and calls the loss an emptiness.
            const groups = groupsUnder(
              payload,
              request.operation,
              ask.spec,
              "the fingerprint lookup",
            );
            const raw = groups.flat();
            const read: Record<string, unknown>[] = [];
            let skipped = 0;
            for (const entry of raw) {
              const one = readScene(entry, ask.spec, at);
              if (one.record === null) skipped += 1;
              else read.push(one.record as unknown as Record<string, unknown>);
            }
            return { read, skipped };
          },
        );
        if ("report" in found) return found.report;

        let count = 0;
        for (const scene of found.value.read) {
          for (const print of fingerprints) {
            const carried =
              (scene.fingerprints as { hash: string; algorithm: string }[] | undefined) ?? [];
            // A hash is compared for what it is: the catalogues publish it in
            // either case, and a comparison that reads two spellings of one
            // hash as two hashes turns a match into an emptiness.
            if (
              !carried.some(
                (one) =>
                  one.hash.toLowerCase() === print.hash.toLowerCase() &&
                  one.algorithm === print.algorithm,
              )
            )
              continue;
            raw.push({ source: ask.spec.id, scene, algorithm: print.algorithm, hash: print.hash });
            count += 1;
          }
        }
        return {
          source: ask.spec.id,
          name: ask.spec.name,
          state: "answered" as const,
          count,
          records: found.value.read.length,
          ...(found.value.skipped > 0 ? { skipped: found.value.skipped } : {}),
          ...(request.notSearched.length > 0 ? { algorithmsNotSearched: request.notSearched } : {}),
        };
      }),
    );
    reports.push(...answered);

    // One file, one card. Two catalogues answering the same exact hash
    // describe the same bytes, which is the strongest identity the data
    // carries, and both records are already here: consolidating them costs no
    // request. A perceptual hash states a likeness and joins nothing, so its
    // records stay one card per catalogue.
    const byHash = new Map<string, Raw[]>();
    for (const one of raw) {
      const key =
        one.algorithm === "PHASH"
          ? `${one.algorithm} ${one.hash} ${one.source}`
          : `${one.algorithm} ${one.hash}`;
      byHash.set(key, [...(byHash.get(key) ?? []), one]);
    }

    const matches: FingerprintMatch[] = [...byHash.values()].map((group) => {
      const first = group[0] as Raw;
      return {
        scene: consolidate({
          readings: group.map((one) => ({
            source: one.source,
            id: String(one.scene.id),
            state: "answered" as const,
            record: one.scene,
          })),
          prefer: prefer,
          ...SHAPES.scene,
        }),
        algorithm: first.algorithm,
        matchKind: first.algorithm === "PHASH" ? "perceptual_similarity" : "exact_file",
      };
    });

    return {
      data: {
        matches,
        match_count: matches.length,
        // Files, not records: two catalogues answering one exact hash
        // describe the same bytes, and counting their records would add
        // across corpora that overlap by an amount neither publishes.
        scenes_matched: matches.length,
        asked: fingerprints.map((one) => ({ hash: one.hash, algorithm: one.algorithm })),
        perSource: orderByRegistry([...reports, ...unasked]),
      },
      cached: false,
    };
  }
}

/**
 * A setting, read through the bounds it is declared with.
 *
 * The same bounds the environment is read through, applied to what a caller
 * writes: a value outside them is a value this client does not read, whichever
 * way it arrived.
 */
function held(
  loaded: Config,
  written: Partial<Config> | undefined,
  keys: Partial<Record<InstanceId, string>> | undefined,
): Config {
  const bounded = (value: number | undefined, standing: number, low: number, high: number) =>
    value !== undefined && Number.isSafeInteger(value) && value >= low && value <= high
      ? value
      : standing;
  return {
    ...loaded,
    ...written,
    keys: keys ?? loaded.keys,
    minIntervalMs: Math.max(
      MIN_ALLOWED_INTERVAL_MS,
      bounded(written?.minIntervalMs, loaded.minIntervalMs, MIN_ALLOWED_INTERVAL_MS, 60_000),
    ),
    timeoutMs: bounded(written?.timeoutMs, loaded.timeoutMs, 1, 600_000),
    maxRetries: bounded(written?.maxRetries, loaded.maxRetries, 0, 10),
    cacheTtlMs: bounded(written?.cacheTtlMs, loaded.cacheTtlMs, 0, 86_400_000),
    cacheMaxEntries: bounded(written?.cacheMaxEntries, loaded.cacheMaxEntries, 1, 100_000),
  };
}

/** The identifier arguments a caller writes, and the shape each one travels in. */
const IDENTIFIER_ARGUMENTS = [
  "performerIds",
  "studioIds",
  "tagIds",
  "parentStudioId",
  "parentId",
  "performedWith",
  "studioId",
  "categoryId",
] as const;

/**
 * What one catalogue receives of the identifiers a caller wrote.
 *
 * An identifier names the catalogue that minted it, so a list written for all
 * of them reaches each one shorn of the rest, and the bare uuid is what travels
 * on the wire. A catalogue handed another's identifier refuses the request, and
 * the refusal reads as a fact about the catalogue rather than about the list.
 */
function shareOf(input: Record<string, unknown>, source: InstanceId): Record<string, unknown> {
  const held: Record<string, unknown> = { ...input };
  for (const name of IDENTIFIER_ARGUMENTS) {
    const written = input[name];
    if (written === undefined) continue;
    const all = Array.isArray(written) ? (written as string[]) : [String(written)];
    const mine = all
      .filter((one) => one.startsWith(`${source}:`))
      .map((one) => one.slice(source.length + 1));
    if (mine.length === 0) delete held[name];
    else held[name] = Array.isArray(written) ? mine : mine[0];
  }
  return held;
}

/** The catalogues a record is also held at, read off the record itself. */
function alsoAt(record: Record<string, unknown>): { source: InstanceId; uuid: string }[] {
  const held = (record.alsoHeldAt as { source: InstanceId; id: string }[] | undefined) ?? [];
  return held.map((one) => ({ source: one.source, uuid: one.id.slice(one.source.length + 1) }));
}

/** Every report the registry declares a catalogue for, in the order it declares them. */
function orderByRegistry(reports: readonly SourceReport[]): SourceReport[] {
  const byId = new Map(reports.map((report) => [report.source, report]));
  return INSTANCES.map((spec) => byId.get(spec.id)).filter(
    (report): report is SourceReport => report !== undefined,
  );
}
