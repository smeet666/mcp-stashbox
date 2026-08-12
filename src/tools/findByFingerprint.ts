/**
 * Identifying a file from the hashes held for it.
 *
 * The whole honesty of this tool sits in one distinction: **the three algorithms
 * make three different claims.** Two of them match the same bytes. The third
 * matches images that resemble each other, which covers a re-encode, a crop, and
 * a different scene from the same shoot. Rendering all three under one word
 * would present a resemblance as an identity.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StashboxClient } from "../stashbox/client.js";
import type { FingerprintResult } from "../types.js";
import { strictInput } from "./arguments.js";
import { findByFingerprintOutput } from "./schemas.js";
import {
  coverageNote,
  reportPayload,
  nobodyAskedNote,
  skippedNote,
  failureNote,
  dateText,
  joinLines,
  notesBlock,
  perSourceText,
  inline,
  inlineAll,
  type Rendered,
} from "./shared.js";
import { toolError } from "./errorShape.js";

const ALGORITHMS = ["MD5", "OSHASH", "PHASH"] as const;

const WHAT_A_MATCH_MEANS: Record<(typeof ALGORITHMS)[number], string> = {
  MD5: "An MD5 match means the same file, byte for byte.",
  OSHASH: "An OSHASH match means the same file, matched on its size and its ends.",
  PHASH:
    "A PHASH match means the images resemble each other. It is no evidence that the files are the same: a re-encode, a crop and a different scene from one shoot all resemble each other.",
};

export function renderFingerprintMatches(result: FingerprintResult): Rendered {
  const notes: string[] = [];

  // What an algorithm claims is worth stating about the matches an answer holds.
  // Printed under an answer with none, it qualifies nothing.
  const algorithmsMatched = [...new Set(result.matches.map((match) => match.algorithm))];
  for (const algorithm of algorithmsMatched) {
    const sentence = WHAT_A_MATCH_MEANS[algorithm];
    if (sentence) notes.push(sentence);
  }
  if (result.unattributed > 0) {
    notes.push(
      `${result.unattributed} scene(s) came back without the fingerprint that reached them, so which hash matched is unknown for those.`,
    );
  }

  // A catalogue counting no disputes yields an unknown contest. Saying so keeps
  // it apart from a fingerprint nobody has disputed.
  // Keyed on the catalogue that counts no reports. Keying on a missing
  // fingerprint would name a catalogue that does count them.
  const silent = [
    ...new Set(
      result.matches
        .filter((match) => match.fingerprint !== null && match.fingerprint.reports === null)
        .map((match) => match.scene.source),
    ),
  ];
  if (silent.length > 0) {
    notes.push(
      `These catalogues publish no count of reports against a fingerprint, so a match from them has an unknown contest: ${silent.join(", ")}.`,
    );
  }

  const failures = failureNote(result.perSource);
  if (failures) notes.push(failures);
  const lost = skippedNote(result.perSource);
  if (lost) notes.push(lost);
  notes.push(
    "Counts are reported per catalogue and are never added: the catalogues index overlapping corpora, and one film held by two of them carries two identifiers there, which 'scenes_matched' counts separately.",
  );
  // An algorithm a catalogue's route does not search was never put to it, and
  // its silence there is no answer about the file.
  const unasked = new Map<string, string[]>();
  for (const entry of result.perSource) {
    for (const name of entry.narrowingsNotReceived ?? []) {
      unasked.set(name, [...(unasked.get(name) ?? []), entry.name ?? entry.source]);
    }
  }
  if (unasked.size) {
    const named = [...unasked]
      .map(([name, sources]) => `${name} by ${sources.join(", ")}`)
      .join("; ");
    notes.push(
      `Fingerprints not searched for: ${named}. Those catalogues were never asked about them, so their answer here is no evidence about that hash.`,
    );
  }
  const nobody = nobodyAskedNote(result.perSource);
  if (nobody) notes.push(nobody);
  const coverage = coverageNote(result.perSource);
  if (!nobody && coverage) notes.push(coverage);

  const structured = {
    asked: result.asked.map((entry) => ({ hash: entry.hash, algorithm: entry.algorithm })),
    matches: result.matches.map((match) => ({
      algorithm: match.algorithm,
      match_kind: match.matchKind,
      scene: {
        id: match.scene.id,
        source: match.scene.source,
        title: match.scene.title,
        status: match.scene.status,
        release_date: match.scene.releaseDate,
        studio: match.scene.studio?.name ?? null,
        performers: match.scene.performers.map((entry) => entry.name),
        retrieved_at: match.scene.retrievedAt,
        source_url: match.scene.sourceUrl,
      },
      // The fingerprint the scene actually carries, named in full: a caller
      // holding several hashes for one file has to be able to tell which of
      // them reached this record.
      fingerprint: match.fingerprint
        ? {
            algorithm: match.fingerprint.algorithm,
            hash: match.fingerprint.hash,
            duration_seconds: match.fingerprint.durationSeconds,
            submissions: match.fingerprint.submissions,
            reports: match.fingerprint.reports,
            contested: match.fingerprint.contested,
          }
        : null,
    })),
    match_count: result.matches.length,
    scenes_matched: new Set(result.matches.map((match) => match.scene.id)).size,
    unattributed: result.unattributed,
    per_source: reportPayload(result.perSource),
    notes,
  };

  const text =
    joinLines([
      `# ${result.matches.length} match(es) for ${result.asked.length} fingerprint(s)`,
      `Asked: ${result.asked.map((entry) => `${entry.algorithm} ${entry.hash}`).join(", ")}`,
      ...result.matches.map((match) =>
        joinLines([
          `\n- ${inline(match.scene.title) ?? "(untitled)"}${match.scene.status === "established" ? "" : match.scene.status === "merged" ? " — merged, so this identifier now addresses the record it was folded into, and this title is the one it carried then" : " — withdrawn, so this identifier states nothing about what it once named, and this title is the one it carried then"}, ${match.algorithm} (${match.matchKind})`,
          `    catalogue: ${match.scene.source}`,
          `    id: ${match.scene.id}`,
          match.scene.releaseDate ? `    released: ${dateText(match.scene.releaseDate)}` : null,
          match.scene.studio ? `    studio: ${inline(match.scene.studio.name)}` : null,
          match.scene.performers.length
            ? `    performers: ${inlineAll(match.scene.performers.map((entry) => entry.name))}`
            : null,
          match.fingerprint
            ? `    ${
                match.fingerprint.submissions === null
                  ? "submissions not counted"
                  : `${match.fingerprint.submissions} submission(s)`
              }, ${
                match.fingerprint.reports === null
                  ? "reports not counted on this catalogue"
                  : `${match.fingerprint.reports} report(s)`
              }${
                match.fingerprint.contested === null
                  ? ""
                  : match.fingerprint.contested
                    ? ", contested"
                    : ", uncontested"
              }`
            : null,
          `    Source: ${match.scene.sourceUrl}`,
        ]),
      ),
      `\nCatalogues:\n${perSourceText(result.perSource)
        .map((entry) => `  - ${entry}`)
        .join("\n")}`,
    ]) + notesBlock(notes);

  return { text, structured };
}

export function registerFindByFingerprint(server: McpServer, client: StashboxClient): void {
  server.registerTool(
    "find_by_fingerprint",
    {
      title: "Identify a file by its fingerprint",
      description:
        "Ask every configured catalogue which scene a file corresponds to, from the hashes held for it. Pass every hash of one file together: one request settles what three would ask separately. MD5 and OSHASH match the same file; PHASH matches images that resemble each other, which is no evidence that two files are the same.",
      inputSchema: strictInput({
        fingerprints: z
          .array(
            z.object({
              hash: z.string().describe("The fingerprint as the hashing tool produced it."),
              algorithm: z.enum(ALGORITHMS),
            }),
          )
          .min(1)
          .max(10)
          .describe(
            "Every fingerprint held for one file. A file carries one hash per algorithm, so a longer list is an inventory rather than a question.",
          ),
        sources: z
          .array(z.string())
          .min(1)
          .optional()
          .describe("Narrow to named catalogues. Every configured catalogue is asked by default."),
      }),
      outputSchema: findByFingerprintOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ fingerprints, sources }) => {
      try {
        const read = await client.findByFingerprint({
          fingerprints,
          ...(sources ? { sources: sources as never } : {}),
        });
        const rendered = renderFingerprintMatches(read.data);
        return {
          content: [{ type: "text" as const, text: rendered.text }],
          structuredContent: rendered.structured,
        };
      } catch (cause) {
        return toolError(cause);
      }
    },
  );
}
