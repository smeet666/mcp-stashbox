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

import type { CardListEntry, EntryAt } from "./card.js";
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
import { inline, inlineAll, joinLines, line, notesBlock, section, type Rendered } from "./text.js";

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
    publishes: (capability) => spec?.capabilities.includes(capability) ?? false,
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
  if (seconds === null) {
    return null;
  }
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

/**
 * One fingerprint, with what the catalogue counted for it and what it did not.
 *
 * The counts are what makes a hash weigh anything: one submitted five hundred
 * times and one submitted once make the same claim, and only the counts tell
 * them apart. A hash its catalogue counts a dispute on reads as a settled one
 * wherever the dispute is left in the payload.
 */
export function fingerprintText(row: Partial<FingerprintRow>): string {
  const counted = [
    row.submissions === null || row.submissions === undefined
      ? null
      : `${row.submissions} submission(s)`,
    row.reports === null || row.reports === undefined ? null : `${row.reports} report(s)`,
    row.contested === true ? "contested" : null,
    // Its own measurement: the runtime submitted with the hash, which the
    // release's own runtime can differ from.
    row.durationSeconds === null || row.durationSeconds === undefined
      ? null
      : `submitted for ${row.durationSeconds}s`,
    row.userSubmitted === true ? "submitted by a person" : null,
  ].filter((part): part is string => part !== null);
  const about = counted.length === 0 ? "" : ` (${counted.join(", ")})`;
  // The algorithm is one of a closed set this client reads; the hash is
  // whatever the catalogue published, so it is flattened before it is placed.
  return `${row.algorithm ?? ""} ${inline(row.hash ?? null) ?? ""}${about}`;
}

/** The fingerprints a record carries, one to a row. */
export function fingerprintRows(rows: readonly FingerprintRow[]): string[] {
  return rows.map((row) => `  - ${fingerprintText(row)}`);
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
  if (count === undefined || count === 0) {
    return null;
  }
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
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const held = value
    .map((entry) => inline(String(entry)))
    .filter((entry): entry is string => entry !== null);
  return held.length === 0 ? null : `${label}: ${held.join(", ")}`;
}

function studioLine(value: unknown): string | null {
  const studio = value as { name?: string | null; id?: string; status?: never } | null;
  if (studio === null || studio === undefined) {
    return null;
  }
  return `${inline(studio.name ?? null) ?? studio.id ?? ""}${markerSuffix(studio.status ?? ("established" as never))}`;
}

function parentLine(value: unknown): string | null {
  const parent = value as { name?: string | null; id?: string } | null;
  if (parent === null || parent === undefined) {
    return null;
  }
  return inline(parent.name ?? null) ?? parent.id ?? null;
}

function categoryLine(value: unknown): string | null {
  const category = value as { name?: string | null; group?: string | null } | null;
  if (category === null || category === undefined) {
    return null;
  }
  const named = inline(category.name ?? null);
  const group = inline(category.group ?? null);
  if (named === null) {
    return null;
  }
  return group === null ? named : `${named} (${group})`;
}

