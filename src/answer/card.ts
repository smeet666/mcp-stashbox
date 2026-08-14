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
 * **A shared name is never a join.** An entry carrying a catalogue-minted
 * identifier is a record on the catalogue that minted it, and two catalogues
 * naming one thing mint two records. They are one entry only where the data
 * carries the join, and a name that matches is published as the resemblance it
 * is, beside two records a reader can follow separately.
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

/** One catalogue's record, named the way that catalogue names it. */
export interface EntryAt {
  source: string;
  id: string;
}

/**
 * One entry of a united list, with what is known about it on other catalogues.
 *
 * `published_by` names the catalogues that published this very record, so an
 * entry another catalogue never published carries one name. What another
 * catalogue holds is published beside it, under the two things it can be: a
 * record joined to this one by a link somebody wrote, or a record whose name
 * matches and which nothing else connects to it.
 */
export interface CardListEntry extends CardEntry {
  /**
   * The identifier this same record carries on another catalogue, read from a
   * link one of them publishes to the other. A reader chains to either.
   */
  also_at?: EntryAt[];
  /**
   * A record another catalogue published under a name that matches. It is a
   * resemblance and nothing more: the two are one thing only where an editor
   * wrote that they are, and until then a reader who needs the other reads it
   * at the identifier named here.
   */
  same_name_as?: EntryAt[];
}

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
    // Every catalogue asked, not only those that answered: one dropped out of
    // the table reads as a catalogue nobody asked, and a table with a hole in
    // it is a table a reader cannot count from.
    counts[name] = shape.readings.map((one) => ({
      source: one.source,
      value: one.state === "answered" ? countIn(one.record?.[name]) : null,
      state: one.state,
    }));
  }

  return {
    fields,
    counts,
    held_by: [...new Map(shape.readings.map((one) => [one.source, one])).values()].map(holderOf),
    // The policy and the outcome are two facts. A card reporting only the
    // catalogues that answered would read as a policy nobody wrote, and a
    // reader could not tell whether to change it.
    preferred: [...shape.prefer],
    read_from: answered.map((one) => one.source),
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
  // One catalogue that answered twice is one catalogue. Two hashes reaching
  // one record on it is two matches and one reading, and counting it twice
  // turns two agreeing catalogues into three, which is the one signal every
  // value on this card rests on.
  const once = new Map<string, Reading & { record: Record<string, unknown> }>();
  for (const one of answered) if (!once.has(one.source)) once.set(one.source, one);
  return [...once.values()]
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

  // Agreeing takes two readings of something. A field none of them published
  // is a field none of them said anything about, so nobody agrees on it.
  const agreed =
    value === null ? [] : said.filter((one) => same(one.value, value)).map((one) => one.source);
  const disagreed = said
    .filter((one) => one.value !== null && !same(one.value, value))
    .map((one) => ({ source: one.source, value: one.value }));

  return {
    value,
    agreed_by: agreed,
    ...(disagreed.length === 0 ? {} : { disagreed }),
  };
}

/**
 * What a published value is, apart from where it is held.
 *
 * Every record a catalogue names carries that catalogue's own identifier, and
 * two catalogues naming one studio mint two of them. Compared whole, the two
 * readings differ by an address and the card reports a disagreement between two
 * catalogues that said the same thing. Compared on what the value *is*, they
 * agree, which is the stronger fact and the true one.
 *
 * A field a catalogue publishes no table for is left out of the comparison for
 * the same reason: a null that stands for "this catalogue counts none" is a
 * fact about the catalogue, and letting it split two readings would render a
 * capability as a difference in the world.
 */
function identityOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  const held = value as Record<string, unknown>;
  if (typeof held.hash === "string")
    return `${String(held.algorithm ?? "")} ${held.hash.toLowerCase()}`;
  if (typeof held.url === "string") return held.url;
  if (typeof held.value === "string" && typeof held.precision === "string") {
    return `${held.value} ${held.precision}`;
  }
  if (typeof held.name === "string") return held.name.trim().toLowerCase();
  if (typeof held.id === "string") return held.id.slice(held.id.indexOf(":") + 1);
  // A shape with nothing naming it is compared whole, since there is nothing
  // else to compare it on.
  return JSON.stringify(
    Object.fromEntries(Object.entries(held).filter(([name]) => name !== "id" && name !== "source")),
  );
}

/** Whether two published readings name the same thing. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return identityOf(a) === identityOf(b);
}

/**
 * The union of a list, in the order the preferred catalogue holds it, then what
 * the others add.
 *
 * The order carries a fact of its own: a reader meets the preferred catalogue's
 * reading first, and everything after it is what no preferred catalogue held.
 *
 * What counts as one entry is what the data joins. An entry a catalogue minted
 * an identifier for is that record, and it meets another catalogue's entry only
 * under that identifier or under a link published to it. An entry nobody minted
 * an identifier for is what it holds, and two catalogues holding it published
 * one thing.
 */
