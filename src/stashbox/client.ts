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
import { invalidInput, notFound, StashboxError } from "../errors.js";
import type { Card, Read, Reading, RowsResult, SourceReport } from "../types.js";
import { consolidate } from "../answer/card.js";
import { Cache, cacheKey } from "./cache.js";
import { createHttpTransport, type GraphQLRequest, type HttpTransport } from "./graphql.js";
import { parseId } from "./identifiers.js";
import {
  askedOfFacets,
  askedOfWords,
  disclosed,
  identifierList,
  singleIdentifier,
  unaskedFor,
  type Asked,
  type OrderSent,
} from "./narrowings.js";
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
  type SceneSection,
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

/**
 * The lists a caller asks for by naming a section, and the section that carries
 * each of them.
 *
 * A list nobody asked for states no zero: saying the catalogues published none
 * of something nobody requested is an emptiness this answer never looked for.
 */
const BY_SECTION: Record<string, string> = {
  images: "images",
  fingerprints: "fingerprints",
  studios: "studios",
  appearance: "appearance",
};

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
  // A studio record carries no count of the scenes indexed on it in what this
  // client selects, so publishing one would report a silence nobody measured.
  studio: { scalars: ["name", "parent"], lists: ["aliases", "urls", "images"], perSource: [] },
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

/** One record, and every hash that reached it, each naming where it reached it. */
export interface FingerprintMatch {
  scene: Card;
  /**
   * The hashes this card was reached by. A hash names the catalogues it
   * reached the record on, since a catalogue searches the algorithms its own
   * lookup declares and a hash it never received reached nothing there.
   */
  matchedBy: { hash: string; algorithm: string; sources: string[] }[];
  matchKind: string;
}

