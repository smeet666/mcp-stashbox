/**
 * How a record whose identifier no longer addresses what it named is marked.
 *
 * An identifier a catalogue has folded still resolves. What comes back is a
 * marker: it describes the record, and its emptiness describes the record too,
 * never the world. Printed without a mark, a marker reads as the thing it once
 * named, and a caller pivots on an identifier that moved.
 *
 * The rule lives here alone. Written at each site that prints a record, it was
 * honoured at six of seven and the seventh was found by a reviewer rather than
 * by the code. Every list that names a record asks this file how to say it.
 */

import type { RecordStatus } from "../stashbox/normalise.js";

/** Whether an identifier still addresses what the record names. */
export function isFolded(status: RecordStatus): boolean {
  return status !== "established";
}

/**
 * The clause that goes after a record's name, wherever one is printed.
 *
 * A performer names the record it was folded into, so the mark can send a
 * reader there. A scene, a studio and a tag are withdrawn without a successor
 * being published, so the mark says what the identifier no longer supports and
 * points nowhere, which is all the catalogue said.
 */
export function markerClause(status: RecordStatus, successor?: string | null): string {
  if (!isFolded(status)) return "";
  if (status === "merged") {
    return successor
      ? `, merged into ${successor}, so this identifier addresses that record`
      : ", merged, so this identifier now addresses the record it was folded into";
  }
  return ", withdrawn, so this identifier states nothing about what it once named";
}

/** The shorter mark, for a name inside a list where a clause would crowd the line. */
export function markerSuffix(status: RecordStatus): string {
  if (!isFolded(status)) return "";
  return status === "merged" ? " (merged into another record)" : " (withdrawn)";
}

/**
 * What a marker's own answer opens with.
 *
 * It states which of the two happened, in the words a reader acts on, and never
 * offers a successor for a kind of record its catalogue publishes none for.
 */
export function markerOpening(
  source: string,
  status: RecordStatus,
  successor: string | null,
): string {
  if (status === "merged") {
    return successor
      ? `This identifier addresses a record ${source} has merged into ${successor}.`
      : `This identifier addresses a record ${source} has merged into another.`;
  }
  return `This identifier addresses a record ${source} has withdrawn.`;
}

/**
 * The sentence a marker owes about its own emptiness.
 *
 * Without it, the fields a marker does not carry read as fields the catalogue
 * emptied, which states that a release under a former title has no performers.
 */
export function markerEmptinessNote(kind: "scene" | "performer"): string {
  return `A marker describes the record and never the ${kind} it once named, so what is missing here is missing from the marker.`;
}

/**
 * The sections a marker was asked for and cannot carry.
 *
 * Named rather than returned empty: a section absent from an answer reads as a
 * section nobody asked for, and one returned empty reads as a catalogue holding
 * nothing.
 */
export function markerSectionsNote(
  unrendered: readonly string[],
  successor: string | null,
): string | null {
  if (unrendered.length === 0) return null;
  const next = successor ? ` Ask for them on ${successor}, which continues it.` : "";
  return `A marker carries no body, so ${unrendered.join(", ")} could not be rendered here.${next}`;
}
