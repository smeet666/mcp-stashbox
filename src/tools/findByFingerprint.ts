/**
 * The records a set of hashes reaches, and what each kind of hash claims.
 *
 * One distinction decides this whole file. **MD5 and OSHASH name the bytes of a
 * file; PHASH states a likeness**, which a re-encode, a crop and another scene
 * from one shoot all satisfy. Rendered under one word, a resemblance reaches a
 * reader as an identity, and a caller acts on a file they never had.
 *
 * Three counting rules follow from the rule that governs the server, that
 * nothing is stated which the data does not carry. **A row and a record are
 * different numbers**: one record carrying two of the hashes asked is one record
 * and two matches, which the header and each catalogue's line keep apart.
 * **Every match names the hash that reached it**, so two matches on one record
 * never render alike. **A record answered with while carrying none of the hashes
 * asked is counted apart**, since which hash reached it is unknown.
 *
 * A withdrawn record is a match. A hash states what a file is and never what a
 * scene holds, so the mark goes on the line and the record stays in the answer.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { markerSuffix } from "../answer/marker.js";
import {
  countsNeverAddedRule,
  coverageRule,
  failureRule,
  nobodyAskedRule,
  rowsSkippedRule,
  runRules,
  skippedRule,
  storedRule,
  type Rule,
  type RowsFacts,
} from "../answer/notes.js";
import { creditsPayload, datePayload, studioPayload } from "../answer/records.js";
import { reportBlock, reportPayload } from "../answer/report.js";
import { inline, joinLines, notesBlock, section, type Rendered } from "../answer/text.js";
import type { FindByFingerprintInput, StashboxClient } from "../stashbox/client.js";
import { instanceById, supports, type InstanceId } from "../stashbox/instances.js";
import { MOST_IDENTIFIERS } from "../stashbox/narrowings.js";
import type { FingerprintMatch, FingerprintResult, SceneRecord } from "../types.js";
import { catalogues, oneOf, strictInput, text } from "./arguments.js";
import { toolFailure } from "./errorShape.js";
import { findByFingerprintOutput } from "./schemas.js";

const ALGORITHMS = ["MD5", "OSHASH", "PHASH"] as const;

/** How the matches are laid out, which a reader needs before reading the first. */
const ORDERING =
  "grouped by the catalogue that answered, in the order the registry names them, since the catalogues share no common measure to order them together by";

/** What a hash narrows on, which the rules a rows answer shares with this one read. */
const ASKED = {
  query: null,
  narrowedOnAnything: true,
  identifiersGiven: false,
  match: "all",
  bounded: false,
} as const;

/* ------------------------------------------------------------------ the prose */

/** The catalogue's own name, which is the name an answer credits. */
function nameOf(source: string): string {
  return instanceById(source)?.name ?? source;
}

/** What one match claims, in the words the claim is worth. */
const CLAIM: Record<string, string> = {
  exact_file: "an exact-file match, so the record carries this very hash and names the same bytes",
  perceptual_similarity:
    "a perceptual match, so the record's file resembles the one this hash was computed from, and it may be a re-encode, a crop, or another scene from one shoot",
};

/**
 * The counters a match stands on, without which a doubtful one reads as solid.
 *
 * Whether the reports were counted at all is read from the registry: a
 * catalogue that counts none was never in a position to say, and a row's null
 * on its own would leave a reader to take the silence for an agreement.
 */
function fingerprintLine(match: FingerprintMatch): string {
  const print = match.fingerprint;
  const who = nameOf(match.scene.source);
  if (print === null) {
    return "  Fingerprint: the record publishes none of its own, so what it holds for this hash is unknown.";
  }
  const spec = instanceById(match.scene.source);
  const contest =
    print.reports !== null
      ? `${print.reports} report(s)${print.contested === true ? ", which outweigh the submissions, so this fingerprint is contested" : ""}`
      : spec !== undefined && !supports(spec, "fingerprint_reports")
        ? `${who} counts no report against a fingerprint, so whether this one is disputed is unknown there`
        : `the count of the reports against it could not be read on ${who}, so whether it is disputed is unknown`;
  const submissions =
    print.submissions === null
      ? `${who} counts no submission`
      : `${print.submissions} submission(s)`;
  const duration =
    print.durationSeconds === null ? "" : `, submitted for ${print.durationSeconds}s of runtime`;
  return `  Fingerprint: ${submissions}${duration}, ${contest}.`;
}

/** What this client lost inside the record, named by the list it came from. */
function lossLine(scene: SceneRecord): string | null {
  if (!scene.rowsSkipped) return null;
  const lists = scene.rowsSkippedIn?.length ? ` (${scene.rowsSkippedIn.join(", ")})` : "";
  return `  Rows of this record this client could not read: ${scene.rowsSkipped}${lists}. They are left out of what it shows of its own lists, and one of them may be a fingerprint.`;
}

