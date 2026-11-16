import { useMediaQuery } from "@astryxdesign/core/hooks";

export function useResponsive() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isNarrow = useMediaQuery("(max-width: 1024px)");
  return {
    isMobile,
    isNarrow,
    contentPadding: (isMobile ? 4 : 6) as 4 | 6,
  };
}
