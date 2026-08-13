/**
 * How a record and a card reach a reader.
 *
 * One rule shapes every line here, and it is a security property before it is a
 * matter of style: **a value a catalogue published never opens a line.** Every
 * title, name, address and hash in an answer was written by someone editing a
 * public catalogue, and it lands inside a line this server composed. A line
 * break in one of them opens a line at the column this server opens its own,
 * and the reader is a model acting on what it reads: a forged `Note:` rewrites
 * the qualifications this whole server exists to state.
 *
 * So nothing published reaches prose without being flattened first, without
 * exception, and the suite counts lines rather than matching words: a record
 * whose every field carries a line of its own renders in the number of lines
 * the renderer composed, or the guard has a hole in it.
 *
 * The second rule is that **prose and payload carry the same qualifications.** A
 * client showing only the text block must lose none of them, so a caveat that
 * reaches one reaches both.
 */

import { instanceById, type Capability, type InstanceId } from "../stashbox/instances.js";
import type {
  Card,
  CardEntry,
  CardValue,
  FingerprintRow,
  ImageRow,
  ReadDate,
  SiteLink,
  TagRef,
} from "../types.js";
import { markerSuffix } from "./marker.js";
import { inline, joinLines, line, notesBlock, section, type Rendered } from "./text.js";

/* ------------------------------------------------------------ the catalogue */

/** What an answer needs to know about the catalogue a record came off. */
export interface Catalogue {
  name: string;
  publishes: (capability: Capability) => boolean;
}

/**
 * The catalogue a record came off, read from the registry.
 *
 * A catalogue the registry does not declare is one nothing is claimed about: a
 * field missing there is left unexplained rather than explained by a limit
 * nobody measured.
 */
export function catalogueOf(id: InstanceId | string): Catalogue {
  const spec = instanceById(id);
  return {
    name: spec?.name ?? id,
    publishes: (capability) => spec !== undefined && spec.capabilities.includes(capability),
  };
}

/* -------------------------------------------------------------- the pieces */

/** The line a record opens with, which is its own name or the identifier. */
export function headLine(name: string | null, id: string): string {
  return inline(name) ?? id;
}

/** A date as the catalogue entered it, at the precision it was entered with. */
export function dateText(date: ReadDate | null): string | null {
  return date === null ? null : date.value;
}

/** A runtime published as a count of seconds, with the unit it counts in. */
export function durationText(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const spelt = hours > 0 ? `${hours}h ${minutes}m ${rest}s` : `${minutes}m ${rest}s`;
  return `${seconds} seconds (${spelt})`;
}

/**
 * Where a record links, each address with the site and category behind it.
 *
 * An address is written by whoever edits the record, so it reaches this line
 * flattened: a line break inside one would open a line at the column this
 * server opens its own, and a reader has no way to tell the two apart.
 */
export function linksText(links: readonly SiteLink[]): string {
  return links
    .map((link) => {
      const url = inline(link.url) ?? "";
      const about = [inline(link.siteName), inline(link.siteCategory)].filter(
        (part): part is string => part !== null,
      );
      return about.length === 0 ? url : `${url} (${about.join(", ")})`;
    })
    .join("; ");
}

/** One image as an address and the size the catalogue recorded for it. */
export function imageRows(images: readonly ImageRow[]): string[] {
  return images.map((image) => {
    const size =
      image.width !== null && image.height !== null ? ` (${image.width}x${image.height})` : "";
    return `  - ${inline(image.url) ?? ""}${size}`;
  });
}

/** One fingerprint, with what the catalogue counted for it and what it did not. */
export function fingerprintRows(rows: readonly FingerprintRow[]): string[] {
  return rows.map((row) => {
    const counted = [
      row.submissions === null ? null : `${row.submissions} submission(s)`,
      row.reports === null ? null : `${row.reports} report(s)`,
      // Its own measurement: the runtime submitted with the hash, which the
      // release's own runtime can differ from.
      row.durationSeconds === null ? null : `submitted for ${row.durationSeconds}s`,
      row.userSubmitted === true ? "submitted by a person" : null,
    ].filter((part): part is string => part !== null);
    const about = counted.length === 0 ? "" : ` (${counted.join(", ")})`;
    // The algorithm is one of a closed set this client reads; the hash is
    // whatever the catalogue published, so it is flattened before it is placed.
    return `  - ${row.algorithm} ${inline(row.hash) ?? ""}${about}`;
  });
}

