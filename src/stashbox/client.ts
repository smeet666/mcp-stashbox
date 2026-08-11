/**
 * Reading several catalogues as one, with the seams left visible.
 *
 * This layer never imports the protocol. A program can hold it as an ordinary
 * library and get the pacing, the store and the error taxonomy with nothing
 * attached.
 *
 * Everything here follows from one rule: **an answer holding rows from some
 * catalogues is no evidence about the others.** A catalogue that failed, a
 * catalogue that was never asked and a catalogue that looked and found nothing
 * are three different things, and every answer says which is which.
 */

import { StashboxError, invalidInput, notFound, parseFailure } from "../errors.js";
import type {
  FingerprintAlgorithm,
  FingerprintMatch,
  FingerprintResult,
  PerformerRecord,
  Read,
  RowsResult,
  SceneRecord,
  SourceReport,
} from "../types.js";
import { DEFAULT_USER_AGENT, MAX_ALLOWED_INTERVAL_MS, MIN_ALLOWED_INTERVAL_MS } from "../config.js";
import type { Logger } from "../config.js";
import { Cache } from "./cache.js";
import { createHttpTransport, type Transport } from "./graphql.js";
import { formatId, isUuid, parseId } from "./identifiers.js";
import {
  INSTANCES,
  type Capability,
  type InstanceId,
  type InstanceSpec,
  supports,
} from "./instances.js";
import { mapPerformer, mapScene } from "./map.js";
import { readInteger } from "./normalise.js";
import * as documents from "./queries.js";
import { RateLimiter } from "./rateLimiter.js";

export interface StashboxClientOptions {
  keys: Partial<Record<InstanceId, string>>;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  logger?: Logger;
  /** Supplied by tests, which drive the catalogues without a network. */
  transport?: Transport;
}

export interface SearchScenesInput {
  query?: string;
  /**
   * How a list of identifiers is read: every one of them, or any one. Sending a
   * list without saying which makes a scene crediting one of two performers
   * indistinguishable from one crediting both.
   */
  match?: "all" | "any";
  title?: string;
  code?: string;
  performerIds?: readonly string[];
  studioIds?: readonly string[];
  tagIds?: readonly string[];
  dateFrom?: string;
  dateTo?: string;
  sort?: "title" | "date" | "duration" | "created" | "updated";
  direction?: "asc" | "desc";
  limit?: number;
  page?: number;
  sources?: readonly InstanceId[];
}

export interface SearchPerformersInput {
  query?: string;
  name?: string;
  disambiguation?: string;
  country?: string;
  performedWith?: string;
  studioId?: string;
  sort?: "name" | "birthdate" | "scene_count" | "created" | "updated";
  direction?: "asc" | "desc";
  limit?: number;
  page?: number;
  sources?: readonly InstanceId[];
}

export interface FingerprintInput {
  fingerprints: readonly { hash: string; algorithm: FingerprintAlgorithm }[];
  sources?: readonly InstanceId[];
}

const SORT_TO_SCENE_ENUM: Record<string, string> = {
  title: "TITLE",
  date: "DATE",
  duration: "DURATION",
  created: "CREATED_AT",
  updated: "UPDATED_AT",
};

const SORT_TO_PERFORMER_ENUM: Record<string, string> = {
  name: "NAME",
  birthdate: "BIRTHDATE",
  scene_count: "SCENE_COUNT",
  created: "CREATED_AT",
  updated: "UPDATED_AT",
};

/** The fields a catalogue's text index reads, claimed only when one was read. */
const FIELDS_SEARCHED = ["title", "code", "details"];
const PERFORMER_FIELDS_SEARCHED = ["name", "aliases", "disambiguation"];

/** Narrowings the text search cannot receive, since it takes words alone. */
const TEXT_SEARCH_IGNORES = [
  "title",
  "code",
  "match",
  "performer_ids",
  "studio_ids",
  "tag_ids",
  "date_from",
  "date_to",
  "sort",
  "direction",
  "page",
];

/** The narrowings each faceted search can be given, paging and order apart. */
const SCENE_NARROWINGS = [
  "title",
  "code",
  "performer_ids",
  "studio_ids",
  "tag_ids",
  "date_from",
  "date_to",
];
const PERFORMER_NARROWINGS = ["name", "disambiguation", "country", "performed_with", "studio_id"];

const PERFORMER_TEXT_SEARCH_IGNORES = [
  "name",
  "disambiguation",
  "country",
  "performed_with",
  "studio_id",
  "sort",
  "direction",
  "page",
];

/**
 * Whether this catalogue can receive a narrowing written as a criterion object.
 *
 * The reimplementation types every criterion as free text, so a structured one
 * fails its whole request. Guessing how it would read a bare string would narrow
 * on a rule nobody published, so a criterion is left out of its request and
 * named as not received.
 */
