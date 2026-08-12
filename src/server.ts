/**
 * The tools this server offers, and the instructions that go with them.
 *
 * The instructions are built from the catalogues actually configured, so they
 * describe what this server can reach rather than what it could reach if
 * everything were set up.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig, createLogger, type Config } from "./config.js";
import { StashboxClient } from "./stashbox/client.js";
import { INSTANCES, instanceById } from "./stashbox/instances.js";
import { registerFindByFingerprint } from "./tools/findByFingerprint.js";
import { registerGetPerformer } from "./tools/getPerformer.js";
import { registerGetScene } from "./tools/getScene.js";
import { registerSearchPerformers } from "./tools/searchPerformers.js";
import { registerSearchScenes } from "./tools/searchScenes.js";
import { PKG_NAME, PKG_VERSION } from "./version.js";

export function buildInstructions(config: Config): string {
  const configured = INSTANCES.filter((spec) => config.keys[spec.id]);
  const missing = INSTANCES.filter((spec) => !config.keys[spec.id]);

  if (configured.length === 0) {
    return [
      "This server reads public stash-box metadata catalogues, and no catalogue is configured yet.",
      `Set at least one of: ${INSTANCES.map((spec) => spec.envVar).join(", ")}.`,
      "Each catalogue issues its own key to a registered account, and a catalogue with no key is named as absent from every answer.",
    ].join(" ");
  }

  const lines = [
    `Tools for catalogued adult film metadata, reading ${configured.length} catalogue(s): ${configured
      .map((spec) => spec.name)
      .join(", ")}.`,
    "These catalogues describe scenes and performers and hold no media: a record names where something was published and carries nothing of it.",
    "Typical flow: search_scenes or search_performers to find a record and its identifier, then get_scene or get_performer to read it. An identifier names the catalogue that minted it, because the catalogues mint identifiers separately and one string can exist on several of them meaning different things.",
    "find_by_fingerprint answers what a file is. MD5 and OSHASH match the same file byte for byte; PHASH matches images that resemble each other, which covers a re-encode, a crop and a different scene from one shoot, so a PHASH match is no evidence that two files are the same.",
    "A performer's scene count counts what that catalogue has indexed. A settled record naming a career spanning decades can report none, and that measures the catalogue's coverage and states nothing about a person's work.",
    "An identifier folded into another answers as a marker naming its successor. That is a record that exists under a new name, and it is never an absence.",
    "Counts are never added across catalogues, and rows are never ranked against each other: the catalogues publish no score in common, so rows interleave and the answer says so.",
    "A catalogue that failed, a catalogue that was never asked and a catalogue that looked and found nothing are three different things, and every answer names which is which. An answer holding rows from some catalogues is no evidence about the others.",
  ];

  if (missing.length > 0) {
    lines.push(
      `Not configured, and named as absent from every answer: ${missing
        .map((spec) => `${spec.name} (${spec.envVar})`)
        .join(", ")}.`,
    );
  }

  const looseConfigured = configured.filter((spec) => spec.dialect === "loose");
  if (looseConfigured.length > 0) {
    lines.push(
      `${looseConfigured
        .map((spec) => spec.name)
        .join(
          ", ",
        )} answers a smaller surface: it answers no search at all, neither by words nor by typed arguments, so a record of its own is reached by a fingerprint or by an identifier already held. It publishes no table sorting the sites a record links to, no taxonomy sorting its tags, no count of the scenes it indexes for a performer, no count of edits open against a record, and it counts no disputes over a fingerprint, so a match from it carries an unknown contest.`,
    );
  }

  lines.push(
    "Credit the catalogue you took a record from and link it: every result carries a URL.",
  );

  return lines.join(" ");
}

export function createServer(env: NodeJS.ProcessEnv = process.env): McpServer {
  const config = loadConfig(env);
  const logger = createLogger(config.logLevel);

  const client = new StashboxClient({
    keys: config.keys,
    userAgent: config.userAgent,
    minIntervalMs: config.minIntervalMs,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    cacheTtlMs: config.cacheTtlMs,
    cacheMaxEntries: config.cacheMaxEntries,
    logger,
  });

  const server = new McpServer(
    { name: PKG_NAME, version: PKG_VERSION },
    { instructions: buildInstructions(config) },
  );

  registerSearchScenes(server, client);
  registerSearchPerformers(server, client);
  registerGetScene(server, client);
  registerGetPerformer(server, client);
  registerFindByFingerprint(server, client);

  for (const id of client.configured) {
    logger.info(`reading ${instanceById(id)?.name ?? id}`);
  }

  return server;
}
