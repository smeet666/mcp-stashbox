/**
 * One GraphQL request against one catalogue, and the reading it gives to every
 * answer that can come back.
 *
 * The rule that governs this file: a failure never arrives as an emptiness.
 * These catalogues answer HTTP 200 while refusing the question, putting the
 * refusal in an `errors` array beside a payload of nulls, so a client that
 * reads the payload first renders "this record does not exist" where the
 * catalogue said "I do not authorise you to ask". Every failure here leaves as
 * one of the six codes, naming the moment it happened, and only a payload with
 * no error beside it reaches the caller as data.
 *
 * Diagnostics go to the logger, which writes to stderr: stdout carries the
 * protocol.
 */

import type { Logger } from "../config.js";
import { StashboxError, parseFailure, rateLimited } from "../errors.js";
import { CONTACT_URL, PKG_NAME, VERSION } from "../version.js";
import type { InstanceSpec } from "./instances.js";
import { RateLimiter, sleep } from "./rateLimiter.js";

/** The first wait between two attempts, which doubles with each further one. */
const FIRST_RETRY_WAIT_MS = 500;

/** The widest wait this client puts between two attempts of its own accord. */
const LONGEST_RETRY_WAIT_MS = 8000;

/**
 * The longest delay a `Retry-After` header is honoured for. A catalogue naming
 * a longer one is telling the caller to come back later, and holding the call
 * open that long would look like a client that has hung.
 */
const LONGEST_HONOURED_RETRY_AFTER_MS = 60_000;

/** A refusal to answer, which every catalogue phrases in its own words. */
const REFUSAL = /\b(?:not|un)\s*authori[sz]ed\b|\bunauthenticated\b|\binvalid\s+api\s*key\b/i;

/** A catalogue naming its own limit inside an otherwise successful answer. */
const ASKING_FOR_ROOM = /\brate[\s-]?limit\b|\btoo many requests\b/i;

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

export interface HttpTransportOptions {
  fetchImpl: typeof fetch;
  /** The name this client gives itself, completed when it carries no contact. */
  userAgent: string;
  /** How long one attempt may take before the catalogue is called silent. */
  timeoutMs: number;
  /** How many attempts follow the first one. */
  maxRetries: number;
  /** The pace owed to the instance a request is going to. */
  limiterFor: (spec: InstanceSpec) => RateLimiter;
  logger: Logger;
}

export interface HttpTransport {
  request: <T>(spec: InstanceSpec, apiKey: string, body: GraphQLRequest) => Promise<T>;
}

/** A body carrying an answer, a refusal, or both. */
interface GraphQLBody {
  data?: unknown;
  errors?: unknown;
}

/** What one attempt produced: a payload, or a failure and whether asking again is worth it. */
type Attempt =
  | { readonly outcome: "answered"; readonly data: unknown }
  | {
      readonly outcome: "failed";
      readonly error: StashboxError;
      readonly retryable: boolean;
      readonly namedDelayMs?: number;
    };

export function createHttpTransport(options: HttpTransportOptions): HttpTransport {
  const { fetchImpl, timeoutMs, maxRetries, limiterFor, logger } = options;
  const userAgent = completeUserAgent(options.userAgent);

  async function attemptOnce(
    spec: InstanceSpec,
    apiKey: string,
    body: GraphQLRequest,
    limiter: RateLimiter,
  ): Promise<Attempt> {
    const where = { instance: spec.name, url: spec.endpoint };
    const controller = new AbortController();
    // The deadline runs on a timer, so silence is reported at a stated instant
    // instead of waiting on whatever the socket decides.
    const deadline = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent,
      };
      // A key nobody set is a header nobody sends: an empty one would be read
      // as a credential presented and refused.
      if (apiKey) headers.ApiKey = apiKey;

      response = await fetchImpl(spec.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: body.query, variables: body.variables }),
        signal: controller.signal,
      });
    } catch (cause) {
      clearTimeout(deadline);
      if (isAbort(cause)) {
        return {
          outcome: "failed",
          error: new StashboxError(
            "timeout",
            `${spec.name} did not answer within ${timeoutMs} ms.`,
            { ...where, hint: "The catalogue may be slow. Ask again in a moment." },
          ),
          retryable: true,
        };
      }
      return {
        outcome: "failed",
        error: new StashboxError("network_error", `${spec.name} could not be reached.`, {
          ...where,
          hint: "The request did not complete, so the catalogue said nothing about this record.",
        }),
        retryable: true,
      };
    }

    // The status line is read before the body because it carries its whole
    // meaning on its own: a catalogue refusing a key answers an empty body, and
    // reading that body first turns the one mistake a new caller makes into a
    // catalogue that seems unreadable.
    const status = response.status;

    if (status === 429) {
      // Room is given back whether or not this attempt is the last: asking
      // again at the old pace is asking the catalogue to refuse twice.
      limiter.pushBack();
      const namedDelayMs = readRetryAfter(response.headers.get("retry-after"));
      const failure: Attempt = {
        outcome: "failed",
        error: rateLimited(`${spec.name} asked this client to slow down.`, {
          ...where,
          status,
        }),
        retryable: true,
        ...(namedDelayMs === undefined ? {} : { namedDelayMs }),
      };
      return failure;
    }

    if (status === 401 || status === 403) {
      return {
        outcome: "failed",
        error: new StashboxError("invalid_input", `${spec.name} refused the key it was given.`, {
          ...where,
          status,
          hint: `Set ${spec.envVar} to a key ${spec.name} accepts. This says nothing about whether the record exists.`,
        }),
        retryable: false,
      };
    }

    if (status >= 500) {
      return {
        outcome: "failed",
        error: new StashboxError("network_error", `${spec.name} answered ${status}.`, {
          ...where,
          status,
          hint: "The catalogue is having trouble. Ask again in a moment.",
        }),
        retryable: true,
      };
    }

    if (status >= 400) {
      return {
        outcome: "failed",
        error: parseFailure(`${spec.name} answered ${status} to a request it was asked.`, {
          ...where,
          status,
        }),
        retryable: false,
      };
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      // A body that stops part-way through is an answer that started and never
      // arrived, which is silence rather than a connection that never opened.
      return {
        outcome: "failed",
        error: new StashboxError("timeout", `${spec.name} stopped part-way through its answer.`, {
          ...where,
          status,
        }),
        retryable: true,
      };
    } finally {
      clearTimeout(deadline);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        outcome: "failed",
        error: parseFailure(`${spec.name} answered something that is not JSON.`, {
          ...where,
          status,
        }),
        retryable: false,
      };
    }

    return readBody(spec, status, parsed, limiter);
  }

  async function request<T>(spec: InstanceSpec, apiKey: string, body: GraphQLRequest): Promise<T> {
    const limiter = limiterFor(spec);
    let attemptsLeft = maxRetries;
    let wait = FIRST_RETRY_WAIT_MS;

    for (;;) {
      const attempt = await limiter.schedule(() => attemptOnce(spec, apiKey, body, limiter));

      if (attempt.outcome === "answered") {
        limiter.succeeded();
        return attempt.data as T;
      }

      const named = attempt.namedDelayMs;
      if (named !== undefined && named > LONGEST_HONOURED_RETRY_AFTER_MS) {
        throw attempt.error;
      }
      if (!attempt.retryable || attemptsLeft <= 0) throw attempt.error;

      attemptsLeft -= 1;
      // A delay the catalogue named governs, since it knows when it will answer
      // again. Where it names none, the wait widens with each attempt and stops
      // at a bound, so a retry never looks like a client that has hung.
      const held = Math.max(wait, named ?? 0);
      logger.debug(
        `${spec.name} answered ${attempt.error.code}, asking again in ${held} ms (${attemptsLeft} attempts left after this one)`,
      );
      await sleep(held);
      wait = Math.min(LONGEST_RETRY_WAIT_MS, wait * 2);
    }
  }

  return { request };
}

