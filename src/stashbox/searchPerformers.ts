/**
 * Performers read out of every catalogue that can take the question.
 *
 * The route publishes the same two paths a scene search does, and they carry the
 * same rule: a string of words runs the catalogue's own text index and every
 * typed argument written beside it stays behind, named in the report so a caller
 * never reads the rows as satisfying a narrowing no catalogue received.
 *
 * `performed_with` and `studio_id` take one identifier each. An identifier
 * minted by another catalogue reaches this one as nothing, which says nothing
 * about what this one holds, so it is reported apart from a narrowing the
 * catalogue cannot receive at all.
 */

import type { PerformerRecord, Read, RowsResult, SourceReport } from "../types.js";
import type { RouteContext } from "./client.js";
import type { GraphQLRequest } from "./graphql.js";
import { supports, type InstanceId, type InstanceSpec } from "./instances.js";
import { mapPerformer } from "./map.js";
import {
  bounded,
  emptiedBy,
  narrowingText,
  shareFor,
  singleIdentifier,
  type IdentifierList,
} from "./narrowings.js";
import {
  queryPerformersRequest,
  searchPerformersRequest,
  type Direction,
  type PerformerNarrowing,
  type PerformerSection,
  type PerformerSort,
} from "./queries.js";
import { arrayUnder, objectUnder } from "./read.js";
import { indexTotalOf, sortedClause, type Contribution } from "./rows.js";
import { runSearch } from "./searchRun.js";
import { absentReport, chooseSources, failureReport, type Ask } from "./sources.js";

export interface SearchPerformersInput {
  query?: string;
  name?: string;
  /** The free text a catalogue writes to tell two people of one name apart. */
  disambiguation?: string;
  /** A two-letter country code, as the catalogues store one. */
  country?: string;
  performedWith?: string;
  studioId?: string;
  sort?: PerformerSort;
  direction?: Direction;
  page?: number;
  limit?: number;
  sources?: readonly InstanceId[];
  sections?: readonly PerformerSection[];
}

const MOMENT = "the performer search";

const ROWS_PER_PAGE = 25;

interface Plan {
  query: string | undefined;
  name: string | undefined;
  disambiguation: string | undefined;
  country: string | undefined;
  lists: IdentifierList[];
  sort: PerformerSort | undefined;
  direction: Direction | undefined;
  page: number;
  limit: number;
  sections: readonly PerformerSection[];
}

export async function searchPerformers(
  ctx: RouteContext,
  input: SearchPerformersInput,
): Promise<Read<RowsResult<PerformerRecord>>> {
  const plan = readPlan(ctx.configured, input);
  const { asks, unasked } = chooseSources(
    ctx.keyFor,
    "search_performers",
    "performer search",
    input.sources,
  );

  const reached = asks.some((ask) =>
    plan.lists.some((list) => shareFor(list, ask.spec.id).uuids.length > 0),
  );

  return runSearch<PerformerRecord>(ctx, {
    operation: "search_performers",
    params: {
      query: plan.query ?? null,
      name: plan.name ?? null,
      disambiguation: plan.disambiguation ?? null,
      country: plan.country ?? null,
      ids: plan.lists.map((list) => [list.name, list.entries.map((entry) => entry.given)]),
      sort: plan.sort ?? null,
      direction: plan.direction ?? null,
      page: plan.page,
      limit: plan.limit,
      sections: [...plan.sections].sort(),
    },
    asks,
    unasked,
    lists: plan.lists,
    narrowedOnIdentifiers: reached,
    sources: input.sources,
    sorted: plan.query === undefined ? sortedClause(plan.sort, plan.direction) : undefined,
    ask: (ask) => askOne(ctx, ask, plan),
  });
}

function readPlan(configured: readonly InstanceId[], input: SearchPerformersInput): Plan {
  const lists: IdentifierList[] = [];
  if (input.performedWith !== undefined) {
    lists.push(singleIdentifier("performed_with", "performer", input.performedWith, configured));
  }
  if (input.studioId !== undefined) {
    lists.push(singleIdentifier("studio_id", "studio", input.studioId, configured));
  }

  return {
    query: narrowingText("query", input.query),
    name: narrowingText("name", input.name),
    disambiguation: narrowingText("disambiguation", input.disambiguation),
    country: narrowingText("country", input.country),
    lists,
    sort: input.sort,
    direction: input.direction,
    page: bounded("page", input.page, 1, 1000, 1),
    limit: bounded("limit", input.limit, 1, 100, ROWS_PER_PAGE),
    sections: input.sections ?? ["basic"],
  };
}

