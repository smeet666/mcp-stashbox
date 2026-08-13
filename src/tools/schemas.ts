/**
 * The contract each tool publishes for what it answers.
 *
 * Every tool declares an `outputSchema`, and every key any answer publishes is
 * declared at the path it is published on. A key published and undeclared is
 * invisible to a caller reading the contract rather than the prose, and a key
 * declared and never emitted is a promise nothing keeps: the two lists are the
 * same list, which is why this file is the one place either is written.
 *
 * The descriptions carry the reasons. A field that can be read for something it
 * is not says what it does not mean, since a schema-driven caller never reads
 * the sentences the text block carries.
 */

import { z } from "zod";

import { ERROR_CODES } from "../errors.js";
import {
  fingerprintRow,
  foldableStatus,
  identifierField,
  performerRecord,
  sceneRecord,
  sourceId,
} from "./recordSchemas.js";

/* ----------------------------------------------------- what a catalogue did */

/**
 * What one catalogue did with the question.
 *
 * The three states are kept apart because collapsing them is the failure this
 * server exists to prevent, and the four narrowing fields are four because they
 * answer four different questions.
 */
export const sourceReport = z.object({
  source: sourceId,
  name: z.string().optional().describe("The catalogue's own name, as an answer credits it."),
  state: z
    .enum(["answered", "failed", "absent"])
    .describe(
      "What became of this catalogue: 'answered' looked and said what it holds, even where that is nothing; 'failed' could not answer; 'absent' was never asked. Only 'answered' is evidence about the world.",
    ),
  count: z
    .number()
    .optional()
    .describe("Rows this catalogue contributed. Present where it answered, and absent otherwise."),
  records: z
    .number()
    .optional()
    .describe(
      "Distinct records behind those rows, where one record can answer more than one thing that was asked.",
    ),
  unattributed: z
    .number()
    .optional()
    .describe(
      "Records it answered with that carry none of what was asked about. Which one reached them is unknown, which is a different fact from a catalogue finding nothing.",
    ),
  skipped: z
    .number()
    .optional()
    .describe(
      "Rows it answered with that came back unreadable and were left out. They are missing from the rows and from the counts, and their absence says nothing about what this catalogue holds.",
    ),
  index_total: z
    .number()
    .optional()
    .describe(
      "What its index holds for this question, beyond the page returned. Absent on a catalogue publishing no such count.",
    ),
  fields_searched: z
    .array(z.string())
    .optional()
    .describe("The fields its text index read, claimed only where one was consulted."),
  narrowings_not_received: z
    .array(z.string())
    .optional()
    .describe(
      "Narrowings this catalogue cannot receive, so the rows here were never narrowed by them. This is the one field that says a catalogue cannot do something.",
    ),
  narrowings_outside_this_route: z
    .array(z.string())
    .optional()
    .describe(
      "Narrowings this route does not take, where another route of the same catalogue does. Writing words alongside typed arguments picks the full-text route, which reads words alone, so this states nothing about what the catalogue can be given.",
    ),
  narrowings_naming_no_record_here: z
    .array(z.string())
    .optional()
    .describe(
      "Narrowings written with identifiers no record of this catalogue carries. It says only that nothing here was named, and nothing about what this catalogue holds.",
    ),
  narrowings_received_in_part: z
    .array(z.string())
    .optional()
    .describe(
      "Narrowings that reached this catalogue shorn of the identifiers another catalogue minted, so it narrowed on a fraction of what was written.",
    ),
  arguments_with_nothing_to_do: z
    .array(z.string())
    .optional()
    .describe(
      "Arguments this question gave nothing to select on, so they shaped no request at all.",
    ),
  algorithms_not_searched: z
    .array(z.string())
    .optional()
    .describe(
      "Fingerprint algorithms this catalogue's lookup does not search, so they were never put to it and its silence is no evidence about them.",
    ),
  sections_not_carried: z
    .array(z.string())
    .optional()
    .describe(
      "Blocks asked for that this route never asks a catalogue for, so no row carries one and its absence is the route rather than a record holding none of it.",
    ),
  reason: z.string().optional().describe("Why it was not asked, or what went wrong where it was."),
  moment: z
    .string()
    .optional()
    .describe("Which moment failed, such as the search or the reading of one record."),
  error: z
    .enum(ERROR_CODES)
    .optional()
    .describe(
      "The code the failure carries. A failure is a statement about this exchange, never about what the catalogue holds.",
    ),
});

/* ----------------------------------------------- what every answer carries */

const notes = z
  .array(z.string())
  .describe(
    "What the rows do not establish, in sentences: how they are ordered, which catalogues are missing from them, and why an emptiness is empty.",
  );

const cached = z
  .boolean()
  .optional()
  .describe(
    "The answer was replayed from this client's store, so no catalogue was asked for it and each is reported as saying what it said when it was first read.",
  );

