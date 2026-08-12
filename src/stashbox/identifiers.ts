/**
 * Record identifiers, read and written.
 *
 * A record is named by a catalogue and a uuid, written `instance:uuid`. Every
 * identifier this server prints is one it would accept back, so a caller can
 * hand an answer's identifier straight to the next call.
 *
 * The rule that shapes the refusals: the server never states anything the data
 * does not carry. The same uuid exists on several catalogues and means a
 * different record on each, so an identifier that names none of them is refused
 * with the reason and the prefixes that would resolve it, and never resolved by
 * picking a catalogue on the caller's behalf.
 */

import { invalidInput } from "../errors.js";
import { INSTANCES, instanceById, type InstanceId } from "./instances.js";

export interface ParsedId {
  instance: InstanceId;
  uuid: string;
}

/** The five hexadecimal groups, in either case, and nothing around them. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a string is a uuid as the catalogues mint them.
 *
 * The version digit is left unread: the catalogues hand out version 4 and
 * version 7 identifiers, and pinning the digit would reject records that exist.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** The prefixes a caller can write, in the order the registry declares them. */
function knownPrefixes(): string {
  return INSTANCES.map((instance) => instance.id).join(", ");
}

/**
 * Reads `instance:uuid`, or a bare uuid when a single catalogue is configured.
 *
 * A bare uuid carries no catalogue, so it can be resolved only when there is
 * one catalogue to resolve it to. With several configured, any of them could
 * have minted it and choosing one would attach the answer to the wrong record;
 * with none, the uuid names nothing that could be asked.
 *
 * A prefix is measured against the registry alone. Whether a key is held for
 * the catalogue it names is a separate question, answered where the keys are,
 * and refusing here would report a spelling problem for a missing key.
 */
export function parseId(raw: string, configured: readonly InstanceId[]): ParsedId {
  const colon = raw.indexOf(":");

  if (colon >= 0) {
    const prefix = raw.slice(0, colon);
    const uuid = raw.slice(colon + 1);
    const instance = instanceById(prefix);
    if (!instance) {
      throw invalidInput(
        `"${prefix}" in the identifier "${raw}" names no catalogue this server reads.`,
        `Write the identifier as instance:uuid, with one of these prefixes: ${knownPrefixes()}.`,
      );
    }
    if (!isUuid(uuid)) {
      throw invalidInput(
        `The identifier "${raw}" carries "${uuid}" where a uuid was expected.`,
        "A uuid is five hexadecimal groups of 8-4-4-4-12 characters, as it appears in the address of the record.",
      );
    }
    return { instance: instance.id, uuid: uuid.toLowerCase() };
  }

  if (!isUuid(raw)) {
    throw invalidInput(
      `The identifier "${raw}" is neither instance:uuid nor a uuid.`,
      "A uuid is five hexadecimal groups of 8-4-4-4-12 characters, as it appears in the address of the record.",
    );
  }

  const first = configured[0];
  if (first === undefined) {
    throw invalidInput(
      `The identifier "${raw}" names no catalogue, and no catalogue is configured to resolve it against.`,
      "Configure a key for the catalogue holding this record, then ask again.",
    );
  }

  if (configured.length > 1) {
    const names = configured.join(", ");
    throw invalidInput(
      `The identifier "${raw}" is ambiguous: several catalogues are configured (${names}), and any of them could have minted that uuid.`,
      `Name the catalogue in the identifier, as in ${first}:${raw}.`,
    );
  }

  return { instance: first, uuid: raw.toLowerCase() };
}

/** Writes the identifier a caller can hand back to any route that takes one. */
export function formatId(instance: InstanceId, uuid: string): string {
  return `${instance}:${uuid}`;
}