function notReceivedOnTheTextPath(plan: Plan): string[] {
  const left: string[] = [];
  if (plan.name !== undefined) left.push("name");
  if (plan.disambiguation !== undefined) left.push("disambiguation");
  if (plan.country !== undefined) left.push("country");
  for (const list of plan.lists) left.push(list.name);
  if (plan.sort !== undefined) left.push("sort");
  if (plan.direction !== undefined) left.push("direction");
  if (plan.page > 1) left.push("page");
  return left;
}

async function askOne(
  ctx: RouteContext,
  ask: Ask,
  plan: Plan,
): Promise<Contribution<PerformerRecord> | SourceReport> {
  const { spec, apiKey } = ask;
  const report: SourceReport = { source: spec.id, name: spec.name, state: "answered" };
  let key: string;
  let request: GraphQLRequest;

  if (plan.query !== undefined) {
    const notReceived = notReceivedOnTheTextPath(plan);
    if (notReceived.length > 0) report.narrowingsNotReceived = notReceived;
    key = "searchPerformers";
    request = searchPerformersRequest(spec, plan.query, plan.limit, plan.sections);
  } else {
    const narrowing = facets(spec, plan, report);
    if (narrowing === undefined) {
      // Which narrowing emptied this catalogue is what a caller acts on, so it
      // travels as a field rather than only inside a free-text reason.
      return {
        ...report,
        ...absentReport(
          spec,
          emptiedBy(
            spec.name,
            report.narrowingsNamingNoRecord ?? [],
            report.narrowingsNotReceived ?? [],
          ),
        ),
      };
    }
    key = "queryPerformers";
    request = queryPerformersRequest(spec, narrowing, plan.sections);
  }

  try {
    const payload = await ctx.transport.request(spec, apiKey, request);
    const container = objectUnder(payload, key, spec, MOMENT);
    const raw = arrayUnder(container, "performers", spec, MOMENT);
    const retrievedAt = ctx.now();
    const rows: PerformerRecord[] = [];
    let skipped = 0;
    for (const entry of raw) {
      const performer = mapPerformer(entry, spec, retrievedAt);
      if (performer === null) skipped += 1;
      else rows.push(performer);
    }

    report.count = rows.length;
    if (skipped > 0) report.skipped = skipped;
    if (supports(spec, "index_total")) {
      const indexTotal = indexTotalOf(container.count, raw.length);
      if (indexTotal !== undefined) report.indexTotal = indexTotal;
    }
    if (plan.query === undefined && plan.name !== undefined) report.fieldsSearched = ["name"];

    return { report, rows };
  } catch (cause) {
    return failureReport(spec, cause, MOMENT);
  }
}

function facets(
  spec: InstanceSpec,
  plan: Plan,
  report: SourceReport,
): PerformerNarrowing | undefined {
  const namingNoRecord: string[] = [];
  const given: Partial<Record<string, string>> = {};

  for (const list of plan.lists) {
    const share = shareFor(list, spec.id);
    if (share.namingNoRecord) namingNoRecord.push(list.name);
    else given[list.name] = share.uuids[0];
  }
  if (namingNoRecord.length > 0) report.narrowingsNamingNoRecord = namingNoRecord;

  const text =
    plan.name !== undefined || plan.disambiguation !== undefined || plan.country !== undefined;
  const identifiers = Object.keys(given).length > 0;
  const wroteSomething = text || plan.lists.length > 0;
  if (wroteSomething && !text && !identifiers) return undefined;

  return {
    ...(plan.name === undefined ? {} : { name: plan.name }),
    ...(plan.disambiguation === undefined ? {} : { disambiguation: plan.disambiguation }),
    ...(plan.country === undefined ? {} : { country: plan.country }),
    ...(given.performed_with === undefined ? {} : { performedWith: given.performed_with }),
    ...(given.studio_id === undefined ? {} : { studioId: given.studio_id }),
    ...(plan.sort === undefined ? {} : { sort: plan.sort }),
    ...(plan.direction === undefined ? {} : { direction: plan.direction }),
    page: plan.page,
    limit: plan.limit,
  };
}
