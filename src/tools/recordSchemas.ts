/**
 * The shapes a record takes in a published answer, declared once.
 *
 * A key published and undeclared is invisible to anyone reading the contract
 * rather than the prose, so every key any answer carries is declared here at the
 * path it is published on. The description of a field says what it means and,
 * where a field can be read for something it is not, what it does not mean: that
 * is the whole of the rule this server keeps, written where a schema-driven
 * caller reads it.
 *
 * Two measured facts shape the records below. These catalogues **fold a
 * performer into a successor and publish which one**, so a performer's status
 * has three readings and a performer alone names a successor. They **withdraw a
 * scene, a studio and a tag without naming anything in its place**, so those
 * three are held or withdrawn and point nowhere.
 */

import { z } from "zod";

import { INSTANCES } from "../stashbox/instances.js";

const SOURCE_IDS = INSTANCES.map((instance) => instance.id) as [string, ...string[]];

export const sourceId = z
  .enum(SOURCE_IDS)
  .describe("The catalogue this came off, which is the catalogue the identifier names.");

export const identifierField = z
  .string()
  .describe(
    "The record, written instance:uuid. Every identifier published here is one this server takes back, and the same uuid names a different record on each catalogue.",
  );

/** A performer is folded into a successor; a scene, a studio and a tag are not. */
export const foldableStatus = z
  .enum(["established", "merged", "deleted"])
  .describe(
    "What the identifier addresses now: 'established' the record itself, 'merged' the record it was folded into, 'deleted' a record the catalogue withdrew. A record that is not established describes the record and never the thing it once named.",
  );

export const withdrawableStatus = z
  .enum(["established", "deleted"])
  .describe(
    "What the identifier addresses now. These catalogues publish no successor for this kind of record, so it is held or withdrawn and names nothing in its place.",
  );

export const readDateShape = z
  .object({
    value: z.string().describe("The date as the catalogue published it, unchanged."),
    precision: z
      .enum(["day", "month", "year"])
      .describe(
        "How much of the date was entered. A year is a year: reading it as the first of January would put a day in front of a reader that nobody entered.",
      ),
  })
  .describe("A date at the precision it was entered with.");

export const siteLink = z.object({
  url: z.string().describe("The address the record links to."),
  site_name: z
    .string()
    .nullable()
    .describe("The site behind the link, null where the catalogue attaches none to it."),
  site_category: z
    .string()
    .nullable()
    .describe(
      "The catalogue's own category for that site, null where it publishes no table of them. Null is a category nobody recorded and never a site outside every category.",
    ),
});

export const imageRow = z.object({
  url: z.string().describe("The address of the image."),
  width: z
    .number()
    .nullable()
    .describe("Width in pixels, null where the catalogue publishes none."),
  height: z
    .number()
    .nullable()
    .describe("Height in pixels, null where the catalogue publishes none."),
});

export const studioRef = z.object({
  id: identifierField,
  name: z.string().describe("The studio as the catalogue names it."),
  parent: z
    .string()
    .nullable()
    .describe("The studio this one sits under, null where the catalogue names none."),
  status: withdrawableStatus,
  parent_withdrawn: z
    .boolean()
    .optional()
    .describe("The parent named here is a record the catalogue withdrew, so it names nothing now."),
});

export const tagRow = z.object({
  id: identifierField,
  name: z.string().describe("The tag as the catalogue names it."),
  category: z
    .string()
    .nullable()
    .describe(
      "The catalogue's own category for the tag, null on a catalogue publishing no taxonomy. That null is a catalogue with no taxonomy and never a tag left uncategorised.",
    ),
  status: withdrawableStatus,
});

export const performerCredit = z.object({
  id: identifierField,
  name: z.string().describe("The performer as the catalogue's record names them."),
  credited_as: z
    .string()
    .nullable()
    .describe("The name printed on this release, null where it matches the record's own."),
  disambiguation: z
    .string()
    .nullable()
    .describe("Free text telling two people of one name apart, which reads and never parses."),
  status: foldableStatus,
});

