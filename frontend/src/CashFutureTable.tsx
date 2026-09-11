import "./agGridSetup";
import { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { useMarketData, type Row } from "./useMarketData";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

const EM_DASH = "—";

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? EM_DASH : value.toFixed(2);
}

function formatExpiry(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const priceCol: Partial<ColDef<Row>> = {
  cellClass: "ag-right-aligned-cell",
  headerClass: "ag-right-aligned-header",
  valueFormatter: (params) => formatNumber(params.value),
  enableCellChangeFlash: true,
  flex: 1,
  minWidth: 120,
};

const spreadCol: Partial<ColDef<Row>> = {
  ...priceCol,
  cellClassRules: {
    "spread-positive": (p) => typeof p.value === "number" && p.value > 0,
    "spread-negative": (p) => typeof p.value === "number" && p.value < 0,
  },
  cellClass: undefined,
};

// The five columns the brief asks for are always visible, in order. The
// bid/ask the backend streams and the resolved future contract sit behind
// the "details" toggle so the default view matches the spec exactly.
function buildColumnDefs(showDetails: boolean): ColDef<Row>[] {
  const required: ColDef<Row>[] = [
    {
      field: "symbol",
      headerName: "Symbol",
      pinned: "left",
      width: 170,
      filter: true,
    },
    { field: "stockLtp", headerName: "Stock LTP", ...priceCol },
    { field: "futureLtp", headerName: "Future LTP", ...priceCol },
    {
      field: "buySpread",
      headerName: "Buy Spread",
      headerTooltip: "Future Bid − Stock Ask",
      ...spreadCol,
    },
    {
      field: "sellSpread",
      headerName: "Sell Spread",
      headerTooltip: "Stock Bid − Future Ask",
      ...spreadCol,
    },
  ];

  if (!showDetails) return required;

  return [
    ...required,
    { field: "stockBid", headerName: "Stock Bid", ...priceCol },
    { field: "stockAsk", headerName: "Stock Ask", ...priceCol },
    { field: "futureBid", headerName: "Future Bid", ...priceCol },
    { field: "futureAsk", headerName: "Future Ask", ...priceCol },
    {
      field: "futureContractName",
      headerName: "Future Contract",
      flex: 1,
      minWidth: 190,
    },
    {
      field: "futureExpiry",
      headerName: "Expiry",
      flex: 1,
      minWidth: 140,
      valueFormatter: (params) => formatExpiry(params.value),
    },
  ];
}

const statusLabel: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
};

export default function CashFutureTable() {
  const gridRef = useRef<AgGridReact<Row>>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [quickFilter, setQuickFilter] = useState("");

  const handleUpdate = useCallback((rows: Row[]) => {
    gridRef.current?.api?.applyTransaction({ update: rows });
  }, []);

  const { snapshot, status, lastUpdate } = useMarketData(WS_URL, handleUpdate);

  const columnDefs = useMemo(() => buildColumnDefs(showDetails), [showDetails]);

  const getRowId = useMemo(
    () => (params: { data: Row }) => params.data.symbol,
    [],
  );

  return (
    <div className="page">
      <header className="page-header">
        <div className="title-row">
          <h1>Cash&ndash;Future Table</h1>
          <span className={`status-pill status-${status}`}>
            {statusLabel[status]}
          </span>
          {snapshot && (
            <span className="meta">{snapshot.length} stocks</span>
          )}
          {lastUpdate && (
            <span className="meta">
              updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="controls">
          <input
            type="search"
            className="search"
            placeholder="Filter by symbol…"
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
          />
          <label className="toggle">
            <input
              type="checkbox"
              checked={showDetails}
              onChange={(e) => setShowDetails(e.target.checked)}
            />
            Show bid/ask &amp; contract
          </label>
        </div>
      </header>
      <div className="grid-wrapper">
        <AgGridReact<Row>
          ref={gridRef}
          rowData={snapshot ?? []}
          columnDefs={columnDefs}
          getRowId={getRowId}
          quickFilterText={quickFilter}
          defaultColDef={{ resizable: true, sortable: true }}
          cellFlashDuration={800}
          animateRows
        />
      </div>
    </div>
  );
}
