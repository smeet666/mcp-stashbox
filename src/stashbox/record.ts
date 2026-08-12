/**
 * The catalogue an identifier addresses, before anything is asked of it.
 *
 * A record is named by a catalogue and a uuid, so a route reading one record
 * asks exactly one catalogue and there is no per-catalogue report to write. What
 * would otherwise be a report has to travel as a refusal instead, which is why
 * each way of failing here is separated: an identifier this server cannot read,
 * a catalogue no key was configured for, and a catalogue that answers no such
 * route are three different things for a caller to do something about, and none
 * of them is a record the catalogue does not hold.
 */

import { invalidInput } from "../errors.js";
import type { RouteContext } from "./client.js";
import { parseId } from "./identifiers.js";
import { instanceById, supports, type Capability, type InstanceSpec } from "./instances.js";

export interface Addressed {
  spec: InstanceSpec;
  apiKey: string;
  uuid: string;
}

export function addressed(
  ctx: RouteContext,
  id: string,
  capability: Capability,
  route: string,
  /**
   * The argument the identifier was written under. Every refusal names it: a
   * caller holding several arguments shaped like an identifier is otherwise
   * told which value is wrong and nothing about where they wrote it.
   */
  argument = "id",
): Addressed {
  const parsed = parseId(id, ctx.configured);
  const spec = instanceById(parsed.instance);
  if (spec === undefined) {
    throw invalidInput(
      `The identifier "${id}", given for '${argument}', names no catalogue this server reads.`,
      "Write the identifier as instance:uuid, with a catalogue this server reads.",
    );
  }

  const apiKey = ctx.keyFor(parsed.instance);
  if (apiKey === undefined) {
    throw invalidInput(
      `The identifier "${id}", given for '${argument}', names ${spec.name}, and no key is configured for it, so nothing was asked. This states nothing about whether the record exists.`,
      `Set ${spec.envVar} to a key ${spec.name} accepts, then ask again.`,
    );
  }

  if (!supports(spec, capability)) {
    throw invalidInput(
      `${spec.name} answers no ${route} of its own, so the identifier "${id}", given for '${argument}', was never put to it. This states nothing about whether the record exists.`,
      `Ask a catalogue that answers a ${route}.`,
    );
  }

  return { spec, apiKey, uuid: parsed.uuid };
}
