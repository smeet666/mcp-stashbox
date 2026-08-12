/**
 * What every tool's answer looks like once it leaves this server.
 *
 * A client that renders only the text block has to keep whatever qualifies the
 * answer, so every note reaches the prose as well as the structured payload.
 */

import type { ReadDate } from "../stashbox/normalise.js";
import { indentBlock, indentMarkerLines } from "../stashbox/normalise.js";
import { instanceById, instanceName, supports, type Capability } from "../stashbox/instances.js";
import type { SourceReport } from "../types.js";

export interface Rendered {
  text: string;
  structured: Record<string, unknown>;
}

/**
 * A date in prose, at the precision it was entered.
 *
 * A bare year printed as a day would claim a precision nobody entered, so the
 * published text is repeated and the precision travels beside it.
 */
export function dateText(date: ReadDate | null): string | null {
  if (!date) return null;
  return date.precision === "day" ? date.value : `${date.value} (${date.precision} only)`;
}

export function durationText(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${seconds} s (${minutes} min ${rest.toString().padStart(2, "0")} s)`;
}

/** A line for the prose, dropped entirely when there is nothing to say. */
export function line(label: string, value: string | null | undefined): string | null {
  return value === null || value === undefined || value === "" ? null : `${label}: ${value}`;
}

export function joinLines(parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null && part !== "").join("\n");
}

/**
 * A catalogue's own prose, shifted whole so no line of it can forge one of this
 * server's.
 */
export function quoted(text: string | null): string | null {
  return text === null ? null : indentBlock(text);
}

/**
 * A catalogue's own words, made safe to place inside a line of this server's.
 *
 * A title, a name or an alias is written by someone else and lands in the middle
 * of a rendered line, so a newline inside one would start a line of its own that
 * a reader has no way to tell from a line the server wrote. Line breaks collapse
 * to spaces, and anything that still opens the way this server opens is shifted.
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
 * Whether a catalogue offers something, read from the identifier on a record.
 *
 * A field a catalogue was never asked for comes back empty, and an emptiness
 * that was never a question reads as an answer. The answer says which it was.
 */
export function sourceOffers(source: string, capability: Capability): boolean {
  const spec = instanceById(source);
  return spec !== undefined && supports(spec, capability);
}

/**
 * The people credited on these scenes whose record the catalogue has folded.
 *
 * A row lists a scene's cast by name, and a name is what the catalogue printed
 * when the credit was made. Where it has since merged or withdrawn that record,
 * the person is held under another identifier, and a reader pivoting on the
 * name alone looks for someone that catalogue no longer holds under it.
 */
export function foldedCreditsNote(
  scenes: readonly { performers: readonly { name: string; status: string }[] }[],
): string | null {
  const folded = [
    ...new Set(
      scenes.flatMap((scene) =>
        scene.performers
          .filter((entry) => entry.status !== "established")
          .map((entry) => entry.name),
      ),
    ),
  ];
  if (folded.length === 0) return null;
  return `Credited on the rows here and folded on the catalogue that answered: ${inlineAll(folded)}. Each of those credits names a record the catalogue has merged or withdrawn, so what it holds about that person is under another identifier.`;
}

/**
 * What became of each catalogue, in prose.
 *
 * Three states are kept apart on purpose: a catalogue that looked and found
 * nothing has answered, and reads differently from one that failed and from one
 * that was never asked.
 */
export function perSourceText(reports: readonly SourceReport[]): string[] {
  return reports.map((report) => {
    const name = report.name ?? instanceName(report.source);
    if (report.state === "answered") {
      const narrowings = report.narrowingsNotReceived?.length
        ? `; did not receive: ${report.narrowingsNotReceived.join(", ")}`
        : "";
      const fields = report.fieldsSearched?.length
        ? `; its index read ${report.fieldsSearched.join(", ")}`
        : "";
      const why = report.reason ? `; ${inline(report.reason)}` : "";
      const reach =
        report.indexTotal === undefined
          ? ""
          : `, of ${report.indexTotal} its index holds for this question`;
      // A record answering more than one of the things asked contributes a row
      // for each, so the number of rows reads as more records than were found.
      const behind =
        report.records === undefined || report.records === report.count
          ? ""
          : ` on ${report.records} record(s)`;
      return `${name}: answered, ${report.count ?? 0} row(s)${behind}${reach}${fields}${narrowings}${why}`;
    }
    if (report.state === "failed") {
      return `${name}: failed at ${report.moment ?? "an unnamed moment"} (${report.error ?? "error"}): ${inline(report.reason) ?? ""}`.trim();
    }
    return `${name}: not asked: ${inline(report.reason) ?? "no reason recorded"}`;
  });
}

/**
 * The sentence an answer owes a reader whenever a catalogue is missing from it.
 *
 * Without it a partial answer reads as a whole one, which is the failure this
 * whole server is built to avoid.
 */
/**
 * The narrowings no catalogue received, gathered for the prose.
 *
 * A caller who wrote one and reads only the text has to learn it was set aside,
 * and the per-catalogue block is not where a reader looks for that.
 */
/**
 * A catalogue's report, in the shape the published schema declares.
 *
 * The report is built with the names the code uses and read by callers under
 * the names the schema states, and the field carrying what a catalogue could
 * not receive is the one an answer exists to carry.
 */
export function reportPayload(reports: readonly SourceReport[]): Record<string, unknown>[] {
  return reports.map((entry) => ({
    source: entry.source,
    ...(entry.name === undefined ? {} : { name: entry.name }),
    state: entry.state,
    ...(entry.count === undefined ? {} : { count: entry.count }),
    ...(entry.indexTotal === undefined ? {} : { index_total: entry.indexTotal }),
    ...(entry.fieldsSearched === undefined ? {} : { fields_searched: entry.fieldsSearched }),
    ...(entry.narrowingsNotReceived === undefined
      ? {}
      : { narrowings_not_received: entry.narrowingsNotReceived }),
    ...(entry.skipped === undefined ? {} : { skipped: entry.skipped }),
    ...(entry.unattributed === undefined ? {} : { unattributed: entry.unattributed }),
    ...(entry.records === undefined ? {} : { records: entry.records }),
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
    ...(entry.moment === undefined ? {} : { moment: entry.moment }),
    ...(entry.error === undefined ? {} : { error: entry.error }),
  }));
}

export function narrowingNote(reports: readonly SourceReport[]): string | null {
  const refused = new Map<string, string[]>();
  // How a list of identifiers reads is something a row can be said to satisfy
  // only where the list itself reached the catalogue. Where it did not, the
  // reading describes nothing the rows carry, and saying a row holds one of the
  // identifiers contradicts the sentence saying the list was set aside.
  const idle: string[] = [];
  for (const report of reports) {
    const names = report.narrowingsNotReceived ?? [];
    const who = report.name ?? report.source;
    for (const name of names) {
      if (name === "match" && names.some((other) => other.endsWith("_ids"))) {
        idle.push(who);
        continue;
      }
      refused.set(name, [...(refused.get(name) ?? []), who]);
    }
  }
  if (refused.size === 0 && idle.length === 0) return null;
  // Paging and order shape the answer; the rest select rows. Only the second
  // kind is something a row can be said to satisfy.
  const shapes = new Set(["page", "sort", "direction"]);
  const say = (names: [string, string[]][]) =>
    names.map(([name, sources]) => `'${name}' by ${sources.join(", ")}`).join("; ");
  const selecting = [...refused].filter(([name]) => !shapes.has(name) && name !== "match");
  const reading = [...refused].filter(([name]) => name === "match");
  const shaping = [...refused].filter(([name]) => shapes.has(name));
  const lines: string[] = [];
  if (selecting.length) {
    lines.push(
      `Narrowings not received: ${say(selecting)}. A row from those catalogues satisfying one of them does so by chance.`,
    );
  }
  if (reading.length) {
    lines.push(
      `Asked for and not received: ${say(reading)}. A list of identifiers was read as any one of them, so a row carries one of those asked for and not all.`,
    );
  }
  if (idle.length) {
    lines.push(
      `Asked for and not received: 'match' by ${[...new Set(idle)].join(", ")}. The lists of identifiers it would have applied to were not received there either, so it selected nothing.`,
    );
  }
  if (shaping.length) {
    lines.push(
      `Asked for and not received: ${say(shaping)}. These shape an answer rather than select its rows, so the rows are what those catalogues return without them.`,
    );
  }
  return lines.join(" ");
}

/**
 * An answer no catalogue was asked for.
 *
 * A count of zero beside catalogues that all declined reads as five catalogues
 * that looked, and the emptiness belongs to the question rather than to them.
 */
export function pageWasHonoured(reports: readonly SourceReport[]): boolean {
  return !reports.some(
    (entry) => entry.state === "answered" && entry.narrowingsNotReceived?.includes("page"),
  );
}

export function nobodyAskedNote(reports: readonly SourceReport[]): string | null {
  if (reports.length === 0) return null;
  if (reports.some((entry) => entry.state !== "absent")) return null;
  return "No catalogue was asked for this answer, so its emptiness is this question reaching none of them and is no evidence that what you asked about does not exist. Each catalogue above says why it was not asked.";
}

/**
 * The catalogues that could not answer, said in the prose.
 *
 * A reader who never opens the structured payload has to be able to tell a
 * catalogue that looked and found nothing from one that broke, and the
 * per-catalogue block is not where they look.
 */
export function failureNote(reports: readonly SourceReport[]): string | null {
  const failed = reports.filter((report) => report.state === "failed");
  if (failed.length === 0) return null;
  const named = failed
    .map((report) => `${report.name ?? report.source} (${report.error ?? "error"})`)
    .join(", ");
  return `These catalogues could not answer, so this holds no rows of theirs and states nothing about what they hold: ${named}.`;
}

/**
 * What a requested order is worth once several catalogues have answered.
 *
 * Each catalogue orders its own rows as asked, and the rows are then taken one
 * from each in turn. The order therefore holds inside a catalogue and not across
 * them, and a reader scanning the list top to bottom would otherwise read a
 * sequence nobody produced.
 */
export function orderingNote(reports: readonly SourceReport[], sorted: boolean): string | null {
  if (!sorted) return null;
  const contributing = reports.filter((entry) => entry.state === "answered" && entry.count).length;
  if (contributing < 2) return null;
  return "The order asked for holds inside each catalogue. Rows are then taken one from each in turn, so reading the whole list in order reads a sequence no catalogue produced.";
}

/**
 * What a count beside a page is worth on the faceted path.
 *
 * It is the one figure in an answer a reader can cite, and it means something
 * different from the number of rows returned.
 */
/**
 * Rows a catalogue answered that came back unreadable.
 *
 * Counting them without saying so leaves a catalogue that returned ten rows of
 * which four were unreadable to read as a catalogue holding six.
 */
export function skippedNote(reports: readonly SourceReport[]): string | null {
  const lost = reports.filter((entry) => entry.skipped);
  if (lost.length === 0) return null;
  const named = lost.map((entry) => `${entry.name ?? entry.source}: ${entry.skipped}`).join(", ");
  return `Rows left out because this client could not read them — ${named}. They are missing from the rows and from the counts here, and their absence says nothing about what those catalogues hold.`;
}

/**
 * An answer replayed from the store.
 *
 * Every qualification here reaches the prose, and an answer that named no
 * catalogue this time would otherwise read as one that had just asked them.
 */
export function storedNote(cached: boolean, readAt?: string | null): string | null {
  if (!cached) return null;
  // The moment belongs in the sentence: 'when it was first read' names a time a
  // reader has no way to obtain, and a held answer is worth exactly its age.
  const when = readAt ? ` That reading was at ${readAt}.` : "";
  return `This answer was replayed from this client's store, so no catalogue was asked for it. What each catalogue is reported as saying is what it said when the answer was first read.${when}`;
}

