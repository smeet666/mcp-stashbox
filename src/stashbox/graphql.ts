/**
 * One GraphQL request against one catalogue.
 *
 * The trap this module exists for: **a refusal arrives inside a success.** These
 * catalogues answer HTTP 200 with an `errors` array and a payload that is null,
 * so a client reading the status code and the payload alone renders "there is no
 * such record" where the catalogue said "I do not authorise you to ask". Errors
 * are therefore read before the payload, every time.
 */

import {
  invalidInput,
  networkError,
  parseFailure,
  rateLimited,
  timeout,
  StashboxError,
} from "../errors.js";
import type { Logger } from "../config.js";
import type { InstanceSpec } from "./instances.js";
import type { RateLimiter } from "./rateLimiter.js";
import { sleep } from "./rateLimiter.js";

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

export interface Transport {
  request<T>(spec: InstanceSpec, apiKey: string, body: GraphQLRequest): Promise<T>;
}

export interface HttpTransportOptions {
  fetchImpl: typeof fetch;
  userAgent: string;
  timeoutMs: number;
  maxRetries: number;
  /** Ceiling on one answer's body, so a stream nobody ends cannot fill memory. */
  maxBodyBytes?: number;
  /** One limiter per catalogue, looked up by instance id. */
  limiterFor: (spec: InstanceSpec) => RateLimiter;
  logger?: Logger;
}

interface GraphQLError {
  message?: unknown;
}

interface GraphQLBody {
  data?: unknown;
  errors?: GraphQLError[];
}

/** Raised when a request outlives its deadline, so the cause names itself. */
class DeadlineReached extends Error {
  constructor() {
    super("deadline reached");
    this.name = "TimeoutError";
  }
}

/** Language a catalogue uses when it is asking for room. */
const ASKS_FOR_ROOM = /(rate.?limit|too many requests|slow down|throttl)/i;
/** Language a catalogue uses when the key is missing, wrong or insufficient. */
const REFUSES_THE_ASK =
  /(not authori[sz]ed|unauthenticated|unauthorized|forbidden|invalid.*token)/i;

