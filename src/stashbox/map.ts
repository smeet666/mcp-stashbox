/**
 * Turning what a catalogue answers into what this client publishes.
 *
 * This is where a gap stays a gap. A catalogue empties a record when it folds it
 * into another, so the fields of a folded record describe the record as it stood
 * rather than the person or the scene it once named. Reading those fields as an
 * answer is the one way this client could state something nobody entered.
 */

import type {
  FingerprintAlgorithm,
  FingerprintRow,
  ImageRow,
  PerformerAppearance,
  PerformerAppearanceDetails,
  PerformerRecord,
  SceneRecord,
  SiteLink,
  StudioRef,
  TagRow,
} from "../types.js";
import { formatId, isUuid } from "./identifiers.js";
import { supports, type InstanceSpec } from "./instances.js";
import {
  positiveOrNull,
  readContested,
  readDate,
  readInteger,
  readStatus,
  readText,
} from "./normalise.js";

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const ALGORITHMS: readonly FingerprintAlgorithm[] = ["MD5", "OSHASH", "PHASH"];

/**
 * Edits still being argued over.
 *
 * A record carries its edits with a status each, and a record under revision is
 * not a settled one. Counting only the open ones keeps the number meaning what
 * its name says: an accepted edit is part of the record, never a pending change
 * to it.
 */
function countPendingEdits(raw: unknown): number | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((entry) => readText(asRecord(entry)?.status)?.toUpperCase() === "PENDING")
    .length;
}

/**
 * Whether the catalogue answered with edits this client could not read.
 *
 * A catalogue that publishes open edits and answered something unreadable for
 * them is a third state, apart from a record with none and a catalogue that
 * counts none. Left unsaid it reads as the first, which calls a record settled.
 */
function editsUnreadable(spec: InstanceSpec, raw: unknown): boolean {
  return supports(spec, "pending_edits") && raw !== undefined && !Array.isArray(raw);
}

/** A catalogue-minted identifier, kept out of an address unless it is one. */
function readUuid(value: unknown): string | null {
  const text = readText(value);
  return text !== null && isUuid(text) ? text : null;
}

/**
 * The address of a record on the catalogue that answered.
 *
 * The identifier comes from the catalogue's own response, so it is checked and
 * escaped before it reaches an address: a value carrying a path segment or a
 * line break would otherwise point somewhere nobody asked for, or split the line
 * that carries it.
 */
function recordUrl(spec: InstanceSpec, kind: "scenes" | "performers", uuid: string): string | null {
  return isUuid(uuid) ? `${spec.webBase}/${kind}/${encodeURIComponent(uuid)}` : null;
}

function mapLinks(raw: unknown): { rows: SiteLink[]; skipped: number } {
  let skipped = 0;
  const rows = asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const url = readText(row?.url);
    if (!row || !url) {
      skipped += 1;
      return [];
    }
    const site = asRecord(row.site);
    return [
      {
        url,
        // A catalogue attaching no site to a link names none, and inventing a
        // name here would assert a site the catalogue declined to identify.
        siteName: readText(site?.name),
        // A catalogue that publishes no table of sites yields no category, and
        // borrowing a neighbour's would sort a link by a taxonomy its own
        // catalogue never applied.
        siteCategory: readText(asRecord(site?.category)?.name),
      },
    ];
  });
  return { rows, skipped };
}

function mapImages(raw: unknown): { rows: ImageRow[]; skipped: number } {
  let skipped = 0;
  const rows = asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const url = readText(row?.url);
    if (!url) {
      skipped += 1;
      return [];
    }
    return [{ url, width: readInteger(row?.width), height: readInteger(row?.height) }];
  });
  return { rows, skipped };
}

