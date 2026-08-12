/**
 * The one list of rules that qualifies an answer made of rows.
 *
 * Both searches run this list. That is the whole point of the file: written as
 * a sequence of calls inside each renderer, the list existed twice, the copies
 * drifted apart by three lines, and a note added to one had to be remembered
 * into the other. A rule stated here reaches every answer of this kind or it
 * reaches none, and a reviewer who finds a rule honoured in one search and
 * missed in the other has found a defect in this file rather than in two.
 *
 * The order below is the order a reader meets the notes, and it is stated once.
 * It runs from what shapes the whole answer, through what qualifies its rows,
 * to what is missing from it: a reader who stops after two sentences has read
 * the two that change what the rows mean.
 */

import type { PerformerRecord, RowsResult, SceneRecord } from "../types.js";
import {
  absentNarrowingRule,
  countMeaningRule,
  countsNeverAddedRule,
  coverageRule,
  emptyPageRule,
  failureRule,
  foldedNarrowingRule,
  identifiersCarriedRule,
  indexTotalRule,
  narrowingsUnreceivedRule,
  nobodyAskedRule,
  orderingRule,
  overLimitRule,
  rowsSkippedRule,
  runRules,
  skippedRule,
  storedRule,
  uncheckedNarrowingRule,
  unnarrowedRule,
  type Rule,
  type RowsFacts,
} from "./notes.js";

/**
 * The rows one page carries where a caller writes no limit, which an answer
 * states as the window it was read through.
 */
export const ROWS_PER_PAGE = 25;

/**
 * What every rows answer is qualified by, in reading order.
 *
 * `what` names the kind of record so one sentence can say it, which is the only
 * difference between the two searches worth carrying.
 */
export function rowsRules<T>(what: string, readAt: string | null): Rule<T>[] {
  return [
    // What the rows are and how they are ordered, before the first one is read.
    orderingRule,
    unnarrowedRule,
    identifiersCarriedRule,
    narrowingsUnreceivedRule,
    // What the numbers beside the catalogues measure.
    countsNeverAddedRule(what),
    countMeaningRule,
    indexTotalRule,
    overLimitRule,
    // Why an answer is empty, which a reader needs before concluding anything.
    emptyPageRule,
    foldedNarrowingRule,
    absentNarrowingRule,
    uncheckedNarrowingRule,
    // What is missing from the rows that are here.
    rowsSkippedRule,
    skippedRule,
    // Which catalogues are missing from the answer entirely.
    failureRule,
    nobodyAskedRule,
    coverageRule,
    // Where the answer came from, which qualifies everything above it.
    storedRule(readAt),
  ] as Rule<T>[];
}

/** The shared facts of a rows answer, gathered once from the result. */
export function rowsFacts<T extends SceneRecord | PerformerRecord>(
  result: RowsResult<T>,
  asked: RowsFacts<T>["asked"],
  window?: { page: number; limit: number },
): RowsFacts<T> {
  return {
    result,
    ...(window === undefined ? {} : { window }),
    asked,
    // Counted across the records listed, since a reader cannot see inside them.
    rowsSkipped: result.rows.reduce((total, row) => total + (row.rowsSkipped ?? 0), 0),
  };
}

/**
 * Every note a rows answer owes, in one call.
 *
 * `extra` carries what only one kind of answer can say, appended after the
 * shared rules so the sentences a reader needs first stay first. A rule that
 * belongs to both kinds belongs in the list above and never here.
 */
export function rowsNotes<T extends SceneRecord | PerformerRecord>(
  facts: RowsFacts<T>,
  what: string,
  readAt: string | null,
  extra: readonly Rule<T>[] = [],
): string[] {
  const shared = rowsRules<T>(what, readAt);
  return runRules<T>([...shared.slice(0, -1), ...extra, ...shared.slice(-1)], facts);
}
