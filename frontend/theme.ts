import { defineTheme } from "@astryxdesign/core/theme";
import { themes, defaultThemeSlug } from "../astryx-themes";

// Keep Astryx Neutral's layout and components; emphasize actionable status tokens and surface polish.
export const oneflowTheme = defineTheme({
  name: "oneflow",
  extends: themes[defaultThemeSlug],
  motion: {
    fast: 140,
    medium: 240,
    slow: 700,
    ratio: 0.75,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  adaptations: {
    rules: [
      {
        when: { motion: "no-preference" },
        value: {
          components: {
            "text-input": {
              base: {
                transition:
                  "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)",
              },
            },
            "input-group": {
              base: {
                transition:
                  "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
              },
            },
            selector: {
              base: {
                transition:
                  "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)",
              },
            },
            "text-area": {
              base: {
                transition:
                  "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
              },
            },
            "date-input": {
              base: {
                transition:
                  "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
              },
            },
            "table-row": {
              base: { transitionDuration: "var(--duration-fast-min)" },
            },
            "side-nav-item": {
              base: {
                transition:
                  "background-color var(--duration-fast-min) var(--ease-standard), color var(--duration-fast-min) var(--ease-standard)",
              },
            },
            tab: {
              base: {
                transition:
                  "color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)",
              },
            },
            "segmented-control-item": {
              base: {
                transition:
                  "color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
              },
            },
            "progress-bar-fill": {
              base: {
                transition: "width var(--duration-medium) var(--ease-standard)",
              },
            },
            card: {
              base: {
                transition:
                  "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
              },
            },
          },
        },
      },
    ],
  },
  components: {
    token: {
      "color:red": {
        backgroundColor: "var(--color-error)",
        color: "var(--color-on-error)",
        fontWeight: "var(--font-weight-semibold)",
      },
      "color:orange": {
        backgroundColor: "var(--color-warning)",
        color: "var(--color-on-warning)",
        fontWeight: "var(--font-weight-semibold)",
      },
      "color:green": {
        fontWeight: "var(--font-weight-semibold)",
      },
      "color:blue": {
        fontWeight: "var(--font-weight-semibold)",
      },
    },
    card: {
      base: {
        borderRadius: "var(--radius-lg)",
      },
    },
    dialog: {
      base: {
        borderRadius: "var(--radius-xl)",
      },
    },
  },
});

