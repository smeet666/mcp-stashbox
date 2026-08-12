/**
 * Everything an answer owes a reader beyond its rows.
 *
 * The notes are the reason this server exists: rows anyone can fetch, but only
 * an answer that says what it does not establish is safe to act on. This file
 * holds every one of them, and it holds them as **data**.
 *
 * That is the whole design. A rows answer is qualified by one ordered list of
 * rules, and both searches run that same list. Written as a sequence of calls
 * inside each renderer, the list existed twice, the two copies differed by
 * three lines, and every note added to one had to be remembered into the other.
 * A rule stated here reaches every answer of that kind, or it reaches none.
 *
 * Each rule is a pure function from the facts of an answer to a sentence or to
 * `null`. Returning `null` is how a rule says its condition does not hold, and
 * it is the only way a note is ever withheld: a note that fires when its case
 * has passed is as wrong as one that never fires.
 */

import type { PerformerRecord, RowsResult, SourceReport } from "../types.js";
import { inlineAll } from "./text.js";

/** What a rows answer knows about itself, which is all a rule may read. */
export interface RowsFacts<T> {
  result: RowsResult<T>;
  /** The page asked for, absent where the question reached no catalogue. */
  window?: { page: number; limit: number };
  /** What the caller wrote, so a rule can tell a silence from a thing not asked. */
  asked: {
    query: string | null;
    narrowedOnAnything: boolean;
    identifiersGiven: boolean;
    match: "all" | "any";
    sortedOn?: string;
    bounded: boolean;
    cached: boolean;
  };
  /** Rows lost inside the records listed, counted across them. */
  rowsSkipped: number;
}

/** A rule: the facts of an answer in, a sentence or nothing out. */
export type Rule<T> = (facts: RowsFacts<T>) => string | null;

const answering = (reports: readonly SourceReport[]) =>
  reports.filter((entry) => entry.state === "answered");

const contributing = (reports: readonly SourceReport[]) =>
  answering(reports).filter((entry) => entry.count);

const named = (entries: readonly SourceReport[]) =>
  entries.map((entry) => entry.name ?? entry.source).join(", ");

/** How the rows were ordered, which a reader needs before reading the first one. */
export const orderingRule: Rule<unknown> = ({ result }) =>
  result.rows.length === 0 ? null : `Rows are ${result.ordering}.`;

/**
 * A search given nothing to narrow on, which answers a page of the whole index.
 *
 * Without this the rows read as the answer to a question, and an empty value is
 * refused at the door for doing exactly what writing nothing does here.
 */
export const unnarrowedRule: Rule<unknown> = ({ result, asked }) =>
  asked.narrowedOnAnything || result.rows.length === 0
    ? null
    : "Nothing was given to narrow this search, so these rows are a page of each catalogue's whole index, in its own order. They answer no question beyond that.";

/**
 * The warning against adding counts, owed to an answer holding more than one.
 *
 * Beside a single count it describes an arithmetic nobody could perform, and
 * beside none it describes nothing.
 */
export function countsNeverAddedRule(what: string): Rule<unknown> {
  return ({ result }) =>
    contributing(result.perSource).length > 1
      ? `Counts are reported per catalogue and are never added: the catalogues index overlapping corpora, and one ${what} held by two of them is a separate record on each.`
      : null;
}

/**
 * A narrowing written with identifiers, which is the kind `match` reads.
 *
 * The shape of the name carries the fact: a narrowing taking identifiers is
 * written as one or several of them, and no other narrowing is.
 */
function writtenWithIdentifiers(narrowing: string): boolean {
  return /_ids?$/.test(narrowing) || narrowing === "performed_with";
}

/** Whether a catalogue received every identifier narrowing whole. */
function receivedTheListEntire(entry: SourceReport): boolean {
  const short = [
    ...(entry.narrowingsNotReceived ?? []),
    ...(entry.narrowingsOutsideThisRoute ?? []),
    ...(entry.narrowingsNamingNoRecord ?? []),
    ...(entry.narrowingsReceivedInPart ?? []),
  ];
  return !short.some(writtenWithIdentifiers);
}

