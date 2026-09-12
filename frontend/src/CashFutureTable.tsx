import { darkTheme, lightTheme } from "./agGridSetup";
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

const annualisedBasisCol: ColDef<Row> = {
  field: "annualizedBasisPct",
  headerName: "Ann. Basis",
  headerTooltip: "Basis annualised over days to expiry — comparable across stocks",
  ...priceCol,
  cellClass: undefined,
  cellClassRules: signedCellClass,
  valueFormatter: (params) => formatPct(params.value),
  minWidth: 120,
};

// The five columns the brief asks for are always visible, in order. Everything
// else is opt-in, so the default view matches the spec exactly.
function buildColumnDefs(showDetails: boolean, showBasis: boolean): ColDef<Row>[] {
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

  if (!showDetails) {
    // Ranking by basis shows the one column being ranked on, nothing more.
    return showBasis ? [...required, annualisedBasisCol] : required;
  }

  return [
    ...required,
    annualisedBasisCol,
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

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** AG Grid themes are objects, not CSS, so the scheme has to be picked in JS. */
function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia?.(DARK_QUERY).matches ?? false,
  );

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return dark;
}

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
  const [paused, setPaused] = useState(false);
  const [visibleRows, setVisibleRows] = useState<number | null>(null);
  const prefersDark = usePrefersDark();

  // Ticks arrive off the React render cycle, so the pause flag and the
  // buffer of what was missed both live in refs.
  const pausedRef = useRef(false);
  const missedRef = useRef(new Map<string, Row>());

  const handleUpdate = useCallback((rows: Row[]) => {
    if (pausedRef.current) {
      // Keep only the newest row per symbol, so resuming applies one
      // transaction with current prices rather than replaying history.
      for (const row of rows) missedRef.current.set(row.symbol, row);
      return;
    }
    gridRef.current?.api?.applyTransaction({ update: rows });
  }, []);

  const { snapshot, status, lastUpdate } = useMarketData(WS_URL, handleUpdate);

  const togglePause = useCallback(() => {
    setPaused((wasPaused) => {
      const nowPaused = !wasPaused;
      pausedRef.current = nowPaused;
      if (!nowPaused && missedRef.current.size > 0) {
        gridRef.current?.api?.applyTransaction({
          update: [...missedRef.current.values()],
        });
        missedRef.current.clear();
      }
      return nowPaused;
    });
  }, []);

  const exportCsv = useCallback(() => {
    gridRef.current?.api?.exportDataAsCsv({
      fileName: `cash-future-${new Date().toISOString().slice(0, 19)}.csv`,
    });
  }, []);

  const columnDefs = useMemo(
    () => buildColumnDefs(showDetails, sortMode === "opportunity"),
    [showDetails, sortMode],
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
  }, [sortMode, showDetails, snapshot]);

  const updateVisibleRows = useCallback(() => {
    const api = gridRef.current?.api;
    if (api) setVisibleRows(api.getDisplayedRowCount());
  }, []);

  const getRowId = useMemo(
    () => (params: { data: Row }) => params.data.symbol,
    [],
  );

  const total = snapshot?.length ?? 0;
  const filtered = visibleRows !== null && visibleRows !== total;

  return (
    <div className="page">
      <header className="page-header">
        <div className="title-row">
          <h1>Cash&ndash;Future Table</h1>
          <span className={`status-pill status-${status}`}>
            {statusLabel[status]}
          </span>
          {paused && <span className="status-pill status-paused">Paused</span>}
          {snapshot && (
            <span className="meta">
              {filtered ? `${visibleRows} of ${total}` : `${total}`} stocks
            </span>
          )}
          {lastUpdate && !paused && (
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
              checked={showDetails}
              onChange={(e) => setShowDetails(e.target.checked)}
            />
            Details
          </label>
          <button type="button" className="btn" onClick={togglePause}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="btn" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </header>
      <div className="grid-wrapper">
        <AgGridReact<Row>
          ref={gridRef}
          theme={prefersDark ? darkTheme : lightTheme}
          rowData={snapshot ?? []}
          columnDefs={columnDefs}
          getRowId={getRowId}
          quickFilterText={quickFilter}
          defaultColDef={{ resizable: true, sortable: true }}
          cellFlashDuration={800}
          animateRows
          onModelUpdated={updateVisibleRows}
          overlayNoRowsTemplate={
            status === "connected"
              ? "Waiting for the first snapshot…"
              : "Not connected to the market data server — check the backend is running."
          }
        />
      </div>
    </div>
  );
}