export const fingerprintRow = z.object({
  algorithm: z
    .enum(["MD5", "OSHASH", "PHASH"])
    .describe(
      "How the hash was computed. MD5 and OSHASH name a file; PHASH states a likeness, which a re-encode, a crop and another scene from one shoot all satisfy.",
    ),
  hash: z.string().describe("The hash as the catalogue stores it."),
  duration_seconds: z
    .number()
    .nullable()
    .describe("The duration submitted with the hash, null where none was."),
  submissions: z
    .number()
    .nullable()
    .describe(
      "How many people submitted this hash for this scene, null on a catalogue that counts none.",
    ),
  reports: z
    .number()
    .nullable()
    .describe(
      "How many people disputed it, null on a catalogue that counts no disputes. Null is a contest nobody counted and never an absence of one.",
    ),
  contested: z
    .boolean()
    .nullable()
    .describe(
      "Whether the disputes outweigh the submissions, null wherever the disputes were never counted. Null is unknown, and reading it as false would state an agreement nobody expressed.",
    ),
});

/** What every record carries, whatever it is a record of. */
const recordBase = {
  id: identifierField,
  source: sourceId,
  source_url: z.string().describe("The record on the catalogue's own site."),
  retrieved_at: z.string().describe("When this record came off the catalogue, ISO 8601."),
  pending_edits: z
    .number()
    .nullable()
    .describe(
      "Edits open against the record, null on a catalogue publishing no count. An open edit says the record may be about to change and says nothing about whether it is wrong.",
    ),
  pending_edits_unreadable: z
    .boolean()
    .optional()
    .describe(
      "The catalogue publishes open edits and answered a shape this client could not read, so the count is missing rather than zero.",
    ),
  rows_skipped: z
    .number()
    .optional()
    .describe("Rows of this record's own lists that came back unreadable and are left out."),
  rows_skipped_in: z
    .array(z.string())
    .optional()
    .describe("Which of its lists lost them, so the count says what it counts."),
};

export const sceneRecord = z.object({
  ...recordBase,
  status: withdrawableStatus,
  title: z.string().nullable().describe("The title the record carries."),
  details: z.string().nullable().describe("What the catalogue publishes about the scene."),
  code: z.string().nullable().describe("The studio's own reference for the release."),
  director: z
    .string()
    .nullable()
    .describe("Free text, which can name several people and is never split here."),
  duration_seconds: z
    .number()
    .nullable()
    .describe("The runtime the catalogue publishes, null where it publishes none."),
  release_date: readDateShape
    .nullable()
    .describe("When the scene was released, at the precision it was entered with."),
  production_date: readDateShape
    .nullable()
    .describe("When the scene was made, which is a different question from when it was released."),
  release_date_unreadable: z
    .boolean()
    .optional()
    .describe(
      "The catalogue published a release date naming no day on a calendar, so the date is missing rather than absent from the record.",
    ),
  production_date_unreadable: z
    .boolean()
    .optional()
    .describe("The catalogue published a production date this client could not read."),
  studio: studioRef.nullable().describe("The studio credited, null where none is."),
  performers: z.array(performerCredit).describe("Who is credited, as this record credits them."),
  tags: z.array(tagRow).describe("The tags the record carries."),
  urls: z.array(siteLink).describe("Where the catalogue links this scene."),
  images: z
    .array(imageRow)
    .optional()
    .describe("Published only where the images block was asked for."),
  images_skipped: z
    .number()
    .optional()
    .describe("Images the catalogue answered with that this client could not read."),
  fingerprints: z
    .array(fingerprintRow)
    .optional()
    .describe("Published only where the fingerprints block was asked for."),
  fingerprints_skipped: z
    .number()
    .optional()
    .describe("Fingerprints the catalogue answered with that this client could not read."),
  fingerprints_shown: z
    .object({
      MD5: z.number().optional().describe("How many exact-file hashes of that kind are shown."),
      OSHASH: z.number().optional().describe("How many exact-file hashes of that kind are shown."),
      PHASH: z.number().optional().describe("How many perceptual hashes are shown."),
    })
    .optional()
    .describe(
      "How many hashes are shown here per algorithm. A hash the catalogue answered with that this client could not read is counted in fingerprints_skipped and in none of these, so what the record holds is the two together.",
    ),
  created: z
    .string()
    .nullable()
    .optional()
    .describe(
      "When the record was created on the catalogue, carried only where the question was ordered on it.",
    ),
  updated: z
    .string()
    .nullable()
    .optional()
    .describe(
      "When the record was last edited, carried only where the question was ordered on it.",
    ),
});

export const performerStudio = z.object({
  id: identifierField,
  name: z.string().describe("The studio as the catalogue names it."),
  scene_count: z
    .number()
    .nullable()
    .describe(
      "Scenes this catalogue has indexed crediting the performer on that studio, null where it counts none.",
    ),
  status: withdrawableStatus,
});

