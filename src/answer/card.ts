/**
 * One record, read on every catalogue that holds it, put together as one card.
 *
 * This is the only place in the server where readings of several catalogues are
 * combined, and it is where the rule that governs everything is easiest to
 * break. Four readings of it decide every line below.
 *
 * **A value carries who said it.** Two catalogues agreeing is a stronger fact
 * than one asserting, and publishing the value alone throws that away. Two
 * catalogues disagreeing is a fact as well, so both readings are published:
 * choosing between them is a policy, and a policy applied in silence is a claim
 * nobody can check.
 *
 * **A silence is not a disagreement.** A catalogue that published nothing for a
 * field contradicts nobody. It joins neither the agreement nor the dispute.
 *
 * **A list is united, never chosen.** Every entry of the union is one some
 * catalogue published, so the union asserts nothing new, and picking one
 * catalogue's list would erase what the other holds.
 *
 * **A count is never merged.** These catalogues index corpora that overlap by an
 * amount none of them publishes, so a sum would state a total nobody measured.
 * Counts stay one per catalogue, and a catalogue publishing none says so.
 */

import type {
  Card,
  CardCount,
  CardEntry,
  CardHolder,
  CardValue,
  Reading,
  RecordStatus,
} from "../types.js";

export type { Reading };

/** What a card is built from: the readings, the policy, and the shape to read. */
export interface Consolidation {
  readings: readonly Reading[];
  /** The order readings are preferred in, which the card states. */
  prefer: readonly string[];
  /** Fields carrying one value, published with who said it. */
  scalars: readonly string[];
  /** Fields carrying several values, published as the union. */
  lists: readonly string[];
  /** Fields counting something, published one per catalogue and never added. */
  perSource: readonly string[];
}

/** A reading that answered with a record, which is the only kind carrying values. */
interface Answered {
  source: string;
  record: Record<string, unknown>;
}

export function consolidate(shape: Consolidation): Card {
  const answered = inPreferredOrder(shape);
  const fields: Record<string, CardValue | CardEntry[]> = {};

  for (const name of shape.scalars) fields[name] = scalarOf(answered, name);
  for (const name of shape.lists) fields[name] = unionOf(answered, name);

  const counts: Record<string, CardCount[]> = {};
  for (const name of shape.perSource) {
    counts[name] = answered.map((one) => ({
      source: one.source,
      value: countIn(one.record[name]),
    }));
  }

  return {
    fields,
    counts,
    held_by: shape.readings.map(holderOf),
    preferred: answered.map((one) => one.source),
    notes: notesFor(shape, answered),
  };
}

/**
 * The readings that answered, in the order the preference names them.
 *
 * A catalogue the preference does not name comes last, in the order it was
 * read: a policy that forgot a catalogue is no reason to drop what it said.
 */
function inPreferredOrder(shape: Consolidation): Answered[] {
  const answered = shape.readings.filter(
    (one): one is Reading & { record: Record<string, unknown> } =>
      one.state === "answered" && one.record !== undefined,
  );
  const rank = (source: string) => {
    const at = shape.prefer.indexOf(source);
    return at === -1 ? shape.prefer.length : at;
  };
  return [...answered]
    .sort((a, b) => rank(a.source) - rank(b.source))
    .map((one) => ({ source: one.source, record: one.record }));
}

/**
 * One value, with the catalogues that said it and the readings that lost.
 *
 * The winner is the first reading the preference names that published anything
 * at all. A catalogue publishing nothing joins the agreement only where nobody
 * published anything, since a silence agrees with a silence and with no value.
 */
function scalarOf(answered: readonly Answered[], name: string): CardValue {
  const said = answered.map((one) => ({ source: one.source, value: one.record[name] ?? null }));
  const winner = said.find((one) => one.value !== null) ?? said[0];
  const value = winner?.value ?? null;

  const agreed = said.filter((one) => same(one.value, value)).map((one) => one.source);
  const disagreed = said
    .filter((one) => one.value !== null && !same(one.value, value))
    .map((one) => ({ source: one.source, value: one.value }));

  return {
    value,
    agreed_by: agreed,
    ...(disagreed.length === 0 ? {} : { disagreed }),
  };
}

/** Whether two published readings are the same reading, structure included. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The union of a list, in the order the preferred catalogue holds it, then what
 * the others add.
 *
 * The order carries a fact of its own: a reader meets the preferred catalogue's
 * reading first, and everything after it is what no preferred catalogue held.
 */
function unionOf(answered: readonly Answered[], name: string): CardEntry[] {
  const held = new Map<string, CardEntry>();
  for (const one of answered) {
    const value = one.record[name];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const key = typeof entry === "string" ? entry : JSON.stringify(entry);
      const found = held.get(key);
      if (found === undefined)
        held.set(key, { value: entry as string, published_by: [one.source] });
      else if (!found.published_by.includes(one.source)) found.published_by.push(one.source);
    }
  }
  return [...held.values()];
}

/** A count as a catalogue published one, which is a whole number of things or nothing. */
function countIn(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** What became of one catalogue, whether it answered, failed or was never asked. */
function holderOf(reading: Reading): CardHolder {
  const status = (reading.record as { status?: RecordStatus } | undefined)?.status;
  return {
    source: reading.source,
    ...(reading.id === undefined ? {} : { id: reading.id }),
    state: reading.state,
    ...(status === undefined ? {} : { status }),
    ...(reading.error === undefined ? {} : { error: reading.error }),
    ...(reading.reason === undefined ? {} : { reason: reading.reason }),
  };
}

/**
 * What the card owes a reader beyond its fields.
 *
 * Every sentence here is one a reader needs before acting on a value: which
 * catalogues are missing from it, whether the policy fell back, and whether a
 * record named here is one its catalogue no longer holds as itself.
 */
function notesFor(shape: Consolidation, answered: readonly Answered[]): string[] {
  const notes: string[] = [];
  const named = (sources: readonly string[]) => sources.join(", ");

  const failed = shape.readings.filter((one) => one.state === "failed");
  if (failed.length > 0) {
    notes.push(
      `These catalogues could not answer, so nothing here carries what they hold and this card states nothing about it: ${named(failed.map((one) => one.source))}.`,
    );
  }

  const absent = shape.readings.filter((one) => one.state === "absent");
  if (absent.length > 0) {
    notes.push(
      `These catalogues were never asked, so their silence is this question reaching none of them: ${named(absent.map((one) => one.source))}.`,
    );
  }

  // A fallback nobody announced reads as the preferred catalogue's own answer.
  const first = shape.prefer.find((source) => shape.readings.some((one) => one.source === source));
  const reading = shape.readings.find((one) => one.source === first);
  if (reading !== undefined && reading.state !== "answered" && answered.length > 0) {
    notes.push(
      `The catalogue this call preferred is ${first}, which did not answer, so every value here was read from ${named(answered.map((one) => one.source))} instead.`,
    );
  }

  const folded = shape.readings.filter((one) => {
    const status = (one.record as { status?: RecordStatus } | undefined)?.status;
    return status !== undefined && status !== "established";
  });
  if (folded.length > 0) {
    notes.push(
      `This record is folded on these catalogues, so what each of them holds about it is under another identifier: ${named(folded.map((one) => one.source))}.`,
    );
  }

  if (answered.length > 1) {
    notes.push(
      "A value here names the catalogues that published it. Two of them agreeing is evidence of its own, and where they disagree the reading nobody preferred is published beside the one that won.",
    );
  }

  return notes;
}
