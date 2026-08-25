/**
 * What a tool takes, declared once and enforced as it is declared.
 *
 * Two rules govern this file, and both come from the same place: the server
 * never states anything the data does not carry.
 *
 * **An argument this server does not declare is refused, at every depth.** Read
 * and dropped, it produces an answer computed on the defaults, which a caller
 * reads as the answer to the question they asked. The refusal names the
 * declared argument a near miss was reaching for, since a caller who wrote
 * `titel` wants `title` and not a list of everything a tool takes.
 *
 * **Every refusal carries one of the six error codes**, because that is what a
 * caller branches on. A message the validator writes on its own arrives without
 * one, so every bound, every closed set and every required argument is declared
 * with its own coded message. A caller never receives an engine's own words.
 */

import { z } from "zod";

import { readDate } from "../stashbox/normalise.js";
import { INSTANCES } from "../stashbox/instances.js";
import { MOST_IDENTIFIERS } from "../stashbox/narrowings.js";

const COUNTRY_CODE = /^[A-Za-z]{2}$/;

/** The one code an argument can be refused under, written where a caller reads it. */
const CODE = "[invalid_input]";

/** The catalogues an argument may name, in the order the registry declares them. */
const SOURCE_IDS = INSTANCES.map((instance) => instance.id);

/**
 * A record identifier as this server prints one, and as it takes one back.
 *
 * The catalogue is optional here because a bare uuid is resolvable when a single
 * catalogue is configured, and which catalogue that is belongs to the
 * configuration rather than to the declaration.
 */
