/**
 * The primitives every rendered answer is built from.
 *
 * A client that shows only the text block must keep everything that qualifies
 * the answer, so nothing here may drop a caveat on its way to prose. Two rules
 * govern the file:
 *
 * **A catalogue's own words never forge one of ours.** A title, a name or a
 * reason is written by someone else and lands inside a line this server wrote.
 * A newline in one of those would open a line a reader cannot tell from ours,
 * so text coming from a catalogue is flattened or shifted before it is placed.
 *
 * **A line with nothing to say is not written.** An empty label reads as a
 * field the catalogue emptied, which is a claim nobody made.
 */

import { indentMarkerLines } from "../stashbox/normalise.js";

/** A rendered answer: the prose a reader sees and the payload a program reads. */
export interface Rendered {
  text: string;
  structured: Record<string, unknown>;
}

/**
 * A catalogue's words, made safe to place inside a line of this server's.
 *
 * Line breaks collapse to spaces, and anything that still opens the way this
 * server opens is shifted. An empty result is `null`, so the caller drops the
 * line instead of printing a label with nothing after it.
 */
export function inline(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const flattened = value.replace(/[\r\n]+/g, " ").trim();
  return flattened === "" ? null : indentMarkerLines(flattened);
}

/** Every one of a catalogue's words, made safe for one line. */
export function inlineAll(values: readonly string[]): string {
  return values
    .map((value) => inline(value))
    .filter((value): value is string => value !== null)
    .join(", ");
}

/**
 * A catalogue's own prose, made unable to forge a line of this server's.
 *
 * Every line is shifted, whatever it says. Shifting only the lines that look
 * like an opening this server writes would leave the question of which
 * spellings count, and a block indented throughout raises no such question: no
 * line of it can begin where a line of ours begins.
 */
export function quoted(text: string | null): string | null {
  if (text === null) return null;
  return text
    .split("\n")
    .map((entry) => `  ${entry}`)
    .join("\n");
}

/** A labelled line, dropped entirely when there is nothing to label. */
export function line(label: string, value: string | null | undefined): string | null {
  return value === null || value === undefined || value === "" ? null : `${label}: ${value}`;
}

/** The lines that have something to say, in the order they were given. */
export function joinLines(parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null && part !== "").join("\n");
}

/**
 * A section and the rows under it, or the section stating its own zero.
 *
 * A section that vanishes when it holds nothing is indistinguishable from one
 * that was never loaded, which is the distinction this server exists to keep.
 * The zero is stated on the heading line, since a heading followed by nothing
 * reads as an answer cut short.
 */
export function section(
  heading: string,
  rows: readonly string[],
  emptiness: string,
): string | null {
  return rows.length === 0 ? `\n${heading}: ${emptiness}` : `\n${heading}:\n${rows.join("\n")}`;
}

/**
 * What a record says about the edits open against it.
 *
 * A catalogue publishing no count and a record nothing is open against are two
 * different things, so the second says so in words and the first drops the
 * line. An open edit says the record may be about to change.
 */
export function pendingEdits(count: number | null, unreadable?: boolean): string | null {
  if (unreadable === true) {
    return "a count this catalogue publishes and this client could not read";
  }
  if (count === null) return null;
  return count === 0 ? "none open" : String(count);
}

/**
 * The rows of a record's own lists this client could not read, with the lists
 * that lost them, so the number says what it counts.
 */
export function lostRows(skipped?: number, lists?: readonly string[]): string | null {
  if (skipped === undefined || skipped === 0) return null;
  const where = lists === undefined || lists.length === 0 ? "" : ` (in ${lists.join(", ")})`;
  return `${skipped}${where}`;
}

/** The notes, gathered under the answer they qualify. */
export function notesBlock(notes: readonly string[]): string {
  return notes.length === 0 ? "" : `\n\n${notes.map((note) => `Note: ${note}`).join("\n")}`;
}

/** The line pointing at the record on the catalogue that answered. */
export function sourceLine(url: string): string {
  return `Source: ${url}`;
}
