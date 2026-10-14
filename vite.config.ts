import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    {
      name: "astryx-local-font",
      enforce: "pre",
      transform(code, id) {
        // The official theme requests Figtree; Fontsource names its variable face Figtree Variable.
        if (id.includes("@fontsource-variable/figtree/") && id.endsWith(".css"))
          return code.replaceAll("Figtree Variable", "Figtree");
      },
    },
  ],
  resolve: {
    alias: {
      "@astryxdesign/theme-neutral/fonts.css":
        "@fontsource-variable/figtree/index.css",
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