const IDENTIFIER = new RegExp(
  `^(?:(?:${SOURCE_IDS.join("|")}):)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
  "i",
);

/** A day written as the calendars these catalogues publish write one. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/* --------------------------------------------------------- the declarations */

/**
 * A narrowing written as text.
 *
 * Refused when it carries no characters, spaces alone included: a catalogue
 * asked with an empty narrowing answers everything it holds, and that page
 * reaches a caller as the answer to the question they narrowed.
 */
export function text(argument: string, what: string): z.ZodString {
  const error = `${CODE} ${argument} takes ${what}. A ${argument} carrying no characters, spaces alone included, narrows nothing, and the whole index would come back as the answer to it.`;
  return z.string({ error }).trim().min(1, error);
}

/** One record identifier, required, which is the whole question a record route answers. */
export function identifier(argument: string): z.ZodString {
  const error = identifierError(argument);
  return z.string({ error }).regex(IDENTIFIER, error);
}

/**
 * A bounded list of record identifiers.
 *
 * Empty, it narrows nothing. Long, it is a question about a record carrying
 * fifty identifiers at once, which no record carries, and answering it would
 * run a follow-up read per identifier for an emptiness that belongs to the
 * question.
 */
export function identifiers(argument: string): z.ZodArray<z.ZodString> {
  const error = `${CODE} ${argument} takes a list of one to ${MOST_IDENTIFIERS} record identifiers, each written instance:uuid.`;
  return z
    .array(identifier(argument), { error })
    .min(
      1,
      `${CODE} ${argument} was written as an empty list, which narrows nothing: the whole index would come back as the answer to a question it was never asked.`,
    )
    .max(
      MOST_IDENTIFIERS,
      `${CODE} ${argument} takes at most ${MOST_IDENTIFIERS} identifiers in one call. A longer list asks about a record carrying every one of them, which no record carries.`,
    );
}

/**
 * A day the calendar has.
 *
 * A catalogue handed a date it cannot read reinterprets it, and the rows that
 * come back answer a question nobody asked. The 45th of the 13th month and the
 * 30th of February are refused here for that reason.
 */
export function calendarDay(argument: string, what: string): z.ZodString {
  const error = `${CODE} ${argument} takes ${what}, written as a day the calendar has, in the form 2019-04-12. A catalogue reinterprets a date it cannot read, and the rows come back answering a question nobody asked.`;
  return z
    .string({ error })
    .regex(CALENDAR_DAY, error)
    .refine((value) => readDate(value)?.precision === "day", error);
}

/**
 * How many hexadecimal characters each algorithm writes.
 *
 * A hash is a fixed number of bits written in hexadecimal, so anything else is
 * a string that names no file. Put to a catalogue, it comes back refused with a
 * status, and that refusal reaches a caller as a catalogue that could not
 * answer rather than as the value they wrote.
 */
const HASH_LENGTH: Record<string, number> = { MD5: 32, OSHASH: 16, PHASH: 16 };

/** One fingerprint, written as the algorithm that computed it writes one. */
export function hexadecimalHash<T extends z.ZodObject<z.ZodRawShape>>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    const written = value as { hash?: unknown; algorithm?: unknown };
    const algorithm = String(written.algorithm);
    const hash = String(written.hash);
    const length = HASH_LENGTH[algorithm];
    if (length === undefined) {
      return;
    }
    if (new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hash)) {
      return;
    }
    ctx.addIssue({
      code: "custom",
      message: `${CODE} "${hash}" is no ${algorithm}. ${algorithm} writes ${length} hexadecimal characters, and a string outside that shape names no file any catalogue indexes.`,
    });
  }) as unknown as T;
}

/** A two-letter country code, as the catalogues store one. */
export function countryCode(argument: string): z.ZodString {
  const error = `${CODE} ${argument} takes a two-letter country code, as in AU or SE. A country written out in full names no code the catalogues store, so it would match nothing they hold.`;
  return z.string({ error }).regex(COUNTRY_CODE, error);
}

/**
 * The closed set of catalogues, which is the set this server holds addresses
 * for. A catalogue named outside it could be asked nothing, and the emptiness
 * would read as an answer.
 */
export function catalogues(argument: string): z.ZodArray<z.ZodEnum<Record<string, string>>> {
  const error = `${CODE} ${argument} names the catalogues to ask, out of ${SOURCE_IDS.join(", ")}.`;
  return z
    .array(z.enum(SOURCE_IDS, { error }), { error })
    .min(
      1,
      `${CODE} ${argument} was written as an empty list, so it asks none of them, and an emptiness nobody was asked for is no evidence about anything.`,
    )
    .max(
      SOURCE_IDS.length,
      `${CODE} ${argument} holds more entries than there are catalogues, so it names a catalogue twice. Each catalogue is asked once, and a name written twice asks for nothing more.`,
    );
}

/** A reading with two states, refused in the words every other refusal uses. */
export function trueOrFalse(argument: string, what: string): z.ZodBoolean {
  return z.boolean({
    error: `${CODE} ${argument} takes ${what}, written true or false. A value outside those two names no question this server can put to a catalogue.`,
  });
}

/** A whole number inside the bounds an answer of that size can honour. */
export function wholeNumber(
  argument: string,
  what: string,
  least: number,
  most: number,
): z.ZodNumber {
  const error = `${CODE} ${argument} takes ${what}, as a whole number from ${least} to ${most}.`;
  return z.number({ error }).int(error).min(least, error).max(most, error);
}

/** One reading out of a closed set, named in the words a caller writes. */
export function oneOf<const T extends readonly [string, ...string[]]>(
  argument: string,
  what: string,
  readings: T,
): z.ZodEnum<Record<T[number], T[number]>> {
  return z.enum(readings as unknown as T[number][], {
    error: `${CODE} ${argument} takes ${what}, one of: ${readings.join(", ")}. A reading outside that set names nothing this server can ask for.`,
  }) as z.ZodEnum<Record<T[number], T[number]>>;
}

/** A list of readings out of a closed set, each one naming a block of an answer. */
export function severalOf<const T extends readonly [string, ...string[]]>(
  argument: string,
  what: string,
  readings: T,
): z.ZodArray<z.ZodEnum<Record<T[number], T[number]>>> {
  const error = `${CODE} ${argument} takes ${what}, each one of: ${readings.join(", ")}.`;
  return z
    .array(oneOf(argument, what, readings), { error })
    .min(
      1,
      `${CODE} ${argument} was written as an empty list, so it asks for no block at all and the answer would carry nothing.`,
    )
    .max(
      readings.length,
      `${CODE} ${argument} holds more entries than there are blocks to ask for, so it names a block twice. Each block is rendered once, and a name written twice asks for nothing more.`,
    );
}

function identifierError(argument: string): string {
  return `${CODE} ${argument} takes a record identifier written instance:uuid, as in ${SOURCE_IDS[0]}:94ef9c17-82c6-48b0-8dcc-063b69231960, with the catalogue named out of ${SOURCE_IDS.join(", ")}. The same uuid names a different record on each catalogue, so one written without a catalogue is resolved only where a single catalogue is configured.`;
}

/* ------------------------------------------------------------- strict input */

/**
 * The declaration a tool publishes, enforcing at runtime exactly what it
 * announces.
 *
 * A schema announcing that it takes nothing else while a runtime accepts
 * something else makes the announcement worthless, so the strictness is both
 * declared in the published schema and applied to every call.
 */
export function strictInput<Shape extends z.ZodRawShape>(shape: Shape): z.ZodObject<Shape> {
  const declared = Object.keys(shape);
  return z.strictObject(shape, {
    error: (issue) => {
      if (issue.code === "unrecognized_keys") {
        return unknownArgumentMessage(issue.keys, declared);
      }
      // Anything else the validator writes about this object is still an
      // argument that cannot produce a request, which is the one thing this code
      // names. Its own sentence already says which argument and why, so it is
      // prefixed rather than rewritten.
      return issue.message === undefined || issue.message.startsWith(CODE)
        ? undefined
        : `${CODE} ${issue.message}`;
    },
  }) as z.ZodObject<Shape>;
}

/**
 * What a caller reads when they wrote an argument this tool does not declare.
 *
 * A tool that declares nothing is refused in its own words. Enumerating an
 * empty list writes a sentence that names no argument at all, and a caller
 * reads it as a list somebody left unfilled and goes looking for the arguments
 * this tool takes.
 */
function unknownArgumentMessage(unknown: readonly string[], declared: readonly string[]): string {
  const named = unknown
    .map((key) => {
      const near = nearest(key, declared);
      return near === undefined ? key : `${key} (did you mean ${near}?)`;
    })
    .join(", ");
  const instead =
    declared.length === 0
      ? "It takes no argument at all, and answers the same thing every time it is called."
      : `It takes: ${declared.join(", ")}.`;
  return `${CODE} This tool does not take ${named}. ${instead} An argument that is read and dropped produces an answer computed without it, which reads as the answer to the question that was asked.`;
}

/**
 * How far apart two spellings are, counting insertions, deletions and
 * substitutions.
 */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    previous = current;
  }
  return previous[b.length] ?? Math.max(a.length, b.length);
}

/**
 * The declared argument a near miss was reaching for, or nothing.
 *
 * Two edits is the widest miss that still names one argument: it covers a
 * doubled letter, a missing separator, a plural, and two letters written the
 * wrong way round, which a count of insertions, deletions and substitutions
 * scores as two. Beyond it a suggestion sends a caller to an argument answering
 * a different question, which costs more than no suggestion at all.
 */
function nearest(written: string, declared: readonly string[]): string | undefined {
  let best: { name: string; apart: number } | undefined;
  for (const name of declared) {
    const apart = distance(written.toLowerCase(), name.toLowerCase());
    if (apart > 2) {
      continue;
    }
    if (best === undefined || apart < best.apart) {
      best = { name, apart };
    }
  }
  return best?.name;
}

/* ------------------------------------------------- arguments read together */

/**
 * The words a caller wrote, refused beside any filter the faceted route takes.
 *
 * The two paths combine their terms in opposite ways: a catalogue's text index
 * reads the words as a union, and the typed filters are an intersection.
 * Answering one while reporting the other as unreceived hands a caller rows
 * narrowed by a logic they did not choose, so writing both is refused and the
 * refusal names them.
 */
export function exclusiveQuery<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  typed: readonly string[],
): T {
  return schema.superRefine((value, ctx) => {
    const written = value as Record<string, unknown>;
    if (written.query === undefined) {
      return;
    }
    const beside = typed.filter((name) => written[name] !== undefined);
    if (beside.length === 0) {
      return;
    }
    ctx.addIssue({
      code: "custom",
      message: `${CODE} query was written beside ${beside.join(", ")}. A catalogue's own text index reads the words as a union, and the typed arguments narrow as an intersection, so the two answer different questions. Write query on its own, or write the typed arguments without it.`,
    });
  }) as unknown as T;
}

/**
 * A date and the comparison it is read with, which travel together.
 *
 * No catalogue declares a range, so a date carries one comparison. Written
 * alone, the date would be compared in a way nobody chose, and the comparison
 * alone would compare against nothing.
 */
export function datedTogether<T extends z.ZodObject<z.ZodRawShape>>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    const written = value as Record<string, unknown>;
    const date = written.date !== undefined;
    const compare = written.date_compare !== undefined;
    if (date === compare) {
      return;
    }
    ctx.addIssue({
      code: "custom",
      message: date
        ? `${CODE} date was written without date_compare. These catalogues compare a date against one bound rather than answering a range, so the comparison is written rather than assumed: date_compare takes on, before or after.`
        : `${CODE} date_compare was written with no date to compare. Write date beside it, or leave both out.`,
    });
  }) as unknown as T;
}
