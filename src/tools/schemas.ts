/**
 * The shapes an answer is published under, each written once.
 *
 * A schema is a promise a caller pays for before asking anything: the tool list
 * is read at the opening of every session. Writing one record shape into every
 * tool that answers with a record multiplies the same paragraph of descriptions
 * by the number of tools, and the cost is real money on every conversation.
 *
 * So the shared shapes live in `$defs` and every tool refers to them. The
 * revision of the protocol this server speaks takes any JSON Schema 2020-12,
 * which is what makes that possible.
 */

/** Every shape more than one tool answers with, written once. */
export const DEFS: Record<string, unknown> = {
  identifier: {
    type: "string",
    description:
      "A record identifier, written instance:uuid. The same uuid names a different record on each catalogue, so the catalogue travels with it.",
  },
  state: {
    type: "string",
    enum: ["answered", "failed", "absent"],
    description:
      "What one catalogue did. 'answered' looked, and a count of zero means it found nothing. 'failed' could not answer, and states nothing about what it holds. 'absent' was never asked. Only the first is evidence about the world.",
  },
  per_source: {
    type: "object",
    additionalProperties: false,
    required: ["source", "state"],
    properties: {
      source: { type: "string", description: "The catalogue this row is about." },
      name: { type: "string", description: "The name that catalogue calls itself." },
      state: { $ref: "#/$defs/state" },
      count: {
        type: "integer",
        description:
          "Rows it contributed. Never added to another catalogue's count: they index corpora that overlap by an amount none of them publishes.",
      },
      index_total: {
        type: "integer",
        description: "What its own index holds for this question, the rows on this page included.",
      },
      skipped: {
        type: "integer",
        description: "Rows it answered with that this client could not read and left out.",
      },
      records: { type: "integer", description: "Distinct records behind its rows." },
      unattributed: {
        type: "integer",
        description: "Records it answered with while carrying none of what was asked about.",
      },
      narrowings_not_received: {
        type: "array",
        items: { type: "string" },
        description:
          "Narrowings this catalogue cannot receive. This is the one field that says a catalogue cannot do something.",
      },
      narrowings_naming_no_record_here: {
        type: "array",
        items: { type: "string" },
        description:
          "Narrowings written with identifiers another catalogue minted, which says nothing about this one.",
      },
      narrowings_received_in_part: {
        type: "array",
        items: { type: "string" },
        description: "Narrowings it received shorn of the identifiers another catalogue minted.",
      },
      algorithms_not_searched: {
        type: "array",
        items: { type: "string" },
        description:
          "Fingerprint algorithms its lookup does not search, so they were never put to it and its silence about them is no evidence.",
      },
      fields_searched: {
        type: "array",
        items: { type: "string" },
        description: "The fields its own index read for this question.",
      },
      reason: { type: "string", description: "Why it was not asked, or what went wrong." },
      moment: { type: "string", description: "Which moment failed." },
      error: {
        type: "string",
        enum: [
          "not_found",
          "invalid_input",
          "rate_limited",
          "parse_failure",
          "network_error",
          "timeout",
        ],
      },
    },
  },
  card_value: {
    type: "object",
    additionalProperties: false,
    required: ["value", "agreed_by"],
    properties: {
      value: {
        description: "The reading the preference named, null where no catalogue published one.",
      },
      agreed_by: {
        type: "array",
        items: { type: "string" },
        description:
          "The catalogues that published this reading. Two of them agreeing is evidence of its own.",
      },
      disagreed: {
        type: "array",
        description:
          "The readings nobody preferred, published rather than dropped: choosing between them is a policy, and a policy applied in silence is a claim nobody can check.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["source", "value"],
          properties: { source: { type: "string" }, value: {} },
        },
      },
    },
  },
  card_entry: {
    type: "object",
    additionalProperties: false,
    required: ["value", "published_by"],
    properties: {
      value: { description: "One entry of the union of what the catalogues published." },
      published_by: {
        type: "array",
        items: { type: "string" },
        description: "Every catalogue that published this entry.",
      },
    },
  },
  card_count: {
    type: "object",
    additionalProperties: false,
    required: ["source", "value"],
    properties: {
      source: { type: "string" },
      value: {
        type: ["integer", "null"],
        description:
          "What that catalogue counted, null where it publishes no such count. Never added to another catalogue's.",
      },
    },
  },
  card_holder: {
    type: "object",
    additionalProperties: false,
    required: ["source", "state"],
    properties: {
      source: { type: "string" },
      id: { $ref: "#/$defs/identifier" },
      state: { $ref: "#/$defs/state" },
      status: {
        type: "string",
        enum: ["established", "merged", "deleted"],
        description:
          "What the identifier addresses on that catalogue now. A folded record is held under another identifier.",
      },
      error: { type: "string" },
      reason: { type: "string" },
    },
  },
  card: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "fields", "counts", "held_by", "preferred", "notes"],
    properties: {
      kind: { type: "string" },
      fields: {
        type: "object",
        description:
          "Each field of the record. A scalar carries the catalogues that said it; a list is the union, each entry naming who published it.",
        additionalProperties: {
          oneOf: [
            { $ref: "#/$defs/card_value" },
            { type: "array", items: { $ref: "#/$defs/card_entry" } },
          ],
        },
      },
      counts: {
        type: "object",
        description: "Counts, one entry per catalogue and never added together.",
        additionalProperties: { type: "array", items: { $ref: "#/$defs/card_count" } },
      },
      held_by: { type: "array", items: { $ref: "#/$defs/card_holder" } },
      preferred: {
        type: "array",
        items: { type: "string" },
        description: "The order the readings were preferred in, since choosing is a policy.",
      },
      notes: {
        type: "array",
        items: { type: "string" },
        description: "What this answer does not establish, which is what makes it safe to act on.",
      },
    },
  },
  row: {
    type: "object",
    required: ["id", "source", "source_url", "status"],
    properties: {
      id: { $ref: "#/$defs/identifier" },
      source: { type: "string" },
      source_url: {
        type: "string",
        description: "The address it was read from. Credit the catalogue and link it.",
      },
      status: { type: "string", enum: ["established", "merged", "deleted"] },
      name: { type: ["string", "null"] },
      title: { type: ["string", "null"] },
    },
  },
};

