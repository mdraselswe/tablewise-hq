// Production build: bundles the API (and the workspace contracts package it imports
// as TypeScript source) into dist/. Third-party packages stay external and are
// installed in the image with `pnpm deploy --prod`.
import { readFile, rm } from "node:fs/promises";
import { build } from "esbuild";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@tablewise/"));

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: [
    "src/main.ts",
    "src/cli/migrate.ts",
    "src/cli/seed.ts",
    "src/cli/reset.ts",
    "src/cli/replay-events.ts",
  ],
  outdir: "dist",
  outbase: "src",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  external,
  logLevel: "info",
});
