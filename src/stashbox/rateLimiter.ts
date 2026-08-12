/**
 * The pace one catalogue is asked at.
 *
 * These catalogues are free to use and one of them is a small operation, so
 * what this client owes them governs the whole file: one request at a time, a
 * gap between two requests that the configuration may widen and can never
 * lower below the floor, and room given back the moment a catalogue asks for
 * it. The interval widens on a push-back and narrows only after a run of clean
 * answers, so a catalogue under strain is asked less often until it recovers.
 *
 * Every wait goes through timers, which is what lets a test move the clock and
 * name the instant a request went out.
 */

/** How many clean answers in a row buy back half the widening. */
const CLEAN_ANSWERS_BEFORE_NARROWING = 3;

/** How far the interval may widen when no ceiling is named, as a multiple of the base. */
const WIDEST_MULTIPLE_OF_BASE = 16;

export interface RateLimiterOptions {
  /** The gap this instance is owed between two requests when all is well. */
  intervalMs: number;
  /** The widest gap a push-back may reach. */
  maxIntervalMs?: number;
}

/** Resolves once that many milliseconds have passed on the clock in force. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RateLimiter {
  readonly #baseIntervalMs: number;
  readonly #maxIntervalMs: number;
  #intervalMs: number;
  #cleanAnswers = 0;
  #lastRequestAt: number | undefined;
  /** The single file every caller passes through, which is what serialises them. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: RateLimiterOptions) {
    this.#baseIntervalMs = options.intervalMs;
    this.#intervalMs = options.intervalMs;
    this.#maxIntervalMs = Math.max(
      options.intervalMs,
      options.maxIntervalMs ?? options.intervalMs * WIDEST_MULTIPLE_OF_BASE,
    );
  }

  /** The gap currently owed, which a push-back widens and clean answers narrow. */
  get currentIntervalMs(): number {
    return this.#intervalMs;
  }

  /**
   * Resolves when the caller may send its request.
   *
   * Callers that arrive together are released one at a time, each wait measured
   * from the request released before it. A wait measured from the last request
   * that actually went out would free the whole queue at one instant and send
   * that burst to a single catalogue.
   */
  beforeRequest(): Promise<void> {
    return this.#enqueue(async () => {
      await this.#waitTurn();
    });
  }

  /** Runs `task` alone, once the gap this instance is owed has passed. */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      await this.#waitTurn();
      return task();
    });
  }

  /** A catalogue asking for room, which doubles the gap up to the ceiling. */
  pushBack(): void {
    this.#intervalMs = Math.min(this.#maxIntervalMs, this.#intervalMs * 2);
    // The run of clean answers ended here, so counting it starts again.
    this.#cleanAnswers = 0;
  }

  /** A clean answer, which buys back half the widening once enough have followed. */
  succeeded(): void {
    if (this.#intervalMs <= this.#baseIntervalMs) return;
    this.#cleanAnswers += 1;
    if (this.#cleanAnswers < CLEAN_ANSWERS_BEFORE_NARROWING) return;
    this.#cleanAnswers = 0;
    this.#intervalMs = Math.max(this.#baseIntervalMs, this.#intervalMs / 2);
  }

  #enqueue<T>(turn: () => Promise<T>): Promise<T> {
    const running = this.#queue.then(turn);
    // The queue holds a settled outcome so that a task which fails releases the
    // callers behind it instead of stopping the file.
    this.#queue = running.then(
      () => undefined,
      () => undefined,
    );
    return running;
  }

  async #waitTurn(): Promise<void> {
    const wait = this.#waitMs();
    if (wait > 0) await sleep(wait);
    this.#lastRequestAt = Date.now();
  }

  #waitMs(): number {
    const last = this.#lastRequestAt;
    if (last === undefined) return 0;
    const elapsed = Date.now() - last;
    // A clock that jumps backwards makes the previous request read as one made
    // in the future, and the difference would park this client for the length
    // of the jump. One interval is the longest wait the instance is owed.
    if (elapsed < 0) return this.#intervalMs;
    return Math.min(this.#intervalMs, Math.max(0, this.#intervalMs - elapsed));
  }
}
