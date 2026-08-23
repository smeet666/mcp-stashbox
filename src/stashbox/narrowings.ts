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
    if (seen.has(parsed.given)) {
      continue;
    }
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

/* ------------------------------ what one catalogue was asked, beside what was written */

/** The order that reached a catalogue, in the words its own route takes. */
export interface OrderSent {
  /** The field it was told to order by, absent where it was told none. */
  sort?: string;
  /** The way it was told to run, absent where it was left its own. */
  direction?: string;
}

/**
 * What one catalogue was asked, beside what the caller wrote for it.
 *
 * Every disclosure an answer owes about a narrowing is the difference between
 * those two things, so the difference is taken once and each disclosure is read
 * off it: whether the catalogue has a question left, what its own index total
 * counts, what order its rows stand in. Kept per code path instead, each is
 * disclosed where somebody remembered to disclose it, and a combination nobody
 * tried hands over a page narrowed on less than the question with nothing on
 * the answer saying so.
 */
export interface Asked {
  /** Narrowings whose every identifier names a record another catalogue minted. */
  namingNoRecord: string[];
  /** Narrowings received short of the list written, the rest naming other catalogues. */
  receivedInPart: string[];
  /** Narrowings this catalogue's own route declares no field for. */
  notReceived: string[];
  /** What shapes the request, which is what any answer of its is narrowed by. */
  applied: string[];
  /** The order that went onto the wire, absent where the catalogue kept its own. */
  order?: OrderSent;
}

/** The keys of a built request that decide the page rather than what is on it. */
const PAGING = new Set(["page", "per_page", "sort", "direction"]);

/** What a catalogue was asked on the route that reads a term, which takes no order. */
export function askedOfWords(notReceived: readonly string[]): Asked {
  return {
    namingNoRecord: [],
    receivedInPart: [],
    notReceived: [...notReceived],
    applied: ["the words themselves"],
  };
}

/**
 * What a catalogue was asked on its faceted route, read off the request built
 * for it.
 *
 * A faceted input holding paging and an order alone asks for the first page of
 * a whole index. Answered, that page reaches a reader as the answer to whatever
 * the caller narrowed on, so what the request carries is what tells the two
 * apart.
 */
export function askedOfFacets(
  share: { namingNoRecord: readonly string[]; receivedInPart: readonly string[] },
  notReceived: readonly string[],
  wire: Record<string, unknown> | undefined,
): Asked {
  const sort = wire?.sort;
  const direction = wire?.direction;
  return {
    namingNoRecord: [...share.namingNoRecord],
    receivedInPart: [...share.receivedInPart],
    notReceived: [...notReceived],
    applied:
      wire === undefined
        ? ["read on a route that takes no input"]
        : Object.keys(wire).filter((name) => !PAGING.has(name)),
    ...(sort === undefined && direction === undefined
      ? {}
      : {
          order: {
            ...(typeof sort === "string" ? { sort } : {}),
            ...(typeof direction === "string" ? { direction } : {}),
          },
        }),
  };
}

/**
 * The fields an answer publishes about the narrowings one catalogue received.
 *
 * Read off the record whatever became of the catalogue, so a catalogue that
 * answered and one that was never asked disclose the same three facts about
 * what was written for them.
 */
export function disclosed(asked: Asked): {
  narrowingsNotReceived?: string[];
  narrowingsNamingNoRecord?: string[];
  narrowingsReceivedInPart?: string[];
} {
  return {
    ...(asked.notReceived.length > 0 ? { narrowingsNotReceived: asked.notReceived } : {}),
    ...(asked.namingNoRecord.length > 0 ? { narrowingsNamingNoRecord: asked.namingNoRecord } : {}),
    ...(asked.receivedInPart.length > 0 ? { narrowingsReceivedInPart: asked.receivedInPart } : {}),
  };
}

/**
 * Why a catalogue was left unasked, or nothing where it holds a question.
 *
 * A narrowing every identifier of which names another catalogue's records is
 * answered by no record this one holds, whatever else was written beside it.
 * Asked without it, the catalogue answers a wider question than the one that
 * was written, and that page reaches a reader as the answer to all of it.
 */
export function unaskedFor(name: string, asked: Asked): string | undefined {
  if (asked.namingNoRecord.length > 0) {
    const named = asked.namingNoRecord.join(", ");
    return `Every identifier written for ${name} in ${named} names a record another catalogue minted, so no record of its own carries one and nothing it holds answers this question. Asked without ${named}, it would answer a wider question than the one written, so it was never asked.`;
  }
  // A question narrowed on nothing at all asks for a page of a whole index,
  // which is what it asked for and what comes back. Only a narrowing that was
  // written and then landed nowhere leaves the catalogue answering something
  // else.
  if (asked.applied.length === 0 && asked.notReceived.length > 0) {
    const named = asked.notReceived.join(", ");
    return `${name} receives none of the narrowings written for it (${named}): its own route takes each of them and reads nothing of any, so it was never asked. Its first page would answer any question put to it.`;
  }
  return undefined;
}