function creditsLine(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
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
 * The two things that differ between catalogues held out for one reason.
 *
 * A reason names the catalogue it belongs to and the setting that would read
 * it. Both are lifted out to find the reasons that share a shape, and both are
 * written back into the sentence that folds them: a shape printed with the two
 * removed names neither what went unread nor what to set to read it. The marks
 * are characters no catalogue publishes.
 */
const CATALOGUE = "\u0001";
const VARIABLE = "\u0002";

/**
 * A card as a reader meets it: every value with the catalogues that said it,
 * every disagreement stated rather than resolved in silence.
 */
export function renderCard(card: Card, kind: string, cached = false): Rendered {
  const rows: (string | null)[] = [];
  for (const [name, held] of Object.entries(card.fields)) {
    rows.push(Array.isArray(held) ? unionBlock(name, held) : valueLine(name, held));
  }

  for (const [name, counts] of Object.entries(card.counts)) {
    const each = counts
      .map((one) => {
        const who = catalogueOf(one.source).name;
        // A null is three different facts. Read as one, two of them become a
        // limit the catalogue does not have.
        if (one.value !== null) {
          return `${one.value} on ${who}`;
        }
        if (one.state === "absent") {
          return `${who} was never asked`;
        }
        if (one.state === "failed") {
          return `${who} could not answer`;
        }
        return `${who} publishes no such count`;
      })
      .join("; ");
    // Never added: these catalogues index corpora that overlap by an amount
    // none of them publishes.
    rows.push(`${spelt(name)}: ${each}`);
  }

  // Catalogues held out for one reason are one fact. Written a line each, they
  // push what the card holds off the top of a reader's view. What differs
  // between them is the catalogue and the setting that would read it, so both
  // are held apart from the shape they are folded on and printed back.
  const alike = new Map<string, { names: string[]; variables: string[] }>();
  for (const one of card.held_by) {
    if (one.state !== "absent" || one.reason === undefined) {
      continue;
    }
    const who = catalogueOf(one.source).name;
    const shape = one.reason
      .split(who)
      .join(CATALOGUE)
      .replace(/STASHBOX_\w+/g, VARIABLE);
    const group = alike.get(shape) ?? { names: [], variables: [] };
    group.names.push(who);
    for (const variable of one.reason.match(/STASHBOX_\w+/g) ?? []) {
      if (!group.variables.includes(variable)) {
        group.variables.push(variable);
      }
    }
    alike.set(shape, group);
  }
  const folded = new Set(
    [...alike.values()].filter((group) => group.names.length > 1).flatMap((one) => one.names),
  );

  const held = card.held_by
    .filter((one) => !folded.has(catalogueOf(one.source).name))
    .map((one) => {
      const who = catalogueOf(one.source).name;
      if (one.state === "answered") {
        // A catalogue that looked and holds nothing there answered, and saying
        // it holds the record is the one thing the answer cannot say.
        if (one.reason !== undefined) {
          return `  - ${who}: ${inline(one.reason) ?? ""}`;
        }
        const at = one.retrieved_at === undefined ? "" : `, read ${one.retrieved_at}`;
        const where = one.source_url === undefined ? "" : ` (${inline(one.source_url) ?? ""})`;
        return `  - ${who}: holds it at ${one.id ?? ""}${one.status === undefined ? "" : markerSuffix(one.status)}${where}${at}`;
      }
      if (one.state === "failed") {
        return `  - ${who}: could not answer (${one.error ?? "error"})${one.reason === undefined ? "" : `: ${inline(one.reason) ?? ""}`}`;
      }
      return `  - ${who}: not asked${one.reason === undefined ? "" : `: ${inline(one.reason) ?? ""}`}`;
    });

  for (const [shape, group] of alike) {
    if (group.names.length < 2) {
      continue;
    }
    const said = shape
      .split(CATALOGUE)
      .join("each of them")
      .split(VARIABLE)
      .join(group.variables.join(", "))
      .replace(/\s+/g, " ")
      .trim();
    held.push(`  - ${group.names.join(", ")}: not asked: ${inline(said) ?? ""}`);
  }

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

/* ------------------------------------------------------------ the matches */

/** What a set of hashes reached, and what every catalogue did with them. */
export interface Matches {
  matches: {
    scene: Card;
    matchedBy: { hash: string; algorithm: string; sources: string[] }[];
    matchKind: string;
  }[];
  match_count: number;
  records_named: number;
  resemblances: number;
  unattributed: number;
  unmatched: { hash: string; algorithm: string }[];
  not_searched: { hash: string; algorithm: string; sources: string[] }[];
  asked: { hash: string; algorithm: string }[];
  perSource: {
    source: string;
    name?: string;
    state: string;
    count?: number;
    algorithmsNotSearched?: string[];
    reason?: string;
  }[];
}

/** The records behind one card, at the addresses their catalogues minted. */
function addressesOf(match: Matches["matches"][number]): string[] {
  return match.scene.held_by
    .filter(
      (one): one is typeof one & { id: string } => one.state === "answered" && one.id !== undefined,
    )
    .map((one) => one.id);
}

/**
 * What a fingerprint answer states, and what each kind of hash claims.
 *
 * The distinction decides the whole answer. An MD5 and an OSHASH are computed
 * from the bytes of a file, so a match on one names the file. A PHASH states a
 * likeness, which a re-encode, a crop and another scene from one shoot all
 * satisfy: rendered under one word, a resemblance reaches a reader as an
 * identity and a caller acts on a file they never had.
 *
 * Every block opens with the hash that reached it. The answer is a mapping from
 * a hash to a record, the blocks stand in no order a caller wrote, and a reader
 * working from the prose alone would have to guess which hash produced which.
 */
export function renderMatches(result: Matches, cached: boolean): Rendered {
  const notes: string[] = [];
  /** One hash as a reader meets it, of a length that fits a line. */
  const spelt = (one: { algorithm: string; hash: string }) =>
    `${one.algorithm} ${inline(one.hash) ?? ""}`;
  const named = (source: string) =>
    inline(result.perSource.find((one) => one.source === source)?.name ?? source) ?? source;
  if (result.matches.some((one) => one.matchKind === "perceptual_similarity")) {
    notes.push(
      "A perceptual hash states a likeness. A record it reaches may hold a re-encode, a crop, or another scene from one shoot, so a match of that kind establishes a resemblance and says nothing about the bytes of either file.",
    );
  }
  if (result.matches.some((one) => one.matchKind === "exact_file")) {
    notes.push(
      "An MD5 and an OSHASH are computed from the bytes of a file, so a match on one of them names the file the hash was taken from, and two catalogues answering one of them describe the same bytes.",
    );
  }
  // One catalogue holding two records under one exact hash contradicts itself,
  // and it is the catalogue that says so by minting two identifiers. Folded
  // into one card, one of the two disappears; left unsaid, a reader takes the
  // two cards for two files.
  // The count that decides this is a count of records, never one of matches:
  // a record reached by three hashes is one record, and read off the matches
  // the note would assert a choice a caller does not have to make.
  const cardsPerHash = new Map<string, number>();
  for (const one of result.matches) {
    if (one.matchKind !== "exact_file") {
      continue;
    }
    for (const by of one.matchedBy) {
      cardsPerHash.set(spelt(by), (cardsPerHash.get(spelt(by)) ?? 0) + 1);
    }
  }
  const doubled = [...cardsPerHash].filter(([, cards]) => cards > 1).map(([hash]) => hash);
  if (doubled.length > 0) {
    notes.push(
      `These hashes reached more than one record: ${doubled.join(", ")}. A catalogue mints one identifier per record it holds, so each of those records opens an exact match of its own here, and which of them holds the file the hash was computed from is a question the catalogues answer no way at all.`,
    );
  }
  // A record an exact hash and a perceptual hash both reached stands under two
  // cards, since the two state different things about it. Counted off the
  // cards, one record reads as two files identified.
  const twice = [
    ...new Set(
      result.matches
        .filter((one) => one.matchKind === "exact_file")
        .flatMap((one) => addressesOf(one))
        .filter((id) =>
          result.matches
            .filter((one) => one.matchKind === "perceptual_similarity")
            .some((one) => addressesOf(one).includes(id)),
        ),
    ),
  ];
  if (twice.length > 0) {
    notes.push(
      `These records stand here twice, once under an exact hash that names the file and once under a perceptual hash that states a likeness: ${twice.join(", ")}. The two cards claim different things about one record, so the number of matches counts it twice where the records named count it once.`,
    );
  }
  const failed = result.perSource.filter((one) => one.state === "failed");
  if (failed.length > 0) {
    notes.push(
      `These catalogues could not answer, so this holds no record of theirs and states nothing about what they hold: ${failed.map((one) => inline(one.name ?? one.source) ?? one.source).join(", ")}.`,
    );
  }
  if (result.unmatched.length > 0) {
    notes.push(
      `These hashes reached no record on any catalogue that searched them: ${result.unmatched.map(spelt).join(", ")}. Each of them is a file the catalogues that searched them do not know, and the catalogues named below as unasked say nothing about them either way.`,
    );
  }
  if (result.not_searched.length > 0) {
    notes.push(
      `These hashes were never put to the catalogues named beside them, whose lookup does not search the algorithm they were computed with: ${result.not_searched.map((one) => `${spelt(one)} to ${one.sources.map(named).join(", ")}`).join("; ")}. What those catalogues hold is no evidence about the files behind them, either way.`,
    );
  }
  if (result.unattributed > 0) {
    notes.push(
      `${result.unattributed} record(s) the catalogues answered with carry none of the hashes asked. Which hash reached them is unknown, so they stand here as no match and are counted apart.`,
    );
  }
  // A lookup nobody performed and a lookup that found nothing read alike once
  // the counts are the only thing on the page, and only the second is evidence
  // about the files behind the hashes.
  if (!result.perSource.some((one) => one.state === "answered")) {
    notes.push(
      "No catalogue answered this question, so its emptiness is the question reaching none of them and is no evidence that what you asked about does not exist.",
    );
  }
  if (result.unmatched.length > 0 && result.matches.length === 0) {
    notes.push(
      "The catalogues that answered hold no record carrying the hashes they were put, so each of them looked and found nothing.",
    );
  }
  if (cached) {
    notes.push(
      "This answer was replayed from this client's store, so no catalogue was asked for it.",
    );
  }

  const shown = result.matches.map((one) => ({ match: one, card: renderCard(one.scene, "scene") }));
  const cards = shown.map((entry) => entry.card);
  // Every catalogue asked, and every one that was not, as every other answer
  // states them. Left to the payload, a caller reading the prose has no signal
  // that three of five catalogues were never asked, and "no match" reads as
  // "no catalogue holds this file".
  const reports = result.perSource.map((one) => {
    const who = inline(one.name ?? one.source) ?? one.source;
    if (one.state === "answered") {
      const also = [
        one.count === undefined ? null : `${one.count} match(es)`,
        (one.algorithmsNotSearched ?? []).length === 0
          ? null
          : `does not search ${(one.algorithmsNotSearched ?? []).join(", ")}, so those were never put to it`,
      ].filter((part): part is string => part !== null);
      return `  - ${who}: answered${also.length === 0 ? "" : `, ${also.join("; ")}`}`;
    }
    if (one.state === "failed") {
      return `  - ${who}: could not answer: ${inline(one.reason ?? "") ?? ""}`;
    }
    return `  - ${who}: not asked: ${inline(one.reason ?? "") ?? ""}`;
  });

  // A hash reaches a catalogue that answered and searches the algorithm it was
  // computed with. Counting what was written instead reports a lookup nobody
  // performed as a lookup that found nothing.
  const put = result.asked.filter((one) =>
    result.perSource.some(
      (who) =>
        who.state === "answered" && !(who.algorithmsNotSearched ?? []).includes(one.algorithm),
    ),
  );

  const body = [
    `${result.asked.length} fingerprint(s) written, ${put.length} put to a catalogue that answered, ${result.match_count} match(es). ${result.records_named} record(s) named by an exact hash; ${result.resemblances} match(es) on a perceptual hash, which names no file.`,
    `Asked: ${result.asked.map((one) => `${one.algorithm} ${inline(one.hash) ?? ""}`).join(", ")}`,
    `\nCatalogues:\n${reports.join("\n")}`,
    ...cards.map((one, at) => {
      const match = result.matches[at];
      const by = match?.matchedBy ?? [];
      // Where a card holds a reading from more than one catalogue, a hash
      // reached it on some of them and a hash written bare would stand as a
      // hash every catalogue on the card answered.
      // A catalogue that answered the lookup and holds no record on this card
      // stands among its holders as one that looked, so the readings the card
      // carries are what says whether a hash needs a catalogue named beside it.
      const several = (match?.scene.read_from.length ?? 0) > 1;
      const hashes = by
        .map(
          (print) =>
            `${spelt(print)}${several ? ` on ${print.sources.map(named).join(", ")}` : ""}`,
        )
        .join(", ");
      const claim =
        match?.matchKind === "exact_file"
          ? by.length > 1
            ? "name these bytes"
            : "names these bytes"
          : by.length > 1
            ? "resemble this"
            : "resembles this";
      return `\n${hashes} ${claim}:\n${one.text}`;
    }),
  ].join("\n");

  return {
    text: `${body}${notesBlock(notes)}`,
    structured: {
      matches: shown.map(({ match, card }) => ({
        scene: (card.structured as { card: unknown }).card,
        matched_by: match.matchedBy,
        match_kind: match.matchKind,
      })),
      match_count: result.match_count,
      records_named: result.records_named,
      resemblances: result.resemblances,
      unattributed: result.unattributed,
      unmatched: result.unmatched,
      not_searched: result.not_searched,
      asked: result.asked,
      // Under the names the published schema declares. A report handed over as
      // this client spells it announces one contract and answers another.
      per_source: result.perSource.map((one) => rowPayload(one as never)),
      ...(cached ? { cached: true } : {}),
      notes,
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
    indexTotalOverAnyWord?: boolean;
    skipped?: number;
    narrowingsNotReceived?: string[];
    narrowingsReceivedInPart?: string[];
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
      // A narrowing this catalogue never received, and a list it received short
      // of what was written, both leave it answering a question of its own. Its
      // total counts that question, and called the total for this one it stands
      // beside the disclosure that denies it.
      const narrower =
        (one.narrowingsNotReceived ?? []).length > 0 ||
        (one.narrowingsReceivedInPart ?? []).length > 0;
      const also = [
        one.indexTotal === undefined
          ? null
          : `of ${String(one.indexTotal)} its own index holds for ${
              one.indexTotalOverAnyWord === true
                ? "rows carrying any of the words asked, which is how its text index reads them"
                : narrower
                  ? "the question it received"
                  : "this question"
            }`,
        one.skipped === undefined
          ? null
          : `${String(one.skipped)} row(s) it answered with could not be read and are left out`,
        (one.narrowingsNotReceived ?? []).length === 0
          ? null
          : `did not receive: ${(one.narrowingsNotReceived ?? []).join(", ")}`,
        (one.narrowingsReceivedInPart ?? []).length === 0
          ? null
          : `received in part, the rest of what was written naming records of other catalogues: ${(
              one.narrowingsReceivedInPart ?? []
            ).join(", ")}`,
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
    if (value === undefined) {
      continue;
    }
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
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return inline(String(value));
  }
  const held = value as Record<string, unknown>;
  if (typeof held.value === "string" && typeof held.precision === "string") {
    return inline(held.value);
  }
  if (typeof held.url === "string") {
    return linksText([held as never]);
  }
  if (typeof held.hash === "string") {
    return fingerprintText(held as Partial<FingerprintRow>);
  }
  if (typeof held.name === "string" || typeof held.id === "string") {
    // The identifier travels with the name: a reader who wants this record's
    // scenes calls the next tool with it, and a name is what that tool
    // refuses. Chaining forward works because a search prints identifiers;
    // chaining back from a card takes the same.
    const called = inline(String(held.name ?? ""));
    const at = typeof held.id === "string" ? inline(held.id) : null;
    if (called === null) {
      return at;
    }
    return at === null ? called : `${called} [${at}]`;
  }
  // A block of named fields is printed as its fields. A shape with nothing
  // naming it at all is the only thing this renderer has no words for, and
  // naming it beats printing it the way an engine would.
  const named = Object.entries(held)
    .filter(
      ([, one]) => one !== null && one !== undefined && !(Array.isArray(one) && one.length === 0),
    )
    .map(
      ([name, one]) =>
        `${spelt(name).toLowerCase()} ${Array.isArray(one) ? inlineAll(one.map(String)) : (inline(String(one)) ?? "")}`,
    );
  return named.length === 0 ? null : named.join(", ");
}

/** One value, with the catalogues that said it and the readings that lost. */
function valueLine(name: string, held: CardValue): string | null {
  const value = spelled(held.value);
  if (value === null) {
    return null;
  }
  const said = held.agreed_by.map((one) => catalogueOf(one).name).join(", ");
  const apart =
    held.disagreed === undefined
      ? ""
      : `; ${held.disagreed
          .map((one) => `${catalogueOf(one.source).name} says ${spelled(one.value) ?? ""}`)
          .join(", ")}`;
  return `${spelt(name)}: ${value} (${said}${apart})`;
}

/**
 * A united list, on one line while it fits and as rows once it does not.
 *
 * Seventy addresses joined by semicolons is not a line a reader walks, and the
 * one thing they were reading for is somewhere inside it.
 */
function unionBlock(name: string, entries: readonly CardEntry[]): string | null {
  const one = unionLine(name, entries);
  if (one === null || one.length <= 240) {
    return one;
  }
  const rows = entries
    .map((entry) => {
      const value = spelled(entry.value);
      const by = entry.published_by.map((held) => catalogueOf(held).name).join(", ");
      // A block of forty entries carries the same facts in fewer words: what a
      // reader takes from a row is the other catalogue's address and that
      // nothing joins the two, and both survive the shortening.
      return value === null ? null : `  - ${value} (${by}${elsewhere(entry, name, true)})`;
    })
    .filter((row): row is string => row !== null);
  return `${spelt(name)}:\n${rows.join("\n")}`;
}

/**
 * What another catalogue holds under this entry, and what that is worth.
 *
 * Two entries of one name, printed one after the other with nothing said, read
 * as one record written twice. They are two records, and the prose says which
 * of the two things joins them: a link an editor wrote, or a name that matches
 * and establishes nothing. A reader chains to either address from here.
 */
function elsewhere(entry: CardEntry, name: string, brief: boolean): string {
  const held = entry as CardListEntry;
  const thing = oneOf(spelt(name).toLowerCase());
  const at = (one: EntryAt) => `${inline(one.id) ?? ""} on ${catalogueOf(one.source).name}`;
  // The claim is worded the one way in both forms: a resemblance qualified
  // unlike its neighbour reads as a resemblance of another kind. What a long
  // block shortens is the lead-in to it.
  const parts = [
    ...(held.also_at ?? []).map((one) =>
      brief
        ? `also at ${at(one)}`
        : `the same ${thing} is at ${at(one)}, joined to this one by a link a catalogue published`,
    ),
    ...(held.same_name_as ?? []).map((one) =>
      brief
        ? `same name at ${at(one)}, which nothing here establishes as the same ${thing}`
        : `${catalogueOf(one.source).name} publishes a ${thing} of that name at ${inline(one.id) ?? ""}, which nothing here establishes as the same ${thing}`,
    ),
  ];
  return parts.length === 0 ? "" : `; ${parts.join("; ")}`;
}

/**
 * A united list, each entry naming every catalogue that published it.
 *
 * A list holding nothing states its own zero. Dropped from the prose, it reads
 * exactly like a block nobody loaded, which is the distinction this server
 * exists to keep.
 */
function unionLine(name: string, entries: readonly CardEntry[]): string | null {
  if (entries.length === 0) {
    return `${spelt(name)}: none of the catalogues that answered published any`;
  }
  const each = entries
    .map((entry) => {
      const value = spelled(entry.value);
      const by = entry.published_by.map((one) => catalogueOf(one).name).join(", ");
      return value === null ? null : `${value} (${by}${elsewhere(entry, name, false)})`;
    })
    .filter((entry): entry is string => entry !== null)
    .join("; ");
  return each === "" ? null : `${spelt(name)}: ${each}`;
}

/** One of what a field holds, named as a reader names a single one of them. */
function oneOf(field: string): string {
  return field.endsWith("ses") ? field.slice(0, -2) : field.replace(/s$/, "");
}

/** A field of a card as a reader names the thing it holds. */
function spelt(name: string): string {
  const words = name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
