/**
 * The shape every search has in common, run once for both of them.
 *
 * A search asks each catalogue that can take the question, reads what came
 * back, and then owes the caller three things the rows alone never say: what
 * became of every catalogue, how the order was built, and why an emptiness is
 * empty. Written out at each route, that sequence existed twice and the two
 * copies drifted; stated here, a rule added to it reaches both searches or
 * reaches neither.
 *
 * The store is written to only where the answer is worth keeping. An answer
 * holding a catalogue that failed would turn one bad moment into a lasting
 * statement about that catalogue, and an answer whose emptiness could not be
 * explained would replay a check nobody completed.
 */

import type { Read, RowsResult, SourceReport } from "../types.js";
import { cacheKey } from "./cache.js";
import type { RouteContext } from "./client.js";
import type { InstanceId } from "./instances.js";
import type { IdentifierList } from "./narrowings.js";
import { checkNarrowings, nothingChecked, settled } from "./resolve.js";
import { contributorsOf, interleave, orderingOf, type Contribution } from "./rows.js";
import { inRegistryOrder, type Ask } from "./sources.js";

export interface SearchRun<T> {
  /** The route, which belongs in the key so two routes never share an answer. */
  operation: string;
  /** Everything the question varies on, the sections asked for included. */
  params: Record<string, unknown>;
  asks: Ask[];
  unasked: SourceReport[];
  /** The lists an emptiness would be checked against. */
  lists: readonly IdentifierList[];
  /** Whether any catalogue was actually given one of those identifiers. */
  narrowedOnIdentifiers: boolean;
  /** The catalogues this call was allowed to reach. */
  sources: readonly InstanceId[] | undefined;
  sorted: string | undefined;
  ask: (ask: Ask) => Promise<Contribution<T> | SourceReport>;
}

export async function runSearch<T>(
  ctx: RouteContext,
  run: SearchRun<T>,
): Promise<Read<RowsResult<T>>> {
  const key = cacheKey({
    instance: run.asks.map((ask) => ask.spec.id).join(","),
    operation: run.operation,
    params: run.params,
  });
  const held = ctx.cache.get(key) as RowsResult<T> | undefined;
  if (held !== undefined) return { data: held, cached: true };

  const outcomes = await Promise.all(run.asks.map((ask) => run.ask(ask)));
  const contributions: Contribution<T>[] = [];
  const reports: SourceReport[] = [...run.unasked];
  for (const outcome of outcomes) {
    if ("report" in outcome) {
      contributions.push(outcome);
      reports.push(outcome.report);
    } else {
      reports.push(outcome);
    }
  }

  const rows = interleave(contributions.map((contribution) => contribution.rows));
  // The check explains an emptiness a narrowing produced, so it runs only where
  // a catalogue looked and where one of those identifiers reached it. Where
  // every catalogue asked failed, the emptiness is the failure's and nothing
  // about an identifier would explain it.
  const looked = reports.some((report) => report.state === "answered");
  const checked =
    rows.length === 0 && looked && run.narrowedOnIdentifiers
      ? await checkNarrowings(ctx, run.lists, askable(ctx.configured, run.sources))
      : nothingChecked();

  const result: RowsResult<T> = {
    rows,
    perSource: inRegistryOrder(reports),
    ordering: orderingOf(contributorsOf(reports), run.sorted),
    ...(checked.foldedNarrowings.length > 0 ? { foldedNarrowings: checked.foldedNarrowings } : {}),
    ...(checked.absentNarrowings.length > 0 ? { absentNarrowings: checked.absentNarrowings } : {}),
    ...(checked.uncheckedNarrowings.length > 0
      ? { uncheckedNarrowings: checked.uncheckedNarrowings }
      : {}),
  };

  // An answer holding a catalogue that failed is not the answer that was asked
  // for. Neither is one whose rows were all lost in the reading: stored, it
  // replays this client's failure as a catalogue's emptiness for the whole
  // lifetime of the entry.
  const everyRowLost = reports.some((report) => !report.count && report.skipped);
  const worthKeeping =
    settled(checked) && !everyRowLost && !reports.some((report) => report.state === "failed");
  if (worthKeeping) ctx.cache.set(key, result);

  const skipped = reports.reduce((lost, report) => lost + (report.skipped ?? 0), 0);
  return { data: result, cached: false, ...(skipped > 0 ? { skipped } : {}) };
}

/** The catalogues a check may reach, which are the ones this call was allowed. */
function askable(
  configured: readonly InstanceId[],
  sources: readonly InstanceId[] | undefined,
): InstanceId[] {
  return configured.filter((id) => sources === undefined || sources.includes(id));
}
