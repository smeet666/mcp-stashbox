/**
 * The registry, published as data.
 *
 * A claim about a catalogue held in prose is a claim nothing can check: no
 * suite can put a sentence to a catalogue and see whether it holds. A table
 * can, and the live suite walks exactly what this file publishes, asking each
 * catalogue every question the table says it answers.
 *
 * Two facts stay apart here, because a caller acts on one of them and can do
 * nothing about the other. **A missing key is the operator's to fix.** **A route
 * a catalogue does not answer is nobody's.** Folded into one field they read
 * alike, and a caller who reads "unavailable" cannot tell which they have met.
 *
 * Each row carries the kind of evidence its capabilities rest on and the day
 * that evidence was gathered, so a claim here is a claim a reader can weigh and
 * a claim with a date on it. A route seen answering and a route a schema
 * declares are two different things to know about a catalogue, and a caller
 * planning a call acts differently on each.
 */

import {
  CAPABILITIES,
  FACETED_SEARCH,
  INSTANCES,
  supports,
  type Evidence,
  type InstanceId,
  type InstanceSpec,
} from "../stashbox/instances.js";

/** One catalogue, as `get_sources` publishes it. */
export interface SourceDescription {
  id: InstanceId;
  name: string;
  web_url: string;
  /** The prefix a caller writes in front of a uuid to address this catalogue. */
  identifier_prefix: InstanceId;
  /** Whether this server holds a key for it, which is a fact about this install. */
  key_configured: boolean;
  env_var: string;
  /** What it was read to answer. Unchanged by whether a key is held. */
  answers: string[];
  /** What it publishes no such thing for, which is a limit it has. */
  lacks: string[];
  /**
   * What the two lists above rest on: routes put to the catalogue and seen
   * answered, or routes its own schema declares and nothing has exercised.
   */
  evidence: Evidence;
  /** The day that evidence was gathered from the catalogue itself. */
  measured_at: string;
}

export interface SourcesAnswer {
  sources: SourceDescription[];
  notes: string[];
}

/**
 * Every catalogue the registry declares, keyed or not.
 *
 * A catalogue is never left out for want of a key: dropped from the list, its
 * absence from an answer reads as a catalogue that holds nothing, which is the
 * emptiness this whole server exists to refuse.
 */
export function describeSources(held: { configured: readonly InstanceId[] }): SourcesAnswer {
  const sources = INSTANCES.map((spec) => ({
    id: spec.id,
    name: spec.name,
    web_url: spec.webBase,
    identifier_prefix: spec.id,
    key_configured: held.configured.includes(spec.id),
    env_var: spec.envVar,
    answers: [
      ...CAPABILITIES.filter((capability) => supports(spec, capability)),
      ...(spec.facetedSearch ? [FACETED_SEARCH] : []),
    ],
    lacks: [
      ...CAPABILITIES.filter((capability) => !supports(spec, capability)),
      ...(spec.facetedSearch ? [] : [FACETED_SEARCH]),
    ],
    evidence: spec.evidence,
    measured_at: spec.measuredAt,
  }));

  const notes: string[] = [
    "What a catalogue answers is what the evidence beside its row was gathered from, on the day named there: a route put to the catalogue and seen answered, or a route the catalogue's own schema declares. A key held for it is a fact about this install and changes neither.",
    "Counts from two catalogues are never added. They index corpora that overlap by an amount none of them publishes, so one thing held by both is a record on each.",
    ...INSTANCES.filter((spec) => spec.evidence === "declared_in_schema").map(readFromItsSchema),
    ...INSTANCES.filter((spec) => !spec.facetedSearch).map(limitOnItsSearches),
  ];

  const reachable = sources.filter((one) => one.key_configured);
  if (reachable.length === 0) {
    notes.unshift(
      "This server holds a key for no catalogue, so every answer it gives is empty for want of a key rather than for want of a record. Each row below names the variable to set.",
    );
  }

  return { sources, notes };
}

/**
 * A catalogue whose row was read from its schema, said as one.
 *
 * A caller plans calls from this table, and a row read off a GraphQL schema
 * carries route names, record fields and result shapes the catalogue publishes
 * about itself. What comes back when the route is called is a second fact, and
 * this sentence is what keeps a reader from taking the first for it. The
 * faceted search is named on its own, since a schema declares an input and
 * cannot state that the rows honour it.
 */
function readFromItsSchema(spec: InstanceSpec): string {
  return `${spec.name}: no request has been put to it from this install, and every capability listed for it was read from its own GraphQL schema on ${spec.measuredAt}, which is what the catalogue declares about itself. That covers ${FACETED_SEARCH} too: a schema declares the input a faceted route takes, and rows honouring the narrowings written to it are what a request would show.`;
}

/**
 * The searches a catalogue answers, said with the limit measured on them.
 *
 * The table is what a caller plans a session from, so a capability listed there
 * with its limit left to the answer of a call already cost them the call. This
 * sentence names the searches, the form they take, and the word the same row
 * carries among what the catalogue lacks.
 */
function limitOnItsSearches(spec: InstanceSpec): string {
  return `${spec.name} answers a search of words alone: its faceted routes do not apply the narrowings written to them, so a question written with typed arguments reports it as never asked. The searches listed for it are that text form, which is why ${FACETED_SEARCH} is among what it lacks.`;
}
