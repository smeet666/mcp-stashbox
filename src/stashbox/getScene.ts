/**
 * One scene, read from the catalogue its identifier names.
 *
 * The distinction this route exists to hold: an answer carrying no `findScene`
 * key at all is a shape this client could not read, and the key present and null
 * is the catalogue saying it holds nothing under that identifier. Only the
 * second is an absence, and reading the first as one would deny a record nobody
 * said was missing.
 */

import { notFound } from "../errors.js";
import type { Read, SceneRecord } from "../types.js";
import { cacheKey } from "./cache.js";
import type { RouteContext } from "./client.js";
import { mapScene } from "./map.js";
import { findSceneRequest, type SceneSection } from "./queries.js";
import { recordUnder, unreadable } from "./read.js";
import { addressed } from "./record.js";

const MOMENT = "the scene it was asked for";

export async function getScene(
  ctx: RouteContext,
  id: string,
  sections: readonly SceneSection[] = ["basic"],
): Promise<Read<SceneRecord>> {
  const { spec, apiKey, uuid } = addressed(ctx, id, "get_scene", "scene lookup");
  const key = cacheKey({
    instance: spec.id,
    operation: "get_scene",
    // The sections belong in the key: two calls for one record ask for
    // different blocks of it and get different answers.
    params: { uuid, sections: [...sections].sort() },
  });

  const held = ctx.cache.get(key) as SceneRecord | undefined;
  if (held !== undefined) return { data: held, cached: true };

  const payload = await ctx.transport.request(spec, apiKey, findSceneRequest(spec, uuid, sections));
  const raw = recordUnder(payload, "findScene", spec, MOMENT);
  if (raw === null) {
    throw notFound(`${spec.name} holds no scene at ${id}.`, {
      instance: spec.name,
      hint: "The catalogue looked and holds nothing under that identifier. Another catalogue may hold the same scene under one of its own.",
    });
  }

  const scene = mapScene(raw, spec, ctx.now());
  // A record whose own identifier this client could not read is a record no
  // further call could be written for, which is a shape rather than an absence.
  if (scene === null) throw unreadable(spec, MOMENT);

  ctx.cache.set(key, scene);
  const skipped = scene.rowsSkipped ?? 0;
  return { data: scene, cached: false, ...(skipped > 0 ? { skipped } : {}) };
}
