/**
 * Scenes read out of every catalogue that can take the question.
 *
 * The route publishes two paths and they narrow on different things. A string of
 * words runs the catalogue's own text index, which receives nothing else: every
 * typed argument written beside it stays behind, and the report says so rather
 * than letting a caller believe the rows satisfy a narrowing no catalogue was
 * given. The typed arguments run the faceted query, where a list of identifiers
 * reaches only the catalogue that minted them.
 *
 * A catalogue left with none of the narrowings is not asked at all: its first
 * page would answer any question put to it, and a page of everything presented
 * as an answer to something is the failure this client exists to prevent.
 */

import type { Read, RowsResult, SceneRecord, SourceReport } from "../types.js";
import type { RouteContext } from "./client.js";
import type { GraphQLRequest } from "./graphql.js";
import { supports, type InstanceId, type InstanceSpec } from "./instances.js";
import { mapScene } from "./map.js";
import {
  bounded,
  emptiedBy,
  identifierList,
  narrowingText,
  shareFor,
  type IdentifierList,
} from "./narrowings.js";
import {
  queryScenesRequest,
  searchScenesRequest,
  type Direction,
  type MatchMode,
  type SceneNarrowing,
  type SceneSection,
  type SceneSort,
} from "./queries.js";
import { arrayUnder, objectUnder } from "./read.js";
import { indexTotalOf, sortedClause, type Contribution } from "./rows.js";
import { runSearch } from "./searchRun.js";
import { absentReport, chooseSources, failureReport, type Ask } from "./sources.js";

export interface SearchScenesInput {
  /** A string of words for the catalogue's own text index. */
  query?: string;
  title?: string;
  code?: string;
  dateFrom?: string;
  dateTo?: string;
  performerIds?: readonly string[];
  studioIds?: readonly string[];
  tagIds?: readonly string[];
  match?: MatchMode;
  sort?: SceneSort;
  direction?: Direction;
  page?: number;
  limit?: number;
  sources?: readonly InstanceId[];
  sections?: readonly SceneSection[];
}

const MOMENT = "the scene search";

/** The rows one page carries where the caller asks for no number. */
const ROWS_PER_PAGE = 25;

/** What the caller wrote, read once and put to every catalogue. */
interface Plan {
  query: string | undefined;
  title: string | undefined;
  code: string | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  lists: IdentifierList[];
  match: MatchMode | undefined;
  sort: SceneSort | undefined;
  direction: Direction | undefined;
  page: number;
  limit: number;
  sections: readonly SceneSection[];
}

