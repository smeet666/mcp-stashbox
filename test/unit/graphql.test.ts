/**
 * One GraphQL request against one instance, and what it does with every answer
 * it can get back.
 *
 * The central case: this API answers HTTP 200 while refusing the question. The
 * refusal lives in an `errors` array beside a payload of nulls, so a client that
 * reads the status code and the payload renders "this record does not exist"
 * where the instance said "I do not authorise you to ask".
 *
 * The clock is fake and pinned, so a test that names a wait names an exact
 * number rather than a range a slow machine might miss.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../src/config.js";
import { StashboxError } from "../../src/errors.js";
import { createHttpTransport } from "../../src/stashbox/graphql.js";
import type { InstanceSpec } from "../../src/stashbox/instances.js";
import { RateLimiter } from "../../src/stashbox/rateLimiter.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

/** Time enough to carry a call through every wait it can take between attempts. */
const AMPLE_MS = 600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

const STASHDB: InstanceSpec = {
  id: "stashdb",
  name: "StashDB",
  endpoint: "https://stashdb.org/graphql",
  webBase: "https://stashdb.org",
  envVar: "STASHBOX_STASHDB_KEY",
  capabilities: [
    "search_scenes",
    "search_performers",
    "get_scene",
    "get_performer",
    "find_by_fingerprint",
    "site_categories",
    "fingerprint_reports",
  ],
  routes: { get_scene: "findScene" },
  answersWith: {},
  filters: "criteria" as const,
  facetedSearch: true,
  measuredAt: "2026-08-13",
};

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
  at: number;
}

/**
 * A fetch answering a scripted sequence, one step per attempt, recording what it
 * was asked and the clock reading of each attempt. The last step answers every
 * further attempt, so a retry test states how many attempts happened rather than
 * running out of script.
 */
function scriptedFetch(steps: Array<() => Response | Promise<Response>>): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
  count: () => number;
} {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init, at: Date.now() });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (!step) throw new Error("scriptedFetch was given no steps");
    return step();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, count: () => calls.length };
}

/** A fetch that never answers, and rejects the way a real one does on abort. */
function hangingFetch(): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    })) as unknown as typeof fetch;
}

/** A header value, whichever of the three shapes `fetch` accepts was used. */
function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
  const entries = Array.isArray(headers)
    ? (headers as string[][])
    : Object.entries(headers as Record<string, string>);
  for (const [key, value] of entries) {
    if (String(key).toLowerCase() === name.toLowerCase()) return String(value);
  }
  return null;
}

async function captureAsync(
  fn: () => Promise<unknown>,
): Promise<{ threw: boolean; error: unknown; returned: unknown }> {
  try {
    return { threw: false, error: undefined, returned: await fn() };
  } catch (error) {
    return { threw: true, error, returned: undefined };
  }
}

/**
 * Carries `call` to its outcome on a fake clock. The rejection is held while the
 * clock moves, so a call that fails does so at the `await` the test writes.
 */
async function settle<T>(call: Promise<T>, ampleMs: number): Promise<T> {
  const held = call.catch(() => undefined);
  await vi.advanceTimersByTimeAsync(ampleMs);
  await held;
  return call;
}

/** The transport under test, built from the options its factory declares. */
function transport(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  // Every request in a test goes to the same instance, so one limiter backs the
  // whole transport and the gap between two calls is the gap that instance owes.
  const limiter = new RateLimiter({ intervalMs: 1000 });
  return createHttpTransport({
    fetchImpl,
    userAgent: "mcp-stashbox/0.1.0 (+https://github.com/smeet666/mcp-stashbox)",
    timeoutMs: 5000,
    maxRetries: 2,
    limiterFor: () => limiter,
    logger: silentLogger,
    ...overrides,
  });
}

const FIND_PERFORMER = {
  query: "query FindPerformer($id: ID!) { findPerformer(id: $id) { id name } }",
  variables: { id: "9b1c8f2e-0000-4000-8000-0000000000aa" },
};

function errorOf(outcome: { error: unknown }): StashboxError {
  expect(outcome.error).toBeInstanceOf(StashboxError);
  return outcome.error as StashboxError;
}

