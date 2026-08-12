/**
 * One performer, read from the catalogue its identifier names, with the blocks
 * the caller asked for.
 *
 * Two silences are told apart everywhere here. A section a catalogue publishes
 * and holds nothing in comes back empty. A section a catalogue has no route for,
 * or one this client could not read, comes back missing and says why: an empty
 * list where a route does not exist reads as a person credited on nothing.
 *
 * A record its catalogue folded carries its identifier, its successor and the
 * identifiers still resolving to it. The scenes and the studios belong to the
 * record that holds them, so they are not read against a marker: a count of zero
 * there would describe the marker and be read as describing the person.
 */

import { notFound } from "../errors.js";
import type { PerformerRecord, Read, SceneRecord } from "../types.js";
import { cacheKey } from "./cache.js";
import type { RouteContext } from "./client.js";
import { supports, type InstanceSpec } from "./instances.js";
import { mapPerformer, mapScene } from "./map.js";
import { findPerformerRequest, queryScenesRequest, type PerformerSection } from "./queries.js";
import { arrayUnder, objectUnder, recordUnder, unreadable } from "./read.js";
import { addressed } from "./record.js";
import { indexTotalOf } from "./rows.js";

const MOMENT = "the performer it was asked for";

/** The scenes one page of the section shows, behind which the index holds more. */
const SCENES_SHOWN = 25;

export async function getPerformer(
  ctx: RouteContext,
  id: string,
  sections: readonly PerformerSection[] = ["basic"],
): Promise<Read<PerformerRecord>> {
  const { spec, apiKey, uuid } = addressed(ctx, id, "get_performer", "performer lookup");
  const key = cacheKey({
    instance: spec.id,
    operation: "get_performer",
    params: { uuid, sections: [...sections].sort() },
  });

  const held = ctx.cache.get(key) as PerformerRecord | undefined;
  if (held !== undefined) return { data: held, cached: true };

  const payload = await ctx.transport.request(
    spec,
    apiKey,
    findPerformerRequest(spec, uuid, sections),
  );
  const raw = recordUnder(payload, "findPerformer", spec, MOMENT);
  if (raw === null) {
    throw notFound(`${spec.name} holds no performer at ${id}.`, {
      instance: spec.name,
      hint: "The catalogue looked and holds nothing under that identifier. Another catalogue may hold the same person under one of its own.",
    });
  }

  const performer = mapPerformer(raw, spec, ctx.now());
  if (performer === null) throw unreadable(spec, MOMENT);

  if (sections.includes("studios")) Object.assign(performer, studioNote(spec, performer));
  if (sections.includes("scenes")) {
    Object.assign(performer, await creditedScenes(ctx, spec, apiKey, uuid, performer));
  }

  ctx.cache.set(key, performer);
  const skipped = (performer.rowsSkipped ?? 0) + (performer.scenesSkipped ?? 0);
  return { data: performer, cached: false, ...(skipped > 0 ? { skipped } : {}) };
}

/** Why a table of studios is missing, where the record carries none. */
function studioNote(spec: InstanceSpec, performer: PerformerRecord): Partial<PerformerRecord> {
  if (!supports(spec, "performer_studios")) {
    return {
      studiosUnavailable: `${spec.name} publishes no table of the studios a performer is credited on, so this section was never asked for.`,
    };
  }
  if (performer.status !== "established") {
    return {
      studiosUnavailable: `This identifier addresses a record ${spec.name} no longer holds as itself, and the studios belong to the record that holds them.`,
    };
  }
  return {};
}

/**
 * The scenes a catalogue indexes crediting this performer.
 *
 * They are read with a scene query rather than off the record, so what comes
 * back is one page of an index and says so: the count belongs to the catalogue's
 * coverage and never to a person's work.
 */
async function creditedScenes(
  ctx: RouteContext,
  spec: InstanceSpec,
  apiKey: string,
  uuid: string,
  performer: PerformerRecord,
): Promise<Partial<PerformerRecord>> {
  if (!supports(spec, "search_scenes")) {
    return {
      scenesUnavailable: `${spec.name} answers no scene search of its own, so the scenes crediting this performer were never asked for.`,
    };
  }
  if (performer.status !== "established") {
    return {
      scenesUnavailable: `This identifier addresses a record ${spec.name} no longer holds as itself, and the scenes moved with the record it was folded into.`,
    };
  }

  try {
    const payload = await ctx.transport.request(
      spec,
      apiKey,
      queryScenesRequest(spec, { performerIds: [uuid], page: 1, limit: SCENES_SHOWN }, ["basic"]),
    );
    const container = objectUnder(payload, "queryScenes", spec, "the scenes crediting it");
    const raw = arrayUnder(container, "scenes", spec, "the scenes crediting it");
    const retrievedAt = ctx.now();
    const scenes: SceneRecord[] = [];
    let skipped = 0;
    for (const entry of raw) {
      const scene = mapScene(entry, spec, retrievedAt);
      if (scene === null) skipped += 1;
      else scenes.push(scene);
    }

    const total = supports(spec, "index_total")
      ? indexTotalOf(container.count, raw.length)
      : undefined;
    return {
      scenes,
      scenesShown: scenes.length,
      scenesTotal: total ?? null,
      ...(skipped > 0 ? { scenesSkipped: skipped } : {}),
    };
  } catch {
    return {
      scenesUnavailable: `${spec.name} answered the scenes crediting this performer in a shape this client could not read, so none are shown and none are denied.`,
    };
  }
}
