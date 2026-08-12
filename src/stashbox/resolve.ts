/**
 * Why a search narrowed on identifiers came back with nothing.
 *
 * An identifier its catalogue has folded still resolves, and it narrows to
 * nothing: the rows moved to the record it was folded into while the catalogue
 * goes on holding everything it ever held. An emptiness left unexplained reads
 * as a catalogue indexing none of what was asked about, which is the opposite of
 * what happened.
 *
 * The check is bounded by what it is allowed to know. It asks only catalogues
 * the caller's own list named, it never runs when every catalogue asked failed,
 * and it reports what it could not check apart from what a catalogue holds no
 * record for. An identifier whose check could not run settles nothing, so the
 * answer carrying it is never stored.
 */

import type { FoldedNarrowing } from "../types.js";
import type { RouteContext } from "./client.js";
import { formatId, isUuid } from "./identifiers.js";
import { instanceById, type InstanceId } from "./instances.js";
import type { IdentifierList, LookupKind, WrittenId } from "./narrowings.js";
import { readStatus } from "./normalise.js";
import { performerLookupRequest, studioLookupRequest, tagLookupRequest } from "./queries.js";
import { asObject } from "./read.js";

/** What became of the identifiers a narrowing was written with. */
export interface Checked {
  foldedNarrowings: FoldedNarrowing[];
  absentNarrowings: string[];
  uncheckedNarrowings: string[];
}

/** The key a lookup answers under, which is the key its own document named. */
const ANSWER_KEY: Record<LookupKind, string> = {
  performer: "findPerformer",
  studio: "findStudio",
  tag: "findTag",
};

export function nothingChecked(): Checked {
  return { foldedNarrowings: [], absentNarrowings: [], uncheckedNarrowings: [] };
}

/** Whether an answer carries a check nobody could complete, which is never stored. */
export function settled(checked: Checked): boolean {
  return checked.uncheckedNarrowings.length === 0;
}

export async function checkNarrowings(
  ctx: RouteContext,
  lists: readonly IdentifierList[],
  askable: readonly InstanceId[],
): Promise<Checked> {
  const checked = nothingChecked();
  const seen = new Set<string>();
  const pending: Promise<void>[] = [];

  for (const list of lists) {
    for (const entry of list.entries) {
      if (seen.has(entry.given)) continue;
      seen.add(entry.given);
      if (!askable.includes(entry.instance)) {
        // A catalogue this call never asked cannot be asked about one of its own
        // identifiers either, so what became of it stays unsettled.
        checked.uncheckedNarrowings.push(entry.given);
        continue;
      }
      pending.push(resolveOne(ctx, list.kind, entry, checked));
    }
  }

  await Promise.all(pending);
  return checked;
}

async function resolveOne(
  ctx: RouteContext,
  kind: LookupKind,
  entry: WrittenId,
  into: Checked,
): Promise<void> {
  const spec = instanceById(entry.instance);
  const apiKey = ctx.keyFor(entry.instance);
  if (spec === undefined || apiKey === undefined) {
    into.uncheckedNarrowings.push(entry.given);
    return;
  }

  const request =
    kind === "performer"
      ? performerLookupRequest(entry.uuid)
      : kind === "studio"
        ? studioLookupRequest(entry.uuid)
        : tagLookupRequest(spec, entry.uuid);

  let payload: unknown;
  try {
    payload = await ctx.transport.request(spec, apiKey, request);
  } catch {
    into.uncheckedNarrowings.push(entry.given);
    return;
  }

  const body = asObject(payload);
  const key = ANSWER_KEY[kind];
  if (body === undefined || !(key in body)) {
    into.uncheckedNarrowings.push(entry.given);
    return;
  }

  const held = body[key];
  if (held === null || held === undefined) {
    // The catalogue looked at its own identifier and holds nothing under it,
    // which is the one reading here that is a statement about the world.
    into.absentNarrowings.push(entry.given);
    return;
  }

  const record = asObject(held);
  if (record === undefined) {
    into.uncheckedNarrowings.push(entry.given);
    return;
  }

  const named = record.merged_into_id;
  const successor = typeof named === "string" && named !== "" ? named : null;
  const status = readStatus(record.deleted === true, successor);
  if (status === "established") return;

  // The successor is printed only where it is an identifier this server would
  // accept back, and never where it is the record itself: a caller sent to the
  // identifier they already wrote is sent nowhere.
  const readable =
    successor !== null && isUuid(successor) && successor.toLowerCase() !== entry.uuid;

  into.foldedNarrowings.push({
    given: entry.given,
    successor:
      readable && successor !== null ? formatId(entry.instance, successor.toLowerCase()) : null,
    status,
  });
}