function mapFingerprints(
  raw: unknown,
  spec: InstanceSpec,
): { rows: FingerprintRow[]; skipped: number } {
  const publishesReports = spec.capabilities.includes("fingerprint_reports");
  let skipped = 0;
  const rows = asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const hash = readText(row?.hash);
    const algorithm = readText(row?.algorithm)?.toUpperCase();
    if (!row || !hash || !algorithm || !ALGORITHMS.includes(algorithm as FingerprintAlgorithm)) {
      skipped += 1;
      return [];
    }
    const submissions = readInteger(row.submissions);
    // A catalogue that counts no disputes yields null rather than zero: silence
    // about disputes is not an absence of them.
    const reports = publishesReports ? readInteger(row.reports) : null;
    return [
      {
        algorithm: algorithm as FingerprintAlgorithm,
        hash,
        durationSeconds: positiveOrNull(readInteger(row.duration)),
        submissions,
        reports,
        contested: readContested(submissions, reports),
      },
    ];
  });
  return { rows, skipped };
}

function mapStudio(
  raw: unknown,
  spec: InstanceSpec,
  lost?: { skipped: number; inParent?: boolean },
): StudioRef | null {
  const row = asRecord(raw);
  const id = readText(row?.id);
  const name = readText(row?.name);
  if (!row || !id || !name || !isUuid(id)) {
    // A studio the catalogue answered with and this client could not read is a
    // loss. Returning null silently makes it a scene with no studio.
    if (raw !== undefined && raw !== null && lost) lost.skipped += 1;
    return null;
  }
  const parent = readText(asRecord(row.parent)?.name);
  // A parent the catalogue answered with and this client could not read is a
  // loss. Left silent it is indistinguishable from a studio under no parent.
  if (row.parent !== undefined && row.parent !== null && parent === null && lost) {
    lost.skipped += 1;
    lost.inParent = true;
  }
  return {
    id: formatId(spec.id, id),
    name,
    parent,
    // A studio identifier is a live input to a scene search, so what it
    // addresses now travels with it.
    status: readStatus(row.deleted === true, null),
    ...(asRecord(row.parent)?.deleted === true ? { parentWithdrawn: true } : {}),
  };
}

function mapAppearances(
  raw: unknown,
  spec: InstanceSpec,
): { rows: PerformerAppearance[]; skipped: number } {
  let skipped = 0;
  const rows = asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const performer = asRecord(row?.performer);
    const id = readText(performer?.id);
    const name = readText(performer?.name);
    if (!performer || !id || !name || !isUuid(id)) {
      skipped += 1;
      return [];
    }
    const creditedAs = readText(row?.as);
    return [
      {
        id: formatId(spec.id, id),
        name,
        // The name printed on a release differs from a performer's own by a
        // letter as often as by a whole stage name, so it travels beside it.
        creditedAs: creditedAs && creditedAs !== name ? creditedAs : null,
        disambiguation: readText(performer.disambiguation),
        // A credit is an identifier a caller reads next. One the catalogue has
        // folded resolves to a marker, and printing it bare offers a person the
        // catalogue no longer holds under that identifier.
        status: readStatus(performer.deleted === true, readText(performer.merged_into_id)),
      },
    ];
  });
  return { rows, skipped };
}

function mapTags(raw: unknown, spec: InstanceSpec): { rows: TagRow[]; skipped: number } {
  let skipped = 0;
  const rows = asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const id = readText(row?.id);
    const name = readText(row?.name);
    if (!row || !id || !name || !isUuid(id)) {
      skipped += 1;
      return [];
    }
    return [
      {
        id: formatId(spec.id, id),
        name,
        category: readText(asRecord(row.category)?.name),
        status: readStatus(row.deleted === true, null),
      },
    ];
  });
  return { rows, skipped };
}

function mapBodyModifications(raw: unknown, lost?: { skipped: number }): string[] {
  return asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const location = readText(row?.location);
    const description = readText(row?.description);
    // A mark the catalogue answered with and this client could not read is a
    // loss. Dropping it silently makes it a person carrying one fewer mark.
    if (!location && !description) {
      if (lost) lost.skipped += 1;
      return [];
    }
    return [[location, description].filter(Boolean).join(": ")];
  });
}

