/**
 * The shapes every tool declares it returns.
 *
 * A record read from a catalogue comes back in one of two shapes: what the
 * catalogue holds, or a marker saying the identifier now addresses something
 * else. Declaring one and returning the other would publish a schema a caller
 * cannot rely on, so the two are declared as a choice and each is described for
 * what it is.
 */

import { z } from "zod";

const dateSchema = z
  .object({
    value: z.string().describe("The date exactly as the catalogue publishes it."),
    precision: z
      .enum(["day", "month", "year"])
      .describe(
        "How much of the date a cataloguer entered. A value recorded to the year carries no month and no day, and reading it as one would claim a precision nobody entered.",
      ),
  })
  .nullable();

const siteLinkSchema = z.object({
  url: z.string(),
  site_name: z
    .string()
    .nullable()
    .describe(
      "The catalogue's own name for that site. Null where it attaches no site to the link, since naming one would assert a site the catalogue declined to identify.",
    ),
  site_category: z
    .string()
    .nullable()
    .describe(
      "The catalogue's own category for that site. Null on a catalogue that publishes no table of sites, since borrowing a neighbour's would sort a link by a taxonomy this catalogue never applied.",
    ),
});

const imageSchema = z.object({
  url: z.string().describe("The address of the image. The image itself is never returned."),
  width: z.number().nullable(),
  height: z.number().nullable(),
});

const fingerprintSchema = z.object({
  algorithm: z.enum(["MD5", "OSHASH", "PHASH"]),
  hash: z.string(),
  duration_seconds: z.number().nullable(),
  submissions: z
    .number()
    .nullable()
    .describe("How many people entered this fingerprint. Null where the catalogue counts none."),
  reports: z
    .number()
    .nullable()
    .describe(
      "How many people reported against it. Null on a catalogue that records no reports, which is an unknown contest and never an absence of one.",
    ),
  contested: z
    .boolean()
    .nullable()
    .describe(
      "Whether the reports reach the submissions. Null where the catalogue publishes no report count: a fingerprint nobody has disputed and one on a catalogue that counts no disputes are different things.",
    ),
});

const sourceReportSchema = z.object({
  source: z.string(),
  name: z.string().optional(),
  state: z
    .enum(["answered", "failed", "absent"])
    .describe(
      "'answered' is a catalogue that looked, and a count of zero there means it found nothing. 'failed' could not answer. 'absent' was never asked. An answer holding rows from some catalogues is no evidence about the others.",
    ),
  count: z.number().optional().describe("Rows this catalogue contributed to this page."),
  unattributed: z.number().optional(),
  skipped: z.number().optional(),
  index_total: z
    .number()
    .optional()
    .describe("What this catalogue's index holds for the question, the rows returned included."),
  reason: z.string().optional(),
  moment: z.string().optional().describe("Which step failed, for a catalogue that failed."),
  error: z.string().optional(),
  fields_searched: z
    .array(z.string())
    .optional()
    .describe("The fields the text index read. Absent where no text index was consulted."),
  narrowings_not_received: z
    .array(z.string())
    .optional()
    .describe(
      "Narrowings this catalogue could not receive. A row of its satisfying one of them does so by chance.",
    ),
});

/**
 * When a record came off a catalogue.
 *
 * An answer served from the in-memory store carries the moment of the read it
 * came from, so a caller can tell a fresh reading from a held one.
 */
const retrievedAtSchema = z.string().describe("When this record came off the catalogue, ISO 8601.");

const statusSchema = z
  .enum(["established", "deleted", "merged"])
  .describe(
    "'established' is a record the catalogue holds. 'merged' and 'deleted' are markers: the identifier resolves, and what comes back describes the record rather than the thing it once named.",
  );

export const sceneSchema = z.object({
  id: z.string(),
  source: z.string(),
  source_url: z.string().describe("The record on the catalogue that answered."),
  retrieved_at: retrievedAtSchema,
  status: statusSchema,
  title: z.string().nullable(),
  details: z.string().nullable(),
  code: z
    .string()
    .nullable()
    .describe("The studio's own reference, in whatever form it publishes."),
  director: z.string().nullable().describe("Free text, which can name several people."),
  duration_seconds: z.number().nullable(),
  release_date: dateSchema.describe("When the scene was published."),
  production_date: dateSchema.describe(
    "When the scene was made, which is a different question from when it was published. Rarely recorded, and never filled in from the release date.",
  ),
  studio: z.object({ id: z.string(), name: z.string(), parent: z.string().nullable() }).nullable(),
  performers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      credited_as: z
        .string()
        .nullable()
        .describe(
          "The name printed on this release, where it differs from the performer's own. It travels beside that name and never in place of it.",
        ),
      disambiguation: z.string().nullable(),
    }),
  ),
  tags: z.array(z.object({ id: z.string(), name: z.string(), category: z.string().nullable() })),
  urls: z.array(siteLinkSchema),
  images: z.array(imageSchema).optional(),
  fingerprints: z.array(fingerprintSchema).optional(),
  fingerprints_held: z
    .number()
    .optional()
    .describe("How many the record holds, where the section shows a page of them."),
  fingerprint_count: z.record(z.string(), z.number()).optional(),
  images_skipped: z
    .number()
    .optional()
    .describe("Image rows the catalogue answered with that came back unreadable."),
  fingerprints_skipped: z
    .number()
    .optional()
    .describe("Fingerprint rows the catalogue answered with that came back unreadable."),
  created: z.string().nullable(),
  updated: z.string().nullable(),
  cached: z.boolean().optional().describe("Present when the answer came from the in-memory store."),
  notes: z.array(z.string()).describe("What qualifies this answer. Also carried in the text."),
});

