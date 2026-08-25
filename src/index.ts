#!/usr/bin/env node
/**
 * The executable, speaking the protocol over stdio.
 *
 * Two things are load-bearing here. **Nothing writes to stdout** except the
 * transport: that channel carries the protocol, and a line of ours on it would
 * be read as a message, so every diagnostic goes to stderr through the logger.
 * And the process stays up until the transport closes: exiting on an idle
 * moment would end a session a client believes is open.
 */

import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createLogger, loadConfig } from "./config.js";
import { StashboxClient } from "./stashbox/client.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const client = new StashboxClient({ keys: config.keys, config, logger });

  if (client.configured.length === 0) {
    // Said once at startup: every answer would otherwise report five catalogues
    // holding nothing, where the truth is that none of them was asked.
    logger.warn(
      "No catalogue key is configured, so every answer will be empty for want of a key. Set one of the STASHBOX_*_KEY variables.",
    );
  }

  const server = createServer(client as never);

  await server.connect(new StdioServerTransport());
  logger.info(`ready, reading ${client.configured.join(", ") || "no catalogue"}`);
}

main().catch((cause: unknown) => {
  process.stderr.write(`mcp-stashbox: ${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
});