function takesCriteria(spec: InstanceSpec): boolean {
  return spec.dialect === "strict";
}

/** One page of a performer's scenes, since an established record holds thousands. */
const SCENES_SECTION_LIMIT = 20;

/**
 * An identifier given as an argument, checked before anything is asked.
 *
 * It names a catalogue and carries a UUID that catalogue could have minted. A
 * bare one names none, and sending it to every catalogue would answer about a
 * different record on each.
 */
function readIdentifierArgument(id: string): void {
  const separator = id.indexOf(":");
  if (separator === -1) {
    throw invalidInput(
      `'${id}' names no catalogue, so no catalogue can be asked about it.`,
      `Write it as <catalogue>:<uuid>, using one of: ${INSTANCES.map((entry) => entry.id).join(", ")}.`,
    );
  }
  const prefix = id.slice(0, separator);
  if (!INSTANCES.some((entry) => entry.id === prefix)) {
    throw invalidInput(
      `'${prefix}' is not a catalogue this server reads.`,
      `The catalogues are: ${INSTANCES.map((entry) => entry.id).join(", ")}.`,
    );
  }
  if (!isUuid(id.slice(separator + 1))) {
    throw invalidInput(
      `'${id.slice(separator + 1)}' is not a UUID, so no catalogue could have minted it.`,
      "A record identifier looks like 00000000-0000-0000-0000-000000000000.",
    );
  }
}

/** A page inside what this client pages through, or a refusal naming the bound. */
function readPageArgument(page: number | undefined): number {
  if (page === undefined) return 1;
  if (!Number.isInteger(page) || page < 1 || page > StashboxClient.MAX_PAGE) {
    throw invalidInput(
      `Page ${page} is outside the pages this client reads.`,
      `Ask for a page between 1 and ${StashboxClient.MAX_PAGE}, and narrow the question to reach further.`,
    );
  }
  return page;
}

/** The hexadecimal length each algorithm produces. */
const HASH_LENGTH: Record<FingerprintAlgorithm, number> = { MD5: 32, OSHASH: 16, PHASH: 16 };

/**
 * A fingerprint given as an argument, checked before anything is asked.
 *
 * A hash of the wrong length for its algorithm is a question no catalogue can
 * answer, and sending it returns an emptiness that reads as an answer about the
 * catalogues rather than about the argument. A hash of nothing but zeroes is
 * what a hashing tool emits when it fails, and matching one would state an
 * identity out of a failure.
 */
function readFingerprintArgument(hash: string, algorithm: FingerprintAlgorithm): void {
  const value = hash.trim();
  if (!/^[0-9a-f]+$/i.test(value)) {
    throw invalidInput(
      `'${hash}' is not a hexadecimal fingerprint.`,
      "A fingerprint is the hexadecimal digest a hashing tool prints.",
    );
  }
  const expected = HASH_LENGTH[algorithm];
  if (value.length !== expected) {
    throw invalidInput(
      `A ${algorithm} fingerprint is ${expected} hexadecimal characters, and this one is ${value.length}.`,
      "Check that the hash and the algorithm name each other.",
    );
  }
  if (/^0+$/.test(value)) {
    throw invalidInput(
      "A fingerprint of nothing but zeroes is what a hashing tool prints when it fails.",
      "Hash the file again before asking which scene it is.",
    );
  }
}

/**
 * A query carrying no words is refused.
 *
 * A text search reads words, so a query of spaces asks nothing. Sending it
 * returns an emptiness that describes the question and reads as the corpus, and
 * dropping it silently leaves the faceted path to answer with the whole
 * catalogue under a question nobody put. Either way the answer would carry a
 * claim about the catalogues that the caller's own argument produced.
 */
function withReadableQuery<T extends { query?: string }>(input: T): T {
  if (input.query === undefined) return input;
  const words = input.query.trim();
  if (words === "") {
    throw invalidInput(
      "A search for words carries no words.",
      "Write what to look for, or omit 'query' and narrow with the typed arguments.",
    );
  }
  return words === input.query ? input : ({ ...input, query: words } as T);
}

/** Whether a caller actually set a narrowing, so only what was given is named. */
function hasNarrowing(input: Record<string, unknown>, name: string): boolean {
  const camel = name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const value = input[camel];
  if (value === undefined || value === null) return false;
  return Array.isArray(value) ? value.length > 0 : true;
}

export class StashboxClient {
  private readonly keys: Partial<Record<InstanceId, string>>;
  private readonly transport: Transport;
  private readonly limiters = new Map<InstanceId, RateLimiter>();
  private readonly cache: Cache<unknown>;
  private readonly logger: Logger | undefined;

