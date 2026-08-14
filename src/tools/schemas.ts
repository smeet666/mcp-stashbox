/**
 * The shapes an answer is published under, each written once.
 *
 * A schema is a promise a caller pays for before asking anything: the tool list
 * is read at the opening of every session. So each shared shape is one object,
 * referred to by every tool that answers with it, rather than a paragraph of
 * descriptions written out per tool.
 *
 * Every description here says what the field means, not what it is called. A
 * caller reading the schema is deciding whether to trust a number, and the one
 * thing they need is what it counts.
 */

import { z } from "zod";

/** What one catalogue did with a question. Its three states are the whole point. */
export const perSource = z.object({
  source: z.string().describe("The catalogue this row is about."),
  name: z.string().optional().describe("The name that catalogue calls itself."),
  state: z
    .enum(["answered", "failed", "absent"])
    .describe(
      "'answered' looked, and a count of zero means it found nothing. 'failed' could not answer, and states nothing about what it holds. 'absent' was never asked. Only the first is evidence about the world.",
    ),
  count: z
    .number()
    .optional()
    .describe(
      "Rows it contributed. Never added to another catalogue's: they index corpora that overlap by an amount none of them publishes.",
    ),
  index_total: z
    .number()
    .optional()
    .describe("What its own index holds for this question, the rows on this page included."),
  index_total_over_any_word: z
    .boolean()
    .optional()
    .describe(
      "The total counts rows carrying any word of the query, its text index reading them apart.",
    ),
  skipped: z
    .number()
    .optional()
    .describe("Rows it answered with that this client could not read and left out."),
  records: z.number().optional().describe("Distinct records behind its rows."),
  unattributed: z
    .number()
    .optional()
    .describe("Records it answered with while carrying none of what was asked about."),
  narrowings_not_received: z
    .array(z.string())
    .optional()
    .describe(
      "Narrowings this catalogue cannot receive. This is the one field that says a catalogue cannot do something.",
    ),
  narrowings_naming_no_record: z
    .array(z.string())
    .optional()
    .describe("Narrowings written only with identifiers another catalogue minted."),
  narrowings_received_in_part: z.array(z.string()).optional(),
  algorithms_not_searched: z
    .array(z.string())
    .optional()
    .describe("Fingerprint algorithms its lookup does not search, so they were never put to it."),
  reason: z.string().optional().describe("Why it was not asked, or what went wrong."),
  moment: z.string().optional().describe("Which moment failed."),
  error: z
    .enum([
      "not_found",
      "invalid_input",
      "rate_limited",
      "parse_failure",
      "network_error",
      "timeout",
    ])
    .optional(),
});

/** A scalar of a card, with the catalogues that said it and the readings that lost. */
const cardValue = z.object({
  value: z.unknown().describe("The reading the preference named, null where none published one."),
  agreed_by: z
    .array(z.string())
    .describe("The catalogues that published this reading. Two agreeing is evidence of its own."),
  disagreed: z
    .array(z.object({ source: z.string(), value: z.unknown() }))
    .optional()
    .describe(
      "The readings nobody preferred, published rather than dropped: choosing between them is a policy, and a policy applied in silence is a claim nobody can check.",
    ),
});

/** One catalogue's record, named the way that catalogue names it. */
const entryAt = z.object({ source: z.string(), id: z.string() });

/** One entry of a united list, naming every catalogue that published it. */
const cardEntry = z.object({
  value: z.unknown(),
  published_by: z
    .array(z.string())
    .describe(
      "Every catalogue that published this very record. A shared name is no join, so an entry one catalogue minted names that one.",
    ),
  also_at: z
    .array(entryAt)
    .optional()
    .describe("What this same record is called on another catalogue, from a link joining the two."),
  same_name_as: z
    .array(entryAt)
    .optional()
    .describe(
      "A record another catalogue published under a matching name. A resemblance, never a join.",
    ),
});

/** One record, read on every catalogue that holds it. */
export const card = z.object({
  kind: z.string(),
  fields: z
    .record(z.string(), z.union([cardValue, z.array(cardEntry)]))
    .describe(
      "Each field of the record. A scalar carries the catalogues that said it; a list is the union, each entry naming who published it.",
    ),
  counts: z
    .record(
      z.string(),
      z.array(
        z.object({
          source: z.string(),
          value: z.number().nullable(),
          state: z.enum(["answered", "failed", "absent"]),
        }),
      ),
    )
    .describe(
      "Counts, one entry per catalogue asked and never added together. A null is read with the state beside it: a catalogue that publishes no such count, one that could not answer, and one nobody asked are three different facts.",
    ),
  held_by: z
    .array(
      z.object({
        source: z.string(),
        id: z.string().optional(),
        source_url: z.string().optional().describe("The address it was read at, which credits it."),
        retrieved_at: z.string().optional().describe("The moment this client read it there."),
        state: z.enum(["answered", "failed", "absent"]),
        status: z
          .enum(["established", "merged", "deleted"])
          .optional()
          .describe("What the identifier addresses there now. A folded record is held elsewhere."),
        error: z.string().optional(),
        reason: z.string().optional(),
      }),
    )
    .describe("Every catalogue asked, with the identifier the record carries there."),
  preferred: z
    .array(z.string())
    .describe(
      "The order the readings were preferred in. This is the policy that was applied, whether or not every catalogue in it answered.",
    ),
  read_from: z
    .array(z.string())
    .describe(
      "The catalogues that answered, in the order they were preferred. A policy and an outcome are two facts, and a reader deciding whether to change the policy needs both.",
    ),
  notes: z
    .array(z.string())
    .describe("What this answer does not establish, which is what makes it safe to act on."),
});

