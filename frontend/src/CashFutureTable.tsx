import "./agGridSetup";
import { useCallback, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { useMarketData, type Row } from "./useMarketData";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

const numericColDefaults: Partial<ColDef<Row>> = {
  cellClass: "ag-right-aligned-cell",
  headerClass: "ag-right-aligned-header",
  valueFormatter: (params) => formatNumber(params.value),
  enableCellChangeFlash: true,
};

const columnDefs: ColDef<Row>[] = [
  { field: "symbol", headerName: "Symbol", pinned: "left" },
  { field: "stockLtp", headerName: "Stock LTP", ...numericColDefaults },
  { field: "futureLtp", headerName: "Future LTP", ...numericColDefaults },
  { field: "buySpread", headerName: "Buy Spread", ...numericColDefaults },
  { field: "sellSpread", headerName: "Sell Spread", ...numericColDefaults },
];

const statusLabel: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
};

export default function CashFutureTable() {
  const gridRef = useRef<AgGridReact<Row>>(null);

  const handleUpdate = useCallback((rows: Row[]) => {
    gridRef.current?.api?.applyTransaction({ update: rows });
  }, []);

  const { snapshot, status } = useMarketData(WS_URL, handleUpdate);

  const getRowId = useMemo(
    () => (params: { data: Row }) => params.data.symbol,
    [],
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Cash&ndash;Future Table</h1>
        <span className={`status-pill status-${status}`}>
          {statusLabel[status]}
        </span>
      </header>
      <div className="grid-wrapper">
        <AgGridReact<Row>
          ref={gridRef}
          rowData={snapshot ?? []}
          columnDefs={columnDefs}
          getRowId={getRowId}
          defaultColDef={{ resizable: true, sortable: true }}
          cellFlashDuration={800}
          animateRows
        />
      </div>
    </div>
  );
}