  constructor(options: StashboxClientOptions) {
    this.keys = { ...options.keys };
    this.logger = options.logger;

    // The floor holds through this entry point too: a library consumer cannot
    // ask these catalogues for more than the server would. A value that is not a
    // number falls back to the floor, since arithmetic on one would silently
    // remove the spacing altogether.
    const interval = bounded(
      options.minIntervalMs,
      MIN_ALLOWED_INTERVAL_MS,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    );
    for (const spec of INSTANCES) {
      this.limiters.set(spec.id, new RateLimiter({ intervalMs: interval }));
    }

    this.cache = new Cache<unknown>(options.cacheTtlMs ?? 900_000, options.cacheMaxEntries ?? 200);

    this.transport =
      options.transport ??
      createHttpTransport({
        fetchImpl: options.fetchImpl ?? fetch,
        // A consumer may say who they are, and the project identifier with its
        // contact address stays attached whatever they set: a catalogue has to
        // be able to reach a human about traffic it did not expect.
        userAgent: options.userAgent?.trim()
          ? `${options.userAgent.trim()} ${DEFAULT_USER_AGENT}`
          : DEFAULT_USER_AGENT,
        timeoutMs: bounded(options.timeoutMs, 20_000, 1000, 120_000),
        maxRetries: bounded(options.maxRetries, 3, 0, 8),
        limiterFor: (spec) => this.limiters.get(spec.id)!,
        ...(options.logger ? { logger: options.logger } : {}),
      });
  }

  get configured(): readonly InstanceId[] {
    return INSTANCES.filter((spec) => this.keys[spec.id]).map((spec) => spec.id);
  }

  /**
   * Which catalogues take part in one question, and why the others do not.
   *
   * A catalogue is left out for one of three stated reasons: no key, no
   * declaration of the capability, or a caller narrowing the sources. Each of
   * them reaches the answer as an absence with its reason.
   */
  private plan(
    capability: Capability,
    sources: readonly InstanceId[] | undefined,
  ): { asked: InstanceSpec[]; absent: SourceReport[] } {
    const asked: InstanceSpec[] = [];
    const absent: SourceReport[] = [];

    const unknown = (sources ?? []).filter((id) => !INSTANCES.some((spec) => spec.id === id));
    if (unknown.length > 0) {
      throw invalidInput(
        `No catalogue answers to ${unknown.map((id) => `'${id}'`).join(", ")}.`,
        `The catalogues are: ${INSTANCES.map((spec) => spec.id).join(", ")}.`,
      );
    }

    for (const spec of INSTANCES) {
      const report = (reason: string): SourceReport => ({
        source: spec.id,
        name: spec.name,
        state: "absent",
        reason,
      });

      if (sources && !sources.includes(spec.id)) {
        absent.push(report("excluded by the caller's 'sources'"));
        continue;
      }
      if (!this.keys[spec.id]) {
        absent.push(report(`no API key configured; set ${spec.envVar}`));
        continue;
      }
      if (!supports(spec, capability)) {
        absent.push(
          report(
            capability === "search_scenes" || capability === "search_performers"
              ? `this catalogue's search returns the same rows whatever is asked, so it answers no search at all`
              : `this catalogue does not answer ${capability}`,
          ),
        );
        continue;
      }
      asked.push(spec);
    }

    return { asked, absent };
  }

  private async ask<T>(spec: InstanceSpec, query: string, variables: Record<string, unknown>) {
    return this.transport.request<T>(spec, this.keys[spec.id]!, { query, variables });
  }

  private async askFingerprints(
    spec: InstanceSpec,
    wanted: readonly { hash: string; algorithm: FingerprintAlgorithm }[],
  ) {
    return this.ask<{ findScenesBySceneFingerprints?: unknown[][] }>(
      spec,
      documents.findByFingerprintDocument(spec.dialect),
      // A variable carries an enumeration as a string, which is what lets one
      // document satisfy a catalogue typing this as an enumeration and one
      // typing it as free text.
      { fingerprints: [wanted] },
    );
  }

  private cached<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  /** The whole question, so two different ones cannot share an entry. */
  /** The furthest page this client pages through, declared and applied alike. */
  static readonly MAX_PAGE = 10_000;

  private searchKey(kind: string, input: unknown, asked: readonly InstanceSpec[]): string {
    return `${kind}:${asked.map((spec) => spec.id).join(",")}:${JSON.stringify(input)}`;
  }

