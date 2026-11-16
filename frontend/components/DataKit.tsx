import { useEffect, useRef, useState, type ReactNode } from "react";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import {
  CheckCircleIcon,
  InboxIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import {
  Table,
  useTableSortable,
  proportional,
  type TableColumn,
  type TableSortState,
} from "@astryxdesign/core/Table";
import type { Row } from "../types";
import { MotionStack } from "../motion";

export function Empty({
  title = "Belum ada data",
  description,
  action,
  kind = "empty",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  kind?: "empty" | "search" | "complete";
}) {
  return (
    <MotionStack gap={3} hAlign="center" padding={8} motionKey={title}>
      <Icon
        icon={
          kind === "search"
            ? MagnifyingGlassIcon
            : kind === "complete"
              ? CheckCircleIcon
              : InboxIcon
        }
        color="secondary"
        size="lg"
      />
      <VStack maxWidth="36rem" gap={2} hAlign="center" role="status">
        <Heading level={3} justify="center">
          {title}
        </Heading>
        {description && (
          <Text type="supporting" justify="center">
            {description}
          </Text>
        )}
      </VStack>
      {action && (
        <HStack gap={2} hAlign="center" wrap="wrap">
          {action}
        </HStack>
      )}
    </MotionStack>
  );
}

// Native Astryx presentation shared by server- and client-sorted tables.
export const tablePresentation = {
  density: "balanced",
  dividers: "rows",
  verticalAlign: "middle",
  textOverflow: "wrap",
  hasHover: true,
} as const;

export function FilterRow({ children }: { children: ReactNode }) {
  return (
    <HStack gap={3} vAlign="end" wrap="wrap">
      {children}
    </HStack>
  );
}

export function useSearchInput(
  serverQuery: string,
  revision: number,
  onSearch: (nextQuery: string) => void,
  delay = 250,
): [string, (value: string) => void] {
  const [query, setQuery] = useState(serverQuery || "");
  const lastServer = useRef(serverQuery || "");
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  useEffect(() => {
    const nextServer = serverQuery || "";
    const prevServer = lastServer.current;
    lastServer.current = nextServer;
    if (nextServer !== prevServer && (nextServer === "" || query === prevServer)) {
      setQuery(nextServer);
    }
  }, [revision, serverQuery]);
  useEffect(() => {
    if (query.trim() === (serverQuery || "").trim()) return;
    const timer = window.setTimeout(() => onSearchRef.current(query), delay);
    return () => window.clearTimeout(timer);
  }, [query, serverQuery, delay]);
  return [query, setQuery];
}

export function resetLabel(hasSearch: unknown, hasFilter: unknown) {
  if (hasSearch && hasFilter) return "Reset pencarian & filter";
  if (hasSearch) return "Reset pencarian";
  return "Reset filter";
}

export function ResultsSummary({
  children,
  reset,
}: {
  children: ReactNode;
  reset?: { href?: string; onClick?: () => void; label?: string };
}) {
  return (
    <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
      <Text type="supporting" aria-live="polite">
        {children}
      </Text>
      {reset && (
        <Button
          label={reset.label || "Reset filter"}
          size="sm"
          variant="secondary"
          href={reset.href}
          onClick={reset.onClick}
        />
      )}
    </HStack>
  );
}

export function DataTable({
  rows,
  columns,
  empty,
}: {
  rows: Row[];
  columns: TableColumn<Row>[];
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState<TableSortState>([]);
  const sorting = useTableSortable({
    sort,
    onSortChange: setSort,
    allowUnsortedState: true,
  });
  const ordered = sort.length
    ? [...rows].sort((a, b) => {
        const { sortKey, direction } = sort[0];
        const av = a[sortKey],
          bv = b[sortKey];
        // Django serializes integer amounts as strings; lexical or Number sorting loses precision.
        const order =
          /^-?\d+$/.test(String(av)) && /^-?\d+$/.test(String(bv))
            ? BigInt(av) < BigInt(bv)
              ? -1
              : BigInt(av) > BigInt(bv)
                ? 1
                : 0
            : String(av ?? "").localeCompare(String(bv ?? ""), "id", {
                numeric: true,
              });
        return direction === "ascending" ? order : -order;
      })
    : rows;
  return rows.length ? (
    <Table
      {...tablePresentation}
      data={ordered}
      plugins={{ sort: sorting }}
      columns={columns.map((column) => ({
        ...column,
        width: column.width || proportional(1, { minWidth: 96 }),
      }))}
      idKey="id"
    />
  ) : (
    empty || <Empty />
  );
}