/**
 * One shape covering a scene and a marker.
 *
 * A record answers as itself or as a marker saying the identifier now addresses
 * something else, and `status` says which. The fields that survive on both are
 * required; the rest are declared optional and described for the status they
 * belong to.
 */
export const getSceneOutput = sceneSchema
  .partial()
  .extend({
    id: z.string(),
    source: z.string(),
    source_url: z.string(),
    retrieved_at: retrievedAtSchema,
    status: statusSchema,
    notes: z.array(z.string()),
    merged_into: z
      .string()
      .nullable()
      .optional()
      .describe("Present on a marker: the identifier that continues this record."),
    former_title: z
      .string()
      .nullable()
      .optional()
      .describe("Present on a marker: the title the record carried."),
  })
  .describe(
    "A scene when 'status' is 'established'. When it is 'deleted' or 'merged' this is a marker: it carries the identifier, the catalogue, the successor and the former title, and no field describing a scene.",
  );

export const performerSchema = z.object({
  id: z.string(),
  source: z.string(),
  source_url: z.string(),
  retrieved_at: retrievedAtSchema,
  status: statusSchema,
  merged_into: z.string().nullable(),
  merged_ids: z.array(z.string()),
  name: z.string().nullable(),
  disambiguation: z
    .string()
    .nullable()
    .describe("Free text telling two people apart. It reads and never parses."),
  aliases: z.array(z.string()).describe("Stage names and variant spellings alike."),
  gender: z.string().nullable(),
  country: z.string().nullable(),
  birth_date: dateSchema,
  death_date: dateSchema,
  career_start_year: z.number().nullable(),
  career_end_year: z.number().nullable(),
  scene_count: z
    .number()
    .nullable()
    .describe(
      "Scenes this catalogue has indexed crediting this performer. A settled record naming a career spanning decades can report zero, which measures the catalogue's coverage and states nothing about a person's work.",
    ),
  scene_count_means: z.string(),
  urls: z.array(siteLinkSchema),
  appearance: z
    .object({
      ethnicity: z.string().nullable(),
      eye_color: z.string().nullable(),
      hair_color: z.string().nullable(),
      height_cm: z.number().nullable(),
      breast_type: z.string().nullable(),
      cup_size: z.string().nullable(),
      band_size: z.number().nullable(),
      waist_size: z.number().nullable(),
      hip_size: z.number().nullable(),
      tattoos: z.array(z.string()).nullable(),
      piercings: z.array(z.string()).nullable(),
    })
    .optional(),
  images: z.array(imageSchema).optional(),
  scenes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().nullable(),
        release_date: dateSchema,
        studio: z.string().nullable(),
        source_url: z.string(),
      }),
    )
    .optional(),
  scenes_total: z
    .number()
    .optional()
    .describe("What the catalogue holds behind the one page this section shows."),
  scenes_unavailable: z
    .string()
    .optional()
    .describe(
      "Why the section is missing, when it was asked for and could not be read. Its absence then says nothing about what the catalogue holds.",
    ),
  studios: z
    .array(z.object({ id: z.string(), name: z.string(), scene_count: z.number().nullable() }))
    .optional(),
  studios_total: z
    .number()
    .optional()
    .describe("How many the record credits, where the section shows a page of them."),
  studios_skipped: z
    .number()
    .optional()
    .describe("Studio rows the catalogue answered with that came back unreadable."),
  scenes_skipped: z
    .number()
    .optional()
    .describe("Scenes the catalogue answered with that came back unreadable and were left out."),
  studios_unavailable: z
    .string()
    .optional()
    .describe(
      "Why the studios section is missing, where it was asked for and could not be read. Its absence then says nothing about what the catalogue holds.",
    ),
  created: z.string().nullable(),
  updated: z.string().nullable(),
  cached: z.boolean().optional().describe("Present when the answer came from the in-memory store."),
  notes: z.array(z.string()),
});

/**
 * One shape covering a performer and a marker, for the reason given above.
 */