  async searchScenes(rawInput: SearchScenesInput): Promise<Read<RowsResult<SceneRecord>>> {
    const input = withReadableQuery(rawInput);
    // An identifier no catalogue could have minted is a question that cannot be
    // asked, so it is refused for the call. Letting it fail per catalogue would
    // report a caller's mistake as five catalogues going wrong.
    for (const ids of [input.performerIds, input.studioIds, input.tagIds]) {
      for (const id of ids ?? []) readIdentifierArgument(id);
    }

    // Both paths ask the same question, so both are gated on the same capability.
    const capability: Capability = "search_scenes";
    const { asked, absent } = this.plan(capability, input.sources);
    const limit = clamp(input.limit ?? 10, 1, 100);
    // Bringing an out-of-range page back to the last one would answer a page
    // nobody asked for while the answer went on naming the page they did.
    const page = readPageArgument(input.page);

    const perSource: SourceReport[] = [...absent];
    const collected: SceneRecord[][] = [];
    let skipped = 0;

    const key = this.searchKey("scenes", input, asked);
    const hit = this.cached<RowsResult<SceneRecord>>(key);
    if (hit) return { data: hit, cached: true };

    const settled = await Promise.all(
      asked.map(async (spec) => {
        try {
          return { spec, answer: await this.searchScenesOn(spec, input, limit, page) };
        } catch (cause) {
          return { spec, cause };
        }
      }),
    );

    for (const outcome of settled) {
      const spec = outcome.spec;
      if ("answer" in outcome) {
        const answer = outcome.answer;
        collected.push(answer.rows);
        skipped += answer.skipped;
        if (answer.unnarrowed) {
          perSource.push({
            source: spec.id,
            name: spec.name,
            state: "absent",
            reason: `this catalogue could receive none of the narrowings asked for (${answer.refused.join(", ")}), so its rows would answer no question`,
          });
          continue;
        }
        perSource.push({
          source: spec.id,
          name: spec.name,
          state: "answered",
          count: answer.rows.length,
          ...(answer.total === null ? {} : { indexTotal: answer.total }),
          ...(answer.fields.length ? { fieldsSearched: answer.fields } : {}),
          ...(answer.refused.length ? { narrowingsNotReceived: answer.refused } : {}),
          ...(answer.skipped ? { skipped: answer.skipped } : {}),
        });
      } else {
        const cause = outcome.cause;
        perSource.push(failureReport(spec, cause, "search"));
        this.logger?.debug(`${spec.id}: search failed`);
      }
    }

    const answer = {
      rows: interleave(collected),
      perSource,
      ordering:
        "interleaved by catalogue, in the order the catalogues were asked; no score is shared across them",
    };
    // An answer holding a catalogue that failed is not the answer that was asked
    // for, so it is returned and never stored.
    if (!perSource.some((entry) => entry.state === "failed")) this.cache.set(key, answer);
    return { data: answer, cached: false, ...(skipped ? { skipped } : {}) };
  }

  private async searchScenesOn(
    spec: InstanceSpec,
    input: SearchScenesInput,
    limit: number,
    page: number,
  ): Promise<{
    rows: SceneRecord[];
    skipped: number;
    total: number | null;
    refused: string[];
    fields: string[];
    unnarrowed?: boolean;
  }> {
    if (input.query && supports(spec, "search_scenes")) {
      const data = await this.ask<{ searchScenes?: { count?: unknown; scenes?: unknown[] } }>(
        spec,
        documents.searchScenesDocument(spec.dialect),
        { term: input.query, limit },
      );
      return {
        ...readRows(data.searchScenes?.scenes, spec, mapScene, now()),
        total: supports(spec, "index_total") ? readInteger(data.searchScenes?.count) : null,
        refused: TEXT_SEARCH_IGNORES.filter((name) =>
          hasNarrowing(input as unknown as Record<string, unknown>, name),
        ),
        fields: FIELDS_SEARCHED,
      };
    }

    const filters: Record<string, unknown> = documents.sceneQueryPaging(
      page,
      limit,
      SORT_TO_SCENE_ENUM[input.sort ?? "date"] ?? "DATE",
      (input.direction ?? "desc").toUpperCase(),
    );
    const refused: string[] = [];
    const criteria = takesCriteria(spec);

    if (input.title) filters.title = input.title;
    if (input.code) {
      if (criteria) filters.code = { value: input.code, modifier: "EQUALS" };
      else refused.push("code");
    }

    const modifier = input.match === "any" ? "INCLUDES" : "INCLUDES_ALL";
    const byIdentifier = (
      name: string,
      ids: readonly string[] | undefined,
      field: string,
      how: string,
    ) => {
      if (!ids?.length) return;
      const mine = uuidsFor(spec, ids);
      // A filter that reaches none of this catalogue's records narrows nothing.
      // Sending it empty would return everything under a narrowed question.
      if (!criteria || mine.length === 0) {
        refused.push(name);
        return;
      }
      filters[field] = { value: mine, modifier: how };
    };
    byIdentifier("performer_ids", input.performerIds, "performers", modifier);
    // A scene carries one studio, so asking for every one of several can never
    // be satisfied, and the catalogue refuses the comparison outright. The list
    // is asked as a union, and a caller who wrote 'all' is told it was not taken.
    if (input.match !== "any" && uuidsFor(spec, input.studioIds ?? []).length > 1) {
      refused.push("match");
    }
    byIdentifier("studio_ids", input.studioIds, "studios", "INCLUDES");
    byIdentifier("tag_ids", input.tagIds, "tags", modifier);
    // A bound the caller wrote is the bound they get: an exclusive comparison
    // would drop a scene released on the day they named.
    // A date takes one comparison, and the comparisons a catalogue offers are
    // strict. Two bounds therefore cannot travel together: the earlier one is
    // sent and the other is named as not received.
    if (!criteria) {
      if (input.dateFrom) refused.push("date_from");
      if (input.dateTo) refused.push("date_to");
    } else if (input.dateFrom) {
      filters.date = { value: input.dateFrom, modifier: "GREATER_THAN" };
      if (input.dateTo) refused.push("date_to");
    } else if (input.dateTo) {
      filters.date = { value: input.dateTo, modifier: "LESS_THAN" };
    }

    // Asking at all would spend a request on a question this catalogue cannot
    // be given, and bring back a first page that answers anything.
    if (
      !narrowingsSurvive(input as unknown as Record<string, unknown>, SCENE_NARROWINGS, refused)
    ) {
      return { rows: [], skipped: 0, total: null, refused, fields: [], unnarrowed: true };
    }

    const data = await this.ask<{ queryScenes?: { count?: unknown; scenes?: unknown[] } }>(
      spec,
      documents.queryScenesDocument(spec.dialect),
      { input: filters },
    );
    return {
      ...readRows(data.queryScenes?.scenes, spec, mapScene, now()),
      // What the catalogue says its index holds for this question, beyond the
      // page returned. The rows are a page; this is the reach.
      total: supports(spec, "index_total") ? readInteger(data.queryScenes?.count) : null,
      refused,
      // A faceted query reads no text index, so it claims none.
      fields: [],
    };
  }

