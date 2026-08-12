/**
 * What a caller wrote, read into what each catalogue can be given.
 *
 * Four facts about a narrowing look alike and mean different things, and this
 * file is where they are told apart. A narrowing a catalogue **cannot receive**
 * is a limit of the catalogue. One written only with **another catalogue's
 * identifiers** says nothing about it. One **received in part** narrowed on a
 * fraction of what was written. An argument with **nothing to do**, such as a
 * match mode with no list of identifiers, shaped no request at all. Collapsed
 * into one field, the first reading is the one a caller takes away, and it is
 * the only one that says a catalogue cannot do something.
 *
 * A list names each record once. An identifier written twice becomes a question
 * about a record holding it twice, which no record holds, and the emptiness that
 * comes back reads as a catalogue indexing none of it.
 */

import { invalidInput } from "../errors.js";
import { formatId, parseId } from "./identifiers.js";
import type { InstanceId } from "./instances.js";

/** The routes a narrowing identifier is resolved on when an answer is empty. */
export type LookupKind = "performer" | "studio" | "tag";

/** One identifier a narrowing was written with, on the catalogue that minted it. */
export interface WrittenId {
  /** As this server would print it, so a caller can hand it straight back. */
  given: string;
  instance: InstanceId;
  uuid: string;
}

export interface IdentifierList {
  /** The name the argument is published under, which is the name a report says. */
  name: string;
  kind: LookupKind;
  entries: WrittenId[];
}

/** What one catalogue receives out of a list written for all of them. */
export interface Share {
  uuids: string[];
  /** No record of this catalogue is named, so the list says nothing about it. */
  namingNoRecord: boolean;
  /** Part of the list reached it, the rest naming other catalogues. */
  receivedInPart: boolean;
}

/** How long a list may be before answering it becomes a run of follow-up reads. */
export const MOST_IDENTIFIERS = 25;

/**
 * A list of identifiers, each record named once.
 *
 * An identifier this server would refuse back is refused here, naming the
 * argument it was written in: sending it would ask a question no catalogue can
 * answer, and the emptiness would read as an index holding nothing.
 */
export function identifierList(
  name: string,
  kind: LookupKind,
  given: readonly string[],
  configured: readonly InstanceId[],
): IdentifierList {
  if (given.length === 0) {
    throw invalidInput(
      `${name} was written as an empty list, which narrows nothing.`,
      `Write at least one identifier in ${name}, or leave it out.`,
    );
  }
  if (given.length > MOST_IDENTIFIERS) {
    throw invalidInput(
      `${name} names ${given.length} identifiers, and this client reads at most ${MOST_IDENTIFIERS} in one call.`,
      `Ask again with at most ${MOST_IDENTIFIERS} identifiers in ${name}.`,
    );
  }

  const entries: WrittenId[] = [];
  const seen = new Set<string>();
  for (const raw of given) {
    const parsed = readOne(name, raw, configured);
    if (seen.has(parsed.given)) continue;
    seen.add(parsed.given);
    entries.push(parsed);
  }
  return { name, kind, entries };
}

/** One identifier, in an argument that takes exactly one. */
export function singleIdentifier(
  name: string,
  kind: LookupKind,
  given: string,
  configured: readonly InstanceId[],
): IdentifierList {
  return { name, kind, entries: [readOne(name, given, configured)] };
}

function readOne(name: string, raw: string, configured: readonly InstanceId[]): WrittenId {
  try {
    const parsed = parseId(raw, configured);
    return { given: formatId(parsed.instance, parsed.uuid), ...parsed };
  } catch (cause) {
    const said = cause instanceof Error ? cause.message : `"${raw}" is no identifier.`;
    throw invalidInput(`${name}: ${said}`, `Write each entry of ${name} as instance:uuid.`);
  }
}

export function shareFor(list: IdentifierList, instance: InstanceId): Share {
  const uuids = list.entries
    .filter((entry) => entry.instance === instance)
    .map((entry) => entry.uuid);
  return {
    uuids,
    namingNoRecord: uuids.length === 0,
    receivedInPart: uuids.length > 0 && uuids.length < list.entries.length,
  };
}

/** Text as a narrowing, refused where it carries nothing to narrow on. */
export function narrowingText(name: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") {
    throw invalidInput(
      `${name} was written with nothing in it, so it narrows nothing while presenting itself as a narrowing.`,
      `Write words in ${name}, or leave it out.`,
    );
  }
  return value;
}

/** A whole number inside the bounds this client reads, or a refusal naming it. */
export function bounded(
  name: string,
  value: number | undefined,
  low: number,
  high: number,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < low || value > high) {
    throw invalidInput(
      `${name} was written as ${JSON.stringify(value)}, and this client reads a whole number from ${low} to ${high}.`,
      `Write ${name} between ${low} and ${high}.`,
    );
  }
  return value;
}

/**
 * The reason a catalogue was left with nothing to narrow on.
 *
 * The two are kept apart in the sentence as they are kept apart in the fields: a
 * catalogue that cannot take a narrowing has a limit, and a catalogue given only
 * another catalogue's identifiers has none.
 */
export function emptiedBy(
  name: string,
  namingNoRecord: readonly string[],
  notReceived: readonly string[],
): string {
  const parts: string[] = [];
  if (namingNoRecord.length > 0) {
    parts.push(
      `every narrowing written for it names records another catalogue minted (${namingNoRecord.join(", ")})`,
    );
  }
  if (notReceived.length > 0) {
    parts.push(`it could receive none of the narrowings written (${notReceived.join(", ")})`);
  }
  return `${name} was left with nothing to narrow on because ${parts.join(", and ")}, so it was not asked. Its first page would answer any question put to it.`;
}
