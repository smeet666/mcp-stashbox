import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/stashbox/client.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // Left external so a consumer resolves their own copies from node_modules.
  external: ["@modelcontextprotocol/sdk", "zod"],
});