  async searchPerformers(
    rawInput: SearchPerformersInput,
  ): Promise<Read<RowsResult<PerformerRecord>>> {
    const input = withReadableQuery(rawInput);
    // An identifier no catalogue could have minted is a question that cannot be
    // asked, so it is refused for the call rather than per catalogue.
    for (const id of [input.performedWith, input.studioId]) {
      if (id !== undefined) readIdentifierArgument(id);
    }
    const capability: Capability = "search_performers";
    const { asked, absent } = this.plan(capability, input.sources);
    const limit = clamp(input.limit ?? 10, 1, 100);
    // Bringing an out-of-range page back to the last one would answer a page
    // nobody asked for while the answer went on naming the page they did.
    const page = readPageArgument(input.page);

    const perSource: SourceReport[] = [...absent];
    const collected: PerformerRecord[][] = [];
    let skipped = 0;

    const key = this.searchKey("performers", input, asked);
    const hit = this.cached<RowsResult<PerformerRecord>>(key);
    if (hit) return { data: hit, cached: true };

    const settled = await Promise.all(
      asked.map(async (spec) => {
        try {
          return { spec, answer: await this.searchPerformersOn(spec, input, limit, page) };
        } catch (cause) {
          return { spec, cause };
        }
      }),
    );

    for (const outcome of settled) {
      const spec = outcome.spec;
      if ("answer" in outcome) {
        const answer = outcome.answer;
        collected.push(answer.rows);
        skipped += answer.skipped;
        if (answer.unnarrowed) {
          perSource.push({
            source: spec.id,
            name: spec.name,
            state: "absent",
            reason: `this catalogue could receive none of the narrowings asked for (${answer.refused.join(", ")}), so its rows would answer no question`,
          });
          continue;
        }
        perSource.push({
          source: spec.id,
          name: spec.name,
          state: "answered",
          count: answer.rows.length,
          ...(answer.total === null ? {} : { indexTotal: answer.total }),
          ...(answer.fields.length ? { fieldsSearched: answer.fields } : {}),
          ...(answer.refused.length ? { narrowingsNotReceived: answer.refused } : {}),
          ...(answer.skipped ? { skipped: answer.skipped } : {}),
        });
      } else {
        const cause = outcome.cause;
        perSource.push(failureReport(spec, cause, "search"));
      }
    }

    const answer = {
      rows: interleave(collected),
      perSource,
      ordering:
        "interleaved by catalogue, in the order the catalogues were asked; no score is shared across them",
    };
    // An answer holding a catalogue that failed is not the answer that was asked
    // for, so it is returned and never stored.
    if (!perSource.some((entry) => entry.state === "failed")) this.cache.set(key, answer);
    return { data: answer, cached: false, ...(skipped ? { skipped } : {}) };
  }