/** The tags a record carries, each with the category its catalogue placed it in. */
export function tagsText(tags: readonly TagRef[]): string {
  return tags
    .map((tag) => {
      const category = inline(tag.category);
      const named = `${inline(tag.name) ?? tag.id}${markerSuffix(tag.status)}`;
      return category === null ? named : `${named} (${category})`;
    })
    .join("; ");
}

/**
 * What a block of a record lost on its way here, said the one way.
 *
 * Every heavy block loses rows the same way and owes a reader the same
 * sentence, whichever kind of record carries it. A loss phrased unlike its
 * neighbour reads as a loss of another kind.
 */
export function blockLoss(
  count: number | undefined,
  what: string,
  catalogue: string,
): string | null {
  if (count === undefined || count === 0) return null;
  return `${count} ${what}(s) ${catalogue} answered with could not be read and are left out of the block here.`;
}

/* ------------------------------------------------------------ a record read */

/** A record as one catalogue holds it, printed under the words a reader reads. */
export function recordLines(record: Record<string, unknown>, kind: string): string {
  const catalogue = catalogueOf(String(record.source));
  const named = (name: string) => inline(record[name] as string | null);

  const rows: (string | null)[] = [
    `${headLine(named("title") ?? named("name"), String(record.id))}${markerSuffix(
      record.status as never,
    )}`,
    `${catalogue.name}, ${kind} ${String(record.id)}`,
    line("Told apart by", named("disambiguation")),
    line("Description", named("description")),
    line("Released", dateText((record.releaseDate as ReadDate | null) ?? null)),
    line("Born", dateText((record.birthDate as ReadDate | null) ?? null)),
    line("Died", dateText((record.deathDate as ReadDate | null) ?? null)),
    line("Duration", durationText((record.durationSeconds as number | null) ?? null)),
    line("Code", named("code")),
    line("Director", named("director")),
    line("Gender", named("gender")),
    line("Country", named("country")),
    listLine("Aliases", record.aliases),
    line("Studio", studioLine(record.studio)),
    line("Parent", parentLine(record.parent)),
    line("Category", categoryLine(record.category)),
    creditsLine(record.performers),
    Array.isArray(record.tags) && record.tags.length > 0
      ? `Tags: ${tagsText(record.tags as TagRef[])}`
      : null,
    `Links: ${
      Array.isArray(record.urls) && record.urls.length > 0
        ? linksText(record.urls as SiteLink[])
        : `${catalogue.name} links this record nowhere else.`
    }`,
    Array.isArray(record.images)
      ? section(
          "Images",
          imageRows(record.images as ImageRow[]),
          `${catalogue.name} published none with this record.`,
        )
      : null,
    Array.isArray(record.fingerprints)
      ? section(
          "Fingerprints",
          fingerprintRows(record.fingerprints as FingerprintRow[]),
          `${catalogue.name} published none with this record.`,
        )
      : null,
    `Source: ${inline(String(record.sourceUrl)) ?? ""}`,
    `Read from ${catalogue.name} at ${String(record.retrievedAt)}`,
  ];
  return joinLines(rows);
}

function listLine(label: string, value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const held = value
    .map((entry) => inline(String(entry)))
    .filter((entry): entry is string => entry !== null);
  return held.length === 0 ? null : `${label}: ${held.join(", ")}`;
}

function studioLine(value: unknown): string | null {
  const studio = value as { name?: string | null; id?: string; status?: never } | null;
  if (studio === null || studio === undefined) return null;
  return `${inline(studio.name ?? null) ?? studio.id ?? ""}${markerSuffix(studio.status ?? ("established" as never))}`;
}

function parentLine(value: unknown): string | null {
  const parent = value as { name?: string | null; id?: string } | null;
  if (parent === null || parent === undefined) return null;
  return inline(parent.name ?? null) ?? parent.id ?? null;
}

function categoryLine(value: unknown): string | null {
  const category = value as { name?: string | null; group?: string | null } | null;
  if (category === null || category === undefined) return null;
  const named = inline(category.name ?? null);
  const group = inline(category.group ?? null);
  if (named === null) return null;
  return group === null ? named : `${named} (${group})`;
}

function creditsLine(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const credits = value
    .map((entry) => {
      const credit = entry as {
        name: string | null;
        id: string;
        creditedAs: string | null;
        status: never;
      };
      const own = inline(credit.name) ?? credit.id;
      const printed = inline(credit.creditedAs);
      const as = printed === null ? "" : `, credited as ${printed}`;
      return `${own}${as}${markerSuffix(credit.status)}`;
    })
    .join("; ");
  return `Credited: ${credits}`;
}