export const getPerformerOutput = performerSchema
  .partial()
  .extend({
    id: z.string(),
    source: z.string(),
    source_url: z.string(),
    retrieved_at: retrievedAtSchema,
    status: statusSchema,
    notes: z.array(z.string()),
    merged_into: z
      .string()
      .nullable()
      .optional()
      .describe("Present on a marker: the identifier that continues this record."),
    former_name: z
      .string()
      .nullable()
      .optional()
      .describe("Present on a marker: the name the record carried."),
    scene_count: z
      .number()
      .nullable()
      .optional()
      .describe(
        "Scenes this catalogue has indexed crediting this performer. A settled record naming a career spanning decades can report zero, which measures coverage and states nothing about a person's work. Null on a marker, since the count belongs to the record that continues it.",
      ),
  })
  .describe(
    "A performer when 'status' is 'established'. When it is 'deleted' or 'merged' this is a marker: it carries the identifier, the catalogue, the successor, the identifiers folded in and the former name, and no field describing a person.",
  );

const sceneRowSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string().nullable(),
  release_date: dateSchema,
  duration_seconds: z.number().nullable(),
  studio: z.string().nullable(),
  performers: z.array(z.string()),
  status: statusSchema,
  created: z
    .string()
    .nullable()
    .optional()
    .describe("Carried when the rows were sorted on it, so the order can be read on the rows."),
  updated: z.string().nullable().optional().describe("Carried on the same terms as 'created'."),
  retrieved_at: retrievedAtSchema,
  source_url: z.string(),
});

const windowSchema = z
  .object({
    page: z
      .number()
      .describe(
        "The page asked for. A catalogue whose search takes no page is named in 'per_source' as not having received it, and its rows are a first page.",
      ),
    limit: z.number(),
    page_received_by_all: z
      .literal(false)
      .optional()
      .describe(
        "Present when a catalogue named in 'per_source' could take no page and answered its first, so its rows repeat a first page rather than covering the one asked for.",
      ),
  })
  .optional()
  .describe(
    "The window this answer covers, per catalogue. An emptiness here is an emptiness inside that window.",
  );

const orderingSchema = z
  .string()
  .describe(
    "How the order was built. The catalogues publish no score in common, so rows interleave and nothing is ranked across them.",
  );

export const searchScenesOutput = z.object({
  query: z.string().optional(),
  cached: z.boolean().optional().describe("Present when the answer came from the in-memory store."),
  results: z.array(sceneRowSchema),
  result_count: z
    .number()
    .describe("Rows returned here. Counts are never added across catalogues."),
  ordering: orderingSchema,
  window: windowSchema,
  per_source: z.array(sourceReportSchema),
  notes: z.array(z.string()),
});

export const searchPerformersOutput = z.object({
  query: z.string().optional(),
  cached: z.boolean().optional().describe("Present when the answer came from the in-memory store."),
  results: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      name: z.string().nullable(),
      disambiguation: z.string().nullable(),
      aliases: z.array(z.string()),
      country: z.string().nullable(),
      birth_date: dateSchema,
      career_start_year: z.number().nullable(),
      career_end_year: z.number().nullable(),
      scene_count: z
        .number()
        .nullable()
        .describe("Scenes that catalogue has indexed crediting this performer."),
      status: statusSchema,
      created: z
        .string()
        .nullable()
        .optional()
        .describe("Carried when the rows were sorted on it, so the order can be read on the rows."),
      updated: z.string().nullable().optional().describe("Carried on the same terms as 'created'."),
      retrieved_at: retrievedAtSchema,
      source_url: z.string(),
    }),
  ),
  result_count: z.number(),
  ordering: orderingSchema,
  window: windowSchema,
  per_source: z.array(sourceReportSchema),
  notes: z.array(z.string()),
});

export const findByFingerprintOutput = z.object({
  asked: z.array(z.object({ hash: z.string(), algorithm: z.string() })),
  matches: z.array(
    z.object({
      algorithm: z.enum(["MD5", "OSHASH", "PHASH"]),
      match_kind: z
        .enum(["exact_file", "perceptual_similarity"])
        .describe(
          "'exact_file' means the same file, byte for byte. 'perceptual_similarity' means images that resemble each other, which covers a re-encode, a crop and a different scene from one shoot, and is no evidence that two files are the same.",
        ),
      scene: z.object({
        id: z.string(),
        source: z.string(),
        title: z.string().nullable(),
        release_date: dateSchema,
        studio: z.string().nullable(),
        performers: z.array(z.string()),
        source_url: z.string(),
      }),
      fingerprint: fingerprintSchema.nullable(),
    }),
  ),
  match_count: z.number().describe("Matches returned: one per scene per fingerprint it carries."),
  scenes_matched: z.number().describe("Distinct scenes behind those matches."),
  unattributed: z
    .number()
    .describe(
      "Scenes a catalogue answered with while returning none of the fingerprints asked for. Which hash reached them is unknown, which is kept apart from a catalogue that found nothing.",
    ),
  per_source: z.array(sourceReportSchema),
  notes: z.array(z.string()),
});