function mapAppearanceDetails(raw: Raw, lost?: { skipped: number }): PerformerAppearanceDetails {
  return {
    ethnicity: readText(raw.ethnicity),
    eyeColor: readText(raw.eye_color),
    hairColor: readText(raw.hair_color),
    // A folded record publishes a height of zero, which no person has.
    heightCm: positiveOrNull(readInteger(raw.height)),
    tattoos: mapBodyModifications(raw.tattoos, lost),
    piercings: mapBodyModifications(raw.piercings, lost),
    breastType: readText(raw.breast_type),
    cupSize: readText(raw.cup_size),
    bandSize: positiveOrNull(readInteger(raw.band_size)),
    waistSize: positiveOrNull(readInteger(raw.waist_size)),
    hipSize: positiveOrNull(readInteger(raw.hip_size)),
  };
}

/**
 * One scene.
 *
 * A scene is withdrawn outright and carries no successor on any catalogue, so its
 * status is settled by the withdrawal flag alone.
 */
export function mapScene(
  raw: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): SceneRecord | null {
  const row = asRecord(raw);
  const uuid = readUuid(row?.id);
  if (!row || !uuid) return null;

  const status = readStatus(row.deleted === true, null);
  const base = {
    id: formatId(spec.id, uuid),
    source: spec.id,
    sourceUrl: recordUrl(spec, "scenes", uuid) ?? spec.webBase,
    retrievedAt,
    status,
    mergedInto: null,
    pendingEdits: countPendingEdits(row.edits),
    ...(editsUnreadable(spec, row.edits) ? { pendingEditsUnreadable: true } : {}),
  };

  if (status === "deleted") {
    // A withdrawn record describes itself and nothing else, so nothing it still
    // carries is offered as a statement about a scene. Its fingerprints are the
    // one exception: a hash states what a file is, never what a scene holds, and
    // dropping them makes a file the catalogue can still recognise look like a
    // file it has never seen.
    const titleLost = row.title !== undefined && row.title !== null && readText(row.title) === null;
    const withdrawn: SceneRecord = {
      ...base,
      ...(titleLost ? { rowsSkipped: 1, rowsSkippedIn: ["the title it carried"] } : {}),
      title: readText(row.title),
      details: null,
      code: null,
      director: null,
      durationSeconds: null,
      releaseDate: null,
      productionDate: null,
      studio: null,
      performers: [],
      tags: [],
      urls: [],
      created: null,
      updated: null,
    };
    attachFingerprints(withdrawn, row, spec);
    return withdrawn;
  }

  const performers = mapAppearances(row.performers, spec);
  const tags = mapTags(row.tags, spec);
  const urls = mapLinks(row.urls);
  const studioLoss: { skipped: number; inParent?: boolean } = { skipped: 0 };
  const studio = mapStudio(row.studio, spec, studioLoss);
  const lost = performers.skipped + tags.skipped + urls.skipped + studioLoss.skipped;

  const scene: SceneRecord = {
    ...base,
    title: readText(row.title),
    details: readText(row.details),
    code: readText(row.code),
    director: readText(row.director),
    durationSeconds: positiveOrNull(readInteger(row.duration)),
    releaseDate: readDate(readText(row.release_date)),
    ...(readText(row.release_date) !== null && readDate(readText(row.release_date)) === null
      ? { releaseDateUnreadable: true }
      : {}),
    // When a scene was made is a different question from when it was released,
    // so neither ever stands in for the other.
    productionDate: readDate(readText(row.production_date)),
    ...(readText(row.production_date) !== null && readDate(readText(row.production_date)) === null
      ? { productionDateUnreadable: true }
      : {}),
    studio,
    performers: performers.rows,
    tags: tags.rows,
    urls: urls.rows,
    ...(lost
      ? {
          rowsSkipped: lost,
          rowsSkippedIn: [
            ...(urls.skipped ? ["its links"] : []),
            ...(tags.skipped ? ["its tags"] : []),
            ...(performers.skipped ? ["the performers it credits"] : []),
            ...(studioLoss.skipped
              ? [
                  studioLoss.inParent
                    ? "the studio the one it names belongs to"
                    : "the studio it names",
                ]
              : []),
          ],
        }
      : {}),
    created: readText(row.created),
    updated: readText(row.updated),
  };

  attachFingerprints(scene, row, spec);
  if (row.images !== undefined) {
    const { rows: images, skipped: imagesSkipped } = mapImages(row.images);
    scene.images = images;
    if (imagesSkipped) scene.imagesSkipped = imagesSkipped;
  }

  return scene;
}