/** One match, opening with the hash that reached it. */
function matchLines(match: FingerprintMatch): string[] {
  const scene = match.scene;
  const hash = match.fingerprint === null ? "" : ` ${inline(match.fingerprint.hash) ?? ""}`;
  const studio = scene.studio;
  const by =
    studio === null ? "" : `, by ${inline(studio.name) ?? studio.id}${markerSuffix(studio.status)}`;
  return [
    `- ${match.algorithm}${hash}: ${CLAIM[match.matchKind] ?? "a match"}. Record ${scene.id} on ${nameOf(scene.source)}${markerSuffix(scene.status)}: ${inline(scene.title) ?? "the record carries no title"}${by}.`,
    // Who a record credits is what a reader checks a file against, so it is
    // stated here and not left to a second read of the identifier.
    scene.performers.length === 0
      ? null
      : `  Credited: ${scene.performers
          .map((entry) => `${inline(entry.name) ?? entry.id}${markerSuffix(entry.status)}`)
          .join(", ")}.`,
    fingerprintLine(match),
    scene.releaseDateUnreadable === true
      ? "  Release date: the catalogue published one naming no day on a calendar, so it is missing here."
      : null,
    lossLine(scene),
  ].filter((line): line is string => line !== null);
}

/* ---------------------------------------------------------------- the payload */

/**
 * The record a hash reached, as much of it as this answer states.
 *
 * A fingerprint answer identifies a file, so a record carries here what names
 * the release and what became of its identifier, and the identifier reads the
 * rest of it. Everything the record lost while it was read is counted and named,
 * its fingerprints included: one of the rows lost may be the hash asked about.
 */
function scenePayload(scene: SceneRecord): Record<string, unknown> {
  return {
    id: scene.id,
    source: scene.source,
    source_url: scene.sourceUrl,
    retrieved_at: scene.retrievedAt,
    status: scene.status,
    title: scene.title,
    code: scene.code,
    duration_seconds: scene.durationSeconds,
    release_date: datePayload(scene.releaseDate),
    ...(scene.releaseDateUnreadable === true ? { release_date_unreadable: true } : {}),
    studio: studioPayload(scene.studio),
    performers: creditsPayload(scene.performers),
    ...(scene.rowsSkipped === undefined ? {} : { rows_skipped: scene.rowsSkipped }),
    ...(scene.rowsSkippedIn === undefined ? {} : { rows_skipped_in: scene.rowsSkippedIn }),
  };
}

function matchPayload(match: FingerprintMatch): Record<string, unknown> {
  const print = match.fingerprint;
  return {
    scene: scenePayload(match.scene),
    algorithm: match.algorithm,
    match_kind: match.matchKind,
    fingerprint:
      print === null
        ? null
        : {
            algorithm: print.algorithm,
            hash: print.hash,
            duration_seconds: print.durationSeconds,
            submissions: print.submissions,
            reports: print.reports,
            contested: print.contested,
          },
  };
}

/* ----------------------------------------------------------------- the notes */

/** The records behind the matches, counted once however many hashes reached them. */
function recordsBehind(matches: readonly FingerprintMatch[]): SceneRecord[] {
  return [...new Map(matches.map((match) => [match.scene.id, match.scene])).values()];
}

/** What every answer made of rows is qualified by, run here as it is run there. */
const SHARED_RULES = [
  countsNeverAddedRule("scene"),
  rowsSkippedRule,
  skippedRule,
  failureRule,
  nobodyAskedRule,
  coverageRule,
  storedRule(null),
] as Rule<SceneRecord>[];

/**
 * What this answer owes a reader beyond its matches.
 *
 * The rules a rows answer shares with this one are run from the shared list, so
 * a sentence added there reaches here too. What is written out below is what
 * only a fingerprint answer can say.
 */
function notesFor(
  result: FingerprintResult,
  records: readonly SceneRecord[],
  rowsSkipped: number,
  cached: boolean,
): string[] {
  const facts: RowsFacts<SceneRecord> = {
    result: { rows: [...records], perSource: result.perSource, ordering: ORDERING },
    asked: { ...ASKED, cached },
    rowsSkipped,
  };

  const kinds = new Set(result.matches.map((match) => match.matchKind));
  const notSearched = result.perSource.some((report) => report.algorithmsNotSearched?.length);
  const answered = result.perSource.filter((report) => report.state === "answered");

  const own: (string | null)[] = [
    result.matches.length === 0
      ? null
      : `Matches are ${ORDERING}. One record carrying two of the hashes asked is one record and two matches, which is why the two are counted apart above.`,
    kinds.has("perceptual_similarity")
      ? "A perceptual hash states a likeness. A record it reaches may hold a re-encode, a crop, or another scene from one shoot, so a match of that kind establishes a resemblance and says nothing about the bytes of either file."
      : null,
    kinds.has("exact_file")
      ? "An MD5 and an OSHASH are computed from the bytes of a file, so a match on one of them names the file the hash was taken from."
      : null,
    records.some((record) => record.status !== "established")
      ? "A hash states what a file is and never what a scene holds, so a record its catalogue has withdrawn is a match like any other. It is marked above, and what is missing from it is missing from the record."
      : null,
    result.matches.some((match) => match.fingerprint?.contested === null)
      ? "Whether a fingerprint is disputed can be read only where its catalogue counts the reports against one. Each line above names the catalogue where that count is unavailable, and an uncounted contest is unknown there."
      : null,
    result.unattributed > 0
      ? `${result.unattributed} record(s) the catalogues answered with carry none of the fingerprints asked. Which hash reached them is unknown, so they stand here as no match and are counted apart.`
      : null,
    notSearched
      ? "A catalogue is asked only for the algorithms its own lookup searches. Where a line above names one it does not search, that hash was never put to it and its silence there is no evidence about it."
      : null,
    result.matches.length === 0 && answered.length > 0
      ? "The catalogues that answered hold no record carrying the fingerprints asked, so each of them looked and found nothing."
      : null,
  ];

  return [
    ...own.filter((note): note is string => note !== null),
    ...runRules<SceneRecord>(SHARED_RULES, facts),
  ];
}

