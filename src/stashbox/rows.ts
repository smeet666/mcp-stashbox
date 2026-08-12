/**
 * Rows from several catalogues read as one list, with the seam left visible.
 *
 * Two rules meet here. **Ordering is described as it is**: where one catalogue
 * contributed rows the list is in its order, where several did the rows
 * interleave, and no score is shared across them, so nothing here ranks one
 * catalogue's row against another's. **Counts never lie**: an index total below
 * the number of rows published beside it measures something other than the
 * index, so it is dropped rather than restated.
 */

import type { SourceReport } from "../types.js";

/** One catalogue's contribution to an answer, with what it did with the question. */
export interface Contribution<T> {
  report: SourceReport;
  rows: T[];
}

/**
 * The rows of several catalogues, taken one at a time from each in turn.
 *
 * Round by round rather than catalogue after catalogue, since concatenating
 * would put one catalogue's whole page in front of every other's first row and
 * present an accident of order as a ranking.
 */
export function interleave<T>(groups: readonly (readonly T[])[]): T[] {
  const longest = groups.reduce((most, group) => Math.max(most, group.length), 0);
  const rows: T[] = [];
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const row = group[index];
      if (row !== undefined) rows.push(row);
    }
  }
  return rows;
}

/** How the order was built, in the words a reader needs before the first row. */
export function orderingOf(contributors: readonly string[], sorted: string | undefined): string {
  const tail = sorted === undefined ? "" : `, ${sorted}`;
  if (contributors.length === 0) return `in the order each catalogue returned them${tail}`;
  if (contributors.length === 1) return `in ${contributors[0]}'s own order${tail}`;
  return `interleaved between ${contributors.join(", ")}, which share no score${tail}`;
}

/** The sort clause an ordering carries, where a catalogue received a sort. */
export function sortedClause(
  sort: string | undefined,
  direction: string | undefined,
): string | undefined {
  if (sort === undefined) return undefined;
  const way = direction === "asc" ? " ascending" : direction === "desc" ? " descending" : "";
  return `each catalogue sorted by ${sort}${way}`;
}

/**
 * What a catalogue's index holds for the question, where the number stands up.
 *
 * A total below the rows published beside it counts something other than the
 * index, and a value that is no whole number of things counts nothing at all.
 * Either is dropped: restating it would put a number in front of a reader that
 * contradicts the list under their eyes.
 */
export function indexTotalOf(count: unknown, rows: number): number | undefined {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return undefined;
  return count < rows ? undefined : count;
}

/** The catalogues that put rows into an answer, by the name they call themselves. */
export function contributorsOf(reports: readonly SourceReport[]): string[] {
  return reports
    .filter((report) => report.state === "answered" && (report.count ?? 0) > 0)
    .map((report) => report.name ?? report.source);
}