/**
 * The shapes one schema refers to, and everything those refer to in turn.
 *
 * A schema carrying a shape it never names costs a caller the same as one that
 * uses it: the tool list is read whole at the opening of a session, and every
 * byte of it is paid before a question is asked.
 */
function defsFor(...named: string[]): Record<string, unknown> {
  const held: Record<string, unknown> = {};
  const walk = (name: string): void => {
    if (held[name] !== undefined || DEFS[name] === undefined) return;
    held[name] = DEFS[name];
    for (const found of JSON.stringify(DEFS[name]).matchAll(/#\/\$defs\/([a-z_]+)/g)) {
      walk(found[1] ?? "");
    }
  };
  for (const name of named) walk(name);
  return held;
}

/** A page of rows, whatever kind of thing the rows are records of. */
export const rowsOutput = {
  type: "object",
  $defs: defsFor("row", "per_source"),
  required: ["results", "per_source", "result_count", "ordering", "notes"],
  properties: {
    results: { type: "array", items: { $ref: "#/$defs/row" } },
    result_count: { type: "integer", description: "How many rows this page carries." },
    per_source: { type: "array", items: { $ref: "#/$defs/per_source" } },
    ordering: {
      type: "string",
      description: "How the rows were laid out, which a reader needs before reading the first.",
    },
    window: {
      type: "object",
      additionalProperties: false,
      properties: { page: { type: "integer" }, limit: { type: "integer" } },
      description: "The page a catalogue paged through, absent where none was given one.",
    },
    cached: { type: "boolean", description: "Replayed from this client's store." },
    notes: { type: "array", items: { type: "string" } },
  },
};

/** One record, read on every catalogue that holds it. */
export const cardOutput = {
  type: "object",
  $defs: defsFor("card", "per_source"),
  required: ["card"],
  properties: {
    card: { $ref: "#/$defs/card" },
    per_source: { type: "array", items: { $ref: "#/$defs/per_source" } },
    cached: { type: "boolean" },
  },
};

/** What each catalogue was measured answering, and whether a key is held for it. */
export const sourcesOutput = {
  type: "object",
  required: ["sources", "notes"],
  properties: {
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "web_url",
          "identifier_prefix",
          "key_configured",
          "env_var",
          "answers",
          "lacks",
          "measured_at",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          web_url: { type: "string" },
          identifier_prefix: {
            type: "string",
            description: "The prefix a caller writes in front of a uuid to address this catalogue.",
          },
          key_configured: {
            type: "boolean",
            description:
              "Whether this install holds a key for it. A fact about this install, and no fact about the catalogue.",
          },
          env_var: { type: "string" },
          answers: {
            type: "array",
            items: { type: "string" },
            description: "What it was measured answering, on the day named beside it.",
          },
          lacks: {
            type: "array",
            items: { type: "string" },
            description: "What it publishes no such thing for, which is a limit it has.",
          },
          measured_at: { type: "string", description: "The day its surface was read from it." },
        },
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
};

/** The records a set of hashes reached, each as a consolidated card. */
export const fingerprintOutput = {
  type: "object",
  $defs: defsFor("card", "per_source"),
  required: ["matches", "match_count", "scenes_matched", "asked", "per_source", "notes"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scene", "algorithm", "match_kind"],
        properties: {
          scene: { $ref: "#/$defs/card" },
          algorithm: { type: "string", enum: ["MD5", "OSHASH", "PHASH"] },
          match_kind: {
            type: "string",
            enum: ["exact_file", "perceptual_similarity"],
            description:
              "What the match claims. 'exact_file' names the same bytes. 'perceptual_similarity' covers a re-encode, a crop and another scene from one shoot, and is no evidence that two files are the same.",
          },
        },
      },
    },
    match_count: { type: "integer" },
    scenes_matched: { type: "integer", description: "Distinct files behind the matches." },
    unattributed: {
      type: "integer",
      description: "Records answered with that carry none of the hashes asked.",
    },
    asked: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { hash: { type: "string" }, algorithm: { type: "string" } },
      },
    },
    per_source: { type: "array", items: { $ref: "#/$defs/per_source" } },
    cached: { type: "boolean" },
    notes: { type: "array", items: { type: "string" } },
  },
};