export function indexTotalNote(reports: readonly SourceReport[]): string | null {
  const withTotal = reports.filter(
    (entry) => entry.state === "answered" && entry.indexTotal !== undefined,
  );
  if (withTotal.length === 0) return null;
  if (withTotal.every((entry) => !entry.indexTotal)) return null;
  const named = withTotal
    .map((entry) => `${entry.name ?? entry.source}: ${entry.indexTotal}`)
    .join(", ");
  return `Records each catalogue's index holds for this question, the rows here included — ${named}. These count different corpora and are never added.`;
}

/**
 * A page past what a catalogue holds, said rather than left as an emptiness.
 *
 * The number that settles it is already in the answer, so leaving a reader to
 * work it out turns a page they overshot into a corpus that holds nothing.
 */
export function pastTheEndNote(
  reports: readonly SourceReport[],
  window: { page: number; limit: number } | undefined,
): string | null {
  if (!window || window.page <= 1) return null;
  const past = reports.filter(
    (entry) =>
      entry.state === "answered" &&
      entry.indexTotal !== undefined &&
      // A catalogue that never received the page did not reach the end of
      // anything: it answered its first page, which the window note says.
      !entry.narrowingsNotReceived?.includes("page") &&
      // And a catalogue that returned rows has not run out of them.
      !entry.count &&
      (window.page - 1) * window.limit >= entry.indexTotal,
  );
  if (past.length === 0) return null;
  return `Page ${window.page} is past everything these catalogues hold for this question: ${past
    .map((entry) => entry.name ?? entry.source)
    .join(", ")}. Their emptiness here is the end of the rows, never an empty catalogue.`;
}