export async function searchScenes(
  ctx: RouteContext,
  input: SearchScenesInput,
): Promise<Read<RowsResult<SceneRecord>>> {
  const plan = readPlan(ctx.configured, input);
  const { asks, unasked } = chooseSources(
    ctx.keyFor,
    "search_scenes",
    "scene search",
    input.sources,
  );

  // A list reaches a catalogue only where it names one of its records, and the
  // check that explains an emptiness runs only where something actually reached
  // one of them.
  const reached = asks.some((ask) =>
    plan.lists.some((list) => shareFor(list, ask.spec.id).uuids.length > 0),
  );

  return runSearch<SceneRecord>(ctx, {
    operation: "search_scenes",
    params: {
      query: plan.query ?? null,
      title: plan.title ?? null,
      code: plan.code ?? null,
      dateFrom: plan.dateFrom ?? null,
      dateTo: plan.dateTo ?? null,
      ids: plan.lists.map((list) => [list.name, list.entries.map((entry) => entry.given)]),
      match: plan.match ?? null,
      sort: plan.sort ?? null,
      direction: plan.direction ?? null,
      page: plan.page,
      limit: plan.limit,
      sections: [...plan.sections].sort(),
      // The catalogues asked belong in the key: an answer holds a report per
      // catalogue saying why it was or was not asked, and replaying one built
      // for a narrower call would state a reason that was never this call's.
      sources: asks.map((ask) => ask.spec.id).sort(),
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

function readPlan(configured: readonly InstanceId[], input: SearchScenesInput): Plan {
  const lists: IdentifierList[] = [];
  if (input.performerIds !== undefined) {
    lists.push(identifierList("performer_ids", "performer", input.performerIds, configured));
  }
  if (input.studioIds !== undefined) {
    lists.push(identifierList("studio_ids", "studio", input.studioIds, configured));
  }
  if (input.tagIds !== undefined) {
    lists.push(identifierList("tag_ids", "tag", input.tagIds, configured));
  }

  return {
    query: narrowingText("query", input.query),
    title: narrowingText("title", input.title),
    code: narrowingText("code", input.code),
    dateFrom: narrowingText("date_from", input.dateFrom),
    dateTo: narrowingText("date_to", input.dateTo),
    lists,
    match: input.match,
    sort: input.sort,
    direction: input.direction,
    page: bounded("page", input.page, 1, 1000, 1),
    limit: bounded("limit", input.limit, 1, 100, ROWS_PER_PAGE),
    sections: input.sections ?? ["basic"],
  };
}

/**
 * The typed arguments the text index receives none of.
 *
 * A match mode is reported here only where a list of identifiers travelled with
 * it. Written alone it selected nothing on either path, which is a different
 * fact and belongs in a different field.
 */
function notReceivedOnTheTextPath(plan: Plan): string[] {
  const left: string[] = [];
  if (plan.title !== undefined) left.push("title");
  if (plan.code !== undefined) left.push("code");
  if (plan.dateFrom !== undefined) left.push("date_from");
  if (plan.dateTo !== undefined) left.push("date_to");
  for (const list of plan.lists) left.push(list.name);
  if (plan.match !== undefined && plan.lists.length > 0) left.push("match");
  if (plan.sort !== undefined) left.push("sort");
  if (plan.direction !== undefined) left.push("direction");
  if (plan.page > 1) left.push("page");
  return left;
}

async function askOne(
  ctx: RouteContext,
  ask: Ask,
  plan: Plan,
): Promise<Contribution<SceneRecord> | SourceReport> {
  const { spec, apiKey } = ask;
  const report: SourceReport = { source: spec.id, name: spec.name, state: "answered" };
  let key: string;
  let request: GraphQLRequest;

  if (plan.query !== undefined) {
    const notReceived = notReceivedOnTheTextPath(plan);
    // The full-text route reads words alone. An argument it does not take is a
    // fact about the route, and reporting it as one the catalogue cannot
    // receive would state a limitation of a catalogue that has none.
    if (notReceived.length > 0) report.narrowingsOutsideThisRoute = notReceived;
    if (plan.match !== undefined && plan.lists.length === 0) {
      report.argumentsWithNothingToDo = ["match"];
    }
    key = "searchScenes";
    request = searchScenesRequest(spec, plan.query, plan.limit, plan.sections);
  } else {
    const narrowing = facets(spec, plan, report);
    if (narrowing === undefined) {
      // The facts established while the lists were shared out travel with the
      // report: which narrowing emptied this catalogue is the thing a caller
      // acts on, and a free-text reason alone gives them nothing to read it by.
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
    key = "queryScenes";
    request = queryScenesRequest(spec, narrowing, plan.sections);
  }

  try {
    const payload = await ctx.transport.request(spec, apiKey, request);
    const container = objectUnder(payload, key, spec, MOMENT);
    const raw = arrayUnder(container, "scenes", spec, MOMENT);
    const retrievedAt = ctx.now();
    const rows: SceneRecord[] = [];
    let skipped = 0;
    for (const entry of raw) {
      const scene = mapScene(entry, spec, retrievedAt);
      if (scene === null) skipped += 1;
      else rows.push(scene);
    }

    report.count = rows.length;
    if (skipped > 0) report.skipped = skipped;
    // The count beside a page is read only from a catalogue that publishes one:
    // elsewhere its silence is a question nobody put.
    if (supports(spec, "index_total")) {
      const indexTotal = indexTotalOf(container.count, raw.length);
      if (indexTotal !== undefined) report.indexTotal = indexTotal;
    }
    const fields = plan.query === undefined ? fieldsSearched(plan) : [];
    if (fields.length > 0) report.fieldsSearched = fields;

    return { report, rows };
  } catch (cause) {
    return failureReport(spec, cause, MOMENT);
  }
}

/**
 * The narrowing one catalogue is given, or nothing where it was left with none.
 *
 * The report is filled as the list is shared out, so the four facts about a
 * narrowing are written where they are established rather than reconstructed
 * afterwards from a request nobody kept.
 */
function facets(spec: InstanceSpec, plan: Plan, report: SourceReport): SceneNarrowing | undefined {
  const namingNoRecord: string[] = [];
  const inPart: string[] = [];
  const given: Partial<Record<string, string[]>> = {};

  for (const list of plan.lists) {
    const share = shareFor(list, spec.id);
    if (share.namingNoRecord) namingNoRecord.push(list.name);
    else given[list.name] = share.uuids;
    if (share.receivedInPart) inPart.push(list.name);
  }

  if (namingNoRecord.length > 0) report.narrowingsNamingNoRecord = namingNoRecord;
  if (inPart.length > 0) report.narrowingsReceivedInPart = inPart;

  const text =
    plan.title !== undefined ||
    plan.code !== undefined ||
    plan.dateFrom !== undefined ||
    plan.dateTo !== undefined;
  const identifiers = Object.keys(given).length > 0;

  // A match mode reads a list of identifiers. Where none reached this catalogue
  // it selected nothing here, which is not a narrowing the catalogue refused.
  if (plan.match !== undefined && !identifiers) report.argumentsWithNothingToDo = ["match"];

  // A scene filter compares a date against one bound. Two sent together are
  // refused outright, so the earlier one travels and the other is named as not
  // received: rows answered on one bound are wider than the question written.
  const bothBounds = plan.dateFrom !== undefined && plan.dateTo !== undefined;
  if (bothBounds) {
    report.narrowingsNotReceived = [...(report.narrowingsNotReceived ?? []), "date_to"];
  }

  const wroteSomething = text || plan.lists.length > 0;
  if (wroteSomething && !text && !identifiers) return undefined;

  return {
    ...(plan.title === undefined ? {} : { title: plan.title }),
    ...(plan.code === undefined ? {} : { code: plan.code }),
    ...(plan.dateFrom === undefined ? {} : { dateFrom: plan.dateFrom }),
    ...(plan.dateTo === undefined || bothBounds ? {} : { dateTo: plan.dateTo }),
    ...(given.performer_ids === undefined ? {} : { performerIds: given.performer_ids }),
    ...(given.studio_ids === undefined ? {} : { studioIds: given.studio_ids }),
    ...(given.tag_ids === undefined ? {} : { tagIds: given.tag_ids }),
    ...(plan.match === undefined || !identifiers ? {} : { match: plan.match }),
    ...(plan.sort === undefined ? {} : { sort: plan.sort }),
    ...(plan.direction === undefined ? {} : { direction: plan.direction }),
    page: plan.page,
    limit: plan.limit,
  };
}

/** The fields the request narrowed on, claimed only where one was written. */
function fieldsSearched(plan: Plan): string[] {
  const fields: string[] = [];
  if (plan.title !== undefined) fields.push("title");
  if (plan.code !== undefined) fields.push("code");
  return fields;
}