/* ---------------------------------------------------------------- the card */

/**
 * A card as a reader meets it: every value with the catalogues that said it,
 * every disagreement stated rather than resolved in silence.
 */
export function renderCard(card: Card, kind: string, cached = false): Rendered {
  const rows: (string | null)[] = [];
  for (const [name, held] of Object.entries(card.fields)) {
    rows.push(Array.isArray(held) ? unionLine(name, held) : valueLine(name, held));
  }

  for (const [name, counts] of Object.entries(card.counts)) {
    const each = counts
      .map((one) => {
        const who = catalogueOf(one.source).name;
        // A null is three different facts. Read as one, two of them become a
        // limit the catalogue does not have.
        if (one.value !== null) return `${one.value} on ${who}`;
        if (one.state === "absent") return `${who} was never asked`;
        if (one.state === "failed") return `${who} could not answer`;
        return `${who} publishes no such count`;
      })
      .join("; ");
    // Never added: these catalogues index corpora that overlap by an amount
    // none of them publishes.
    rows.push(`${spelt(name)}: ${each}`);
  }

  const held = card.held_by.map((one) => {
    const who = catalogueOf(one.source).name;
    if (one.state === "answered") {
      // A catalogue that looked and holds nothing there answered, and saying
      // it holds the record is the one thing the answer cannot say.
      if (one.reason !== undefined) return `  - ${who}: ${inline(one.reason) ?? ""}`;
      const at = one.retrieved_at === undefined ? "" : `, read ${one.retrieved_at}`;
      const where = one.source_url === undefined ? "" : ` (${inline(one.source_url) ?? ""})`;
      return `  - ${who}: holds it at ${one.id ?? ""}${one.status === undefined ? "" : markerSuffix(one.status)}${where}${at}`;
    }
    if (one.state === "failed") {
      return `  - ${who}: could not answer (${one.error ?? "error"})${one.reason === undefined ? "" : `: ${inline(one.reason) ?? ""}`}`;
    }
    return `  - ${who}: not asked${one.reason === undefined ? "" : `: ${inline(one.reason) ?? ""}`}`;
  });

  const body = joinLines([
    ...rows,
    section("Held by", held, "no catalogue was asked for this record"),
    `Preferred in this order: ${card.preferred.map((one) => catalogueOf(one).name).join(", ")}`,
    `Read from: ${card.read_from.map((one) => catalogueOf(one).name).join(", ") || "no catalogue answered"}`,
  ]);

  const notes = cached
    ? [
        ...card.notes,
        "This answer was replayed from this client's store, so no catalogue was asked for it. What each is reported as holding is what it held when the answer was first read.",
      ]
    : card.notes;

  return {
    text: `${body}${notesBlock(notes)}`,
    structured: {
      ...(cached ? { cached: true } : {}),
      card: {
        kind,
        fields: card.fields,
        counts: card.counts,
        held_by: card.held_by,
        preferred: card.preferred,
        read_from: card.read_from,
        notes,
      },
    },
  };
}

/* ---------------------------------------------------------------- the rows */

/** What a search answers with, once every catalogue has been heard from. */
export interface Rows {
  rows: Record<string, unknown>[];
  window?: { page: number; limit: number };
  perSource: {
    source: string;
    name?: string;
    state: string;
    count?: number;
    indexTotal?: number;
    skipped?: number;
    narrowingsNotReceived?: string[];
    algorithmsNotSearched?: string[];
    reason?: string;
    [key: string]: unknown;
  }[];
  ordering: string;
}

/**
 * A page of rows, with what each catalogue did and what the page does not
 * establish.
 *
 * The prose carries every qualification the payload carries: a client showing
 * the text block alone must lose none of them, and the three states a
 * catalogue can be in are the qualification that matters most.
 */
