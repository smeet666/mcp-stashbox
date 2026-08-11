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
import type { InstanceSpec } from "./instances.js";
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

function mapLinks(raw: unknown): SiteLink[] {
  return asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const url = readText(row?.url);
    if (!row || !url) return [];
    const site = asRecord(row.site);
    return [
      {
        url,
        siteName: readText(site?.name) ?? "unnamed site",
        // A catalogue that publishes no table of sites yields no category, and
        // borrowing a neighbour's would sort a link by a taxonomy its own
        // catalogue never applied.
        siteCategory: readText(asRecord(site?.category)?.name),
      },
    ];
  });
}

function mapImages(raw: unknown): ImageRow[] {
  return asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const url = readText(row?.url);
    if (!url) return [];
    return [{ url, width: readInteger(row?.width), height: readInteger(row?.height) }];
  });
}

function mapFingerprints(raw: unknown, spec: InstanceSpec): FingerprintRow[] {
  const publishesReports = spec.capabilities.includes("fingerprint_reports");
  return asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const hash = readText(row?.hash);
    const algorithm = readText(row?.algorithm)?.toUpperCase();
    if (!row || !hash || !algorithm || !ALGORITHMS.includes(algorithm as FingerprintAlgorithm)) {
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
}

function mapStudio(raw: unknown, spec: InstanceSpec): StudioRef | null {
  const row = asRecord(raw);
  const id = readText(row?.id);
  const name = readText(row?.name);
  if (!row || !id || !name) return null;
  return {
    id: formatId(spec.id, id),
    name,
    parent: readText(asRecord(row.parent)?.name),
  };
}

function mapAppearances(raw: unknown, spec: InstanceSpec): PerformerAppearance[] {
  return asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const performer = asRecord(row?.performer);
    const id = readText(performer?.id);
    const name = readText(performer?.name);
    if (!performer || !id || !name) return [];
    const creditedAs = readText(row?.as);
    return [
      {
        id: formatId(spec.id, id),
        name,
        // The name printed on a release differs from a performer's own by a
        // letter as often as by a whole stage name, so it travels beside it.
        creditedAs: creditedAs && creditedAs !== name ? creditedAs : null,
        disambiguation: readText(performer.disambiguation),
      },
    ];
  });
}

function mapTags(raw: unknown, spec: InstanceSpec): TagRow[] {
  return asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const id = readText(row?.id);
    const name = readText(row?.name);
    if (!row || !id || !name) return [];
    return [{ id: formatId(spec.id, id), name, category: readText(asRecord(row.category)?.name) }];
  });
}

function mapBodyModifications(raw: unknown): string[] {
  return asArray(raw).flatMap((entry) => {
    const row = asRecord(entry);
    const location = readText(row?.location);
    const description = readText(row?.description);
    if (!location && !description) return [];
    return [[location, description].filter(Boolean).join(": ")];
  });
}

function mapAppearanceDetails(raw: Raw): PerformerAppearanceDetails {
  return {
    ethnicity: readText(raw.ethnicity),
    eyeColor: readText(raw.eye_color),
    hairColor: readText(raw.hair_color),
    // A folded record publishes a height of zero, which no person has.
    heightCm: positiveOrNull(readInteger(raw.height)),
    tattoos: mapBodyModifications(raw.tattoos),
    piercings: mapBodyModifications(raw.piercings),
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
  };

  if (status === "deleted") {
    // A withdrawn record describes itself and nothing else, so nothing it still
    // carries is offered as a statement about a scene.
    return {
      ...base,
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
  }

  const scene: SceneRecord = {
    ...base,
    title: readText(row.title),
    details: readText(row.details),
    code: readText(row.code),
    director: readText(row.director),
    durationSeconds: positiveOrNull(readInteger(row.duration)),
    releaseDate: readDate(readText(row.release_date)),
    // When a scene was made is a different question from when it was released,
    // so neither ever stands in for the other.
    productionDate: readDate(readText(row.production_date)),
    studio: mapStudio(row.studio, spec),
    performers: mapAppearances(row.performers, spec),
    tags: mapTags(row.tags, spec),
    urls: mapLinks(row.urls),
    created: readText(row.created),
    updated: readText(row.updated),
  };

  if (row.fingerprints !== undefined) {
    const fingerprints = mapFingerprints(row.fingerprints, spec);
    scene.fingerprints = fingerprints;
    scene.fingerprintCount = fingerprints.reduce<Partial<Record<FingerprintAlgorithm, number>>>(
      (counts, entry) => ({ ...counts, [entry.algorithm]: (counts[entry.algorithm] ?? 0) + 1 }),
      {},
    );
  }
  if (row.images !== undefined) scene.images = mapImages(row.images);

  return scene;
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

  const mergedIntoRaw = readText(row.merged_into_id);
  const status = readStatus(row.deleted === true, mergedIntoRaw);
  const mergedIds = asArray(row.merged_ids)
    .map((entry) => readText(entry))
    .filter((entry): entry is string => entry !== null)
    .map((entry) => formatId(spec.id, entry));

  const base = {
    id: formatId(spec.id, uuid),
    source: spec.id,
    sourceUrl: recordUrl(spec, "performers", uuid) ?? spec.webBase,
    retrievedAt,
    status,
    mergedInto: mergedIntoRaw ? formatId(spec.id, mergedIntoRaw) : null,
    pendingEdits: countPendingEdits(row.edits),
  };

  if (status !== "established") {
    return {
      ...base,
      mergedIds,
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

  const performer: PerformerRecord = {
    ...base,
    mergedIds,
    name: readText(row.name),
    disambiguation: readText(row.disambiguation),
    aliases: asArray(row.aliases)
      .map((entry) => readText(entry))
      .filter((entry): entry is string => entry !== null),
    gender: readText(row.gender),
    country: readText(row.country),
    birthDate: readDate(readText(row.birth_date)),
    deathDate: readDate(readText(row.death_date)),
    careerStartYear: readInteger(row.career_start_year),
    careerEndYear: readInteger(row.career_end_year),
    // What this catalogue has indexed. A settled record naming a career spanning
    // decades can report zero, so the number reports coverage.
    sceneCount: readInteger(row.scene_count),
    urls: mapLinks(row.urls),
    created: readText(row.created),
    updated: readText(row.updated),
  };

  if (row.ethnicity !== undefined || row.height !== undefined) {
    performer.appearance = mapAppearanceDetails(row);
  }
  if (row.images !== undefined) performer.images = mapImages(row.images);
  if (row.studios !== undefined) {
    performer.studios = asArray(row.studios).flatMap((entry) => {
      const studioRow = asRecord(entry);
      const studio = asRecord(studioRow?.studio);
      const id = readText(studio?.id);
      const name = readText(studio?.name);
      if (!id || !name) return [];
      return [{ id: formatId(spec.id, id), name, sceneCount: readInteger(studioRow?.scene_count) }];
    });
  }

  return performer;
}