function unionOf(answered: readonly Answered[], name: string): CardListEntry[] {
  const held: CardListEntry[] = [];
  /** Every address one entry answers to: the one it carries, and those linked to it. */
  const addressed = new Map<string, CardListEntry>();
  /** Entries that are their own content, keyed on that content. */
  const byContent = new Map<string, CardListEntry>();

  for (const one of answered) {
    const value = one.record[name];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const id = identifierOf(entry);
      if (id === undefined) {
        // An entry nobody minted an identifier for is what it holds. Two
        // catalogues publishing one alias published one alias.
        const key = typeof entry === "string" ? entry : identityOf(entry);
        const found = byContent.get(key);
        if (found === undefined) byContent.set(key, place(held, entry, one.source));
        else attribute(found, one.source);
        continue;
      }
      const found = addressed.get(id);
      const kept = found ?? place(held, entry, one.source);
      if (found !== undefined) {
        attribute(found, one.source);
        // Reached through a link rather than under its own address: the
        // identifier this catalogue minted is the one a reader chains to
        // there, and dropping it leaves that catalogue's record unreachable.
        if (identifierOf(found.value) !== id && !(found.also_at ?? []).some((at) => at.id === id)) {
          (found.also_at ??= []).push({ source: one.source, id });
        }
      }
      addressed.set(id, kept);
      for (const link of linksOf(entry)) if (!addressed.has(link)) addressed.set(link, kept);
    }
  }
  return resembling(held);
}

/** A new entry of the union, in the order the catalogue that published it was read. */
function place(held: CardListEntry[], value: unknown, source: string): CardListEntry {
  const made: CardListEntry = { value: value as string, published_by: [source] };
  held.push(made);
  return made;
}

/** A catalogue that published this very record, named once however often it said it. */
function attribute(entry: CardListEntry, source: string): void {
  if (!entry.published_by.includes(source)) entry.published_by.push(source);
}

/** The identifier a catalogue minted for an entry, absent where it minted none. */
function identifierOf(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const held = (value as Record<string, unknown>).id;
  return typeof held === "string" && held !== "" ? held : undefined;
}

/** The addresses an entry names for itself on other catalogues, which are joins. */
function linksOf(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  const held = (value as { alsoHeldAt?: unknown }).alsoHeldAt;
  if (!Array.isArray(held)) return [];
  return held
    .map((one) => (one as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string" && id !== "");
}

/** What an entry is called, for the one comparison a name is allowed to decide. */
function nameOf(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const held = (value as Record<string, unknown>).name;
  if (typeof held !== "string") return null;
  const written = held.trim().toLowerCase();
  return written === "" ? null : written;
}

/** The catalogue an identifier was minted on, which is the one it addresses. */
function mintedOn(id: string, entry: CardListEntry): string {
  const at = id.indexOf(":");
  return at === -1 ? (entry.published_by[0] ?? "") : id.slice(0, at);
}

/**
 * Every pair of entries two catalogues wrote one name for, named on both.
 *
 * A reader looking for one thing on the other catalogue needs to be told that
 * something of that name is held there, and needs just as much to be told that
 * nothing establishes the two as one. Both entries carry the other's address,
 * so the pair reads the same from either side.
 */
function resembling(held: readonly CardListEntry[]): CardListEntry[] {
  for (const one of held) {
    const name = nameOf(one.value);
    if (name === null) continue;
    for (const other of held) {
      if (other === one || nameOf(other.value) !== name) continue;
      // What the reader is sent to read is an address, so an entry carrying
      // none is nothing to send them to.
      const id = identifierOf(other.value);
      if (id === undefined) continue;
      // A catalogue that published both of them holds two records apart under
      // one name, which is its own reading and no resemblance between two
      // catalogues.
      if (other.published_by.some((source) => one.published_by.includes(source))) continue;
      (one.same_name_as ??= []).push({ source: mintedOn(id, other), id });
    }
  }
  return [...held];
}

/** A count as a catalogue published one, which is a whole number of things or nothing. */
function countIn(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** What became of one catalogue, whether it answered, failed or was never asked. */
function holderOf(reading: Reading): CardHolder {
  const held = reading.record as
    { status?: RecordStatus; sourceUrl?: string; retrievedAt?: string } | undefined;
  const status = held?.status;
  return {
    source: reading.source,
    // Read from that catalogue, at that moment, by this client. Neither is a
    // reading two catalogues could disagree about.
    ...(held?.sourceUrl === undefined ? {} : { source_url: held.sourceUrl }),
    ...(held?.retrievedAt === undefined ? {} : { retrieved_at: held.retrievedAt }),
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
    // Not asked and could not answer are two of the three states this server
    // exists to keep apart, and the fallback is announced either way.
    const what = reading.state === "absent" ? "was never asked" : "could not answer";
    notes.push(
      `The catalogue this call preferred is ${first}, which ${what}, so every value here was read from ${named(answered.map((one) => one.source))} instead.`,
    );
  }

  const folded = shape.readings.filter((one) => {
    const status = (one.record as { status?: RecordStatus } | undefined)?.status;
    return status !== undefined && status !== "established";
  });
  for (const one of folded) {
    const successor = (one.record as { mergedInto?: string | null } | undefined)?.mergedInto;
    notes.push(
      successor
        ? `${one.source} has folded this record into ${successor}, so what it holds about it is under that identifier.`
        : `${one.source} has withdrawn this record and names none in its place, so what it once held is reachable there under no identifier at all.`,
    );
  }

  if (answered.length > 1) {
    notes.push(
      "A value here names the catalogues that published it. Two of them agreeing is evidence of its own, and where they disagree the reading nobody preferred is published beside the one that won.",
    );
  }

  return notes;
}
