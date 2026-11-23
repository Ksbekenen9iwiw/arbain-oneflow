import { Fragment, type CSSProperties, type ReactNode } from "react";
import { IconArrowDown, IconArrowUp, IconArrowUpDown, IconChevronDown } from "@/icons";
import { cx } from "@/utils/cx";

type AnyRow = Record<string, any>;

export interface ColumnWidth {
  weight: number;
  minWidth?: number;
}

/** Share of the free table width, with an optional floor in px. */
export const proportional = (weight: number, options?: { minWidth?: number }): ColumnWidth => ({
  weight,
  minWidth: options?.minWidth,
});

export interface TableColumn<T> {
  key: string;
  header?: ReactNode;
  renderCell?: (row: T) => ReactNode;
  width?: ColumnWidth | number | string;
  align?: "start" | "center" | "end";
  sortable?: boolean;
}

export type TableSortState = { sortKey: string; direction: "ascending" | "descending" }[];

export interface SortPlugin {
  sort: TableSortState;
  onSortChange: (sort: TableSortState) => void;
  allowUnsortedState?: boolean;
}

export const useTableSortable = (options: SortPlugin): SortPlugin => options;

export interface ExpansionPlugin<T> {
  expandedKeys: Set<any>;
  onToggle: (key: any) => void;
  getRowKey: (row: T) => any;
  renderExpanded: (row: T) => ReactNode;
  panelVariant?: string;
}

export const useTableRowExpansion = <T,>(options: ExpansionPlugin<T>): ExpansionPlugin<T> =>
  options;

const ALIGN = { start: "text-start", center: "text-center", end: "text-end" };

function columnStyle(width: TableColumn<unknown>["width"], total: number): CSSProperties {
  if (width === undefined) return {};
  if (typeof width === "number") return { width };
  if (typeof width === "string") return { width };
  return { width: `${(width.weight / total) * 100}%`, minWidth: width.minWidth };
}

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  idKey?: string;
  plugins?: { sort?: SortPlugin; expansion?: ExpansionPlugin<T>; rowExpansion?: ExpansionPlugin<T> };
  density?: string;
  dividers?: string;
  verticalAlign?: string;
  textOverflow?: string;
  hasHover?: boolean;
  /** Consecutive rows sharing a key sit under one labelled group row. */
  group?: (row: T) => { key: string; label: ReactNode };
  "aria-label"?: string;
}

/** Desktop table on BoardUI's `bui-table` styles, with sort and row expansion. */
export function Table<T extends AnyRow>({
  data,
  columns,
  idKey = "id",
  plugins,
  hasHover,
  group,
  "aria-label": ariaLabel,
}: TableProps<T>) {
  const sort = plugins?.sort;
  const expansion = plugins?.expansion ?? plugins?.rowExpansion;
  const total = columns.reduce(
    (sum, column) =>
      sum + (typeof column.width === "object" && column.width ? column.width.weight : 0),
    0,
  );
  const toggleSort = (key: string) => {
    if (!sort) return;
    const current = sort.sort[0]?.sortKey === key ? sort.sort[0].direction : null;
    if (current === null) sort.onSortChange([{ sortKey: key, direction: "ascending" }]);
    else if (current === "ascending")
      sort.onSortChange([{ sortKey: key, direction: "descending" }]);
    else
      sort.onSortChange(
        sort.allowUnsortedState ? [] : [{ sortKey: key, direction: "ascending" }],
      );
  };
  return (
    <div className="bui-table-wrap w-full overflow-x-auto rounded-2xl border border-border-button-default bg-background-primary-default">
      <table aria-label={ariaLabel} className="bui-table w-full">
        <thead>
          <tr>
            {expansion && <th className="w-10" aria-label="Buka detail" />}
            {columns.map((column) => {
              const active = sort?.sort[0]?.sortKey === column.key ? sort.sort[0].direction : null;
              const canSort = Boolean(sort && column.sortable !== false && column.header);
              const Arrow =
                active === "ascending"
                  ? IconArrowUp
                  : active === "descending"
                    ? IconArrowDown
                    : IconArrowUpDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ?? undefined}
                  className={ALIGN[column.align ?? "start"]}
                  style={columnStyle(column.width, total || 1)}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cx(
                        "group/sort inline-flex cursor-pointer items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                        active && "text-text-primary",
                      )}
                    >
                      {column.header}
                      <Arrow
                        aria-hidden
                        className={cx(
                          "size-3.5 transition-opacity duration-150",
                          active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-60",
                        )}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const key = String(row[idKey] ?? index);
            const rowKey = expansion?.getRowKey(row);
            const isOpen = expansion ? expansion.expandedKeys.has(rowKey) : false;
            const heading = group?.(row);
            const startsGroup =
              heading && (index === 0 || group?.(data[index - 1]).key !== heading.key);
            return (
              <Fragment key={key}>
                {startsGroup && (
                  <tr className="bui-table-group">
                    <th scope="rowgroup" colSpan={columns.length + (expansion ? 1 : 0)}>
                      {heading.label}
                    </th>
                  </tr>
                )}
                <tr
                  data-row
                  className={cx(
                    hasHover !== false &&
                      "transition-colors duration-150 hover:bg-background-secondary-default/60",
                  )}
                >
                  {expansion && (
                    <td className="w-10">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Tutup detail" : "Buka detail"}
                        onClick={() => expansion.onToggle(rowKey)}
                        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-text-secondary outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                      >
                        <IconChevronDown
                          aria-hidden
                          className={cx(
                            "size-4 transition-transform duration-200",
                            !isOpen && "-rotate-90",
                          )}
                        />
                      </button>
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} className={ALIGN[column.align ?? "start"]}>
                      {column.renderCell
                        ? column.renderCell(row)
                        : String(row[column.key] ?? "—")}
                    </td>
                  ))}
                </tr>
                {isOpen && expansion && (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="bg-background-secondary-default/60 !p-0"
                    >
                      {expansion.renderExpanded(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
