/**
 * Badge was renamed to Counter (components/base/badges/counter.tsx). This file
 * keeps `import { Badge }` and `npx boardui add badge` working for projects
 * that installed it under the old name. New code imports Counter.
 */
export {
  Counter as Badge,
  type CounterColor as BadgeColor,
  type CounterProps as BadgeProps,
} from "@/components/base/badges/counter";
