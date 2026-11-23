import { IconArrowLeft, IconArrowRight, IconChevronLeft, IconChevronRight, IconSidebar, IconSidebarClose } from "@/icons";

/** Navigation glyphs mirror; logos, media controls and trend arrows do not. */
const directionalIcons: ReadonlySet<unknown> = new Set([
  IconArrowLeft, IconChevronLeft, IconArrowRight, IconChevronRight,
  IconSidebarClose, IconSidebar,
]);

export function directionalIconClass(icon: unknown): string | undefined {
  return directionalIcons.has(icon) ? "rtl:rotate-180" : undefined;
}
