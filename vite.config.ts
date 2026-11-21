import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./frontend", import.meta.url)),
    },
  },
  base: "/static/crm/react/",
  build: {
    outDir: "crm/static/crm/react",
    emptyOutDir: true,
    manifest: true,
    rolldownOptions: {
      input: "frontend/main.tsx",
      output: {
        // Keep rarely-changing libraries in their own cacheable chunks.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
            {
              name: "aria",
              test: /node_modules[\/](react-aria|react-stately|@react-aria|@react-stately|@react-types|@internationalized)/,
            },
            { name: "motion", test: /node_modules[\/](motion|framer-motion|motion-dom|motion-utils)[\/]/ },
          ],
        },
      },
      // This is a client-only app; React Server Component directives do not apply.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
});
