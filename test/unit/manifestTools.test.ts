/**
 * The tools the extension manifest publishes, against the ones the server holds.
 *
 * A host reads the manifest before anything is installed, so what it lists is
 * what a person decides on. A tool the manifest omits is one nobody chooses,
 * and a tool it names that the server never registers is a promise the install
 * cannot keep. Nothing else holds these two files to each other, which is how
 * they parted in the first place.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../../src/tools/index.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../packaging/manifest.json", import.meta.url), "utf8"),
) as { tools: { name: string; description: string }[] };

describe("the tools the manifest publishes", () => {
  it("are the ones this server registers, in the order it registers them", () => {
    expect(manifest.tools.map((tool) => tool.name)).toEqual(TOOLS.map((tool) => tool.name));
  });

  it("each say something about what the tool answers", () => {
    for (const tool of manifest.tools) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.description.endsWith("."), tool.name).toBe(true);
    }
  });
});
