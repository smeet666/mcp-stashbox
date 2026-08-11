/**
 * What every tool's answer looks like once it leaves this server.
 *
 * A client that renders only the text block has to keep whatever qualifies the
 * answer, so every note reaches the prose as well as the structured payload.
 */

import type { ReadDate } from "../stashbox/normalise.js";
import { indentBlock, indentMarkerLines } from "../stashbox/normalise.js";
import { instanceName } from "../stashbox/instances.js";
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
      return `${name}: answered, ${report.count ?? 0} row(s)${reach}${fields}${narrowings}${why}`;
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
export function narrowingNote(reports: readonly SourceReport[]): string | null {
  const refused = new Map<string, string[]>();
  for (const report of reports) {
    for (const name of report.narrowingsNotReceived ?? []) {
      refused.set(name, [...(refused.get(name) ?? []), report.name ?? report.source]);
    }
  }
  if (refused.size === 0) return null;
  const named = [...refused]
    .map(([name, sources]) => `'${name}' by ${sources.join(", ")}`)
    .join("; ");
  return `Narrowings not received: ${named}. A row from those catalogues satisfying one of them does so by chance.`;
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