  private async searchPerformersOn(
    spec: InstanceSpec,
    input: SearchPerformersInput,
    limit: number,
    page: number,
  ): Promise<{
    rows: PerformerRecord[];
    skipped: number;
    total: number | null;
    refused: string[];
    fields: string[];
    unnarrowed?: boolean;
  }> {
    if (input.query && supports(spec, "search_performers")) {
      const data = await this.ask<{
        searchPerformers?: { count?: unknown; performers?: unknown[] };
      }>(spec, documents.searchPerformersDocument(spec), { term: input.query, limit });
      return {
        ...readRows(data.searchPerformers?.performers, spec, mapPerformer, now()),
        total: supports(spec, "index_total") ? readInteger(data.searchPerformers?.count) : null,
        refused: PERFORMER_TEXT_SEARCH_IGNORES.filter((name) =>
          hasNarrowing(input as unknown as Record<string, unknown>, name),
        ),
        fields: PERFORMER_FIELDS_SEARCHED,
      };
    }

    const filters: Record<string, unknown> = {
      page,
      per_page: limit,
      sort: SORT_TO_PERFORMER_ENUM[input.sort ?? "name"] ?? "NAME",
      direction: (input.direction ?? "asc").toUpperCase(),
    };
    const refused: string[] = [];
    const criteria = takesCriteria(spec);

    if (input.name) filters.name = input.name;
    if (input.disambiguation) {
      if (criteria) filters.disambiguation = { value: input.disambiguation, modifier: "EQUALS" };
      else refused.push("disambiguation");
    }
    if (input.country) {
      if (criteria) filters.country = { value: input.country, modifier: "EQUALS" };
      else refused.push("country");
    }
    if (input.performedWith) {
      const [mine] = uuidsFor(spec, [input.performedWith]);
      if (mine === undefined) refused.push("performed_with");
      else filters.performed_with = mine;
    }
    if (input.studioId) {
      const [mine] = uuidsFor(spec, [input.studioId]);
      if (mine === undefined) refused.push("studio_id");
      else filters.studio_id = mine;
    }

    // Asking at all would spend a request on a question this catalogue cannot
    // be given, and bring back a first page that answers anything.
    if (
      !narrowingsSurvive(input as unknown as Record<string, unknown>, PERFORMER_NARROWINGS, refused)
    ) {
      return { rows: [], skipped: 0, total: null, refused, fields: [], unnarrowed: true };
    }

    const data = await this.ask<{ queryPerformers?: { count?: unknown; performers?: unknown[] } }>(
      spec,
      documents.queryPerformersDocument(spec),
      { input: filters },
    );
    return {
      ...readRows(data.queryPerformers?.performers, spec, mapPerformer, now()),
      total: supports(spec, "index_total") ? readInteger(data.queryPerformers?.count) : null,
      refused,
      fields: [],
    };
  }

  async getScene(id: string, sections: readonly string[] = ["basic"]): Promise<Read<SceneRecord>> {
    const { instance, uuid } = parseId(id, this.configured);
    const spec = INSTANCES.find((entry) => entry.id === instance)!;
    if (!this.keys[instance]) {
      throw invalidInput(
        `No key is configured for ${spec.name}, so this identifier cannot be read.`,
        `Set ${spec.envVar}.`,
      );
    }

    const wanted = {
      fingerprints: sections.includes("fingerprints"),
      images: sections.includes("images"),
    };
    const key = `scene:${instance}:${uuid}:${JSON.stringify(wanted)}`;
    const hit = this.cached<SceneRecord>(key);
    if (hit) return { data: hit, cached: true };

    const data = await this.ask<{ findScene?: unknown }>(
      spec,
      documents.findSceneDocument(spec, wanted),
      { id: uuid },
    );
    // A null payload with no error beside it is the one shape that means absence.
    if (data.findScene === null || data.findScene === undefined) {
      throw notFound(`${spec.name} holds no scene with that identifier.`, { instance: spec.id });
    }
    const record = mapScene(data.findScene, spec, now());
    if (!record) {
      throw parseFailure(`${spec.name} answered a scene this client cannot read.`, {
        instance: spec.id,
      });
    }
    this.cache.set(key, record);
    return { data: record, cached: false };
  }

