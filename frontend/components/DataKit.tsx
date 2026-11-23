import { HoneycombArt } from "../BrandMark";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HStack, VStack } from "@/kit";
import { Text, Heading } from "@/kit";
import { Button } from "@/kit";
import { Icon } from "@/kit";
import { IconCheckCircle, IconInbox, IconSearch } from "@/icons";
import { List, ListItem } from "@/kit";
import {
  Table as KitTable,
  useTableSortable,
  proportional,
  type TableColumn,
  type TableSortState,
} from "@/kit";
import { Fragment, type ComponentProps } from "react";
import type { Row } from "../types";
import { MotionStack } from "../motion";
import { useResponsive } from "../responsive";

type AnyRow = Record<string, unknown>;
const actionKeys = new Set(["action", "actions", "tindakan"]);
const trailingKeys = new Set(["status", "activity_status", "state"]);

function cell<T extends AnyRow>(column: TableColumn<T>, row: T): ReactNode {
  return column.renderCell
    ? column.renderCell(row)
    : String(row[column.key] ?? "—");
}

// Phones get a scannable row list instead of a horizontally scrolling table:
// first column is the title, status sits on the trailing edge, the remaining
// columns become labelled supporting lines, and actions stay reachable below.
function MobileRows<T extends AnyRow>({
  data,
  columns,
  idKey,
  group,
}: {
  data: T[];
  columns: TableColumn<T>[];
  idKey?: string;
  group?: (row: T) => { key: string; label: ReactNode };
}) {
  if (group) {
    const sections: { key: string; label: ReactNode; rows: T[] }[] = [];
    for (const row of data) {
      const { key, label } = group(row);
      const last = sections[sections.length - 1];
      if (last?.key === key) last.rows.push(row);
      else sections.push({ key, label, rows: [row] });
    }
    return (
      <VStack gap={2}>
        {sections.map((section) => (
          <VStack key={section.key} gap={1}>
            <div className="rounded-lg bg-background-secondary-default px-3 py-1.5 text-body-2-medium text-text-secondary">
              {section.label}
            </div>
            <MobileRows data={section.rows} columns={columns} idKey={idKey} />
          </VStack>
        ))}
      </VStack>
    );
  }
  const [title, ...rest] = columns;
  const trailing = rest.find((c) => trailingKeys.has(c.key));
  const actions = rest.filter((c) => actionKeys.has(c.key));
  const meta = rest.filter((c) => c !== trailing && !actions.includes(c));
  return (
    <List hasDividers density="balanced">
      {data.map((row, index) => (
        <ListItem
          key={String(row[idKey || "id"] ?? index)}
          label={title ? cell(title, row) : ""}
          endContent={trailing ? cell(trailing, row) : undefined}
          description={
            meta.length || actions.length ? (
              <VStack gap={2} paddingBlockStart={1}>
                {meta.length > 0 && (
                  <div className="grid grid-cols-[minmax(5.5rem,max-content)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
                    {meta.map((column) => (
                      <Fragment key={column.key}>
                        <Text type="supporting">{column.header}</Text>
                        <div className="min-w-0">{cell(column, row)}</div>
                      </Fragment>
                    ))}
                  </div>
                )}
                {actions.map((column) => (
                  <HStack key={column.key} gap={2} wrap="wrap">
                    {cell(column, row)}
                  </HStack>
                ))}
              </VStack>
            ) : undefined
          }
        />
      ))}
    </List>
  );
}

export function Table<T extends AnyRow>(
  props: ComponentProps<typeof KitTable<T>>,
) {
  const { isMobile } = useResponsive();
  if (isMobile && props.data && props.columns) {
    return (
      <MobileRows
        data={props.data as T[]}
        columns={props.columns as TableColumn<T>[]}
        idKey={props.idKey as string | undefined}
        group={props.group as ((row: T) => { key: string; label: ReactNode }) | undefined}
      />
    );
  }
  return <KitTable {...props} />;
}

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
      {kind === "search" ? (
        <Icon icon={IconSearch} color="accent" size="lg" />
      ) : (
        <HoneycombArt tone={kind === "complete" ? "success" : "accent"} />
      )}
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
  group,
}: {
  rows: Row[];
  columns: TableColumn<Row>[];
  empty?: ReactNode;
  group?: (row: Row) => { key: string; label: ReactNode };
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
      data={group ? rows : ordered}
      plugins={group ? undefined : { sort: sorting }}
      group={group}
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