describe("createHttpTransport, a clean answer", () => {
  it("returns the payload of a body carrying data and no errors", async () => {
    const { fetchImpl } = scriptedFetch([
      () => jsonResponse({ data: { findPerformer: { id: "abc", name: "A Name" } } }),
    ]);

    const data = await settle(
      transport(fetchImpl).request<{ findPerformer: { id: string; name: string } }>(
        STASHDB,
        "key-1",
        FIND_PERFORMER,
      ),
      AMPLE_MS,
    );

    expect(data).toEqual({ findPerformer: { id: "abc", name: "A Name" } });
  });

  it("carries the key in the ApiKey header and the configured agent in User-Agent", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => jsonResponse({ data: { findPerformer: null } }),
    ]);

    await settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS);

    expect(calls).toHaveLength(1);
    expect(headerOf(calls[0]!.init, "ApiKey")).toBe("key-1");
    expect(headerOf(calls[0]!.init, "User-Agent")).toBe(
      "mcp-stashbox/0.1.0 (+https://github.com/smeet666/mcp-stashbox)",
    );
  });

  it("posts the query and its variables to the instance's endpoint", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => jsonResponse({ data: { findPerformer: null } }),
    ]);

    await settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS);

    expect(calls[0]!.url).toBe("https://stashdb.org/graphql");
    expect(String(calls[0]!.init?.method).toUpperCase()).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      query: FIND_PERFORMER.query,
      variables: FIND_PERFORMER.variables,
    });
  });

  it("spaces two requests to one instance by the limiter's interval", async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => jsonResponse({ data: { findPerformer: null } }),
    ]);
    const sut = transport(fetchImpl);

    const both = Promise.all([
      sut.request(STASHDB, "key-1", FIND_PERFORMER),
      sut.request(STASHDB, "key-1", FIND_PERFORMER),
    ]);
    await settle(both, AMPLE_MS);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.at).toBe(EPOCH.getTime());
    expect(calls[1]!.at).toBe(EPOCH.getTime() + 1000);
  });
});

describe("createHttpTransport, an error inside a success", () => {
  /**
   * The measured refusal: status 200, a message in `errors`, and a payload whose
   * only field is null. Reading the payload first would report an absence the
   * instance never stated, so the code says the request was refused.
   */
  it("reads the errors array before the payload", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse({
          errors: [{ message: "not authorized", path: ["findPerformer"] }],
          data: { findPerformer: null },
        }),
    ]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(outcome.threw).toBe(true);
    expect(errorOf(outcome).code).toBe("invalid_input");
  });

  it("throws rather than returning the payload of a body carrying both", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse({
          errors: [{ message: "not authorized", path: ["findScene", "fingerprints"] }],
          data: { findScene: { id: "abc", title: "A Title" } },
        }),
    ]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(outcome.threw).toBe(true);
    expect(outcome.returned).toBeUndefined();
  });

  it("names the instance's key variable when the instance refuses to be asked", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse({
          errors: [{ message: "not authorized", path: ["findPerformer"] }],
          data: { findPerformer: null },
        }),
    ]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    const error = errorOf(outcome);
    expect(error.code).toBe("invalid_input");
    expect(error.details.hint).toContain("STASHBOX_STASHDB_KEY");
  });

  it("reads the refusal whatever case it is written in", async () => {
    for (const message of ["not authorized", "Not Authorized", "NOT AUTHORIZED"]) {
      const { fetchImpl } = scriptedFetch([
        () => jsonResponse({ errors: [{ message }], data: { findPerformer: null } }),
      ]);

      const outcome = await captureAsync(() =>
        settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
      );

      expect(errorOf(outcome).code).toBe("invalid_input");
    }
  });

  it("calls a refusal buried in a longer sentence a refused request", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse({
          errors: [
            { message: "user is not authorized to perform this query", path: ["queryScenes"] },
          ],
          data: null,
        }),
    ]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(errorOf(outcome).code).toBe("invalid_input");
  });

  it("calls a message naming a rate limit a request to slow down", async () => {
    for (const message of [
      "rate limit exceeded",
      "Rate Limit Exceeded",
      "request rate limit reached",
    ]) {
      const { fetchImpl } = scriptedFetch([
        () => jsonResponse({ errors: [{ message }], data: null }),
      ]);

      const outcome = await captureAsync(() =>
        settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
      );

      expect(errorOf(outcome).code).toBe("rate_limited");
    }
  });

  /**
   * A GraphQL error the client has no reading for is an answer it cannot use.
   * Calling it an absence would deny a record nobody said was missing.
   */
  it("calls any other GraphQL error an unreadable answer", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse({
          errors: [{ message: 'Cannot query field "wibble" on type "Performer".' }],
          data: null,
        }),
    ]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(errorOf(outcome).code).toBe("parse_failure");
  });

  it("throws on an errors array even when the body carries no data field at all", async () => {
    const { fetchImpl } = scriptedFetch([
      () => jsonResponse({ errors: [{ message: "internal server error" }] }),
    ]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(outcome.threw).toBe(true);
    expect(errorOf(outcome).code).toBe("parse_failure");
  });

  /**
   * An empty errors array states no error. The payload stands.
   */
  it("returns the payload when the errors array is empty", async () => {
    const { fetchImpl } = scriptedFetch([
      () => jsonResponse({ errors: [], data: { findPerformer: { id: "abc" } } }),
    ]);

    const data = await settle(
      transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER),
      AMPLE_MS,
    );

    expect(data).toEqual({ findPerformer: { id: "abc" } });
  });
});

