/**
 * The records a set of hashes reaches, on every catalogue that joins on one.
 *
 * Three rules govern the file. **The answer is a list of groups, and every
 * member of it is a group**: anything else is a shape this client could not
 * read, and reading it as an emptiness would state that no catalogue has ever
 * seen the file. **A record answering more than one hash is one record and many
 * matches**, so records and matches are counted apart. **A record a catalogue
 * answered with that carries none of the hashes asked is counted as such**:
 * which hash reached it is unknown, and that is a different fact from a
 * catalogue finding nothing.
 *
 * A perceptual hash is searched only where a catalogue searches one. Sending it
 * to a catalogue that joins on exact hashes alone would come back empty and read
 * as a file nobody holds.
 */

import { invalidInput } from "../errors.js";
import type {
  FingerprintAlgorithm,
  FingerprintMatch,
  FingerprintResult,
  Read,
  SceneRecord,
  SourceReport,
} from "../types.js";
import { cacheKey } from "./cache.js";
import type { RouteContext } from "./client.js";
import { supports, type InstanceId } from "./instances.js";
import { mapScene } from "./map.js";
import { MOST_IDENTIFIERS } from "./narrowings.js";
import { fingerprintRequest, type FingerprintQuery, type SceneSection } from "./queries.js";
import { groupsUnder } from "./read.js";
import {
  absentReport,
  chooseSources,
  failureReport,
  inRegistryOrder,
  type Ask,
} from "./sources.js";

export interface FindByFingerprintInput {
  fingerprints: readonly FingerprintQuery[];
  sources?: readonly InstanceId[];
  sections?: readonly SceneSection[];
}

const MOMENT = "the fingerprint lookup";

/** The algorithms these catalogues store, of which one is not an exact hash. */
const ALGORITHMS: readonly FingerprintAlgorithm[] = ["MD5", "OSHASH", "PHASH"];

/** The one algorithm that states a likeness rather than a file. */
const PERCEPTUAL: FingerprintAlgorithm = "PHASH";

export async function findByFingerprint(
  ctx: RouteContext,
  input: FindByFingerprintInput,
): Promise<Read<FingerprintResult>> {
  const asked = readAsked(input.fingerprints);
  const sections: readonly SceneSection[] = input.sections ?? ["basic", "fingerprints"];
  const { asks, unasked } = chooseSources(
    ctx.keyFor,
    "find_by_fingerprint",
    "fingerprint lookup",
    input.sources,
  );

  const key = cacheKey({
    instance: asks.map((ask) => ask.spec.id).join(","),
    operation: "find_by_fingerprint",
    params: {
      asked: asked.map((one) => `${one.algorithm}:${one.hash.toLowerCase()}`),
      sections: [...sections].sort(),
    },
  });
  const held = ctx.cache.get(key) as FingerprintResult | undefined;
  if (held !== undefined) return { data: held, cached: true };

  const outcomes = await Promise.all(asks.map((ask) => askOne(ctx, ask, asked, sections)));

  const matches: FingerprintMatch[] = [];
  const reports: SourceReport[] = [...unasked];
  let unattributed = 0;
  for (const outcome of outcomes) {
    reports.push(outcome.report);
    matches.push(...outcome.matches);
    unattributed += outcome.report.unattributed ?? 0;
  }

  const result: FingerprintResult = {
    matches,
    perSource: inRegistryOrder(reports),
    unattributed,
    asked,
  };

  // An answer holding a catalogue that failed is returned and never stored:
  // kept, one bad moment would answer every repeat of the question.
  if (!reports.some((report) => report.state === "failed")) ctx.cache.set(key, result);

  const skipped = reports.reduce((lost, report) => lost + (report.skipped ?? 0), 0);
  return { data: result, cached: false, ...(skipped > 0 ? { skipped } : {}) };
}

