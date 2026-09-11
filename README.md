# nse-cash-future-table

Real-time NSE cash–future spread table. A Node.js/WebSocket backend replays
recorded NSE tick data, PostgreSQL stores contract reference data, and a
React + AG Grid frontend renders live cash/future LTP and spreads — one row
per stock, updating roughly once per second.

Each row shows, per stock: Symbol, Stock LTP (cash), Future LTP (nearest
FUTSTK expiry), Buy Spread (`Future Bid − Stock Ask`), and Sell Spread
(`Stock Bid − Future Ask`).

## Setup

### 1. Start Postgres

```
docker compose up -d
```

Waits for the `cashfuture_postgres` container to report healthy
(`docker ps` should show `(healthy)`).

### 2. Configure the backend

```
cd backend
cp .env.example .env
```

Edit `.env` and set `DATA_DIR` to the absolute path of the folder
containing the 4 NSE CSV files (`nse_cm_ref_contract_master.csv`,
`nse_fo_ref_contract_master.csv`, `nsecm_market_data.csv`,
`nsefo_market_data.csv`). These files are not committed to the repo.

### 3. Install backend dependencies and load the database

```
npm install
npm run migrate            # creates cm_contracts / fo_contracts
npm run ingest:contracts   # loads both contract CSVs into Postgres
npm run verify:contracts   # sanity-check counts + RELIANCE's contracts
npm run check:universe     # confirms the 228-stock cash+future universe
```

`ingest:contracts` and `migrate` are safely re-runnable (the schema drops
and recreates its tables; inserts use `ON CONFLICT DO NOTHING`).

### 4. Run the backend

```
npm run dev
```

Loads and filters both market data files (a few seconds), then starts the
WebSocket server on `ws://localhost:8080`.

### 5. Run the frontend

In a separate terminal:

```
cd frontend
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). By default
it connects to `ws://localhost:8080`; override with `VITE_WS_URL` (see
`frontend/.env.example`) if the backend runs elsewhere.

## Design decisions

- **Contract files are space-delimited, market data files are
  comma-delimited** — both have a `.csv` extension but different formats
  (verified against the real files). Ingestion (`backend/src/ingest/`) and
  market data replay (`backend/src/market/`) use separate parsers
  accordingly.
- **NSE epoch offset** — `expiryDate` (contract files) and `timestamp`
  (market data files) are stored as seconds since 1980-01-01 00:00:00 IST,
  not the standard Unix epoch. Adding `NSE_EPOCH_OFFSET_SEC` (315513000)
  converts them to normal Unix seconds (UTC).
- **Market data is filtered to the ~456 relevant tokens before replay** —
  the raw files are huge (8.4M / 20.3M rows) but only the tokens belonging
  to the 228 stocks with both a cash and nearest-FUTSTK contract are ever
  needed. Filtering up front (before bucketing or storing anything else in
  memory) is what makes replaying the full files at startup tractable.
- **Replay loops rather than preserving real elapsed time** — the market
  data doesn't cover a full trading day and the two files span different,
  unsynchronized windows (per-file timestamp buckets, not wall-clock
  time). Each of the two simulators (cash, future) advances one bucket per
  `TICK_INTERVAL_MS` and wraps back to the first bucket independently when
  it runs out, rather than trying to reproduce original real-world timing.
- **Buy/sell spread formulas** (per the assessment brief):
  `Buy Spread = Future Bid − Stock Ask`,
  `Sell Spread = Stock Bid − Future Ask`. Computed server-side per stock on
  every tick and sent to the frontend already calculated.
- **Note on spread magnitude**: in this recorded/synthetic dataset, bid/ask
  values for a given token can swing quite widely between ticks (unlike a
  typical live order book), so spreads of several tens to a few hundred
  rupees are normal here, not a bug.

## Known limitations

- This replays a recorded data sample rather than a live market feed.
- No order execution or trading functionality — display only, per the
  assessment brief.