/* -------------------------------------------------------------- the renderer */

/**
 * The whole answer, in the prose a reader acts on and the payload a program
 * reads. Every qualification the payload carries is said in words too, since a
 * client showing the text block alone must lose none of them.
 */
export function renderFingerprintMatches(
  result: FingerprintResult,
  held: { cached?: boolean } = {},
): Rendered {
  const cached = held.cached === true;
  const records = recordsBehind(result.matches);
  const rowsSkipped = records.reduce((lost, record) => lost + (record.rowsSkipped ?? 0), 0);
  const notes = notesFor(result, records, rowsSkipped, cached);

  const body = joinLines([
    `${result.asked.length} fingerprint(s) asked, ${result.matches.length} match(es) on ${records.length} record(s).`,
    `Asked: ${result.asked.map((one) => `${one.algorithm} ${one.hash}`).join(", ")}`,
    section(
      "Matches",
      result.matches.flatMap((match) => matchLines(match)),
      "none of the fingerprints asked reached a record on the catalogues that answered",
    ),
    reportBlock(result.perSource),
  ]);

  return {
    text: `${body}${notesBlock(notes)}`,
    structured: {
      matches: result.matches.map((match) => matchPayload(match)),
      match_count: result.matches.length,
      scenes_matched: records.length,
      unattributed: result.unattributed,
      asked: result.asked.map((one) => ({ hash: one.hash, algorithm: one.algorithm })),
      per_source: reportPayload(result.perSource),
      ...(rowsSkipped > 0 ? { rows_skipped: rowsSkipped } : {}),
      ...(cached ? { cached: true } : {}),
      notes,
    },
  };
}

/* ------------------------------------------------------------- the tool */

const CODE = "[invalid_input]";

const fingerprintEntry = strictInput({
  hash: text("hash", "one fingerprint as the catalogues store it"),
  algorithm: oneOf("algorithm", "how that hash was computed", ALGORITHMS),
});

/**
 * The hashes held for one file, bounded as every list this server takes is.
 *
 * The two bounds are refused in the words the fault carries, and in the words a
 * list of record identifiers refuses the same two faults: a caller who meets
 * one of them on either argument reads one message and learns one thing.
 */
export const fingerprintList = z
  .array(fingerprintEntry, {
    error: `${CODE} fingerprints takes one to ${MOST_IDENTIFIERS} entries, each a hash and the algorithm it was computed with.`,
  })
  .min(
    1,
    `${CODE} fingerprints was written as an empty list, so nothing was asked about, and an emptiness nobody was asked for is no evidence about any file.`,
  )
  .max(
    MOST_IDENTIFIERS,
    `${CODE} fingerprints takes at most ${MOST_IDENTIFIERS} entries in one call. A longer list asks every configured catalogue about each of them at once, which is a run of reads rather than a lookup.`,
  );

const inputSchema = strictInput({
  fingerprints: fingerprintList.describe(
    "The hashes held for one file, each with the algorithm it was computed with. MD5 and OSHASH name the bytes of a file; PHASH states a likeness, which a re-encode, a crop and another scene from one shoot all satisfy.",
  ),
  sources: catalogues("sources")
    .optional()
    .describe("The catalogues to ask. Left out, every catalogue a key is held for is asked."),
});

const DESCRIPTION =
  "Identify a scene from the hashes held for a file, across every configured stash-box catalogue. Each match names the hash that reached it and what that hash claims: MD5 and OSHASH name the bytes of a file, and PHASH states a likeness a re-encode, a crop or another scene from one shoot can satisfy. One record answering two hashes is one record and two matches, and each catalogue reports whether it answered, failed or was never asked.";

export function registerFindByFingerprint(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "find_by_fingerprint",
    {
      title: "Find scenes by fingerprint",
      description: DESCRIPTION,
      inputSchema,
      outputSchema: findByFingerprintOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        // The declaration names the catalogues out of the registry's own list,
        // so what it accepts is what the client addresses.
        const named = args.sources as readonly InstanceId[] | undefined;
        const input: FindByFingerprintInput = {
          fingerprints: args.fingerprints,
          ...(named === undefined ? {} : { sources: named }),
        };
        const read = await client.findByFingerprint(input);
        const rendered = renderFingerprintMatches(read.data, { cached: read.cached });
        return {
          content: [{ type: "text" as const, text: rendered.text }],
          structuredContent: rendered.structured,
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  );
}
