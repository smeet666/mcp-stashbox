/**
 * The reading an answer gets before anything is taken out of it.
 *
 * One rule governs the file: an answer this client cannot read is a failure and
 * never an emptiness. A payload that is a string, a null, a list or a number,
 * one carrying no key the document named, and one whose key holds a shape other
 * than the one declared all leave here as `parse_failure` naming the moment they
 * arrived at. Read as "nothing came back", any of them would state an absence no
 * catalogue expressed, and a caller would stop looking for a record that exists.
 *
 * The message carries the sentence a caller acts on: a shape this client could
 * not read states nothing about what the catalogue holds.
 */

import { parseFailure, type StashboxError } from "../errors.js";
import type { InstanceSpec } from "./instances.js";

/** An object as a payload carries one, which a list and a null are not. */
export function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** The one failure every unreadable shape leaves as, whatever route it came on. */
export function unreadable(spec: InstanceSpec, moment: string): StashboxError {
  return parseFailure(
    `${spec.name} answered ${moment} in a shape this client cannot read, which states nothing about whether the record exists or about what the catalogue holds.`,
    { instance: spec.name, url: spec.endpoint },
  );
}

/**
 * The container a document named, read from the payload that should carry it.
 *
 * The key is required to be present before its value is read: a payload naming
 * another query answers about something nobody asked, and taking rows out of it
 * would attribute one question's answer to another.
 */
export function objectUnder(
  payload: unknown,
  key: string,
  spec: InstanceSpec,
  moment: string,
): Record<string, unknown> {
  const body = asObject(payload);
  if (body === undefined || !(key in body)) throw unreadable(spec, moment);
  const held = asObject(body[key]);
  if (held === undefined) throw unreadable(spec, moment);
  return held;
}

/** The rows a container holds, which have to be a list before they are rows. */
export function arrayUnder(
  container: Record<string, unknown>,
  key: string,
  spec: InstanceSpec,
  moment: string,
): unknown[] {
  const rows = container[key];
  if (!Array.isArray(rows)) throw unreadable(spec, moment);
  return rows;
}

/**
 * One record, or the absence of one.
 *
 * A key the answer does not carry is a record this client could not read. The
 * key present and null is the catalogue saying it holds nothing at that
 * identifier, and only that second reading is an absence.
 */
export function recordUnder(
  payload: unknown,
  key: string,
  spec: InstanceSpec,
  moment: string,
): Record<string, unknown> | null {
  const body = asObject(payload);
  if (body === undefined || !(key in body)) throw unreadable(spec, moment);
  const held = body[key];
  if (held === null || held === undefined) return null;
  const record = asObject(held);
  if (record === undefined) throw unreadable(spec, moment);
  return record;
}

/**
 * The groups a fingerprint lookup answers with.
 *
 * The answer is a list of groups, and every member of it has to be a group. A
 * bare record among them is a record this client cannot attribute to any hash,
 * and filing it anyway would name a file the catalogue never matched.
 */
export function groupsUnder(
  payload: unknown,
  key: string,
  spec: InstanceSpec,
  moment: string,
): unknown[][] {
  const body = asObject(payload);
  if (body === undefined || !(key in body)) throw unreadable(spec, moment);
  const groups = body[key];
  if (!Array.isArray(groups)) throw unreadable(spec, moment);
  if (!groups.every((group) => Array.isArray(group))) throw unreadable(spec, moment);
  return groups as unknown[][];
}
