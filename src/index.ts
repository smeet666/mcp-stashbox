#!/usr/bin/env node
/**
 * The executable.
 *
 * Everything the server says about itself goes to stderr: stdout carries the
 * protocol, and a stray line there corrupts the session.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { PKG_NAME } from "./version.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`[${PKG_NAME}] error: ${message}\n`);
  process.exit(1);
});
