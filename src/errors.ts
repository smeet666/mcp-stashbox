/**
 * What can go wrong, in six readings and not one more.
 *
 * A caller branches on the code, so the set is closed on purpose. A seventh
 * would reach them as prose alone, and the branch they would need for it does
 * not exist. Every one of the six answers a different question:
 *
 * - `not_found`     the catalogue looked and holds no such record
 * - `invalid_input` the arguments cannot produce a request
 * - `rate_limited`  the catalogue asked this client to slow down
 * - `parse_failure` the catalogue answered something this client cannot read
 * - `network_error` the request did not complete
 * - `timeout`       the catalogue did not answer in time
 *
 * The distinction that matters most is between the first and the rest: only
 * `not_found` is a statement about the world. The other five are statements
 * about this exchange, and reading one of them as an absence is the failure
 * this whole server is built to avoid.
 */

import { ISSUES_URL } from "./version.js";

export const ERROR_CODES = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetails {
  /** What a caller can do about it, in words they can act on. */
  hint?: string;
  /** The address that was asked, where naming it helps. */
  url?: string;
  /** The catalogue the failure belongs to. */
  instance?: string;
  /** The status a catalogue answered with. */
  status?: number;
}

export class StashboxError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = "StashboxError";
    this.code = code;
    this.details = details;
  }
}

/** A record the catalogue looked for and does not hold. */
export const notFound = (message: string, details?: ErrorDetails) =>
  new StashboxError("not_found", message, details);

/** Arguments that cannot produce a request, so nothing was asked. */
export const invalidInput = (message: string, hint?: string) =>
  new StashboxError("invalid_input", message, hint ? { hint } : {});

/** A catalogue asking for room, which says nothing about what it holds. */
export const rateLimited = (message: string, details?: ErrorDetails) =>
  new StashboxError("rate_limited", message, {
    hint: "Wait a moment and ask again. This says nothing about whether the record exists.",
    ...details,
  });

/** An answer that arrived and could not be read, which is never an emptiness. */
export const parseFailure = (message: string, details?: ErrorDetails) =>
  new StashboxError("parse_failure", message, {
    hint: `The catalogue may have changed how it answers. Please report this at ${ISSUES_URL} with the arguments you used.`,
    ...details,
  });

/** A request that did not complete, so the catalogue said nothing at all. */
export const networkError = (message: string, details?: ErrorDetails) =>
  new StashboxError("network_error", message, details);

/** A catalogue that did not answer in the time this client waits. */
export const timeout = (message: string, details?: ErrorDetails) =>
  new StashboxError("timeout", message, details);
