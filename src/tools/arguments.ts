/**
 * How a tool's arguments are declared, and what happens to one that is not.
 *
 * An argument this server does not declare is a question it cannot answer.
 * Reading it and dropping it produces an answer computed on the defaults, which
 * a caller reads as the answer to what they asked. So an undeclared argument is
 * refused, and the refusal names it and offers the declared name when one is
 * close enough to be the one that was meant.
 */

import { z } from "zod";

import { INSTANCE_IDS, type InstanceId } from "../stashbox/instances.js";

/** The code a caller branches on when the arguments cannot produce a request. */
const INVALID_INPUT = "invalid_input";

/** Declare a tool's arguments, refusing anything outside the declaration. */
export function strictInput<Shape extends z.ZodRawShape>(shape: Shape) {
  const declared = Object.keys(shape);

  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys" ? unknownArgumentMessage(issue.keys, declared) : undefined,
  });
}

/**
 * A narrowing written as text, which must carry something to narrow on.
 *
 * A value carrying no characters reaches the catalogue as no restriction at
 * all, so the answer that comes back is the whole index handed to a caller who
 * asked for a part of it. Refusing it at the door is the only place the
 * distinction survives, and a value of nothing but spaces carries as little as
 * one of nothing at all.
 */
export function narrowingText(description?: string) {
  const empty = {
    error: `[${INVALID_INPUT}] A value carrying no characters narrows nothing, and a catalogue asked with it answers everything it holds. Give the text to narrow on, or leave the argument out.`,
  };
  const schema = z.string().min(1, empty).refine(carriesCharacters, empty);
  return description ? schema.describe(description) : schema;
}

function carriesCharacters(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * A list of namespaced identifiers, which must name at least one.
 *
 * An empty list is a question about no record, and a catalogue given one
 * answers its whole index, which reads as every record satisfying the list.
 */
export function narrowingList(description?: string) {
  const schema = z.array(narrowingText()).min(1, {
    error: `[${INVALID_INPUT}] An empty list names no record to narrow on, and a catalogue asked with it answers everything it holds. Give at least one identifier, or leave the argument out.`,
  });
  return description ? schema.describe(description) : schema;
}

/**
 * A day, which must be one the calendar has.
 *
 * A catalogue reinterprets a date it cannot read rather than refusing it, so a
 * thirteenth month comes back as an answer to a question nobody asked. The
 * check is on the calendar and not on the shape: 2021-02-30 is written
 * correctly and names no day.
 */
export function dayArgument(description: string) {
  return z
    .string()
    .refine(namesADay, {
      error: `[${INVALID_INPUT}] A date is written YYYY-MM-DD and must name a day the calendar has. A catalogue reinterprets a date it cannot read, so the answer would be to a question that was never asked.`,
    })
    .describe(description);
}

function namesADay(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;
  const [, year, month, day] = parts as unknown as [string, string, string, string];
  const at = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return false;
  // Date rolls an overlong month into the next one, so the day it names back is
  // what says whether the calendar has the one that was written.
  return (
    at.getUTCFullYear() === Number(year) &&
    at.getUTCMonth() + 1 === Number(month) &&
    at.getUTCDate() === Number(day)
  );
}

/**
 * A two-letter country code, in the shape the catalogues index on.
 *
 * A country written out in full reaches the index as a code it holds for
 * nobody, and the emptiness that comes back reads as a catalogue holding no
 * performer from that country.
 */
export function countryArgument(description: string) {
  return z
    .string()
    .regex(/^[A-Za-z]{2}$/, {
      error: `[${INVALID_INPUT}] A country is asked for as its two-letter code, such as 'AU' for Australia. The catalogues index on the code, so a name written out matches nobody and the emptiness would read as a catalogue holding none.`,
    })
    .describe(description);
}

/**
 * The catalogues to ask, named from the closed set this server reads.
 *
 * The set is small and fixed, so declaring it lets a caller offer the choices
 * and settles the spelling before a request is built, rather than after an
 * answer comes back naming a catalogue nobody meant.
 */
export function sourcesArgument(description: string) {
  return z
    .array(z.enum(INSTANCE_IDS as unknown as [InstanceId, ...InstanceId[]]))
    .min(1, {
      error: `[${INVALID_INPUT}] An empty list names no catalogue to ask. Name at least one, or leave the argument out to ask every configured catalogue.`,
    })
    .describe(description);
}

function unknownArgumentMessage(keys: readonly string[], declared: readonly string[]): string {
  const named = keys
    .map((key) => {
      const near = nearestArgument(key, declared);
      return near ? `'${key}' (did you mean '${near}'?)` : `'${key}'`;
    })
    .join(", ");

  return (
    `[${INVALID_INPUT}] Unknown ${keys.length > 1 ? "arguments" : "argument"} ${named}. ` +
    `This tool takes: ${declared.join(", ")}.`
  );
}

/**
 * The declared name a caller most plausibly meant, when there is one.
 *
 * Three readings, ordered by how much each claims: the same name written
 * differently, a name that opens or closes the other, and a name a couple of
 * typing slips away. Anything further is left unnamed, because a suggestion
 * that misses sends a caller to an argument answering a different question.
 */
function nearestArgument(key: string, declared: readonly string[]): string | undefined {
  const flatten = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const flat = flatten(key);
  if (flat.length === 0) return undefined;

  const sameName = declared.find((name) => flatten(name) === flat);
  if (sameName) return sameName;

  // Either name may be the longer one: a caller can qualify a name this tool
  // keeps plain, or shorten one it spells out.
  const overlapping = declared.find((name) => {
    const other = flatten(name);
    const [shorter, longer] = other.length < flat.length ? [other, flat] : [flat, other];
    // Two characters in common say nothing; three start to.
    return shorter.length >= 3 && (longer.startsWith(shorter) || longer.endsWith(shorter));
  });
  if (overlapping) return overlapping;

  let closest: string | undefined;
  let shortest = Number.POSITIVE_INFINITY;
  for (const name of declared) {
    const distance = editDistance(flat, flatten(name));
    if (distance < shortest) {
      shortest = distance;
      closest = name;
    }
  }

  // Up to a third of the name may differ. Past that the match is a guess.
  return shortest <= Math.max(1, Math.floor(flat.length / 3)) ? closest : undefined;
}

/** Single-character insertions, deletions and substitutions between two words. */
function editDistance(left: string, right: string): number {
  let beforePrevious: number[] = [];
  let previous: number[] = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current: number[] = [row];
    for (let column = 1; column <= right.length; column += 1) {
      // Every index here is inside a row this loop has already filled.
      const substitution = previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1);
      let best = Math.min(substitution, previous[column]! + 1, current[column - 1]! + 1);
      const swapped =
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1];
      if (swapped) best = Math.min(best, beforePrevious[column - 2]! + 1);
      current[column] = best;
    }
    beforePrevious = previous;
    previous = current;
  }

  return previous[right.length]!;
}
