/**
 * What a caller wrote, read into what each catalogue can be given.
 *
 * An identifier names the catalogue that minted it, so a list written for all
 * of them reaches each one shorn of the rest. Three facts about that look alike
 * and mean different things, and this file is where they are told apart: a
 * catalogue given **none of its own identifiers** was told nothing about
 * anything, one given **part of the list** narrowed on a fraction of what was
 * written, and one that **cannot receive the narrowing at all** has a limit.
 * Collapsed into one field, the last reading is the one a caller takes away,
 * and it is the only one that says a catalogue cannot do something.
 *
 * A list names each record once. An identifier written twice becomes a question
 * about a record holding it twice, which no record holds, and the emptiness
 * that comes back reads as a catalogue indexing none of it.
 */

import { invalidInput } from "../errors.js";
import { formatId, parseId } from "./identifiers.js";
import type { InstanceId } from "./instances.js";

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

/**
 * How long a list may be before answering it stops being a lookup.
 *
 * Beyond this a question about a record carrying every one of them is a
 * question no record answers, and one about a record carrying any of them is a
 * run of reads rather than a narrowing.
 */
export const MOST_IDENTIFIERS = 25;

/** A list of identifiers, each record named once, refused where one is unreadable. */
export function identifierList(
  name: string,
  given: readonly string[],
  configured: readonly InstanceId[],
): IdentifierList {
  const entries: WrittenId[] = [];
  const seen = new Set<string>();
  for (const raw of given) {
    const parsed = readOne(name, raw, configured);
    if (seen.has(parsed.given)) continue;
    seen.add(parsed.given);
    entries.push(parsed);
  }
  return { name, entries };
}

/** One identifier, in an argument that takes exactly one. */
export function singleIdentifier(
  name: string,
  given: string,
  configured: readonly InstanceId[],
): IdentifierList {
  return { name, entries: [readOne(name, given, configured)] };
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

/** What one catalogue receives of a list, and what its share says about it. */
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

/**
 * The reason a catalogue was left with nothing to narrow on.
 *
 * A catalogue given only another catalogue's identifiers has no limit of its
 * own, so its first page would answer any question put to it and it is not
 * asked at all.
 */
export function emptiedBy(name: string, namingNoRecord: readonly string[]): string {
  return `${name} was left with nothing to narrow on: every narrowing written for it names records another catalogue minted (${namingNoRecord.join(", ")}), so it was not asked. Its first page would answer any question put to it.`;
}
