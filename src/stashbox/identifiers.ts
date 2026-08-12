/**
 * Identifiers, and why they carry the name of the catalogue that minted them.
 *
 * Every instance mints UUIDs from its own sequence, so one string can exist on
 * several of them describing different things. Reading a bare identifier is
 * therefore only safe when a single catalogue could have produced it, and a
 * question that several could answer is refused rather than sent somewhere and
 * answered about the wrong record.
 */

import { invalidInput } from "../errors.js";
import { INSTANCE_IDS, type InstanceId } from "./instances.js";

export interface NamespacedId {
  instance: InstanceId;
  uuid: string;
}

/**
 * The catalogues mint both version 4 and version 7 identifiers, so the version
 * digit is read as any hexadecimal character.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function formatId(instance: InstanceId, uuid: string): string {
  return `${instance}:${uuid.toLowerCase()}`;
}

/**
 * A namespaced identifier, or a refusal naming the argument it was given for.
 *
 * The argument is named in every refusal: a caller holding several arguments
 * shaped like an identifier is otherwise told which value is wrong and nothing
 * about where they wrote it.
 */
export function parseId(
  raw: string,
  configured: readonly InstanceId[],
  argument = "id",
): NamespacedId {
  const value = raw.trim();
  if (value === "") {
    throw invalidInput(
      `An identifier is required for '${argument}'.`,
      `Write it as <catalogue>:<uuid>, for example ${INSTANCE_IDS[0]}:00000000-0000-0000-0000-000000000000.`,
    );
  }

  const separator = value.indexOf(":");
  if (separator === -1) {
    if (!isUuid(value)) {
      throw invalidInput(
        `'${raw}', given for '${argument}', is not an identifier this catalogue could have minted.`,
        "An identifier is a UUID, optionally prefixed with the catalogue that minted it.",
      );
    }
    // A bare identifier names no catalogue, so it can only be resolved when a
    // single one is configured. Choosing for the caller would answer about a
    // record on a catalogue they did not ask.
    if (configured.length === 1) return { instance: configured[0]!, uuid: value.toLowerCase() };
    if (configured.length === 0) {
      throw invalidInput(
        "No catalogue is configured, so a bare identifier names nothing.",
        "Set an API key for at least one catalogue.",
      );
    }
    throw invalidInput(
      `'${raw}' names no catalogue, and ${configured.length} are configured, any of which could have minted it.`,
      `Write it as <catalogue>:<uuid>, using one of: ${configured.join(", ")}.`,
    );
  }

  const prefix = value.slice(0, separator).toLowerCase();
  const uuid = value.slice(separator + 1).trim();

  const instance = INSTANCE_IDS.find((id) => id === prefix);
  if (!instance) {
    throw invalidInput(
      `'${prefix}', given for '${argument}', is not a catalogue this server reads.`,
      `The catalogues are: ${INSTANCE_IDS.join(", ")}.`,
    );
  }
  if (!isUuid(uuid)) {
    throw invalidInput(
      `'${uuid}', given for '${argument}', is not a UUID, so no catalogue could have minted it.`,
      "A record identifier looks like 00000000-0000-0000-0000-000000000000.",
    );
  }

  return { instance, uuid: uuid.toLowerCase() };
}
