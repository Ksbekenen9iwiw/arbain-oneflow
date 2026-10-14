import type { ReactNode } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { HStack, VStack, Text } from "./ui";

/** Shared identity rhythm for CRM rows; all sizing comes from Astryx. */
export function RecordIdentity({
  name,
  children,
  supporting,
  company = false,
}: {
  name: string;
  children?: ReactNode;
  supporting?: ReactNode;
  company?: boolean;
}) {
  return (
    <HStack gap={3} vAlign="center">
      <Avatar
        name={name}
        size={company ? 32 : 24}
        shape={company ? "rounded" : "circle"}
        aria-hidden="true"
      />
      <VStack gap={1}>
        {children || <Text>{name}</Text>}
        {supporting && <Text type="supporting">{supporting}</Text>}
      </VStack>
    </HStack>
  );
}