const window = z
  .object({
    page: z.number().describe("The page asked for."),
    limit: z.number().describe("How many rows one page was asked to carry."),
  })
  .optional()
  .describe(
    "The page the rows were asked for. Absent where no catalogue answered, since an emptiness that is a failure is no emptiness inside a window.",
  );

const rowsSkipped = z
  .number()
  .optional()
  .describe(
    "Rows inside the records listed here that could not be read, counted across them. They are missing from what each record shows of its own lists.",
  );

const foldedNarrowings = z
  .array(
    z.object({
      given: identifierField.describe("The identifier as it was written."),
      successor: identifierField
        .nullable()
        .describe("The record it now addresses, null on one the catalogue withdrew."),
      status: foldableStatus,
    }),
  )
  .optional()
  .describe(
    "Identifiers a narrowing was written with that their catalogue has folded. A folded identifier narrows to nothing because the rows moved, so the emptiness is about the identifier.",
  );

const absentNarrowings = z
  .array(identifierField)
  .optional()
  .describe(
    "Identifiers whose catalogue holds no record for them, so nothing there answers to them.",
  );

const uncheckedNarrowings = z
  .array(identifierField)
  .optional()
  .describe(
    "Identifiers whose record could not be read, so whether they still address what they name is unsettled.",
  );

const perSource = z
  .array(sourceReport)
  .describe("What each catalogue did with the question, one line per catalogue.");

/* -------------------------------------------------------------- the search */

const rowsAnswer = {
  per_source: perSource,
  ordering: z
    .string()
    .describe(
      "How the order was built. The catalogues share no score, so rows from several of them are never ranked against each other.",
    ),
  result_count: z.number().describe("How many rows this answer carries."),
  window,
  rows_skipped: rowsSkipped,
  folded_narrowings: foldedNarrowings,
  absent_narrowings: absentNarrowings,
  unchecked_narrowings: uncheckedNarrowings,
  cached,
  notes,
};

export const searchScenesOutput = z.object({
  results: z
    .array(sceneRecord)
    .describe(
      "One page of scenes per catalogue asked, gathered into one list. Counts are per catalogue and are never added: one scene held by two of them is a separate record on each.",
    ),
  ...rowsAnswer,
});

export const searchPerformersOutput = z.object({
  results: z
    .array(performerRecord)
    .describe(
      "One page of performers per catalogue asked, gathered into one list. Counts are per catalogue and are never added: one person held by two of them is a separate record on each.",
    ),
  ...rowsAnswer,
});

/* ---------------------------------------------------------- the one record */

export const getSceneOutput = sceneRecord.extend({ cached, notes });

export const getPerformerOutput = performerRecord.extend({ cached, notes });

/* ------------------------------------------------------------- the lookup */

/**
 * The record a hash reached, as much of it as a fingerprint answer states.
 *
 * A fingerprint identifies a file, so a match names the release, what its
 * identifier addresses now, who it credits and what it lost while being read.
 * The rest of the record is read from its identifier, and declaring fields this
 * answer never fills would promise a caller something nothing keeps.
 */
const matchedRecord = sceneRecord.pick({
  id: true,
  source: true,
  source_url: true,
  retrieved_at: true,
  status: true,
  title: true,
  code: true,
  duration_seconds: true,
  release_date: true,
  release_date_unreadable: true,
  studio: true,
  performers: true,
  rows_skipped: true,
  rows_skipped_in: true,
});

export const findByFingerprintOutput = z.object({
  matches: z
    .array(
      z.object({
        scene: matchedRecord,
        algorithm: z
          .enum(["MD5", "OSHASH", "PHASH"])
          .describe("The algorithm of the hash that reached this record."),
        match_kind: z
          .enum(["exact_file", "perceptual_similarity"])
          .describe(
            "What the match claims. 'exact_file' is the same bytes. 'perceptual_similarity' covers a re-encode, a crop and another scene from one shoot, and is no evidence that two files are the same.",
          ),
        fingerprint: fingerprintRow
          .nullable()
          .describe(
            "The fingerprint the record carries for that hash, null where the record publishes none, so a caller can see which hash reached it.",
          ),
      }),
    )
    .describe(
      "One entry per hash that reached a record, so one record answering two hashes appears twice.",
    ),
  match_count: z.number().describe("How many matches this answer carries."),
  scenes_matched: z
    .number()
    .describe(
      "How many distinct records those matches stand on, which is never more than they are.",
    ),
  unattributed: z
    .number()
    .describe(
      "Records the catalogues answered with while carrying none of the hashes asked. Which hash reached them is unknown, which is a different fact from a catalogue finding nothing.",
    ),
  asked: z
    .array(
      z.object({
        hash: z.string().describe("The hash as it was written."),
        algorithm: z
          .enum(["MD5", "OSHASH", "PHASH"])
          .describe("The algorithm it was said to be computed with."),
      }),
    )
    .describe("The fingerprints put to the catalogues, each named once."),
  per_source: perSource,
  rows_skipped: rowsSkipped,
  cached,
  notes,
});
