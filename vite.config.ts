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
      // This is a client-only app; React Server Component directives do not apply.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
});