  async getPerformer(
    id: string,
    sections: readonly string[] = ["basic"],
  ): Promise<Read<PerformerRecord>> {
    const { instance, uuid } = parseId(id, this.configured);
    const spec = INSTANCES.find((entry) => entry.id === instance)!;
    if (!this.keys[instance]) {
      throw invalidInput(
        `No key is configured for ${spec.name}, so this identifier cannot be read.`,
        `Set ${spec.envVar}.`,
      );
    }

    const wanted = {
      appearance: sections.includes("appearance"),
      images: sections.includes("images"),
      scenes: sections.includes("scenes"),
      studios: sections.includes("studios"),
    };
    const key = `performer:${instance}:${uuid}:${JSON.stringify(wanted)}`;
    const hit = this.cached<PerformerRecord>(key);
    if (hit) return { data: hit, cached: true };

    const data = await this.ask<{ findPerformer?: unknown }>(
      spec,
      documents.findPerformerDocument(spec, wanted),
      { id: uuid },
    );
    if (data.findPerformer === null || data.findPerformer === undefined) {
      throw notFound(`${spec.name} holds no performer with that identifier.`, {
        instance: spec.id,
      });
    }
    const record = mapPerformer(data.findPerformer, spec, now());
    if (!record) {
      throw parseFailure(`${spec.name} answered a performer this client cannot read.`, {
        instance: spec.id,
      });
    }

    let sceneSectionFailed = false;
    if (wanted.scenes && record.status === "established") {
      try {
        const answer = await this.searchScenesOn(
          spec,
          { performerIds: [formatId(spec.id, uuid)], sort: "date", direction: "desc" },
          SCENES_SECTION_LIMIT,
          1,
        );
        if (answer.unnarrowed) {
          // The catalogue could not be given the performer, so its rows would be
          // whatever it holds. An empty section here would read as a catalogue
          // that indexes nothing for this person.
          sceneSectionFailed = true;
          record.scenesUnavailable =
            "this catalogue's scene search cannot be narrowed to a performer, so it was not asked";
        } else {
          record.scenes = answer.rows;
          // The section shows one page. Saying how many the catalogue holds keeps
          // a truncated list apart from a complete one.
          record.scenesTotal = answer.total;
          record.scenesShown = answer.rows.length;
        }
      } catch (cause) {
        // The record was read, so the answer stands. The section that could not
        // be filled is named, since an unexplained gap reads as a catalogue
        // holding nothing.
        sceneSectionFailed = true;
        record.scenesUnavailable =
          cause instanceof StashboxError ? cause.code : "the section could not be read";
        this.logger?.debug(`${spec.id}: scenes section unavailable`);
      }
    }

    // A record whose section failed is not the record that was asked for, so it
    // is answered and never stored: caching it would replay the gap for the
    // lifetime of the entry.
    if (!sceneSectionFailed) this.cache.set(key, record);
    return { data: record, cached: false };
  }

  async findByFingerprint(input: FingerprintInput): Promise<Read<FingerprintResult>> {
    const { asked, absent } = this.plan("find_by_fingerprint", input.sources);
    const perSource: SourceReport[] = [...absent];
    const matches: FingerprintMatch[] = [];
    let unattributed = 0;

    for (const entry of input.fingerprints) {
      readFingerprintArgument(entry.hash, entry.algorithm);
    }

    if (input.fingerprints.length === 0) {
      throw invalidInput(
        "At least one fingerprint is required.",
        "Pass the hashes held for one file, each with its algorithm.",
      );
    }

    // A hash given twice is one question. Answering it twice would double every
    // count built from the matches.
    const seen = new Set<string>();
    const wanted = input.fingerprints.flatMap((entry) => {
      const key = `${entry.algorithm}:${entry.hash.toLowerCase()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ hash: entry.hash, algorithm: entry.algorithm }];
    });

    const retrievedAt = now();
    const settled = await Promise.all(
      asked.map(async (spec) => {
        const answerable = supports(spec, "perceptual_lookup")
          ? wanted
          : wanted.filter((entry) => entry.algorithm !== "PHASH");
        const refused = wanted
          .filter((entry) => !answerable.includes(entry))
          .map((entry) => entry.algorithm);

        if (answerable.length === 0) {
          return { spec, empty: true as const, refused, asked: answerable };
        }
        try {
          return {
            spec,
            data: await this.askFingerprints(spec, answerable),
            refused,
            asked: answerable,
          };
        } catch (cause) {
          return { spec, cause, asked: answerable };
        }
      }),
    );

    for (const outcome of settled) {
      const spec = outcome.spec;
      if ("empty" in outcome) {
        // Every algorithm asked for is one this catalogue cannot search. Saying
        // it looked and found nothing would answer for a question never put.
        perSource.push({
          source: spec.id,
          name: spec.name,
          state: "absent",
          reason: `this catalogue's fingerprint route does not search ${[...new Set(outcome.refused)].join(", ")}`,
        });
        continue;
      }
      if (!("data" in outcome)) {
        perSource.push(failureReport(spec, outcome.cause, "fingerprint lookup"));
        continue;
      }
      const refusedHere = [...new Set(outcome.refused)];
      {
        const data = outcome.data;
        const groups = Array.isArray(data.findScenesBySceneFingerprints)
          ? data.findScenesBySceneFingerprints
          : [];
        let found = 0;
        let attributed = 0;
        let contributed = 0;
        for (const group of groups) {
          for (const raw of Array.isArray(group) ? group : []) {
            const scene = mapScene(raw, spec, retrievedAt);
            if (!scene) continue;
            found += 1;

            // Only a hash this scene carries produces a match. The catalogue
            // says which scenes answered and never which hash reached them, so
            // pairing every scene with every hash asked would report a
            // resemblance as an identity for the hashes that never hit.
            const hits = outcome.asked.filter((entry) =>
              scene.fingerprints?.some(
                (row) =>
                  row.algorithm === entry.algorithm &&
                  row.hash.toLowerCase() === entry.hash.toLowerCase(),
              ),
            );

            if (hits.length === 0) {
              // Answered with, without the fingerprint that reached it.
              // The catalogue matched this scene without returning the
              // fingerprint that did it. Which hash reached it is unknown, and
              // saying so beats naming one.
              unattributed += 1;
              continue;
            }

            attributed += 1;
            for (const entry of hits) {
              const held =
                scene.fingerprints?.find(
                  (row) =>
                    row.algorithm === entry.algorithm &&
                    row.hash.toLowerCase() === entry.hash.toLowerCase(),
                ) ?? null;
              contributed += 1;
              matches.push({
                scene,
                algorithm: entry.algorithm,
                matchKind: entry.algorithm === "PHASH" ? "perceptual_similarity" : "exact_file",
                fingerprint: held,
              });
            }
          }
        }
        // The count is scenes this catalogue answered with, so it stays a count
        // of records whatever number of hashes was asked.
        perSource.push({
          source: spec.id,
          name: spec.name,
          state: "answered",
          // Matches this catalogue contributed, which is what the answer holds.
          // A scene reached by two of the hashes asked carries two of them.
          count: contributed,
          ...(attributed !== contributed ? { records: attributed } : {}),
          ...(found - attributed > 0 ? { unattributed: found - attributed } : {}),
          ...(refusedHere.length ? { narrowingsNotReceived: refusedHere } : {}),
        });
      }
    }

    return { data: { matches, perSource, unattributed, asked: wanted }, cached: false };
  }
}

