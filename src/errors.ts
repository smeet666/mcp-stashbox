/**
 * One error type, carrying a code the caller can branch on.
 *
 * The distinction that matters most is between "this catalogue holds no such
 * record" and "the question could not be asked". These catalogues answer a
 * refusal inside an HTTP success, so collapsing the two lets a model report an
 * absence it never established.
 */

import { ISSUES_URL } from "./version.js";

export type ErrorCode =
  /** The instance answered, and there is no such record. */
  | "not_found"
  /** The arguments cannot produce a request, or the instance refused them. */
  | "invalid_input"
  /** The instance asked this client to slow down. */
  | "rate_limited"
  /** A response arrived in a shape this client cannot read. */
  | "parse_failure"
  /** The request could not be completed. */
  | "network_error"
  /** The request was abandoned before an answer arrived. */
  | "timeout";

export interface ErrorDetails {
  /** What the caller can do about it, when there is something. */
  hint?: string;
  /** The address that produced the failure, for a bug report. */
  url?: string;
  status?: number;
  /** Which catalogue produced it, since several answer one question. */
  instance?: string;
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

export const notFound = (message: string, details?: ErrorDetails) =>
  new StashboxError("not_found", message, details);

export const invalidInput = (message: string, hint?: string) =>
  new StashboxError("invalid_input", message, hint ? { hint } : {});

export const rateLimited = (message: string, details?: ErrorDetails) =>
  new StashboxError("rate_limited", message, {
    hint: "Wait a moment and ask again. This says nothing about whether the record exists.",
    ...details,
  });

export const parseFailure = (message: string, details?: ErrorDetails) =>
  new StashboxError("parse_failure", message, {
    hint: `The instance may have changed how it answers. Please report this at ${ISSUES_URL} with the arguments you used.`,
    ...details,
  });

export const networkError = (message: string, details?: ErrorDetails) =>
  new StashboxError("network_error", message, details);

export const timeout = (message: string, details?: ErrorDetails) =>
  new StashboxError("timeout", message, details);
