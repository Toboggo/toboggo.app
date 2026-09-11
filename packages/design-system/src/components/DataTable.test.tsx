import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DataTable, type DataTableColumn } from "./DataTable";

interface Row {
  id: string;
  name: string;
  n: number;
}

const rows: Row[] = [
  { id: "a", name: "Alpha", n: 2 },
  { id: "b", name: "Bravo", n: 0 },
];

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Nom", sortable: true, render: (r) => r.name },
  {
    key: "actions",
    header: "",
    render: (r) => (
      <span data-dt-stop>
        <button type="button" onClick={() => document.body.setAttribute("data-clicked", r.id)}>
          menu {r.name}
        </button>
      </span>
    ),
  },
];

describe("DataTable", () => {
  it("renders headers and one row per item", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("Nom")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
  });

  it("shows the empty node when ready with no rows, and not the skeleton", () => {
    const { container } = render(
      <DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} state="ready" empty={<span>Rien</span>} />,
    );
    expect(screen.getByText("Rien")).toBeTruthy();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("renders the error node in error state", () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} state="error" error={<span>Oups</span>} />);
    expect(screen.getByText("Oups")).toBeTruthy();
  });

  it("renders skeleton rows (no real data) while loading", () => {
    const { container } = render(
      <DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} state="loading" loadingRows={3} />,
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("fires onRowClick from the accessible first-cell button", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("does NOT fire onRowClick when the click originates inside a [data-dt-stop] cell", () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByRole("button", { name: "menu Alpha" }));
    expect(onRowClick).not.toHaveBeenCalled();
    expect(document.body.getAttribute("data-clicked")).toBe("a");
  });

  it("toggles sort order on a sortable header and reflects aria-sort", () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        sort={{ key: "name", order: "asc" }}
        onSortChange={onSortChange}
      />,
    );
    const header = screen.getByRole("columnheader", { name: /Nom/ });
    expect(header.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(screen.getByRole("button", { name: /Nom/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "name", order: "desc" });

    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        sort={{ key: "name", order: "desc" }}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole("columnheader", { name: /Nom/ }).getAttribute("aria-sort")).toBe("descending");
  });
});
