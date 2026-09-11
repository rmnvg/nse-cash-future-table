import "./agGridSetup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { useMarketData, type Row } from "./useMarketData";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

const EM_DASH = "—";

function formatNumber(value: number | null | undefined, dp = 2): string {
  return value === null || value === undefined ? EM_DASH : value.toFixed(dp);
}

function formatInt(value: number | null | undefined): string {
  return value === null || value === undefined
    ? EM_DASH
    : value.toLocaleString();
}

function formatPct(value: number | null | undefined): string {
  return value === null || value === undefined
    ? EM_DASH
    : `${value.toFixed(2)}%`;
}

function formatExpiry(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const signedCellClass = {
  "spread-positive": (p: { value: unknown }) =>
    typeof p.value === "number" && p.value > 0,
  "spread-negative": (p: { value: unknown }) =>
    typeof p.value === "number" && p.value < 0,
};

const priceCol: Partial<ColDef<Row>> = {
  cellClass: "ag-right-aligned-cell",
  headerClass: "ag-right-aligned-header",
  valueFormatter: (params) => formatNumber(params.value),
  enableCellChangeFlash: true,
  flex: 1,
  minWidth: 115,
};

const spreadCol: Partial<ColDef<Row>> = {
  ...priceCol,
  cellClass: undefined,
  cellClassRules: signedCellClass,
};

// The five columns the brief asks for are always visible, in order. The
// bid/ask the backend streams, the resolved future contract and the derived
// basis metrics sit behind the "details" toggle, so the default view matches
// the spec exactly.
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
    {
      field: "annualizedBasisPct",
      headerName: "Ann. Basis",
      headerTooltip:
        "Basis annualised over days to expiry — comparable across stocks",
      ...priceCol,
      cellClass: undefined,
      cellClassRules: signedCellClass,
      valueFormatter: (params) => formatPct(params.value),
      minWidth: 120,
    },
    {
      field: "basisPct",
      headerName: "Basis %",
      headerTooltip: "(Future LTP − Stock LTP) / Stock LTP",
      ...priceCol,
      cellClass: undefined,
      cellClassRules: signedCellClass,
      valueFormatter: (params) => formatPct(params.value),
      minWidth: 110,
    },
    {
      field: "buySpreadPerLot",
      headerName: "Buy ₹/Lot",
      headerTooltip: "Buy Spread × lot size",
      ...spreadCol,
      valueFormatter: (params) => formatInt(params.value),
    },
    {
      field: "sellSpreadPerLot",
      headerName: "Sell ₹/Lot",
      headerTooltip: "Sell Spread × lot size",
      ...spreadCol,
      valueFormatter: (params) => formatInt(params.value),
    },
    { field: "stockBid", headerName: "Stock Bid", ...priceCol },
    { field: "stockAsk", headerName: "Stock Ask", ...priceCol },
    { field: "futureBid", headerName: "Future Bid", ...priceCol },
    { field: "futureAsk", headerName: "Future Ask", ...priceCol },
    {
      field: "lotSize",
      headerName: "Lot",
      ...priceCol,
      enableCellChangeFlash: false,
      valueFormatter: (params) => formatInt(params.value),
      minWidth: 90,
    },
    {
      field: "daysToExpiry",
      headerName: "Days",
      headerTooltip: "Calendar days to the selected future's expiry",
      ...priceCol,
      enableCellChangeFlash: false,
      valueFormatter: (params) => formatNumber(params.value, 0),
      minWidth: 90,
    },
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

type SortMode = "symbol" | "opportunity";

const statusLabel: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
};

export default function CashFutureTable() {
  const gridRef = useRef<AgGridReact<Row>>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("symbol");
  const [quickFilter, setQuickFilter] = useState("");

  const handleUpdate = useCallback((rows: Row[]) => {
    gridRef.current?.api?.applyTransaction({ update: rows });
  }, []);

  const { snapshot, status, lastUpdate } = useMarketData(WS_URL, handleUpdate);

  // Ranking by annualised basis needs that column present to sort on.
  const detailsVisible = showDetails || sortMode === "opportunity";

  const columnDefs = useMemo(
    () => buildColumnDefs(detailsVisible),
    [detailsVisible],
  );

  // `sort` on a colDef is only an initial value, so drive it through column
  // state — this re-applies cleanly whenever the mode or columns change.
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api || !snapshot) return;
    api.applyColumnState({
      state:
        sortMode === "opportunity"
          ? [{ colId: "annualizedBasisPct", sort: "desc" }]
          : [{ colId: "symbol", sort: "asc" }],
      defaultState: { sort: null },
    });
  }, [sortMode, detailsVisible, snapshot]);

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
          {snapshot && <span className="meta">{snapshot.length} stocks</span>}
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
          <label className="control-label">
            Rank
            <select
              className="select"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              <option value="symbol">by symbol</option>
              <option value="opportunity">by annualised basis</option>
            </select>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={detailsVisible}
              disabled={sortMode === "opportunity"}
              onChange={(e) => setShowDetails(e.target.checked)}
            />
            Details
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
