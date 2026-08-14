/**
 * How a failure reaches a caller.
 *
 * A caller branches on the code, so every failure this server hands back opens
 * with one of the six and carries the sentence and the hint that go with it. The
 * rule that shapes the file: the server never states anything the data does not
 * carry, and an engine's own words state nothing about a catalogue. A failure
 * this server did not raise is therefore rewritten before it leaves, since the
 * message an engine wrote names things inside this program and reads to a caller
 * as something a catalogue said.
 *
 * A failure carries no structured payload. An answer with a shape would be read
 * as a result, and the emptiness inside it as an emptiness the catalogues hold.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { StashboxError } from "../errors.js";
import { ISSUES_URL } from "../version.js";

/**
 * What a caller reads when a tool could not answer.
 *
 * The code opens the line so it survives truncation and so a client reading the
 * text alone can still branch on it. This is the envelope a failure reaching a
 * catalogue arrives in. An argument this server refuses never reaches one, and
 * the protocol layer answers it as a request that could not be dispatched: the
 * code travels in the message either way, and only here does it open the line.
 */
export function toolFailure(error: unknown): CallToolResult {
  const ours = error instanceof StashboxError ? error : undefined;
  const code = ours?.code ?? "parse_failure";
  const message =
    ours?.message ??
    "This client failed while building the answer, so nothing here states anything about what the catalogues hold.";
  const hint =
    ours?.details.hint ??
    `Please report this at ${ISSUES_URL} with the arguments you used, so the case can be read.`;
  const instance = ours?.details.instance;

  const lines = [
    `[${code}] ${message}`,
    instance === undefined ? "" : `Catalogue: ${instance}.`,
    `Hint: ${hint}`,
  ].filter((line) => line.length > 0);

  return {
    isError: true,
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