/**
 * What the rows satisfy of the identifiers a caller wrote.
 *
 * The claim is made where a catalogue received the list entire and answered
 * with rows, and nowhere else. A catalogue that took none of the identifiers
 * answered the rest of the question, so a row of its own satisfies the list by
 * accident, and saying otherwise states a narrowing nothing applied.
 */
export const identifiersCarriedRule: Rule<unknown> = ({ result, asked }) => {
  if (!asked.identifiersGiven || result.rows.length === 0) return null;
  const whole = answering(result.perSource).filter(
    (entry) => (entry.count ?? 0) > 0 && receivedTheListEntire(entry),
  );
  if (whole.length === 0) return null;
  const what =
    asked.match === "any"
      ? "carries one of the identifiers given"
      : "carries every identifier given";
  return `A row from these catalogues ${what}, since each received the whole of what was written: ${named(whole)}.`;
};

/**
 * The narrowings that reached a catalogue short, each with what happened to it.
 *
 * Four different things send a narrowing away, and a caller acts on which one:
 * a catalogue that cannot take it at all, identifiers naming no record of its
 * own, a list shorn of another catalogue's identifiers, and an argument this
 * question gave nothing to select on.
 */
export const narrowingsUnreceivedRule: Rule<unknown> = ({ result }) => {
  const parts: string[] = [];
  for (const entry of result.perSource) {
    const who = entry.name ?? entry.source;
    for (const narrowing of entry.narrowingsNotReceived ?? []) {
      parts.push(`${narrowing}, which ${who} cannot receive`);
    }
    for (const narrowing of entry.narrowingsOutsideThisRoute ?? []) {
      parts.push(
        `${narrowing}, which the route this question took does not take, though ${who} can be given it`,
      );
    }
    for (const narrowing of entry.narrowingsNamingNoRecord ?? []) {
      parts.push(`${narrowing}, whose identifiers name no record ${who} holds`);
    }
    for (const narrowing of entry.narrowingsReceivedInPart ?? []) {
      parts.push(
        `${narrowing}, which reached ${who} shorn of the identifiers another catalogue minted`,
      );
    }
    for (const argument of entry.argumentsWithNothingToDo ?? []) {
      parts.push(`${argument}, which had nothing to select on at ${who}`);
    }
  }
  if (parts.length === 0) return null;
  return `Some of what was written reached a catalogue short: ${parts.join("; ")}. The rows here were never narrowed by those.`;
};

/**
 * What a number beside a catalogue's name measures.
 *
 * A count of records reads as a count of the things they describe, and the two
 * differ wherever two catalogues hold one thing between them.
 */
export const countMeaningRule: Rule<unknown> = ({ result }) =>
  answering(result.perSource).length === 0
    ? null
    : "A count reports how many records a catalogue's own index answered with for this question. A thing held by two catalogues is a record on each of them, and each counts it once.";

/** What an index total counts, which is the page under the reader's eyes as well. */
export const indexTotalRule: Rule<unknown> = ({ result }) =>
  answering(result.perSource).some((entry) => (entry.indexTotal ?? 0) > 0)
    ? "A catalogue's count of what its index holds for this question has the rows here included, so this page is part of that number."
    : null;

/**
 * A catalogue that answered with more rows than one page was asked to carry.
 *
 * A caller paging on the limit they wrote would step over the difference, so
 * the catalogue is named and the limit is left describing what was asked.
 */
export const overLimitRule: Rule<unknown> = ({ result, window }) => {
  if (window === undefined) return null;
  const over = answering(result.perSource).filter((entry) => (entry.count ?? 0) > window.limit);
  if (over.length === 0) return null;
  return `These catalogues answered with more rows than the limit asked for, so paging on that limit steps over the difference: ${named(over)}.`;
};

/**
 * Why an answer holding no row from a catalogue that looked is empty.
 *
 * A page past the end and a question nothing answers are two different
 * emptinesses, and only a catalogue that honoured the page says anything about
 * the first: one answering its own first page whatever was asked says nothing
 * about page nine.
 */
