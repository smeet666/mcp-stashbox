/**
 * Keeps this client to one request at a time, spaced out.
 *
 * These catalogues are run by their communities and paid for by donations, and
 * none of them publishes a rate limit. An unstated limit is a reason to be
 * careful, so the spacing is set conservatively. Discovering the real limit would
 * mean driving requests until they are refused.
 *
 * One limiter exists per catalogue, so a slow one never holds up another.
 * Serialising also means a burst of tool calls cannot turn into a burst of
 * connections. The spacing widens when a catalogue pushes back and narrows again
 * on a run of quiet successes, so a slow patch does not become the permanent
 * speed.
 */

export interface RateLimiterOptions {
  /** Spacing between requests when nothing has gone wrong. */
  intervalMs: number;
  /** The widest the spacing may become under push-back. */
  maxIntervalMs?: number;
}

export class RateLimiter {
  private readonly baseIntervalMs: number;
  private readonly maxIntervalMs: number;
  private intervalMs: number;
  private lastStartedAt = 0;
  /** When the next request may depart, claimed as each caller takes its turn. */
  private nextAllowedAt = 0;
  /** The last clock reading, so a clock that jumped backwards is noticed. */
  private lastObservedAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private calmStreak = 0;

  constructor(options: RateLimiterOptions) {
    this.baseIntervalMs = options.intervalMs;
    this.maxIntervalMs = options.maxIntervalMs ?? options.intervalMs * 16;
    this.intervalMs = options.intervalMs;
  }

  /** The spacing in force, for callers that report it. */
  get currentIntervalMs(): number {
    return this.intervalMs;
  }

  /**
   * Run `task` with nothing else in flight.
   *
   * This only serialises. Spacing is claimed per attempt through
   * `beforeRequest`, because a task that retries makes several requests and
   * each of them owes the catalogue the same gap.
   */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Wait for this request's turn.
   *
   * The turn is claimed before the wait rather than after it. Several callers
   * arriving together otherwise read the same last-departure time, compute the
   * same wait, and leave in a group: the spacing would hold between one request
   * and the next while a burst went out at once.
   */
  async beforeRequest(): Promise<void> {
    const now = Date.now();

    // A clock that moved backwards leaves every claimed departure time in what
    // is now the future, which would hold the queue for the size of the jump.
    // The guard belongs here, on the clock: capping each wait instead would cap
    // the queue itself, and the third caller of three would leave with the
    // second.
    if (now < this.lastObservedAt) this.nextAllowedAt = now;
    this.lastObservedAt = now;

    const departsAt = Math.max(now, this.nextAllowedAt);
    this.nextAllowedAt = departsAt + this.intervalMs;

    const wait = departsAt - now;
    if (wait > 0) await sleep(wait);
    this.lastStartedAt = Date.now();
  }

  /** Called when a catalogue asks for room: double the gap, up to the ceiling. */
  pushBack(): void {
    this.calmStreak = 0;
    this.intervalMs = Math.min(this.maxIntervalMs, this.intervalMs * 2);
    // A wider gap that only took effect on the request after next would let the
    // burst that earned the push-back finish at the old speed.
    this.nextAllowedAt = Math.max(this.nextAllowedAt, this.lastStartedAt + this.intervalMs);
  }

  /**
   * Called on a clean answer. Recovery takes several in a row, so one lucky
   * response after a rough patch does not undo the caution that earned it.
   */
  succeeded(): void {
    if (this.intervalMs === this.baseIntervalMs) return;
    this.calmStreak += 1;
    if (this.calmStreak < 3) return;
    this.calmStreak = 0;
    this.intervalMs = Math.max(this.baseIntervalMs, Math.round(this.intervalMs / 2));
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
