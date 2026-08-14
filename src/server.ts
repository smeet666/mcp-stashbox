/**
 * The server, and what it says about itself before it is asked anything.
 *
 * The tools are registered from one list, in the order that list declares. A
 * client caches the list it is given, so an order that varies between two runs
 * invalidates that cache for nothing, and a rule stated over the list reaches
 * every tool rather than the three a registrar remembered.
 *
 * The instructions say only what a caller cannot learn by asking. What each
 * catalogue answers is a table `get_sources` publishes, held to its
 * measurement by a suite that puts every claim in it to the catalogue itself.
 * Repeating that table here in prose would cost every session the same bytes
 * and could not be checked.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { toolFailure } from "./tools/errorShape.js";
import { TOOLS, type Catalogues } from "./tools/index.js";
import { PKG_NAME, VERSION } from "./version.js";

/** What a caller is told before they ask anything. */
export function instructionsFor(configured: readonly string[]): string {
  const lines = [
    "This server reads public stash-box metadata catalogues. It writes nowhere and contributes nothing back to them.",
    "One rule governs every answer: nothing is stated that the data does not carry. A catalogue that failed, one that was never asked and one that looked and found nothing are three different states, and each answer says which is which per catalogue.",
    "Counts belong to the catalogue that published them and are never added across catalogues: they index corpora that overlap by an amount none of them publishes, so one thing held by two of them is a record on each.",
    "Ask get_sources for what each catalogue was measured answering, and the day its surface was read from it. What it lacks is a limit it has; a key it has no key for is this install's to set.",
    "A search answers with identifiers. A record route reads one record on every catalogue that holds it, following the link each of them publishes to the same record elsewhere, and every value on the card names the catalogues that said it.",
    "Credit the catalogue a record came from and link it: every record carries the address it was read from.",
  ];
  if (configured.length === 0) {
    lines.splice(
      1,
      0,
      "No catalogue is configured, so every answer here is empty for want of a key rather than for want of a record. Set a key for at least one catalogue.",
    );
  }
  return lines.join(" ");
}

/** The server, with every tool registered from the one list. */
export function createServer(client: Catalogues): McpServer {
  const server = new McpServer(
    { name: PKG_NAME, version: VERSION },
    { instructions: instructionsFor(client.configured) },
  );

  for (const tool of TOOLS) {
    // The SDK types one registration at a time; the list is what keeps every
    // tool declaring the same things, so it is the list that is walked.
    const register = server.registerTool.bind(server) as (
      name: string,
      declared: Record<string, unknown>,
      run: (args: Record<string, unknown>) => Promise<unknown>,
    ) => void;
    register(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      },
      // The whole declaration is registered, refinements included, so the
      // protocol layer enforces exactly what this server announces. A rule
      // reading two arguments against each other is no field of a schema, and
      // one applied in a second pass here would be a rule the published
      // declaration does not carry.
      async (args: Record<string, unknown>) => {
        try {
          const rendered = await tool.run(client, args ?? {});
          return {
            content: [{ type: "text" as const, text: rendered.text }],
            structuredContent: rendered.structured,
          };
        } catch (cause) {
          return toolFailure(cause);
        }
      },
    );
  }
  return server;
}
