import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: "scripts/reliability-check.ts",
      formats: ["es"],
      fileName: () => "reliability-check.mjs",
    },
    outDir: ".reliability-tmp",
  },
});