export const emptyPageRule: Rule<unknown> = ({ result, window }) => {
  if (result.rows.length > 0) return null;
  const looked = answering(result.perSource);
  if (looked.length === 0) return null;
  const paged = looked.filter((entry) => !(entry.narrowingsNotReceived ?? []).includes("page"));
  if ((window?.page ?? 1) > 1 && paged.length > 0) {
    return `This page is past everything these catalogues hold for the question, so its emptiness belongs to the page: ${named(paged)}.`;
  }
  // A catalogue whose every row came back unreadable answered with records. The
  // emptiness is this client's reading of them, and calling it a catalogue that
  // found nothing states an absence nobody established.
  const lostEverything = looked.filter((entry) => !entry.count && entry.skipped);
  const found = looked.filter((entry) => !entry.skipped);
  const parts: string[] = [];
  if (found.length > 0) {
    parts.push(`These catalogues looked and found nothing for this question: ${named(found)}.`);
  }
  if (lostEverything.length > 0) {
    parts.push(
      `These catalogues answered with records this client could not read, so this emptiness is that reading and no answer about what they hold: ${named(lostEverything)}.`,
    );
  }
  return parts.length === 0 ? null : parts.join(" ");
};

/** Catalogues that could not answer, whose silence is no evidence about them. */
export const failureRule: Rule<unknown> = ({ result }) => {
  const failed = result.perSource.filter((entry) => entry.state === "failed");
  if (failed.length === 0) return null;
  return `These catalogues could not answer, so this holds no rows of theirs and states nothing about what they hold: ${named(failed)}.`;
};

/** An answer no catalogue was asked for, whose emptiness belongs to the question. */
export const nobodyAskedRule: Rule<unknown> = ({ result }) => {
  if (result.perSource.length === 0) return null;
  if (result.perSource.some((entry) => entry.state !== "absent")) return null;
  return "No catalogue was asked for this answer, so its emptiness is this question reaching none of them and is no evidence that what you asked about does not exist. Each catalogue above says why it was not asked.";
};

/** The catalogues missing from an answer, so a partial one never reads as whole. */
export const coverageRule: Rule<unknown> = ({ result }) => {
  const missing = result.perSource.filter((entry) => entry.state !== "answered");
  if (missing.length === 0 || missing.length === result.perSource.length) return null;
  return `${missing.length} catalogue(s) did not contribute to this answer, so it is no evidence about what they hold.`;
};

/** An identifier its catalogue folded, which narrows to nothing while it holds everything. */
export const foldedNarrowingRule: Rule<unknown> = ({ result }) => {
  const folded = result.foldedNarrowings ?? [];
  if (folded.length === 0) return null;
  const each = folded
    .map((entry) =>
      entry.successor
        ? `${entry.given}, which its catalogue merged into ${entry.successor}`
        : `${entry.given}, which its catalogue has withdrawn`,
    )
    .join("; ");
  return `This search was narrowed with an identifier its catalogue has folded: ${each}. A folded identifier narrows to nothing because the rows moved to the record it was folded into, so this emptiness is about the identifier and never about what the catalogue holds.`;
};

/** A narrowing identifier its catalogue holds no record for. */
export const absentNarrowingRule: Rule<unknown> = ({ result }) => {
  const absent = result.absentNarrowings ?? [];
  if (absent.length === 0) return null;
  return `The catalogue named in these identifiers holds no record for them: ${absent.join(", ")}. Nothing came back because nothing there answers to them, which says nothing about what that catalogue indexes.`;
};

/** The check that would have explained an emptiness and could not be made. */
export const uncheckedNarrowingRule: Rule<unknown> = ({ result }) => {
  const unchecked = result.uncheckedNarrowings ?? [];
  if (unchecked.length === 0) return null;
  return `Whether these identifiers still address the record they name could not be checked: ${unchecked.join(", ")}. An identifier its catalogue has folded narrows to nothing, so this emptiness may be about the identifier rather than about what the catalogue holds.`;
};

/** Rows lost inside the records listed, which are missing from what each shows. */
export const rowsSkippedRule: Rule<unknown> = ({ rowsSkipped }) =>
  rowsSkipped === 0
    ? null
    : `${rowsSkipped} row(s) inside the records listed here could not be read and are left out of what each one shows of its own lists. Read a record for what it says about its own losses.`;

