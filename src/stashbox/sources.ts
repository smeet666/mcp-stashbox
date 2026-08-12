/**
 * Which catalogues a question reaches, and what is said about the ones it does
 * not.
 *
 * The rule this file keeps is the one the whole client exists for: a catalogue
 * that answered, one that could not answer, and one that was never asked are
 * three different states, and only the first is evidence about the world. Every
 * catalogue the registry declares therefore leaves here with a report, including
 * the ones no request went to, and each of those says in its own words why it
 * was left out.
 */

import { StashboxError } from "../errors.js";
import type { SourceReport } from "../types.js";
import {
  INSTANCES,
  supports,
  type Capability,
  type InstanceId,
  type InstanceSpec,
} from "./instances.js";

/** One catalogue a request will go to, with the key it is presented with. */
export interface Ask {
  spec: InstanceSpec;
  apiKey: string;
}

/** The catalogues to ask, and the reports of the ones nobody will ask. */
export interface Chosen {
  asks: Ask[];
  unasked: SourceReport[];
}

/**
 * The catalogues a route can put its question to.
 *
 * Three reasons keep one out, and each is a different fact: no key was
 * configured for it, the caller's own list left it out, or it answers no such
 * route. A caller reading "absent" needs to know which, since two of the three
 * are theirs to change.
 */
export function chooseSources(
  keyFor: (id: InstanceId) => string | undefined,
  capability: Capability,
  route: string,
  sources: readonly InstanceId[] | undefined,
): Chosen {
  const asks: Ask[] = [];
  const unasked: SourceReport[] = [];

  for (const spec of INSTANCES) {
    const apiKey = keyFor(spec.id);
    if (apiKey === undefined) {
      unasked.push(
        absentReport(
          spec,
          `No key is configured for ${spec.name}, so it was never asked. Set ${spec.envVar} to read it.`,
        ),
      );
      continue;
    }
    if (sources !== undefined && !sources.includes(spec.id)) {
      unasked.push(
        absentReport(
          spec,
          `The catalogues named in this call left ${spec.name} out, so it was never asked.`,
        ),
      );
      continue;
    }
    if (!supports(spec, capability)) {
      unasked.push(
        absentReport(spec, `${spec.name} answers no ${route} of its own, so it was never asked.`),
      );
      continue;
    }
    asks.push({ spec, apiKey });
  }

  return { asks, unasked };
}

/** A catalogue nobody put the question to, with the reason it stayed out. */
export function absentReport(spec: InstanceSpec, reason: string): SourceReport {
  return { source: spec.id, name: spec.name, state: "absent", reason };
}

/**
 * A catalogue that could not answer, named with the moment it failed at.
 *
 * A failure carries no count: a number of rows beside a catalogue that returned
 * none of them reads as a catalogue that looked. Anything thrown from outside
 * the declared taxonomy is reported in this client's own words, since an
 * engine's sentence describes this process rather than the exchange.
 */
export function failureReport(
  spec: InstanceSpec,
  cause: unknown,
  moment: string,
  extra: Partial<SourceReport> = {},
): SourceReport {
  const known = cause instanceof StashboxError ? cause : undefined;
  return {
    source: spec.id,
    name: spec.name,
    state: "failed",
    moment,
    reason:
      known?.message ??
      `${spec.name} could not answer ${moment}, and what came back states nothing about what it holds.`,
    error: known?.code ?? "parse_failure",
    ...extra,
  };
}

/** Every report the registry declares a catalogue for, in the order it declares them. */
export function inRegistryOrder(reports: readonly SourceReport[]): SourceReport[] {
  const byId = new Map(reports.map((report) => [report.source, report]));
  const ordered: SourceReport[] = [];
  for (const spec of INSTANCES) {
    const report = byId.get(spec.id);
    if (report !== undefined) ordered.push(report);
  }
  return ordered;
}
