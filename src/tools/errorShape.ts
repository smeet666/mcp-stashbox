/**
 * How a failure reaches a caller.
 *
 * The code opens the message so a reader who sees only the prose can still tell
 * a refusal from an absence. That distinction is the one this server exists to
 * keep: a catalogue that would not answer has said nothing about what it holds.
 */

import { StashboxError } from "../errors.js";

export interface ToolError {
  [key: string]: unknown;
  isError: true;
  content: { type: "text"; text: string }[];
}

export function toolError(cause: unknown): ToolError {
  if (cause instanceof StashboxError) {
    const hint = cause.details.hint ? ` ${cause.details.hint}` : "";
    return {
      isError: true,
      content: [{ type: "text" as const, text: `[${cause.code}] ${cause.message}${hint}` }],
    };
  }
  const message = cause instanceof Error ? cause.message : "an error this server cannot describe";
  return {
    isError: true,
    content: [{ type: "text" as const, text: `[parse_failure] ${message}` }],
  };
}
