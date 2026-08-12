/**
 * The tools this server publishes, and what it says about itself.
 *
 * Registration is ordered on purpose: a client caches the list it is given, and
 * an order that varies between two runs invalidates that cache for nothing.
 *
 * The instructions say what a caller cannot learn from the tool descriptions
 * alone: which catalogues are configured, what the one that answers a smaller
 * surface does not publish, and the single rule that governs every answer. They
 * are built from the registry rather than written out, so a catalogue whose key
 * is absent is never described as available.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { INSTANCES, supports } from "./stashbox/instances.js";
import type { InstanceSpec } from "./stashbox/instances.js";
import { StashboxClient } from "./stashbox/client.js";
import { PKG_NAME, VERSION } from "./version.js";

/**
 * What a caller is told before they ask anything.
 *
 * Every sentence here is one an answer would otherwise have to repeat on every
 * call, and none of it states more than the registry carries.
 */
export function instructionsFor(configured: readonly InstanceSpec[]): string {
  const lines: string[] = [
    "This server reads public stash-box metadata catalogues. It writes nowhere and contributes nothing back to them.",
    "One rule governs every answer: nothing is stated that the data does not carry. A catalogue that failed, one that was never asked and one that looked and found nothing are three different states, and each answer says which is which per catalogue.",
    "Counts belong to the catalogue that published them and are never added across catalogues: they index overlapping corpora, so one record held by two of them is a separate record on each.",
  ];

  if (configured.length === 0) {
    lines.push(
      "No catalogue is configured, so every answer here is empty for want of a key rather than for want of a record. Set a key for at least one catalogue.",
    );
    return lines.join(" ");
  }

  lines.push(`Configured: ${configured.map((spec) => spec.name).join(", ")}.`);

  // Named from the registry, so what a catalogue is said to lack is what it was
  // measured to lack. A catalogue described from memory drifts from the code
  // that decides what to ask it.
  const searchless = configured.filter(
    (spec) => !supports(spec, "search_scenes") && !supports(spec, "search_performers"),
  );
  for (const spec of searchless) {
    lines.push(
      `${spec.name} answers no search at all, neither by words nor by typed arguments, so one of its records is reached by a fingerprint or by an identifier already held.`,
    );
  }

  const lacking = (capability: Parameters<typeof supports>[1], what: string) => {
    const named = configured.filter((spec) => !supports(spec, capability));
    if (named.length === 0) return;
    lines.push(`${named.map((spec) => spec.name).join(", ")} publishes no ${what}.`);
  };
  lacking("site_categories", "table sorting the sites a record links to");
  lacking("tag_categories", "taxonomy sorting the tags a record carries");
  lacking(
    "fingerprint_reports",
    "count of the reports against a fingerprint, so a match from it carries an unknown contest",
  );
  lacking("index_total", "count of what its index holds beyond the page returned");
  lacking("pending_edits", "count of the edits open against a record");
  lacking("scene_count", "count of the scenes it indexes for a performer");
  lacking("performer_studios", "table of the studios a performer is credited on");

  lines.push(
    "Credit the catalogue a record came from and link it: every record carries the address it was read from.",
  );
  return lines.join(" ");
}

/**
 * The server, with its tools registered in a fixed order.
 *
 * Each registrar is passed the client, so nothing under `tools/` reaches a
 * catalogue except through the layer that paces and stores.
 */
export function createServer(
  client: StashboxClient,
  register: readonly ((server: McpServer, client: StashboxClient) => void)[],
): McpServer {
  const configured = INSTANCES.filter((spec) => client.configured.includes(spec.id));
  const server = new McpServer(
    { name: PKG_NAME, version: VERSION },
    { instructions: instructionsFor(configured) },
  );
  for (const registrar of register) registrar(server, client);
  return server;
}