/** The moment a read came off a catalogue, stamped once per request. */
function now(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * A setting held inside its range.
 *
 * Anything outside it, and anything that is not a number, falls back to the
 * default: a value silently clamped would let a consumer believe a setting took
 * effect when the opposite is true.
 */
function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const whole = Math.trunc(value);
  return whole < min || whole > max ? fallback : whole;
}

/** Rows a catalogue answered. Anything unreadable is left out and counted. */
function readRows<T>(
  raw: unknown,
  spec: InstanceSpec,
  map: (entry: unknown, spec: InstanceSpec, retrievedAt: string) => T | null,
  retrievedAt: string,
): { rows: T[]; skipped: number } {
  const rows: T[] = [];
  let skipped = 0;
  for (const entry of Array.isArray(raw) ? raw : []) {
    const mapped = map(entry, spec, retrievedAt);
    if (mapped) rows.push(mapped);
    else skipped += 1;
  }
  return { rows, skipped };
}

/**
 * One row from each catalogue in turn.
 *
 * Ordering by anything else would rank rows on a score the catalogues do not
 * share, and nothing is removed: the same string from two catalogues is two
 * records describing two things.
 */
function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const row = group[index];
      if (row !== undefined) out.push(row);
    }
  }
  return out;
}

function failureReport(spec: InstanceSpec, cause: unknown, moment: string): SourceReport {
  const error = cause instanceof StashboxError ? cause.code : undefined;
  return {
    source: spec.id,
    name: spec.name,
    state: "failed",
    moment,
    reason: cause instanceof Error ? cause.message : "an error this client cannot describe",
    ...(error ? { error } : {}),
  };
}

/**
 * Identifiers a catalogue can act on: the ones it minted itself.
 *
 * A UUID belongs to the catalogue that issued it, so an identifier naming
 * another one is dropped here. A bare UUID names no catalogue and is refused
 * rather than sent to all of them, which is the rule every other identifier
 * follows.
 */
/**
 * Whether a catalogue was left with any of the narrowings the caller wrote.
 *
 * A catalogue that could take none of them holds no question, and its first page
 * answers whatever was asked, which is what makes it look like an answer.
 */
function narrowingsSurvive(
  input: Record<string, unknown>,
  names: readonly string[],
  refused: readonly string[],
): boolean {
  const given = names.filter((name) => hasNarrowing(input, name));
  return given.length === 0 || given.some((name) => !refused.includes(name));
}

function uuidsFor(spec: InstanceSpec, ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const separator = id.indexOf(":");
    if (separator === -1) return [];
    return id.slice(0, separator) === spec.id ? [id.slice(separator + 1)] : [];
  });
}
