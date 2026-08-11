import { defineConfig } from "tsup";

// The .mcpb bundle ships without a node_modules beside it, so dependencies are
// compiled in rather than left for a consumer to resolve.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist-bundle",
  noExternal: [/.*/],
  dts: false,
  sourcemap: false,
  clean: true,
  splitting: false,
});
