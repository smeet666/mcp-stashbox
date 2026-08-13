/**
 * What each catalogue did with the question, in the one shape callers read.
 *
 * A report is built with the names the code uses and read under the names the
 * schema declares. Written out at each tool, the two drifted and the fields
 * carrying the qualifications this server exists to publish were invisible to
 * anyone reading the declared contract. The translation happens here once, so a
 * field added to a report reaches every tool or reaches none.
 *
 * The four narrowing fields look alike and mean different things, which is why
 * they are four. Only `narrowings_not_received` says a catalogue cannot do
 * something; the others are facts about the identifiers a caller wrote.
 */

import { instanceById } from "../stashbox/instances.js";
import type { SourceReport } from "../types.js";
import { inline } from "./text.js";

/**
 * Every field of a report, under the name the published schema declares.
 *
 * The pairs are listed once, in the order a reader meets them, and a field a
 * report does not carry is left out rather than published as a null: a null
 * there would state a catalogue that took no narrowing away, which is a
 * different answer from one nothing was recorded about.
 */
export function reportPayload(reports: readonly SourceReport[]): Record<string, unknown>[] {
  return reports.map((entry) => {
    const payload: Record<string, unknown> = { source: entry.source };
    const put = (name: string, value: unknown) => {
      if (value !== undefined) payload[name] = value;
    };
    put("name", entry.name);
    payload.state = entry.state;
    put("count", entry.count);
    put("records", entry.records);
    put("unattributed", entry.unattributed);
    put("skipped", entry.skipped);
    put("index_total", entry.indexTotal);
    put("fields_searched", entry.fieldsSearched);
    put("narrowings_not_received", entry.narrowingsNotReceived);
    put("narrowings_outside_this_route", entry.narrowingsOutsideThisRoute);
    put("narrowings_naming_no_record_here", entry.narrowingsNamingNoRecord);
    put("narrowings_received_in_part", entry.narrowingsReceivedInPart);
    put("arguments_with_nothing_to_do", entry.argumentsWithNothingToDo);
    put("algorithms_not_searched", entry.algorithmsNotSearched);
    put("sections_not_carried", entry.sectionsNotCarried);
    put("reason", entry.reason);
    put("moment", entry.moment);
    put("error", entry.error);
    return payload;
  });
}

/**
 * What became of each catalogue, in prose.
 *
 * Every qualification the payload carries is said here too, since a client
 * rendering only the text must not lose the reason an answer is what it is.
 */
export function reportLines(reports: readonly SourceReport[]): string[] {
  return reports.map((report) => {
    const who = report.name ?? instanceById(report.source)?.name ?? report.source;

    if (report.state === "failed") {
      const why = inline(report.reason) ?? "";
      return `${who}: failed at ${report.moment ?? "an unnamed moment"} (${report.error ?? "error"}): ${why}`.trim();
    }
    if (report.state === "absent") {
      return `${who}: not asked: ${inline(report.reason) ?? "no reason recorded"}`;
    }

    const parts = [
      // A record answering more than one of the things asked contributes a row
      // for each, so a count of rows reads as more records than were found.
      report.records !== undefined && report.records !== report.count
        ? ` on ${report.records} record(s)`
        : "",
      report.unattributed
        ? `, and ${report.unattributed} more record(s) it answered with carrying none of what was asked`
        : "",
      report.indexTotal === undefined
        ? ""
        : `, of ${report.indexTotal} its index holds for this question`,
      report.fieldsSearched?.length ? `; its index read ${report.fieldsSearched.join(", ")}` : "",
      report.narrowingsNotReceived?.length
        ? `; did not receive: ${report.narrowingsNotReceived.join(", ")}`
        : "",
      report.narrowingsOutsideThisRoute?.length
        ? `; the route this question took does not take ${report.narrowingsOutsideThisRoute.join(", ")}`
        : "",
      report.algorithmsNotSearched?.length
        ? `; does not search ${report.algorithmsNotSearched.join(", ")}`
        : "",
      report.sectionsNotCarried?.length
        ? `; this route asks it for none of ${report.sectionsNotCarried.join(", ")}`
        : "",
      report.narrowingsReceivedInPart?.length
        ? `; received only its own identifiers out of ${report.narrowingsReceivedInPart.join(", ")}`
        : "",
      report.argumentsWithNothingToDo?.length
        ? `; nothing gave ${report.argumentsWithNothingToDo.join(", ")} anything to do`
        : "",
      report.narrowingsNamingNoRecord?.length
        ? `; no record of its own is named by the identifiers given for ${report.narrowingsNamingNoRecord.join(", ")}`
        : "",
      report.reason ? `; ${inline(report.reason)}` : "",
    ];

    return `${who}: answered, ${report.count ?? 0} row(s)${parts.join("")}`;
  });
}

/** The block naming every catalogue, under the answer it explains. */
export function reportBlock(reports: readonly SourceReport[]): string {
  return `\nCatalogues:\n${reportLines(reports)
    .map((entry) => `  - ${entry}`)
    .join("\n")}`;
}