/** Whole rows a catalogue answered with that this client could not read. */
export const skippedRule: Rule<unknown> = ({ result }) => {
  const lost = result.perSource.filter((entry) => entry.skipped);
  if (lost.length === 0) return null;
  const each = lost.map((entry) => `${entry.name ?? entry.source}: ${entry.skipped}`).join(", ");
  return `Rows left out because this client could not read them: ${each}. They are missing from the rows and from the counts here, and their absence says nothing about what those catalogues hold.`;
};

/** An answer replayed from the store, with the moment it was first read. */
export function storedRule(readAt: string | null): Rule<unknown> {
  return ({ asked }) => {
    if (!asked.cached) return null;
    // The moment belongs in the sentence: a held answer is worth its age, and
    // 'when it was first read' names a time a reader cannot obtain.
    const when = readAt ? ` That reading was at ${readAt}.` : "";
    return `This answer was replayed from this client's store, so no catalogue was asked for it. What each catalogue is reported as saying is what it said when the answer was first read.${when}`;
  };
}

/** The people credited on these rows whose record the catalogue has folded. */
export function foldedCreditsRule(
  namesOf: (result: RowsResult<never>) => readonly { name: string; status: string }[],
): Rule<never> {
  return ({ result }) => {
    const folded = [
      ...new Set(
        namesOf(result)
          .filter((entry) => entry.status !== "established")
          .map((entry) => entry.name),
      ),
    ];
    if (folded.length === 0) return null;
    return `Credited on the rows here and folded on the catalogue that answered: ${inlineAll(folded)}. Each of those credits names a record the catalogue has merged or withdrawn, so what it holds about that person is under another identifier.`;
  };
}

/**
 * The words asked for, where no row printed here carries one of them.
 *
 * Each kind of row is read for its own words, which is why the reader is
 * handed in. A row satisfies the words in any order and in any of them, so the
 * sentence is withheld the moment one row carries a single word: it says what
 * a reader can check on the rows and never that a catalogue matched wrongly.
 */
export function queryUncarriedRule<T>(wordsOf: (row: T) => readonly (string | null)[]): Rule<T> {
  return ({ result, asked }) => {
    if (asked.query === null || result.rows.length === 0) return null;
    const words = asked.query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 0);
    if (words.length === 0) return null;
    const carried = result.rows.some((row) =>
      wordsOf(row).some(
        (value) => value !== null && words.some((word) => value.toLowerCase().includes(word)),
      ),
    );
    if (carried) return null;
    return "No row here carries any of the words asked for. A catalogue's text index reads fields this answer does not print, so a row can answer the words somewhere a reader cannot see them.";
  };
}

/**
 * Dates the catalogues published in a form this client could not read.
 *
 * A row missing a date it was published with reads as a record carrying none,
 * which is a claim about the catalogue that nothing supports.
 */
export function unreadableDatesRule<T>(datesOf: (row: T) => readonly string[]): Rule<T> {
  return ({ result }) => {
    const lost = [...new Set(result.rows.flatMap((row) => datesOf(row)))];
    if (lost.length === 0) return null;
    return `A date on the rows here was published in a form this client could not read, so it is left out of the row while the catalogue holds one: ${lost.join(", ")}.`;
  };
}

/**
 * What a scene count on a performer row measures.
 *
 * The caution belongs to the number wherever one is published: a count of none
 * and a count of thirty are both coverage on the catalogue that published them.
 */
export const sceneCountRule: Rule<PerformerRecord> = ({ result }) =>
  result.rows.some((row) => row.sceneCount !== null)
    ? "A scene count is what the catalogue naming it has indexed for that record, so it reports that catalogue's coverage and says nothing about a career: a settled record can carry a count of none while naming decades of work."
    : null;

/**
 * Run an ordered list of rules over one answer.
 *
 * The order is the order a reader meets them, and it is stated once where the
 * list is declared. Nothing else composes notes.
 */
export function runRules<T>(rules: readonly Rule<T>[], facts: RowsFacts<T>): string[] {
  return rules.map((rule) => rule(facts)).filter((note): note is string => note !== null);
}
