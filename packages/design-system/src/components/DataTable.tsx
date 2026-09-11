import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./DataTable.module.css";

export type SortOrder = "asc" | "desc";
export interface SortState {
  key: string;
  order: SortOrder;
}

export interface DataTableColumn<T> {
  /** Stable key — also the sort key sent to `onSortChange` when `sortable`. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Fixed column width (any CSS length), e.g. "1px" to shrink-wrap. */
  width?: string;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Row click = the row's primary action (opening a detail view). Controls
   * inside a cell wrapped in `[data-dt-stop]` never trigger it. */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  state?: "ready" | "loading" | "error";
  /** Rendered (inside a full-width cell) when `state === "ready"` and no rows. */
  empty?: ReactNode;
  /** Rendered when `state === "error"`. */
  error?: ReactNode;
  loadingRows?: number;
  /** Accessible name for the table. */
  caption?: string;
}

/**
 * Minimal management-list table (BO Lot 3A). Deliberately NOT a table library:
 * no column resize, no virtualisation, no row selection, no column config.
 * Just header / rows / sort-on-sortable-columns / loading·empty·error states,
 * with an accessible primary row action and cell-level controls that don't
 * collide with it.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  rowLabel,
  sort,
  onSortChange,
  state = "ready",
  empty,
  error,
  loadingRows = 6,
  caption,
}: DataTableProps<T>) {
  const colCount = columns.length;

  function toggleSort(key: string) {
    if (!onSortChange) return;
    const order: SortOrder = sort?.key === key && sort.order === "asc" ? "desc" : "asc";
    onSortChange({ key, order });
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        {caption && <caption className={styles.srOnly}>{caption}</caption>}
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = !c.sortable
                ? undefined
                : active
                  ? sort!.order === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={clsx(styles.th, c.align === "right" && styles.right, c.align === "center" && styles.center)}
                >
                  {c.sortable && onSortChange ? (
                    <button type="button" className={styles.sortBtn} onClick={() => toggleSort(c.key)}>
                      {c.header}
                      <span className={clsx(styles.sortArrow, !active && styles.inactive)} aria-hidden="true">
                        {active ? (sort!.order === "asc" ? "▲" : "▼") : "▲"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {state === "loading" &&
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={`skel-${i}`} className={styles.row}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx(styles.td, c.align === "right" && styles.right, c.align === "center" && styles.center)}
                  >
                    <div className={styles.skelBar} style={{ width: `${45 + ((i * 13 + c.key.length * 7) % 45)}%` }} />
                  </td>
                ))}
              </tr>
            ))}

          {state === "error" && (
            <tr>
              <td colSpan={colCount} className={styles.stateCell}>
                <div className={styles.stateInner}>{error}</div>
              </td>
            </tr>
          )}

          {state === "ready" && rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className={styles.stateCell}>
                <div className={styles.stateInner}>{empty}</div>
              </td>
            </tr>
          )}

          {state === "ready" &&
            rows.map((row) => {
              const key = getRowKey(row);
              return (
                <tr
                  key={key}
                  className={clsx(styles.row, onRowClick && styles.clickable)}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if ((e.target as HTMLElement).closest("[data-dt-stop]")) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {columns.map((c, ci) => {
                    const content = c.render(row);
                    const cls = clsx(
                      styles.td,
                      c.align === "right" && styles.right,
                      c.align === "center" && styles.center,
                    );
                    // First cell carries the keyboard-accessible primary action
                    // (the row's <tr> onClick is a pointer-only convenience).
                    if (ci === 0 && onRowClick) {
                      return (
                        <td key={c.key} className={cls}>
                          <button
                            type="button"
                            className={styles.rowTrigger}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRowClick(row);
                            }}
                            aria-label={rowLabel?.(row)}
                          >
                            {content}
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className={cls}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