export function createHttpTransport(options: HttpTransportOptions): Transport {
  const { fetchImpl, userAgent, timeoutMs, maxRetries, limiterFor, logger } = options;
  const maxBodyBytes = options.maxBodyBytes ?? 32 * 1024 * 1024;

  return {
    async request<T>(spec: InstanceSpec, apiKey: string, body: GraphQLRequest): Promise<T> {
      const limiter = limiterFor(spec);

      return limiter.schedule(async () => {
        let lastTransient: StashboxError | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          // Claimed per attempt: a request that retries makes several calls and
          // each of them owes the catalogue the same gap.
          await limiter.beforeRequest();

          let response: Response;
          // The deadline runs on an ordinary timer rather than on a built-in
          // one, so a test clock can reach it and the behaviour under a
          // catalogue that never answers is settled by assertion.
          const deadline = new AbortController();
          const timer = setTimeout(() => deadline.abort(new DeadlineReached()), timeoutMs);
          try {
            response = await fetchImpl(spec.endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                // The catalogue reads the key from this header. It travels with
                // every request, since none of them answer without it.
                ApiKey: apiKey,
                "User-Agent": userAgent,
              },
              body: JSON.stringify(body),
              signal: deadline.signal,
            });
          } catch (cause) {
            const aborted =
              deadline.signal.aborted ||
              cause instanceof DeadlineReached ||
              (cause instanceof Error &&
                (cause.name === "TimeoutError" || cause.name === "AbortError"));
            const error = aborted
              ? timeout(`${spec.name} did not answer within ${timeoutMs} ms.`, {
                  url: spec.endpoint,
                  instance: spec.id,
                })
              : networkError(`The request to ${spec.name} did not complete.`, {
                  url: spec.endpoint,
                  instance: spec.id,
                });
            clearTimeout(timer);
            if (aborted || attempt === maxRetries) throw error;
            lastTransient = error;
            await backoff(attempt, limiter);
            continue;
          }

          if (response.status === 429) {
            clearTimeout(timer);
            limiter.pushBack();
            const error = rateLimited(`${spec.name} asked this client to slow down.`, {
              url: spec.endpoint,
              status: 429,
              instance: spec.id,
            });
            if (attempt === maxRetries) throw error;
            lastTransient = error;
            await backoff(attempt, limiter);
            continue;
          }

          if (response.status >= 500) {
            clearTimeout(timer);
            const error = networkError(`${spec.name} answered ${response.status}.`, {
              url: spec.endpoint,
              status: response.status,
              instance: spec.id,
            });
            if (attempt === maxRetries) throw error;
            lastTransient = error;
            logger?.debug(`${spec.id}: ${response.status}, retrying`);
            await backoff(attempt, limiter);
            continue;
          }

          let text: string;
          try {
            text = await readBody(response, spec, maxBodyBytes);
          } catch (cause) {
            throw cause instanceof StashboxError
              ? cause
              : timeout(`${spec.name} stopped part-way through its answer.`, {
                  url: spec.endpoint,
                  instance: spec.id,
                });
          } finally {
            clearTimeout(timer);
          }

          // The statuses that carry their whole meaning in the status line. A
          // refusal answers with an empty body, so reading one first turns the
          // one mistake a new caller makes into an unreadable catalogue.
          if (response.status === 401 || response.status === 403) {
            throw invalidInput(
              `${spec.name} refused this client's key.`,
              `Set ${spec.envVar} to a key for ${spec.name}, which is issued from a profile on that catalogue. This says nothing about whether the record exists.`,
            );
          }
          if (response.status === 429) {
            limiter.pushBack();
            throw rateLimited(`${spec.name} asked this client to slow down.`, {
              url: spec.endpoint,
              instance: spec.id,
            });
          }

          let parsed: GraphQLBody;
          try {
            parsed = JSON.parse(text) as GraphQLBody;
          } catch {
            throw parseFailure(
              text.trim() === ""
                ? `${spec.name} answered ${response.status} with an empty body.`
                : `${spec.name} answered something this client cannot read.`,
              { url: spec.endpoint, status: response.status, instance: spec.id },
            );
          }

          // Errors first. A payload beside them describes nothing that was asked.
          const failure = readErrors(parsed, spec);
          if (failure) {
            if (failure.code === "rate_limited") limiter.pushBack();
            throw failure;
          }

          if (response.status >= 400) {
            throw parseFailure(
              `${spec.name} answered ${response.status} without saying what was wrong.`,
              { url: spec.endpoint, status: response.status, instance: spec.id },
            );
          }

          if (parsed.data === undefined || parsed.data === null) {
            throw parseFailure(`${spec.name} answered with no payload and no error.`, {
              url: spec.endpoint,
              instance: spec.id,
            });
          }

          limiter.succeeded();
          return parsed.data as T;
        }

        // Every attempt was spent on something transient.
        throw (
          lastTransient ??
          networkError(`The request to ${spec.name} did not complete.`, {
            url: spec.endpoint,
            instance: spec.id,
          })
        );
      });
    },
  };
}

/** The error a body carries, read as the kind of failure it describes. */
function readErrors(body: GraphQLBody, spec: InstanceSpec): StashboxError | undefined {
  const errors = body.errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;

  const messages = errors
    .map((entry) => (typeof entry?.message === "string" ? entry.message : ""))
    .filter((message) => message !== "");
  const joined = messages.join("; ") || "an error it did not describe";

  if (messages.some((message) => ASKS_FOR_ROOM.test(message))) {
    return rateLimited(`${spec.name} asked this client to slow down.`, {
      url: spec.endpoint,
      instance: spec.id,
    });
  }

  if (messages.some((message) => REFUSES_THE_ASK.test(message))) {
    return invalidInput(
      `${spec.name} refused the request: ${joined}.`,
      `Set ${spec.envVar} to a key for ${spec.name}. This says nothing about whether the record exists.`,
    );
  }

  return parseFailure(`${spec.name} answered with an error: ${joined}.`, {
    url: spec.endpoint,
    instance: spec.id,
  });
}

/**
 * The body, refused past a ceiling.
 *
 * A catalogue answering an unbounded stream would otherwise be read into memory
 * whole, and the size of an answer is the one thing a caller cannot see before
 * receiving it.
 */
async function readBody(response: Response, spec: InstanceSpec, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw parseFailure(`${spec.name} answered more than this client will read.`, {
      url: spec.endpoint,
      instance: spec.id,
    });
  }
  const text = await response.text();
  if (text.length > maxBytes) {
    throw parseFailure(`${spec.name} answered more than this client will read.`, {
      url: spec.endpoint,
      instance: spec.id,
    });
  }
  return text;
}

/** Widening waits between attempts, bounded so a retry never looks hung. */
async function backoff(attempt: number, limiter: RateLimiter): Promise<void> {
  const wait = Math.min(limiter.currentIntervalMs * 2 ** attempt, 30_000);
  await sleep(wait);
}
