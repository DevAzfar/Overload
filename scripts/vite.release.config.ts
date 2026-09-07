import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        reliability: "scripts/reliability-check.ts",
        workoutCsv: "scripts/verify-workout-csv.ts",
        demoData: "scripts/verify-demo-data.ts",
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.mjs`,
    },
    outDir: ".release-tmp",
  },
});