/** The fingerprints a record publishes, as the catalogue that holds it wrote them. */
function heldPrints(scene: Record<string, unknown>): { hash: string; algorithm: string }[] {
  return (scene.fingerprints as { hash: string; algorithm: string }[] | undefined) ?? [];
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
  /** Distinct records an exact hash named. A perceptual match names none. */
  records_named: number;
  /** Matches a perceptual hash reached, which establish a likeness and no file. */
  resemblances: number;
  unattributed: number;
  /** The hashes put to a catalogue that answered, which reached no record. */
  unmatched: { hash: string; algorithm: string }[];
  /** The hashes a catalogue that answered does not search, with the ones that did not. */
  not_searched: { hash: string; algorithm: string; sources: string[] }[];
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
    build: (spec: InstanceSpec) => GraphQLRequest & {
      faceted: boolean;
      operation: string;
      /** What this catalogue was asked, beside what the caller wrote for it. */
      asked: Asked;
      wordsApart?: boolean;
    },
    reader: (value: unknown, spec: InstanceSpec, at: string) => { record: T | null },
  ): Promise<Answer<T>> {
    const named = input.sources as InstanceId[] | undefined;
    const chosen = this.#chooseSources(SEARCH[kind], `${kind.slice(0, -1)} search`, named);
    // A catalogue whose faceted routes do not apply the narrowings written to
    // them answers rows that ignore the question, and a caller reads those as
    // the answer to it. Such a catalogue is asked through its text route alone,
    // and a question narrowed on typed arguments is never put to it.
    // A question narrowed on nothing at all is neither path: it asks for a
    // page of the whole index, which every catalogue answers. Reading it as
    // the typed path would report a catalogue absent for a narrowing nobody
    // wrote.
    const narrowed = Object.keys(input).some(
      (name) => !["sources", "prefer", "sections", "page", "limit"].includes(name),
    );
    const typed = input.query === undefined && narrowed;
    const unasked: SourceReport[] = [...chosen.unasked];
    const asks: typeof chosen.asks = [];
    // The request each catalogue receives, built once. What it carries decides
    // whether the catalogue is asked at all, and building it twice would let
    // that decision and the request drift apart.
    const built = new Map<InstanceId, ReturnType<typeof build>>();

    for (const ask of chosen.asks) {
      // A catalogue whose faceted routes ignore what is written to them is
      // asked through its text route, and that route reads a term. A question
      // carrying none reaches it by no route at all, so it is never asked:
      // put to it anyway, what comes back is a request it cannot take, and a
      // failure reported there states something about the catalogue that the
      // exchange does not carry.
      if (!ask.spec.facetedSearch && input.query === undefined) {
        unasked.push({
          source: ask.spec.id,
          name: ask.spec.name,
          state: "absent",
          reason: typed
            ? `${ask.spec.name} answers a search of words alone: its faceted routes do not apply the narrowings written to them, so a question narrowed on typed arguments was never put to it.`
            : `${ask.spec.name} answers a search of words alone, and this question carries none, so there was no route to put it to and it was never asked.`,
        });
        continue;
      }
      // What the caller wrote and what the request carries, told apart once.
      // A narrowing answered by no record this catalogue holds and one its own
      // route reads nothing of both leave it a page of its whole index to
      // answer with, and that page reaches a reader as the answer to the
      // question they narrowed.
      const request = build(ask.spec);
      const why = unaskedFor(ask.spec.name, request.asked);
      if (why !== undefined) {
        unasked.push({
          source: ask.spec.id,
          name: ask.spec.name,
          state: "absent",
          ...disclosed(request.asked),
          reason: why,
        });
        continue;
      }
      asks.push(ask);
      built.set(ask.spec.id, request);
    }
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
        const request = built.get(ask.spec.id) ?? build(ask.spec);
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
          // The same difference the decision to ask was taken on: a narrowing
          // this catalogue's route declares no field for is a limit it has, and
          // a list shorn of another catalogue's identifiers narrowed on a
          // fraction of what was written, which is neither the whole question
          // nor a limit of this catalogue.
          ...disclosed(request.asked),
          ...(found.value.skipped > 0 ? { skipped: found.value.skipped } : {}),
          ...(found.value.total === undefined ? {} : { indexTotal: found.value.total }),
          // A total counted over words the index reads apart counts the rows
          // carrying any of them, which is a different question from the one
          // the words spell together.
          ...(found.value.total !== undefined && request.wordsApart === true
            ? { indexTotalOverAnyWord: true }
            : {}),
        };
        rows.push(...found.value.read);
        return report;
      }),
    );
    reports.push(...results);

    // The order the rows actually landed in, read off the rows themselves. A
    // sentence naming the order the catalogues were asked describes something
    // the answer does not do: they answer at their own speed, and the groups
    // arrive as they finish.
    const answering = [...new Set(rows.map((row) => (row as { source?: string }).source))]
      .filter((one): one is string => one !== undefined)
      .map((one) => instanceById(one)?.name ?? one);
    const perSource = orderByRegistry([...reports, ...unasked]);
    // A window states the page a catalogue paged through. Where every catalogue
    // that answered was never given the page, the rows are each one's own first
    // page and a window naming another would describe a paging nobody did.
    const paged = perSource.filter(
      (one) => one.state === "answered" && !(one.narrowingsNotReceived ?? []).includes("page"),
    );
    const data: RowsResult<T> = {
      rows,
      perSource,
      ...(paged.length === 0
        ? {}
        : {
            window: {
              page: (input.page as number | undefined) ?? 1,
              limit: (input.limit as number | undefined) ?? ROWS_PER_PAGE,
            },
          }),
      // Grouped rather than interleaved, and the groups arrive in the order
      // the catalogues answered: they share no measure to order them together
      // by, so nothing here ranks one against another. Within a group stands
      // the order that catalogue applied, which is the one written where it
      // received it and its own where it did not.
      ordering: orderingOf(perSource, answering, built),
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

  #searchOf(kind: Kind, given: Record<string, unknown>): Promise<Answer<unknown>> {
    // Every identifier reaches the layer below naming the catalogue that
    // minted it. A uuid written without one names no catalogue, and reading it
    // as another's leaves this catalogue with nothing to narrow on for a reason
    // the string never carried.
    const input = namedIdentifiers(given, this.configured);
    const words = input.query as string | undefined;
    const page = (input.page as number | undefined) ?? 1;
    const limit = (input.limit as number | undefined) ?? ROWS_PER_PAGE;
    const record = kind.slice(0, -1) as RecordKind;
    const reader = READERS[record] as (
      value: unknown,
      spec: InstanceSpec,
      at: string,
    ) => { record: unknown };

    // The route a catalogue answers words on takes a term and a size and no
    // page at all, so every call reads the same first rows.
    if (words !== undefined && page > 1) {
      throw invalidInput(
        `A search written with query does not take page. The route a catalogue reads words on takes a term and a size, so it answers its first rows whatever page names. An argument that is read and dropped produces an answer computed without it, which reads as the answer to the question that was asked.`,
        "Narrow the words, raise limit, or write the typed arguments, which reach the route that pages.",
      );
    }

    return this.#search(
      kind,
      input,
      (spec) => {
        if (words !== undefined) {
          const built = searchRequest(spec, kind, words, limit);
          // This route reads words and a size, and an order written beside
          // them shapes no part of the request.
          const unreceived = [
            ...(input.sort === undefined ? [] : ["sort"]),
            ...(input.direction === undefined ? [] : ["direction"]),
          ];
          // A catalogue's text index reads the words apart, so a total it
          // publishes counts the rows carrying any of them. Rendered as a
          // total for the phrase, six figures stand as a claim about how
          // common the phrase is.
          return {
            ...built,
            faceted: built.paged,
            asked: askedOfWords(unreceived),
            wordsApart: true,
          };
        }
        // Every identifier a caller wrote names the catalogue that minted it,
        // so this one receives its own and nothing else. Sending the whole
        // list would put another catalogue's identifiers to it, and the
        // refusal that came back would read as a fact about this one.
        const held = shareOf(input, spec.id);
        const narrowing = { ...held.share, page, limit } as never;
        const shaped =
          kind === "scenes"
            ? sceneQueryInput(spec, narrowing)
            : kind === "performers"
              ? performerQueryInput(spec, narrowing)
              : kind === "studios"
                ? studioQueryInput(spec, narrowing)
                : tagQueryInput(spec, narrowing);
        const built = facetedRequest(spec, kind, shaped.input as Record<string, unknown>);
        return {
          ...built,
          faceted: true,
          asked: askedOfFacets(
            held,
            shaped.unreceived,
            (built.variables?.input ?? undefined) as Record<string, unknown> | undefined,
          ),
        };
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
    if (named !== undefined && !named.includes(parsed.instance)) {
      // The identifier names one catalogue and the call names others. Answered
      // as an empty card, it would read as that catalogue holding nothing,
      // when nobody asked it anything.
      throw invalidInput(
        `${written} names ${parsed.instance}, and this call names ${named.join(", ")}. An identifier is read on the catalogue that minted it, so nothing here could be asked about it.`,
        `Ask for ${written} without naming catalogues, or name ${parsed.instance} among them.`,
      );
    }
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

    // Every catalogue the registry declares leaves here named, as it does on a
    // search. A card holding only the catalogues that were read cannot tell a
    // catalogue asked and lacking the record from one nobody asked, and the
    // reasons for the second are three different facts a caller acts on.
    // What a catalogue publishes about its links is read off the record it
    // answered with, so a reading that failed carries no link either way. The
    // key this install holds is the reason only where a link was there to
    // follow: where none is written, setting it changes nothing about this
    // record, and naming it sends a reader to do exactly that.
    const from = instanceById(first.reading.source)?.name ?? first.reading.source;
    for (const spec of INSTANCES) {
      if (readings.some((one) => one.source === spec.id)) continue;
      const link = unfollowed(first.reading, spec.id);
      const reason =
        named !== undefined && !named.includes(spec.id)
          ? `The catalogues named in this call left ${spec.name} out, so it was never asked.`
          : !supports(spec, ROUTE[kind])
            ? `${spec.name} answers no ${kind} of its own, so it was never asked.`
            : first.reading.state !== "answered"
              ? `${from} published nothing here, so whether it links this record to one on ${spec.name} is unknown and nothing here reached it. That is a reading that carried no link rather than a link nobody wrote.`
              : link !== undefined
                ? `${from} links this record to one on ${spec.name} at ${link}, and that address names the record by something this client cannot address, so nothing here reached it. The link is written; following it is what failed.`
                : `${from} publishes no link from this record to one on ${spec.name}, so nothing here reached it. That is a link nobody wrote rather than a record ${spec.name} lacks.`;
      readings.push({ source: spec.id, state: "absent", reason });
    }

    // A card built where every catalogue that looked holds nothing carries a
    // null in each of its fields and an empty list under each of its blocks,
    // and the prose around it reads as a record whose editors filled nothing
    // in. The taxonomy has a code for a catalogue that looked and holds no such
    // record, and this is what it is for.
    const looked = readings.filter((one) => one.state === "answered");
    if (looked.length > 0 && !looked.some((one) => one.record !== undefined)) {
      throw notFound(
        `No catalogue holds a ${kind} at ${written}. ${looked
          .map((one) => one.reason ?? `${instanceById(one.source)?.name ?? one.source} holds none.`)
          .join(" ")}`,
        {
          instance: parsed.instance,
          hint: `Search for the ${kind} and read it by an identifier a row of that search carries. An identifier names the catalogue that minted it, so the same uuid on another catalogue names another record.`,
        },
      );
    }

    const shape = SHAPES[kind];
    const asked = new Set(sections);
    const card = consolidate({
      readings,
      prefer,
      // The address a record was read from and the moment it was read belong
      // to the catalogue that answered, so they travel on its holder rather
      // than being put to a vote: two clock readings a fraction apart would
      // otherwise be published as a disagreement and dilute a real one.
      // A block a section carries is published only where that section was
      // asked for, whether it holds one value or a list of them. Published
      // otherwise, a block nobody read carries a null that reads exactly as a
      // field every catalogue left empty.
      scalars: [...shape.scalars, "mergedInto"].filter(
        (name) => BY_SECTION[name] === undefined || asked.has(BY_SECTION[name]),
      ),
      // A list a section carries is published only where that section was
      // asked for. Stated otherwise, its zero denies something nobody looked
      // for.
      lists: shape.lists.filter(
        (name) => BY_SECTION[name] === undefined || asked.has(BY_SECTION[name]),
      ),
      perSource: shape.perSource,
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
    // A hash of one repeated character is what a failed computation writes.
    // Put to a catalogue it reaches whatever was submitted upstream under the
    // same failure, and the answer states that those bytes are that file.
    const degenerate = fingerprints.filter((one) => /^(.)\1*$/.test(one.hash));
    if (degenerate.length > 0) {
      throw invalidInput(
        `These hashes carry one repeated character and name no bytes: ${degenerate.map((one) => `${one.algorithm} ${one.hash}`).join(", ")}. A hash computed from a file this client could not read reaches whatever another submitter wrote under the same failure, and a record it reaches would be reported as the file.`,
        "Compute the hash again from the file itself.",
      );
    }
    const named = input.sources as InstanceId[] | undefined;
    const { asks, unasked } = this.#chooseSources(
      "find_by_fingerprint",
      "fingerprint lookup",
      named,
    );

    const prefer = (input.prefer as InstanceId[] | undefined) ?? INSTANCES.map((one) => one.id);
    const sections = (input.sections as string[] | undefined) ?? ["basic"];
    // The hashes a record carries are what says which of the hashes asked
    // reached it, so they are read whether or not a caller asked for the
    // block. What the block decides is whether they are published.
    const read = [...new Set([...sections, "fingerprints"])] as SceneSection[];
    const reports: SourceReport[] = [];

    const heard = await Promise.all(
      asks.map(async (ask) => {
        const request = fingerprintRequest(ask.spec, fingerprints, read);
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
        if ("report" in found) return { report: found.report, rows: [] as Raw[] };

        // The route answers a group per hash, so a record carrying two of the
        // hashes asked comes back in two of them. Counted once per group, one
        // record of one catalogue is reported as several.
        const answered = new Map<string, Record<string, unknown>>();
        for (const scene of found.value.read) {
          const held = answered.get(String(scene.id));
          if (held === undefined) {
            answered.set(String(scene.id), scene);
            continue;
          }
          // One record answered under two hashes is one record, and each copy
          // of it carries the hashes its own group was matched on. Keeping the
          // first copy alone drops the hash the second was reached by.
          const prints = [...heldPrints(held), ...heldPrints(scene)];
          const seen = new Set<string>();
          held.fingerprints = prints.filter((one) => {
            const at = `${one.algorithm} ${one.hash.toLowerCase()}`;
            if (seen.has(at)) return false;
            seen.add(at);
            return true;
          });
        }
        // This catalogue was put only the algorithms its own lookup searches.
        // A record it answered with carries hashes of every algorithm, so
        // reading those as matches attributes to it an answer to a question it
        // never received.
        const put = fingerprints.filter((one) => !request.notSearched.includes(one.algorithm));

        let count = 0;
        let unattributed = 0;
        const rows: Raw[] = [];
        for (const scene of answered.values()) {
          const carried = heldPrints(scene);
          // A hash is compared for what it is: the catalogues publish it in
          // either case, and a comparison that reads two spellings of one
          // hash as two hashes turns a match into an emptiness.
          const reached = put.filter((print) =>
            carried.some(
              (one) =>
                one.hash.toLowerCase() === print.hash.toLowerCase() &&
                one.algorithm === print.algorithm,
            ),
          );
          // The catalogue answered with it and this client cannot say which
          // hash reached it, so it stands as no match and is counted apart
          // rather than dropped out of the answer entirely.
          if (reached.length === 0) {
            unattributed += 1;
            continue;
          }
          count += 1;
          for (const print of reached)
            rows.push({ source: ask.spec.id, scene, algorithm: print.algorithm, hash: print.hash });
        }
        return {
          report: {
            source: ask.spec.id,
            name: ask.spec.name,
            state: "answered" as const,
            count,
            records: answered.size,
            ...(unattributed > 0 ? { unattributed } : {}),
            ...(found.value.skipped > 0 ? { skipped: found.value.skipped } : {}),
            ...(request.notSearched.length > 0
              ? { algorithmsNotSearched: request.notSearched }
              : {}),
          },
          rows,
        };
      }),
    );
    reports.push(...heard.map((one) => one.report));
    // The catalogues are read in the order the registry declares, so what a
    // reader meets is the same sequence whichever of them answers first.
    const raw: Raw[] = heard.flatMap((one) => one.rows);

    // One record, one card. A record reached by three of the hashes asked is
    // one record of one catalogue, and published once per hash it would report
    // a caller's one file as three.
    const records = new Map<string, Record<string, unknown>>();
    const reachedBy = new Map<string, { hash: string; algorithm: string }[]>();
    for (const one of raw) {
      const key = `${one.source}:${String(one.scene.id)}`;
      records.set(key, one.scene);
      reachedBy.set(key, [
        ...(reachedBy.get(key) ?? []),
        { hash: one.hash, algorithm: one.algorithm },
      ]);
    }
    const sourceOf = (key: string) => key.slice(0, key.indexOf(":")) as InstanceId;
    const printsOf = (key: string, exact: boolean) =>
      (reachedBy.get(key) ?? []).filter((one) => (one.algorithm === "PHASH") !== exact);

    // Two catalogues answering one exact hash describe the same bytes, which is
    // the strongest identity the data carries, and both records are already
    // here: welding them costs no request. A perceptual hash states a likeness
    // and joins nothing, so its records stay one card per catalogue.
    //
    // A catalogue mints one identifier per record it holds, so two of its
    // records carrying one hash are two records by its own account. A card
    // takes at most one reading per catalogue: the second record opens a card
    // of its own rather than disappearing behind the first.
    const above = new Map<string, string>();
    const under = new Map<string, Map<InstanceId, string>>();
    const root = (key: string): string => {
      const up = above.get(key);
      if (up === undefined || up === key) return key;
      const top = root(up);
      above.set(key, top);
      return top;
    };
    for (const key of records.keys())
      if (printsOf(key, true).length > 0) {
        above.set(key, key);
        under.set(key, new Map([[sourceOf(key), key]]));
      }
    const sharing = new Map<string, string[]>();
    for (const key of records.keys())
      for (const print of printsOf(key, true)) {
        const at = `${print.algorithm} ${print.hash.toLowerCase()}`;
        sharing.set(at, [...(sharing.get(at) ?? []), key]);
      }
    for (const together of sharing.values())
      for (const key of together.slice(1)) {
        const left = root(together[0] as string);
        const right = root(key);
        if (left === right) continue;
        const one = under.get(left) as Map<InstanceId, string>;
        const other = under.get(right) as Map<InstanceId, string>;
        if ([...other.keys()].some((source) => one.has(source))) continue;
        for (const [source, held] of other) one.set(source, held);
        under.delete(right);
        above.set(right, left);
      }

    /** The hashes that reached a card, each naming the catalogues it reached it on. */
    const reaching = (group: readonly string[], exact: boolean) => {
      const by = new Map<string, { hash: string; algorithm: string; sources: InstanceId[] }>();
      for (const key of group)
        for (const print of printsOf(key, exact)) {
          const at = `${print.algorithm} ${print.hash.toLowerCase()}`;
          const entry = by.get(at) ?? { hash: print.hash, algorithm: print.algorithm, sources: [] };
          if (!entry.sources.includes(sourceOf(key))) entry.sources.push(sourceOf(key));
          by.set(at, entry);
        }
      const asked = (one: { hash: string; algorithm: string }) =>
        fingerprints.findIndex(
          (print) =>
            print.algorithm === one.algorithm &&
            print.hash.toLowerCase() === one.hash.toLowerCase(),
        );
      return [...by.values()].sort((one, other) => asked(one) - asked(other));
    };

    const cardOf = (group: readonly string[], exact: boolean): FingerprintMatch => ({
      scene: consolidate({
        readings: group.map((key) => ({
          source: sourceOf(key),
          id: String((records.get(key) as Record<string, unknown>).id),
          state: "answered" as const,
          record: records.get(key) as Record<string, unknown>,
        })),
        prefer: prefer,
        scalars: SHAPES.scene.scalars,
        // A list a section carries is published only where that section was
        // asked for. Stated otherwise, its zero denies something nobody
        // looked for.
        lists: SHAPES.scene.lists.filter(
          (name) => BY_SECTION[name] === undefined || sections.includes(BY_SECTION[name]),
        ),
        perSource: SHAPES.scene.perSource,
      }),
      matchedBy: reaching(group, exact),
      matchKind: exact ? "exact_file" : "perceptual_similarity",
    });

    // The cards stand in the order the records arrived, which is the order the
    // registry declares the catalogues in.
    const opened = new Set<string>();
    const matches: FingerprintMatch[] = [];
    for (const one of raw) {
      const key = `${one.source}:${String(one.scene.id)}`;
      const exact = one.algorithm !== "PHASH";
      const at = exact ? `exact ${root(key)}` : `alike ${key}`;
      if (opened.has(at)) continue;
      opened.add(at);
      matches.push(
        cardOf(
          exact ? [...(under.get(root(key)) as Map<InstanceId, string>).values()] : [key],
          exact,
        ),
      );
    }

    // An algorithm is searched where a catalogue that answered puts it to its
    // index, which is a fact per catalogue and per hash. Held as one fact
    // about the batch, a hash never put to one catalogue disappears from the
    // answer as soon as another hash of another algorithm was asked beside it.
    const answering = reports.filter((one) => one.state === "answered");
    const searchedBy = (one: Fingerprint) =>
      answering.filter((report) => !(report.algorithmsNotSearched ?? []).includes(one.algorithm));
    const neverPutTo = (one: Fingerprint) =>
      answering.filter((report) => (report.algorithmsNotSearched ?? []).includes(one.algorithm));
    const reached = (one: Fingerprint) =>
      raw.some(
        (found) =>
          found.hash.toLowerCase() === one.hash.toLowerCase() && found.algorithm === one.algorithm,
      );

    return {
      data: {
        matches,
        match_count: matches.length,
        // Records, not files: a record two catalogues hold is one record here,
        // and a perceptual hash reaches a record without naming any bytes, so
        // it is counted apart from the records an exact hash named.
        records_named: new Set(
          matches
            .filter((one) => one.matchKind === "exact_file")
            .map((one) =>
              one.scene.held_by
                .filter((held) => held.state === "answered")
                .map((held) => held.id)
                .sort()
                .join("+"),
            ),
        ).size,
        resemblances: matches.filter((one) => one.matchKind === "perceptual_similarity").length,
        // The hashes that reached nothing, which is what a caller asking "which
        // of my files are known?" is reading for. Left out, a set of hashes
        // where two matched and two did not reads as four identified.
        unmatched: fingerprints
          .filter((one) => !reached(one) && searchedBy(one).length > 0)
          .map((one) => ({ hash: one.hash, algorithm: one.algorithm })),
        // The catalogues a hash was never put to, named per hash. A catalogue
        // that never looked holds no evidence about the file behind it, and
        // that stays true of it whatever the rest of the batch reached.
        not_searched: fingerprints
          .filter((one) => neverPutTo(one).length > 0)
          .map((one) => ({
            hash: one.hash,
            algorithm: one.algorithm,
            sources: neverPutTo(one).map((report) => report.source),
          })),
        unattributed: reports.reduce((total, one) => total + (one.unattributed ?? 0), 0),
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
function shareOf(
  input: Record<string, unknown>,
  source: InstanceId,
): { share: Record<string, unknown>; namingNoRecord: string[]; receivedInPart: string[] } {
  const share: Record<string, unknown> = { ...input };
  const namingNoRecord: string[] = [];
  const receivedInPart: string[] = [];
  for (const name of IDENTIFIER_ARGUMENTS) {
    const written = input[name];
    if (written === undefined) continue;
    const all = Array.isArray(written) ? (written as string[]) : [String(written)];
    const mine = all
      .filter((one) => one.startsWith(`${source}:`))
      .map((one) => one.slice(source.length + 1));
    if (mine.length === 0) {
      // Sending the request without it asks this catalogue for a page of its
      // whole index, and the answer would render that page as the answer to a
      // question narrowed on someone it has never heard of.
      namingNoRecord.push(PUBLISHED[name] ?? name);
      delete share[name];
    } else {
      if (mine.length < all.length) receivedInPart.push(PUBLISHED[name] ?? name);
      share[name] = Array.isArray(written) ? mine : mine[0];
    }
  }
  return { share, namingNoRecord, receivedInPart };
}

/**
 * Every identifier a caller wrote, each naming the catalogue that minted it.
 *
 * The same uuid names a different record on every catalogue, so one written
 * without a prefix is resolved only where a single catalogue is configured, and
 * refused in the words a record route refuses it in everywhere else. Left
 * unresolved, it reaches the share of no catalogue at all, and each of them is
 * reported as narrowed on a record another catalogue minted, which is a
 * provenance the string does not carry and the sentence a genuinely foreign
 * identifier earns.
 */
function namedIdentifiers(
  input: Record<string, unknown>,
  configured: readonly InstanceId[],
): Record<string, unknown> {
  const held: Record<string, unknown> = { ...input };
  for (const name of IDENTIFIER_ARGUMENTS) {
    const written = input[name];
    if (written === undefined) continue;
    const published = PUBLISHED[name] ?? name;
    held[name] = Array.isArray(written)
      ? identifierList(published, written as string[], configured).entries.map((one) => one.given)
      : singleIdentifier(published, String(written), configured).entries[0]?.given;
  }
  return held;
}

/** The name a caller wrote, for a narrowing this client names in one word. */
const PUBLISHED: Record<string, string> = {
  performerIds: "performer_ids",
  studioIds: "studio_ids",
  tagIds: "tag_ids",
  parentStudioId: "parent_studio_id",
  parentId: "parent_id",
  performedWith: "performed_with",
  studioId: "studio_id",
  categoryId: "category_id",
};

/** A link to a catalogue that this client could not follow, read off the record. */
function unfollowed(reading: Reading, source: InstanceId): string | undefined {
  const held = (
    reading.record as { linkedUnfollowed?: { source: string; url: string }[] } | undefined
  )?.linkedUnfollowed;
  return held?.find((one) => one.source === source)?.url;
}

/** The catalogues a record is also held at, read off the record itself. */
function alsoAt(record: Record<string, unknown>): { source: InstanceId; uuid: string }[] {
  const held = (record.alsoHeldAt as { source: InstanceId; id: string }[] | undefined) ?? [];
  return held.map((one) => ({ source: one.source, uuid: one.id.slice(one.source.length + 1) }));
}

/**
 * The order the rows stand in, read off what each catalogue was sent.
 *
 * An order a caller wrote reaches some catalogues and not others: a route that
 * reads words alone takes none, and the answer names it as an order that
 * catalogue never received. A direction written without a field to order by
 * reaches the catalogue all the same, and the rows come back the way it ran:
 * a sentence calling those the catalogue's own order sends a reader who needs
 * the first row to the wrong one.
 *
 * One sentence states one order of the catalogues. Naming them as a list beside
 * the order they answered in states two, and a reader has no way to tell which
 * of them the rows stand in.
 */
function orderingOf(
  perSource: readonly SourceReport[],
  answering: readonly string[],
  built: ReadonlyMap<InstanceId, { asked: Asked }>,
): string {
  const apart =
    "The catalogues share no measure to order them against one another, so nothing here ranks a row of one above a row of another";
  const answered = perSource.filter((one) => one.state === "answered");
  // A catalogue that answered is what puts rows in an order. Where none did,
  // there is no row here and no catalogue that laid one anywhere.
  if (answered.length === 0) {
    return "in no order at all: no catalogue answered, so no catalogue laid a row anywhere";
  }

  const way = (order: OrderSent | undefined) =>
    order?.direction === undefined
      ? null
      : order.direction.toUpperCase() === "ASC"
        ? "ascending"
        : "descending";
  /** What one catalogue did with the order, in words that name no catalogue. */
  const clauseOf = (asked: Asked | undefined): string | null => {
    const run = way(asked?.order);
    const sort = asked?.order?.sort;
    if (sort !== undefined) {
      return `sorted by ${sort.toLowerCase()}${run === null ? ", the way it orders by" : `, ${run}`}`;
    }
    if (run !== null) {
      // A direction reached it with no field to order by, so it ran the order
      // the catalogue itself keeps.
      return `in its own order, taken ${run}, which is the direction this call wrote applied to the order it keeps`;
    }
    if ((asked?.notReceived ?? []).some((one) => one === "sort" || one === "direction")) {
      return "in its own order, which did not receive the order this call wrote: the route it answers on takes none";
    }
    return null;
  };

  const clauses = answered.map((one) => ({
    who: one.name ?? one.source,
    clause: clauseOf(built.get(one.source)?.asked),
  }));
  const uniform = clauses.every((one) => one.clause === clauses[0]?.clause);

  if (answering.length > 1) {
    const groups = `grouped by catalogue, in the order they answered: ${answering.join(", ")}`;
    if (uniform) {
      const shared = clauses[0]?.clause;
      return shared === undefined || shared === null
        ? `${groups}, each group in that catalogue's own order. ${apart}`
        : `${groups}, each group ${shared}. ${apart}`;
    }
    const each = clauses.map((one) => `${one.who} ${one.clause ?? "in its own order"}`).join("; ");
    return `${groups}. Within them: ${each}. ${apart}`;
  }

  const one = clauses[0];
  if (one === undefined || one.clause === null) {
    return "in the order the catalogue that answered holds them";
  }
  return one.clause.startsWith("sorted by")
    ? `${one.clause}, which ${one.who} applied`
    : `${one.clause.replace("in its own order", `in the order ${one.who} holds them`)}`;
}

/** Every report the registry declares a catalogue for, in the order it declares them. */
function orderByRegistry(reports: readonly SourceReport[]): SourceReport[] {
  const byId = new Map(reports.map((report) => [report.source, report]));
  return INSTANCES.map((spec) => byId.get(spec.id)).filter(
    (report): report is SourceReport => report !== undefined,
  );
}