/** A row of a search, which names a record and is never consolidated. */
const row = z
  .object({
    id: z.string().describe("Written instance:uuid. The catalogue travels with the uuid."),
    source: z.string(),
    source_url: z
      .string()
      .describe("The address it was read from. Credit the catalogue and link it."),
    status: z.enum(["established", "merged", "deleted"]),
  })
  .loose();

/** A page of rows, whatever kind of thing the rows are records of. */
export const rowsOutput = {
  results: z.array(row),
  result_count: z.number().describe("How many rows this page carries."),
  per_source: z.array(perSource),
  ordering: z
    .string()
    .describe("How the rows were laid out, which a reader needs before reading the first."),
  window: z
    .object({ page: z.number(), limit: z.number() })
    .optional()
    .describe("The page a catalogue paged through, absent where none was given one."),
  cached: z.boolean().optional().describe("Replayed from this client's store."),
  notes: z.array(z.string()),
};

/** One record, consolidated. */
export const cardOutput = {
  card,
  per_source: z.array(perSource).optional(),
  cached: z.boolean().optional(),
};

/** What each catalogue was measured answering, and whether a key is held for it. */
export const sourcesOutput = {
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      web_url: z.string(),
      identifier_prefix: z.string().describe("The prefix a caller writes in front of a uuid."),
      key_configured: z
        .boolean()
        .describe("A fact about this install, and no fact about the catalogue."),
      env_var: z.string(),
      answers: z.array(z.string()).describe("What it was measured answering, on the day named."),
      lacks: z.array(z.string()).describe("What it publishes no such thing for."),
      evidence: z
        .string()
        .optional()
        .describe("What the two lists rest on: a route seen answering, or one a schema declares."),
      measured_at: z.string().describe("The day its surface was read from it."),
    }),
  ),
  notes: z.array(z.string()),
};

/** The records a set of hashes reached, each as a consolidated card. */
export const fingerprintOutput = {
  matches: z.array(
    z.object({
      scene: card,
      matched_by: z
        .array(
          z.object({
            hash: z.string(),
            algorithm: z.enum(["MD5", "OSHASH", "PHASH"]),
            sources: z.array(z.string()),
          }),
        )
        .describe(
          "Every hash that reached this record, each naming the catalogues it reached it on. A hash a catalogue does not search reached nothing there.",
        ),
      match_kind: z
        .enum(["exact_file", "perceptual_similarity"])
        .describe(
          "'exact_file' names the same bytes. 'perceptual_similarity' covers a re-encode, a crop and another scene from one shoot, and is no evidence that two files are the same.",
        ),
    }),
  ),
  match_count: z.number().describe("One per record reached, whatever number of hashes reached it."),
  records_named: z
    .number()
    .describe(
      "Distinct records an exact hash named. Two hashes reaching one record count once, and a perceptual match names no record.",
    ),
  resemblances: z
    .number()
    .describe(
      "Matches a perceptual hash reached, each a likeness and no claim about any file's bytes.",
    ),
  unattributed: z
    .number()
    .describe(
      "Records the catalogues answered with that carry none of the hashes asked. Which hash reached them is unknown, so they stand as no match and are counted apart.",
    ),
  unmatched: z
    .array(z.object({ hash: z.string(), algorithm: z.string() }))
    .describe(
      "The hashes put to a catalogue that answered, which reached no record there. A catalogue named as unasked says nothing about them either way.",
    ),
  not_searched: z
    .array(z.object({ hash: z.string(), algorithm: z.string(), sources: z.array(z.string()) }))
    .describe(
      "Hashes and the catalogues that answered without searching their algorithm, so they were never put to those. Nobody looked there, which is no evidence about the files behind them.",
    ),
  asked: z.array(z.object({ hash: z.string(), algorithm: z.string() })),
  per_source: z.array(perSource),
  cached: z.boolean().optional(),
  notes: z.array(z.string()),
};