/**
 * The window an answer actually covers, per catalogue.
 *
 * A catalogue that could not receive a page answered its first one, so calling
 * the answer a page of the caller's choosing would name a page nobody read.
 */
export function windowNote(
  reports: readonly SourceReport[],
  window: { page: number; limit: number } | undefined,
): string | null {
  const answered = reports.filter((entry) => entry.state === "answered");
  if (!window || answered.length === 0) return null;

  const unpaged = answered.filter((entry) => entry.narrowingsNotReceived?.includes("page"));
  if (unpaged.length === 0) {
    return `This answer covers page ${window.page} at ${window.limit} row(s) per catalogue. An emptiness here is an emptiness inside that window.`;
  }
  const named = unpaged.map((entry) => entry.name ?? entry.source).join(", ");
  return window.page === 1
    ? `This answer covers page 1 at ${window.limit} row(s) per catalogue. An emptiness here is an emptiness inside that window.`
    : `Page ${window.page} was asked for at ${window.limit} row(s) per catalogue, and these catalogues answered their first page instead because their search takes no page: ${named}. Their rows repeat the ones a first page carries.`;
}

export function coverageNote(reports: readonly SourceReport[]): string | null {
  const missing = reports.filter((report) => report.state !== "answered");
  if (missing.length === 0) return null;
  return `${missing.length} catalogue(s) did not contribute to this answer, so it is no evidence about what they hold.`;
}

export function notesBlock(notes: readonly string[]): string {
  return notes.length === 0 ? "" : `\n\n${notes.map((note) => `Note: ${note}`).join("\n")}`;
}

export function sourceLine(url: string): string {
  return `Source: ${url}`;
}