/**
 * The reading of a body that arrived whole.
 *
 * The `errors` array is read before the payload: a body carrying both states a
 * refusal beside whatever it managed to answer, and returning the payload would
 * publish an absence the catalogue never stated.
 */
function readBody(
  spec: InstanceSpec,
  status: number,
  parsed: unknown,
  limiter: RateLimiter,
): Attempt {
  const where = { instance: spec.name, url: spec.endpoint, status };

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      outcome: "failed",
      error: parseFailure(`${spec.name} answered JSON that is not a GraphQL response.`, where),
      retryable: false,
    };
  }

  const body = parsed as GraphQLBody;
  const errors = Array.isArray(body.errors) ? body.errors : undefined;
  const carriesData = "data" in body;

  if (body.errors !== undefined && errors === undefined) {
    return {
      outcome: "failed",
      error: parseFailure(`${spec.name} answered an errors field that is not a list.`, where),
      retryable: false,
    };
  }

  if (errors !== undefined && errors.length > 0) {
    const messages = errors.map(messageOf).filter((message) => message.length > 0);
    const said = messages.join("; ") || "an error it did not describe";

    if (messages.some((message) => REFUSAL.test(message))) {
      return {
        outcome: "failed",
        error: new StashboxError("invalid_input", `${spec.name} refused the request: ${said}`, {
          ...where,
          hint: `Set ${spec.envVar} to a key ${spec.name} accepts, or ask for something this key may read. This says nothing about whether the record exists.`,
        }),
        retryable: false,
      };
    }

    if (messages.some((message) => ASKING_FOR_ROOM.test(message))) {
      limiter.pushBack();
      return {
        outcome: "failed",
        error: rateLimited(`${spec.name} asked this client to slow down: ${said}`, where),
        retryable: true,
      };
    }

    // An error with no reading here is an answer this client cannot use. Calling
    // it an absence would deny a record nobody said was missing.
    return {
      outcome: "failed",
      error: parseFailure(`${spec.name} answered an error this client cannot read: ${said}`, where),
      retryable: false,
    };
  }

  // An empty errors array states no error, so the payload stands.
  if (carriesData && body.data !== null && body.data !== undefined) {
    return { outcome: "answered", data: body.data };
  }

  return {
    outcome: "failed",
    error: parseFailure(`${spec.name} answered neither a payload nor an error.`, where),
    retryable: false,
  };
}

function messageOf(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (typeof entry === "object" && entry !== null) {
    const message = (entry as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * The delay a catalogue named, in milliseconds, when the header can be read.
 *
 * A header holding a number of seconds and one holding a date are both valid,
 * and a header holding neither is trusted for nothing: waiting on a value this
 * client guessed at would be its own delay wearing the catalogue's name.
 */
function readRetryAfter(written: string | null): number | undefined {
  if (written === null) return undefined;
  const value = written.trim();
  if (value === "") return undefined;

  if (/^\d+$/.test(value)) return Number(value) * 1000;

  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - Date.now());
}

/**
 * The name this client sends, always carrying this project and an address where
 * a person can be reached. A caller may put their own name in front of it; a
 * catalogue reading its logs still learns what asked and who to write to.
 */
function completeUserAgent(written: string): string {
  const own = written.trim();
  const identifies = own.includes(PKG_NAME) && own.includes(CONTACT_URL);
  const mine = `${PKG_NAME}/${VERSION} (+${CONTACT_URL})`;
  if (own === "") return mine;
  return identifies ? own : `${own} ${mine}`;
}

function isAbort(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { name?: unknown }).name === "AbortError"
  );
}
