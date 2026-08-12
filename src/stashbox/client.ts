/**
 * Several catalogues read as one, with every seam left visible.
 *
 * This is a library and nothing more: it holds the transport, the pace owed to
 * each catalogue, the store and the error taxonomy, and it imports no protocol,
 * so a program can take it as an ordinary dependency and get all four with
 * nothing attached. Every read comes back as `Read<T>`, which says whether a
 * catalogue was asked at all.
 *
 * What the class owns is the machinery. What each of the five routes owes a
 * caller lives in the route's own module, because the rules this client exists
 * to keep are rules about answers, and a rule stated at one site out of five is
 * a rule honoured at one site out of five.
 *
 * Pacing is owed to these catalogues rather than chosen: one request at a time
 * per catalogue, at an interval the configuration may widen and can never lower
 * below the floor. A caller supplying a transport of their own owns the pace it
 * keeps.
 */

import {
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  type Logger,
} from "../config.js";
import type {
  FingerprintResult,
  PerformerRecord,
  Read,
  RowsResult,
  SceneRecord,
} from "../types.js";
import { Cache } from "./cache.js";
import { findByFingerprint, type FindByFingerprintInput } from "./findByFingerprint.js";
import { getPerformer } from "./getPerformer.js";
import { getScene } from "./getScene.js";
import { createHttpTransport, type HttpTransport } from "./graphql.js";
import { INSTANCES, type InstanceId, type InstanceSpec } from "./instances.js";
import type { PerformerSection, SceneSection } from "./queries.js";
import { RateLimiter } from "./rateLimiter.js";
import { searchPerformers, type SearchPerformersInput } from "./searchPerformers.js";
import { searchScenes, type SearchScenesInput } from "./searchScenes.js";

export type { FindByFingerprintInput, SearchPerformersInput, SearchScenesInput };
export type { PerformerSection, SceneSection };

export interface StashboxClientOptions {
  /** One key per catalogue. A catalogue with no key is never asked. */
  keys?: Partial<Record<InstanceId, string>>;
  fetchImpl?: typeof fetch;
  /** A caller's own name, which never replaces this client's. */
  userAgent?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  logger?: Logger;
  /** A transport supplied by the caller, which owns the pace it keeps. */
  transport?: HttpTransport;
}

/**
 * What a route may read of the client.
 *
 * The routes are given this rather than the client itself, so what one of them
 * can reach is written here and stays readable.
 */
export interface RouteContext {
  transport: HttpTransport;
  cache: Cache<unknown>;
  logger: Logger;
  /** The catalogues a key is held for, in the order the registry declares them. */
  configured: readonly InstanceId[];
  keyFor: (id: InstanceId) => string | undefined;
  /** The moment a record came off a catalogue, which every record carries. */
  now: () => string;
}

const DEFAULTS = {
  timeoutMs: 20_000,
  maxRetries: 3,
  cacheTtlMs: 300_000,
  cacheMaxEntries: 500,
} as const;

export class StashboxClient {
  readonly #keys: Partial<Record<InstanceId, string>>;
  readonly #cache: Cache<unknown>;
  readonly #logger: Logger;
  readonly #transport: HttpTransport;
  readonly #intervalMs: number;
  /** One file per catalogue, so a slow one never holds up another. */
  readonly #limiters = new Map<InstanceId, RateLimiter>();

  /** The catalogues this client holds a key for, which are the ones it can ask. */
  readonly configured: readonly InstanceId[];

  constructor(options: StashboxClientOptions = {}) {
    this.#keys = { ...options.keys };
    this.configured = INSTANCES.map((spec) => spec.id).filter((id) => this.#keys[id] !== undefined);
    this.#logger = options.logger ?? createLogger("error");
    this.#cache = new Cache<unknown>(
      options.cacheTtlMs ?? DEFAULTS.cacheTtlMs,
      options.cacheMaxEntries ?? DEFAULTS.cacheMaxEntries,
    );
    // The floor holds whatever the configuration asks: these catalogues are free
    // to use, so a setting may make this client slower and never faster.
    this.#intervalMs = Math.min(
      MAX_ALLOWED_INTERVAL_MS,
      Math.max(MIN_ALLOWED_INTERVAL_MS, options.minIntervalMs ?? MIN_ALLOWED_INTERVAL_MS),
    );
    this.#transport =
      options.transport ??
      createHttpTransport({
        fetchImpl: options.fetchImpl ?? fetch,
        userAgent: options.userAgent ?? "",
        timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
        maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
        limiterFor: (spec) => this.#limiterFor(spec),
        logger: this.#logger,
      });
  }

  searchScenes(input: SearchScenesInput): Promise<Read<RowsResult<SceneRecord>>> {
    return searchScenes(this.#context(), input);
  }

  searchPerformers(input: SearchPerformersInput): Promise<Read<RowsResult<PerformerRecord>>> {
    return searchPerformers(this.#context(), input);
  }

  getScene(id: string, sections?: readonly SceneSection[]): Promise<Read<SceneRecord>> {
    return getScene(this.#context(), id, sections);
  }

  getPerformer(id: string, sections?: readonly PerformerSection[]): Promise<Read<PerformerRecord>> {
    return getPerformer(this.#context(), id, sections);
  }

  findByFingerprint(input: FindByFingerprintInput): Promise<Read<FingerprintResult>> {
    return findByFingerprint(this.#context(), input);
  }

  /** Empties the store, so the next question reaches the catalogues themselves. */
  clearCache(): void {
    this.#cache.clear();
  }

  #context(): RouteContext {
    return {
      transport: this.#transport,
      cache: this.#cache,
      logger: this.#logger,
      configured: this.configured,
      keyFor: (id) => this.#keys[id],
      now: () => new Date().toISOString(),
    };
  }

  #limiterFor(spec: InstanceSpec): RateLimiter {
    const held = this.#limiters.get(spec.id);
    if (held !== undefined) return held;
    const limiter = new RateLimiter({ intervalMs: this.#intervalMs });
    this.#limiters.set(spec.id, limiter);
    return limiter;
  }
}