describe("createHttpTransport, an absence", () => {
  /**
   * A UUID the instance never minted answers null with no error beside it, and
   * that shape is the one that means absence. It reaches the caller as data so
   * the layer above can say the record is missing; the refusal above never does.
   */
  it("returns a null payload as the answer it is", async () => {
    const { fetchImpl } = scriptedFetch([() => jsonResponse({ data: { findPerformer: null } })]);

    const outcome = await captureAsync(() =>
      settle(
        transport(fetchImpl).request<{ findPerformer: unknown }>(STASHDB, "key-1", FIND_PERFORMER),
        AMPLE_MS,
      ),
    );

    expect(outcome.threw).toBe(false);
    expect(outcome.returned).toEqual({ findPerformer: null });
  });

  it("keeps an absence and a refusal apart on identical payloads", async () => {
    const payload = { findPerformer: null };

    const absent = scriptedFetch([() => jsonResponse({ data: payload })]);
    const refused = scriptedFetch([
      () => jsonResponse({ errors: [{ message: "not authorized" }], data: payload }),
    ]);

    const absence = await captureAsync(() =>
      settle(transport(absent.fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );
    const refusal = await captureAsync(() =>
      settle(transport(refused.fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(absence.threw).toBe(false);
    expect(absence.returned).toEqual(payload);
    expect(refusal.threw).toBe(true);
    expect(errorOf(refusal).code).toBe("invalid_input");
  });
});

describe("createHttpTransport, the status code", () => {
  it("calls 429 a request to slow down", async () => {
    const { fetchImpl } = scriptedFetch([() => new Response("", { status: 429 })]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(errorOf(outcome).code).toBe("rate_limited");
  });

  it("retries a failing instance and returns the answer it finally gives", async () => {
    const { fetchImpl, count } = scriptedFetch([
      () => new Response("", { status: 503 }),
      () => jsonResponse({ data: { findPerformer: { id: "abc" } } }),
    ]);

    const data = await settle(
      transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER),
      AMPLE_MS,
    );

    expect(data).toEqual({ findPerformer: { id: "abc" } });
    expect(count()).toBe(2);
  });

  /**
   * `maxRetries` counts the attempts made after the first one, so a budget of
   * two allows three attempts in all.
   */
  it("gives up on a persistently failing instance after its retry budget", async () => {
    const { fetchImpl, count } = scriptedFetch([() => new Response("", { status: 500 })]);

    const outcome = await captureAsync(() =>
      settle(
        transport(fetchImpl, { maxRetries: 2 }).request(STASHDB, "key-1", FIND_PERFORMER),
        AMPLE_MS,
      ),
    );

    expect(errorOf(outcome).code).toBe("network_error");
    expect(count()).toBe(3);
  });

  it("makes one attempt when no retry is allowed", async () => {
    const { fetchImpl, count } = scriptedFetch([() => new Response("", { status: 502 })]);

    const outcome = await captureAsync(() =>
      settle(
        transport(fetchImpl, { maxRetries: 0 }).request(STASHDB, "key-1", FIND_PERFORMER),
        AMPLE_MS,
      ),
    );

    expect(errorOf(outcome).code).toBe("network_error");
    expect(count()).toBe(1);
  });

  it("reports an unreachable instance as a request that did not complete", async () => {
    const { fetchImpl } = scriptedFetch([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);

    const outcome = await captureAsync(() =>
      settle(
        transport(fetchImpl, { maxRetries: 0 }).request(STASHDB, "key-1", FIND_PERFORMER),
        AMPLE_MS,
      ),
    );

    expect(errorOf(outcome).code).toBe("network_error");
  });
});

describe("createHttpTransport, an answer it cannot read", () => {
  it("calls a body that is not JSON an unreadable answer", async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        new Response("<html><body>maintenance</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    ]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(errorOf(outcome).code).toBe("parse_failure");
  });

  it("calls JSON holding neither data nor errors an unreadable answer", async () => {
    const { fetchImpl } = scriptedFetch([() => jsonResponse({ ok: true })]);

    const outcome = await captureAsync(() =>
      settle(transport(fetchImpl).request(STASHDB, "key-1", FIND_PERFORMER), AMPLE_MS),
    );

    expect(errorOf(outcome).code).toBe("parse_failure");
  });
});

describe("createHttpTransport, silence", () => {
  /**
   * The deadline is measured on timers a test can move, so an instance that
   * accepts a connection and never answers is reported as a timeout at a stated
   * instant. A deadline the fake clock cannot reach leaves this call hanging.
   */
  it("calls a request that never answers a deadline exceeded", async () => {
    const outcome = await captureAsync(() =>
      settle(
        transport(hangingFetch(), { timeoutMs: 5000 }).request(STASHDB, "key-1", FIND_PERFORMER),
        AMPLE_MS,
      ),
    );

    expect(errorOf(outcome).code).toBe("timeout");
  });

  it("calls an aborted request a deadline exceeded rather than a network failure", async () => {
    const { fetchImpl } = scriptedFetch([
      () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      },
    ]);

    const outcome = await captureAsync(() =>
      settle(
        transport(fetchImpl, { maxRetries: 0 }).request(STASHDB, "key-1", FIND_PERFORMER),
        AMPLE_MS,
      ),
    );

    expect(errorOf(outcome).code).toBe("timeout");
  });
});

/* ------------------------------------------------- what a failure leaves behind */

describe("a request lets go of everything it took, whatever came back", () => {
  /**
   * A refusal is the moment a site is already under strain, and it is the one
   * path where holding on costs it something: a deadline left armed keeps this
   * process alive and fires an abort at an exchange that is over, and a body
   * nobody reads holds the connection open instead of returning it.
   */
  const answering = (status: number) => {
    const cancelled: string[] = [];
    const armed = () =>
      vi.getTimerCount === undefined ? 0 : (vi.getTimerCount() as unknown as number);
    const fetchImpl = (async () =>
      ({
        status,
        headers: new Headers(),
        body: { cancel: async () => void cancelled.push("cancelled") },
        text: async () => "{}",
      }) as unknown as Response) as unknown as typeof fetch;
    return { cancelled, armed, fetchImpl };
  };

  for (const status of [429, 401, 403, 500, 400, 404]) {
    it(`clears its deadline and lets go of the body on ${status}`, async () => {
      const { cancelled, armed, fetchImpl } = answering(status);
      const transport = createHttpTransport({
        fetchImpl,
        userAgent: "test",
        timeoutMs: 20_000,
        maxRetries: 0,
        limiterFor: () => new RateLimiter({ intervalMs: 0 }),
        logger: silentLogger,
      });

      const before = armed();
      await transport.request(STASHDB, "key", { query: "{ x }" }).catch(() => undefined);

      expect(armed(), `a deadline stayed armed after ${status}`).toBe(before);
      expect(cancelled, `the body was never let go of after ${status}`).not.toHaveLength(0);
    });
  }
});