export const performerAppearance = z.object({
  ethnicity: z.string().nullable().describe("As the catalogue records it, in its own vocabulary."),
  eye_color: z.string().nullable().describe("As the catalogue records it."),
  hair_color: z.string().nullable().describe("As the catalogue records it."),
  height_cm: z.number().nullable().describe("Height in centimetres, null where none is recorded."),
  tattoos: z.array(z.string()).describe("Each one as the catalogue describes it, with its place."),
  piercings: z
    .array(z.string())
    .describe("Each one as the catalogue describes it, with its place."),
  breast_type: z.string().nullable().describe("As the catalogue records it."),
  cup_size: z.string().nullable().describe("As the catalogue records it, in its own lettering."),
  band_size: z.number().nullable().describe("As the catalogue records it, in inches."),
  waist_size: z.number().nullable().describe("As the catalogue records it, in inches."),
  hip_size: z.number().nullable().describe("As the catalogue records it, in inches."),
});

export const performerRecord = z.object({
  ...recordBase,
  status: foldableStatus,
  merged_into: identifierField
    .nullable()
    .describe(
      "The record this identifier was folded into, which is where the catalogue holds what it knows now. Null on a record that is established and on one withdrawn without a successor.",
    ),
  merged_ids: z
    .array(identifierField)
    .describe("Identifiers folded into this record, which still resolve to it."),
  name: z.string().nullable().describe("The performer as the record names them."),
  disambiguation: z
    .string()
    .nullable()
    .describe("Free text telling two people of one name apart, which reads and never parses."),
  aliases: z.array(z.string()).describe("The other names the record carries."),
  gender: z.string().nullable().describe("As the catalogue records it, in its own vocabulary."),
  country: z.string().nullable().describe("A two-letter country code, as the catalogue stores it."),
  birth_date: readDateShape.nullable().describe("At the precision it was entered with."),
  death_date: readDateShape.nullable().describe("At the precision it was entered with."),
  birth_date_unreadable: z
    .boolean()
    .optional()
    .describe("The catalogue published a birth date naming no day on a calendar."),
  death_date_unreadable: z
    .boolean()
    .optional()
    .describe("The catalogue published a death date naming no day on a calendar."),
  career_start_year: z.number().nullable().describe("As the catalogue records it."),
  career_end_year: z
    .number()
    .nullable()
    .describe(
      "As the catalogue records it. Null is a year nobody entered and never a career ended.",
    ),
  scene_count: z
    .number()
    .nullable()
    .describe(
      "Scenes this catalogue has indexed crediting the performer. It reports that catalogue's coverage and never a person's work: a settled record can report zero while naming a career spanning decades. Null on a record folded into a successor, where the count belongs to the successor.",
    ),
  urls: z.array(siteLink).describe("Where the catalogue links this performer."),
  appearance: performerAppearance
    .optional()
    .describe("Published only where the appearance block was asked for."),
  images: z
    .array(imageRow)
    .optional()
    .describe("Published only where the images block was asked for."),
  images_skipped: z
    .number()
    .optional()
    .describe("Images the catalogue answered with that this client could not read."),
  scenes: z
    .array(sceneRecord)
    .optional()
    .describe("One page of the scenes crediting this performer, asked for as a block."),
  scenes_total: z
    .number()
    .nullable()
    .optional()
    .describe(
      "What the catalogue holds behind that one page, null where it publishes no count. It counts the catalogue's index and never the performer's work.",
    ),
  scenes_shown: z.number().optional().describe("How many of them this answer carries."),
  scenes_skipped: z
    .number()
    .optional()
    .describe("Scenes it answered with that this client could not read and left out."),
  scenes_unavailable: z
    .string()
    .optional()
    .describe(
      "Why the block is missing where it was asked for. A block absent without this sentence would read as a performer credited on nothing.",
    ),
  studios: z
    .array(performerStudio)
    .optional()
    .describe("The studios this catalogue credits the performer on, asked for as a block."),
  studios_answered_with: z
    .number()
    .optional()
    .describe(
      "How many rows the catalogue answered this table with, the ones counted in studios_skipped included. The whole table comes back at once, so nothing stands behind it.",
    ),
  studios_skipped: z
    .number()
    .optional()
    .describe("Studio rows it answered with that this client could not read."),
  studios_unavailable: z
    .string()
    .optional()
    .describe("Why the block is missing where it was asked for."),
  created: z
    .string()
    .nullable()
    .optional()
    .describe("When the record was created, carried only where the question was ordered on it."),
  updated: z
    .string()
    .nullable()
    .optional()
    .describe(
      "When the record was last edited, carried only where the question was ordered on it.",
    ),
});