/** The fingerprints put to the catalogues, each named once. */
function readAsked(written: readonly FingerprintQuery[]): FingerprintQuery[] {
  if (written.length === 0) {
    throw invalidInput(
      "fingerprints was written as an empty list, so there is nothing to look up.",
      "Write at least one hash and the algorithm it was computed with in fingerprints.",
    );
  }
  if (written.length > MOST_IDENTIFIERS) {
    throw invalidInput(
      `fingerprints names ${written.length} hashes, and this client reads at most ${MOST_IDENTIFIERS} in one call.`,
      `Ask again with at most ${MOST_IDENTIFIERS} entries in fingerprints.`,
    );
  }

  const asked: FingerprintQuery[] = [];
  const seen = new Set<string>();
  for (const one of written) {
    if (typeof one.hash !== "string" || one.hash.trim() === "") {
      throw invalidInput(
        "fingerprints carries an entry whose hash is empty, which addresses no file.",
        "Write the hash as the catalogues store it, with the algorithm it was computed with.",
      );
    }
    if (!ALGORITHMS.includes(one.algorithm)) {
      throw invalidInput(
        `fingerprints names the algorithm ${JSON.stringify(one.algorithm)}, which these catalogues do not store.`,
        `Write one of ${ALGORITHMS.join(", ")}.`,
      );
    }
    // A hash written twice asks about one file twice, and the record answering
    // both would be counted as two records holding one file.
    const once = `${one.algorithm}:${one.hash.toLowerCase()}`;
    if (seen.has(once)) continue;
    seen.add(once);
    asked.push({ hash: one.hash, algorithm: one.algorithm });
  }
  return asked;
}

interface Answered {
  report: SourceReport;
  matches: FingerprintMatch[];
}

async function askOne(
  ctx: RouteContext,
  ask: Ask,
  asked: readonly FingerprintQuery[],
  sections: readonly SceneSection[],
): Promise<Answered> {
  const { spec, apiKey } = ask;
  const searchable = asked.filter(
    (one) => one.algorithm !== PERCEPTUAL || supports(spec, "perceptual_lookup"),
  );
  const notSearched = [
    ...new Set(
      asked.filter((one) => !searchable.includes(one)).map((one) => one.algorithm as string),
    ),
  ];

  if (searchable.length === 0) {
    return {
      report: {
        ...absentReport(
          spec,
          `${spec.name} searches none of the algorithms these hashes were computed with, so it was never asked.`,
        ),
        algorithmsNotSearched: notSearched,
      },
      matches: [],
    };
  }

  try {
    const payload = await ctx.transport.request(
      spec,
      apiKey,
      fingerprintRequest(spec, searchable, sections),
    );
    const groups = groupsUnder(payload, "findScenesBySceneFingerprints", spec, MOMENT);
    const retrievedAt = ctx.now();

    const records: SceneRecord[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (const group of groups) {
      for (const entry of group) {
        const scene = mapScene(entry, spec, retrievedAt);
        if (scene === null) {
          skipped += 1;
          continue;
        }
        // A catalogue answering one group per hash names a record once per hash
        // it satisfied. Counted once, it stays one record with several matches.
        if (seen.has(scene.id)) continue;
        seen.add(scene.id);
        records.push(scene);
      }
    }

    const matches = attribute(records, searchable);
    const matched = new Set(matches.map((match) => match.scene.id));
    const report: SourceReport = {
      source: spec.id,
      name: spec.name,
      state: "answered",
      count: matches.length,
      records: matched.size,
      unattributed: records.length - matched.size,
      ...(skipped > 0 ? { skipped } : {}),
      ...(notSearched.length > 0 ? { algorithmsNotSearched: notSearched } : {}),
    };
    return { report, matches };
  } catch (cause) {
    return {
      report: failureReport(
        spec,
        cause,
        MOMENT,
        notSearched.length > 0 ? { algorithmsNotSearched: notSearched } : {},
      ),
      matches: [],
    };
  }
}

/**
 * Which hash reached which record.
 *
 * The attribution is read off the record's own fingerprints rather than off the
 * position of the group it arrived in, so a record that answers two of the
 * hashes asked comes back as two matches naming the two hashes, and a record
 * carrying none of them is never given one it does not hold.
 */
function attribute(
  records: readonly SceneRecord[],
  asked: readonly FingerprintQuery[],
): FingerprintMatch[] {
  const matches: FingerprintMatch[] = [];
  for (const scene of records) {
    for (const one of asked) {
      const carried = (scene.fingerprints ?? []).find(
        (print) =>
          print.algorithm === one.algorithm && print.hash.toLowerCase() === one.hash.toLowerCase(),
      );
      if (carried === undefined) continue;
      matches.push({
        scene,
        algorithm: one.algorithm,
        matchKind: one.algorithm === PERCEPTUAL ? "perceptual_similarity" : "exact_file",
        fingerprint: carried,
      });
    }
  }
  return matches;
}