export function renderRows(result: Rows, what: string, notes: string[], cached = false): Rendered {
  const lines = result.rows.map((row) => `- ${rowLine(row)}`);
  const reports = result.perSource.map((one) => {
    const who = inline(String(one.name ?? one.source)) ?? one.source;
    if (one.state === "answered") {
      // Everything the payload carries about what this catalogue did: a
      // client showing the text block alone must lose none of it.
      const also = [
        one.indexTotal === undefined
          ? null
          : `of ${String(one.indexTotal)} its own index holds for this question`,
        one.skipped === undefined
          ? null
          : `${String(one.skipped)} row(s) it answered with could not be read and are left out`,
        (one.narrowingsNotReceived ?? []).length === 0
          ? null
          : `did not receive: ${(one.narrowingsNotReceived ?? []).join(", ")}`,
        (one.algorithmsNotSearched ?? []).length === 0
          ? null
          : `does not search ${(one.algorithmsNotSearched ?? []).join(", ")}`,
      ].filter((part): part is string => part !== null);
      const tail = also.length === 0 ? "" : `, ${also.join("; ")}`;
      return `  - ${who}: answered, ${one.count ?? 0} row(s)${tail}`;
    }
    if (one.state === "failed") {
      return `  - ${who}: could not answer: ${inline(String(one.reason ?? "")) ?? ""}`;
    }
    return `  - ${who}: not asked: ${inline(String(one.reason ?? "")) ?? ""}`;
  });

  const body = joinLines([
    `${result.rows.length} ${what} row(s) from the catalogues that answered.`,
    section(
      `${what.charAt(0).toUpperCase()}${what.slice(1)}s`,
      lines,
      "no catalogue that answered returned a row",
    ),
    section("Catalogues", reports, "no catalogue was asked"),
    `Rows are ${result.ordering}.`,
  ]);

  return {
    text: `${body}${notesBlock(notes)}`,
    structured: {
      results: result.rows.map((row) => rowPayload(row)),
      result_count: result.rows.length,
      per_source: result.perSource.map((one) => rowPayload(one as never)),
      ordering: result.ordering,
      ...(result.window === undefined ? {} : { window: result.window }),
      ...(cached ? { cached: true } : {}),
      notes,
    },
  };
}

/**
 * One row, under the names the published schema declares.
 *
 * A payload that carried this client's own spellings would announce one
 * contract and answer another, and a caller reading the schema would find no
 * address on a record that carries one.
 */
export function rowPayload(row: Record<string, unknown>): Record<string, unknown> {
  const held: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(row)) {
    if (value === undefined) continue;
    held[name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }
  return held;
}

/** One row, opening with what names the record and closing with its address. */
function rowLine(row: Record<string, unknown>): string {
  const named =
    inline((row.title as string | null) ?? (row.name as string | null)) ?? String(row.id);
  const about = [
    inline((row.disambiguation as string | null) ?? null),
    studioLine(row.studio),
    dateText((row.releaseDate as never) ?? null),
    inline((row.country as string | null) ?? null),
    categoryLine(row.category),
  ].filter((part): part is string => part !== null && part !== "");
  const tail = about.length === 0 ? "" : ` (${about.join(", ")})`;
  return `${named}${markerSuffix(row.status as never)}${tail} [${String(row.id)}]`;
}

/**
 * A value a catalogue published, as a reader reads it.
 *
 * A date carries the precision it was entered at, an address carries the site
 * behind it, and a structure printed through its default rendering reaches a
 * reader as nothing at all.
 */
function spelled(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return inline(String(value));
  const held = value as Record<string, unknown>;
  if (typeof held.value === "string" && typeof held.precision === "string") {
    return inline(held.value);
  }
  if (typeof held.url === "string") return linksText([held as never]);
  if (typeof held.hash === "string")
    return inline(`${String(held.algorithm)} ${String(held.hash)}`);
  if (typeof held.name === "string" || typeof held.id === "string") {
    return inline(String(held.name ?? held.id));
  }
  // A shape this renderer has no words for is published in the payload and
  // named here rather than printed as the engine would print it.
  return "a block this answer carries in its payload";
}

/** One value, with the catalogues that said it and the readings that lost. */
function valueLine(name: string, held: CardValue): string | null {
  const value = spelled(held.value);
  if (value === null) return null;
  const said = held.agreed_by.map((one) => catalogueOf(one).name).join(", ");
  const apart =
    held.disagreed === undefined
      ? ""
      : `; ${held.disagreed
          .map((one) => `${catalogueOf(one.source).name} says ${spelled(one.value) ?? ""}`)
          .join(", ")}`;
  return `${spelt(name)}: ${value} (${said}${apart})`;
}

/** A united list, each entry naming every catalogue that published it. */
function unionLine(name: string, entries: readonly CardEntry[]): string | null {
  if (entries.length === 0) return null;
  const each = entries
    .map((entry) => {
      const value = spelled(entry.value);
      const by = entry.published_by.map((one) => catalogueOf(one).name).join(", ");
      return value === null ? null : `${value} (${by})`;
    })
    .filter((entry): entry is string => entry !== null)
    .join("; ");
  return each === "" ? null : `${spelt(name)}: ${each}`;
}

/** A field of a card as a reader names the thing it holds. */
function spelt(name: string): string {
  const words = name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
