import type { ReactNode } from "react";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { HStack } from "@astryxdesign/core/Layout";
import { productPhotos } from "./productPhotos";

// Catalog mockups are keyed by SKU; unknown products retain Astryx’s neutral fallback.
// These are not upload controls and must not show loading or click affordances.
export function ProductThumbnail({
  name,
  sku,
  size = "row",
}: {
  name: string;
  sku: string | undefined;
  size?: "compact" | "row" | "detail";
}) {
  return (
    <Thumbnail
      src={sku ? productPhotos[sku] : undefined}
      label={
        sku && productPhotos[sku]
          ? `Mockup ${name}`
          : `Foto ${name} belum tersedia`
      }
      aria-hidden="true"
      style={
        size === "detail"
          ? undefined
          : {
              width:
                size === "compact" ? "var(--spacing-6)" : "var(--spacing-10)",
            }
      }
    />
  );
}

export function ProductIdentity({
  name,
  sku,
  size = "row",
  children,
}: {
  name: string;
  sku: string | undefined;
  size?: "compact" | "row" | "detail";
  children: ReactNode;
}) {
  return (
    <HStack gap={size === "compact" ? 2 : 3} vAlign="center">
      <ProductThumbnail name={name} sku={sku} size={size} />
      {children}
    </HStack>
  );
}
