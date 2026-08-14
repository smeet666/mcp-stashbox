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
 * Each row carries the day its surface was read from the catalogue itself, so a
 * claim here is a claim with a date on it.
 */

import {
  CAPABILITIES,
  FACETED_SEARCH,
  INSTANCES,
  supports,
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
  /** What it was measured answering. Unchanged by whether a key is held. */
  answers: string[];
  /** What it publishes no such thing for, which is a limit it has. */
  lacks: string[];
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
    measured_at: spec.measuredAt,
  }));

  const notes: string[] = [
    "What a catalogue answers is what it was measured answering, on the day named beside it. A key held for it is a fact about this install and changes none of that.",
    "Counts from two catalogues are never added. They index corpora that overlap by an amount none of them publishes, so one thing held by both is a record on each.",
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