/** The hashes a catalogue holds for a record, with what could not be read counted. */
function attachFingerprints(scene: SceneRecord, row: Raw, spec: InstanceSpec): void {
  if (row.fingerprints === undefined) return;
  const { rows: fingerprints, skipped: fingerprintsSkipped } = mapFingerprints(
    row.fingerprints,
    spec,
  );
  scene.fingerprints = fingerprints;
  if (fingerprintsSkipped) scene.fingerprintsSkipped = fingerprintsSkipped;
  scene.fingerprintCount = fingerprints.reduce<Partial<Record<FingerprintAlgorithm, number>>>(
    (counts, entry) => ({ ...counts, [entry.algorithm]: (counts[entry.algorithm] ?? 0) + 1 }),
    {},
  );
}

/**
 * One performer.
 *
 * A folded record answers under its old identifier carrying the name it held
 * then, no aliases, no links and a scene count of zero. That zero belongs to the
 * record, so it is dropped and the marker names its successor.
 */
export function mapPerformer(
  raw: unknown,
  spec: InstanceSpec,
  retrievedAt: string,
): PerformerRecord | null {
  const row = asRecord(raw);
  const uuid = readUuid(row?.id);
  if (!row || !uuid) return null;

  // The successor is held to what every printed identifier is held to: a string
  // this catalogue could have minted. It is handed back as the record to read
  // next, so one that is not an identifier sends a caller to a refusal.
  const successorRaw = readText(row.merged_into_id);
  // A record that continues into itself continues nowhere: offered as the one
  // to read next, it sends a reader back to the record they are reading.
  const successorNamed =
    successorRaw !== null && successorRaw.toLowerCase() !== uuid.toLowerCase()
      ? successorRaw
      : null;
  const mergedIntoRaw = successorNamed !== null && isUuid(successorNamed) ? successorNamed : null;
  const successorSkipped = successorNamed !== null && mergedIntoRaw === null ? 1 : 0;
  // A catalogue naming a successor this client could not read has folded the
  // record. Reading the status without it would publish a withdrawal the
  // catalogue never stated.
  const status = readStatus(
    row.deleted === true,
    mergedIntoRaw ?? (successorSkipped ? "unreadable" : null),
  );
  const rawMergedIds = asArray(row.merged_ids);
  // An absorbed identifier is held to what the record's own is held to: a
  // string this catalogue could have minted. Anything else is a row lost.
  const mergedIds = rawMergedIds
    .map((entry) => readText(entry))
    .filter((entry): entry is string => entry !== null && isUuid(entry))
    .map((entry) => formatId(spec.id, entry));
  const mergedIdsSkipped = rawMergedIds.length - mergedIds.length;

  const base = {
    id: formatId(spec.id, uuid),
    source: spec.id,
    sourceUrl: recordUrl(spec, "performers", uuid) ?? spec.webBase,
    retrievedAt,
    status,
    mergedInto: mergedIntoRaw ? formatId(spec.id, mergedIntoRaw) : null,
    pendingEdits: countPendingEdits(row.edits),
    ...(editsUnreadable(spec, row.edits) ? { pendingEditsUnreadable: true } : {}),
  };

  if (status !== "established") {
    const nameLost = row.name !== undefined && row.name !== null && readText(row.name) === null;
    return {
      ...base,
      mergedIds,
      ...(mergedIdsSkipped + successorSkipped + (nameLost ? 1 : 0)
        ? {
            rowsSkipped: mergedIdsSkipped + successorSkipped + (nameLost ? 1 : 0),
            rowsSkippedIn: [
              ...(mergedIdsSkipped ? ["the identifiers folded into it"] : []),
              ...(successorSkipped ? ["the record it continues as"] : []),
              ...(nameLost ? ["the name it carried"] : []),
            ],
          }
        : {}),
      name: readText(row.name),
      disambiguation: null,
      aliases: [],
      gender: null,
      country: null,
      birthDate: null,
      deathDate: null,
      careerStartYear: null,
      careerEndYear: null,
      // The count belongs to the successor, so the marker states none.
      sceneCount: null,
      urls: [],
      created: null,
      updated: null,
    };
  }

  const performerUrls = mapLinks(row.urls);
  const rawAliases = asArray(row.aliases);
  const aliases = rawAliases
    .map((entry) => readText(entry))
    .filter((entry): entry is string => entry !== null);
  const aliasesSkipped = rawAliases.length - aliases.length;

  const performer: PerformerRecord = {
    ...base,
    mergedIds,
    name: readText(row.name),
    disambiguation: readText(row.disambiguation),
    aliases,
    gender: readText(row.gender),
    country: readText(row.country),
    birthDate: readDate(readText(row.birth_date)),
    ...(readText(row.birth_date) !== null && readDate(readText(row.birth_date)) === null
      ? { birthDateUnreadable: true }
      : {}),
    deathDate: readDate(readText(row.death_date)),
    ...(readText(row.death_date) !== null && readDate(readText(row.death_date)) === null
      ? { deathDateUnreadable: true }
      : {}),
    careerStartYear: readInteger(row.career_start_year),
    careerEndYear: readInteger(row.career_end_year),
    // What this catalogue has indexed. A settled record naming a career spanning
    // decades can report zero, so the number reports coverage. A catalogue that
    // carries the field without filling it publishes no count, and a zero there
    // would be indistinguishable from a person it holds nothing for.
    sceneCount: supports(spec, "scene_count") ? readInteger(row.scene_count) : null,
    urls: performerUrls.rows,
    ...(performerUrls.skipped + aliasesSkipped + mergedIdsSkipped + successorSkipped
      ? {
          rowsSkipped: performerUrls.skipped + aliasesSkipped + mergedIdsSkipped + successorSkipped,
          rowsSkippedIn: [
            ...(performerUrls.skipped ? ["its links"] : []),
            ...(aliasesSkipped ? ["the names it is also known by"] : []),
            ...(mergedIdsSkipped ? ["the identifiers folded into it"] : []),
            ...(successorSkipped ? ["the record it continues as"] : []),
          ],
        }
      : {}),
    created: readText(row.created),
    updated: readText(row.updated),
  };

  if (row.ethnicity !== undefined || row.height !== undefined) {
    const marksLost = { skipped: 0 };
    performer.appearance = mapAppearanceDetails(row, marksLost);
    if (marksLost.skipped) {
      performer.rowsSkipped = (performer.rowsSkipped ?? 0) + marksLost.skipped;
      performer.rowsSkippedIn = [
        ...(performer.rowsSkippedIn ?? []),
        "the marks on its body it describes",
      ];
    }
  }
  if (row.images !== undefined) {
    const { rows: images, skipped: imagesSkipped } = mapImages(row.images);
    performer.images = images;
    if (imagesSkipped) performer.imagesSkipped = imagesSkipped;
  }
  if (row.studios !== undefined) {
    const all = asArray(row.studios);
    performer.studiosTotal = all.length;
    let unreadable = 0;
    performer.studios = all.flatMap((entry) => {
      const studioRow = asRecord(entry);
      const studio = asRecord(studioRow?.studio);
      const id = readText(studio?.id);
      const name = readText(studio?.name);
      if (!id || !name || !isUuid(id)) {
        unreadable += 1;
        return [];
      }
      return [
        {
          id: formatId(spec.id, id),
          name,
          sceneCount: readInteger(studioRow?.scene_count),
          status: readStatus(studio?.deleted === true, null),
        },
      ];
    });
    if (unreadable) performer.studiosSkipped = unreadable;
  }

  return performer;
}
