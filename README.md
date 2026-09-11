# nse-cash-future-table

![CI](https://github.com/rmnvg/nse-cash-future-table/actions/workflows/ci.yml/badge.svg)

Real-time NSE cash–future spread table. A Node.js/WebSocket backend replays
recorded NSE tick data, PostgreSQL stores contract reference data, and a
React + AG Grid frontend renders live prices, spreads and basis — one row
per stock, updating once per second.

![Live demo](docs/demo.gif)

Each row shows, per stock: Symbol, Stock LTP (cash leg), Future LTP (nearest
FUTSTK expiry), Buy Spread (`Future Bid − Stock Ask`) and Sell Spread
(`Stock Bid − Future Ask`) — the columns the brief asks for, in that order.

## Ranking by opportunity

A rupee spread isn't comparable across stocks: ABB at ₹7447 with a ₹121
spread and ADANIPOWER at ₹207 with a ₹12 spread can't be ranked against each
other. So the table also derives **basis %** and **annualised basis %**,
which normalise the spread against spot and the time left to expiry — the
number a cash-and-carry desk actually ranks on. Switching **Rank** to
_by annualised basis_ surfaces the widest opportunities instead of whatever
happens to be alphabetically first:

![Ranked by annualised basis](docs/basis-ranking.png)

Lot size comes from the NSEFO contract file, so each spread is also shown as
rupees per contract (`Buy ₹/Lot`) — what a trader actually sizes on.

## Quick start

```
npm run install:all     # root + backend + frontend deps
npm run db:up           # Postgres in Docker
cp backend/.env.example backend/.env   # then set DATA_DIR
npm run setup           # migrate + ingest both contract files
npm run dev             # backend and frontend together
```

Then open `http://localhost:5173`.

`DATA_DIR` must be the absolute path to the folder holding the 4 NSE CSV
files (`nse_cm_ref_contract_master.csv`, `nse_fo_ref_contract_master.csv`,
`nsecm_market_data.csv`, `nsefo_market_data.csv`). They aren't committed —
they total ~950MB. The backend fails fast naming the missing file if the
path is wrong.

## Step by step

### 1. Start Postgres

```
docker compose up -d
```

Wait for `cashfuture_postgres` to report healthy (`docker ps`).

### 2. Configure the backend

```
cd backend
cp .env.example .env
```

Set `DATA_DIR`. Every option is documented inline in `.env.example`.

### 3. Load the database

```
npm run migrate            # creates cm_contracts / fo_contracts
npm run ingest:contracts   # streams both contract CSVs into Postgres
npm run verify:contracts   # counts + RELIANCE's contracts, nearest first
npm run check:universe     # the resolved cash+future stock universe
```

Both are safely re-runnable: the schema drops and recreates its tables, and
inserts use `ON CONFLICT (token) DO NOTHING`.

Expected: 4433 cash contracts, 647 FUTSTK futures (76,534 non-FUTSTK rows
skipped), and a 210-stock universe.

### 4. Run it

```
npm run dev     # from the repo root — starts both servers
```

Or separately: `npm run dev` inside `backend/` and `frontend/`. The frontend
defaults to `ws://localhost:8080`; override with `VITE_WS_URL` (see
`frontend/.env.example`).

## Tests

```
npm test        # from the repo root, or inside backend/
```

56 tests: unit coverage of the two file formats, the NSE epoch conversion,
timestamp bucketing, token routing, the spread formulas (partial-leg nulls,
rounding, zero-spot guards), basis/annualisation, lot sizing, and the
simulator's paise conversion and loop-back wrap; plus integration tests that
run the real WebSocket server against the real row state driven by a stub
simulator, asserting snapshot-then-delta behaviour, fan-out to multiple
clients, and clean handling of a client disconnecting mid-broadcast.

They need neither Postgres nor the CSV files, so they run anywhere — which
is what lets CI stay green without the data.

## Measured performance

On an M-series MacBook, replaying the full provided dataset:

| | |
|---|---|
| Cold start to first tick | **14.0s** |
| Cash file: filter + bucket | 1,629,624 rows → 23,223 buckets in 4.0s |
| Futures file: filter + bucket | 1,667,989 rows → 10,414 buckets in 10.0s |
| Resident memory, steady state | **436 MB** for ~3.3M buffered ticks |
| Snapshot payload (210 rows) | 75.6 KB |
| Update payload | ~21 KB, avg 59 symbols/tick |
| WebSocket throughput | ~63 KB/s |

The startup cost is entirely the one-off parse of ~950MB of CSV; after that
each tick is an O(changed tokens) map write plus one broadcast.

## How it works

```
contract CSVs ──► ingest ──► PostgreSQL ──┐
                                          ├─► symbol universe (210 stocks)
                                          │   cash token + nearest future token
market data CSVs ──► filter to those ─────┘
                     tokens, bucket by
                     timestamp, replay ──► row state ──► WebSocket ──► AG Grid
                     1 bucket/second       + spreads     snapshot,     transaction
                                           + basis       then deltas   per tick
```

## Design decisions

- **The two file types have different formats.** Contract files are
  space-delimited; market data files are comma-delimited — despite both
  using a `.csv` extension. Verified against the real files; separate
  parsers, each with the layout documented at the top.
- **NSE epoch offset.** `expiryDate` and market data `timestamp` are seconds
  since 1980-01-01 00:00:00 IST, not the Unix epoch. Adding
  `NSE_EPOCH_OFFSET_SEC` (315513000) converts them to Unix seconds (UTC) —
  which is what makes RELIANCE's September future land on 2026-09-29.
- **Prices are integers in paise.** Divided by 100 at the simulator boundary
  so everything downstream is in rupees.
- **Market data is filtered to the ~420 relevant tokens before anything
  else.** The raw files hold 8.4M and 20.3M rows across 12,454 and 26,255
  tokens, but only tokens belonging to stocks with both legs matter.
  Filtering first cuts it to ~1.6M rows per file — the difference between a
  tractable in-memory replay and an intractable one.
- **Replay loops rather than preserving real elapsed time.** The sample
  doesn't cover a full session and the two files span different,
  unsynchronised windows (~26h for cash, ~3h for futures). Ticks are grouped
  into per-second buckets; each leg's simulator advances one bucket per
  `TICK_INTERVAL_MS` and wraps back to the start independently.
- **Spreads are computed server-side.** `Buy Spread = Future Bid − Stock
  Ask`, `Sell Spread = Stock Bid − Future Ask`, recomputed every tick so all
  clients render identical numbers. A spread stays `null` (shown as `—`)
  until both legs have ticked, rather than rendering `NaN`.
- **Basis uses LTPs, spreads use bid/ask.** The spreads are executable
  numbers, so they use the book. Basis describes where the future trades
  relative to spot regardless of how wide the book is, so it uses LTPs.
  Annualising over days-to-expiry is what makes a 0.4% basis on one stock
  comparable with 1.2% on another.
- **The wire payload carries bid/ask/LTP for both legs**, as the brief
  specifies, plus the derived spreads, basis and contract metadata.
- **Snapshot-then-delta over WebSocket.** A new client gets every row
  immediately; after that only symbols that changed in a tick are broadcast,
  and the grid applies them via `applyTransaction` keyed by `getRowId`, so a
  tick updates a handful of cells instead of re-rendering 210 rows.
- **NSE test instruments are excluded by default.** 18 `…NSETEST` symbols
  have contracts on both legs and so pass the cash+future join, but never
  receive market data — they'd sit at the top of the table permanently
  empty. `EXCLUDE_TEST_SYMBOLS=false` puts them back (universe: 228).
- **Spread magnitudes look wide.** In this recorded sample a token's bid/ask
  can swing much further between ticks than a live order book would, so
  absolute spreads of tens or hundreds of rupees are normal here. The basis
  columns, being LTP-based, are better behaved.

## Project layout

```
backend/src
  config.ts              env loading + validation (fails fast on bad DATA_DIR)
  db/                    pool, schema, migration, symbol universe, token routing
  ingest/                streaming line reader, contract parsers, bulk loader
  market/                tick parsing, filtering, bucketing, replay, row state
  ws/                    WebSocket server, snapshot + delta broadcast
frontend/src
  useMarketData.ts       WebSocket client, reconnect, snapshot vs delta split
  CashFutureTable.tsx    AG Grid setup, columns, transactions, ranking
```

## Known limitations

- Replays a recorded sample rather than a live market feed.
- Both files are held in memory after filtering (~3.3M rows, 436MB); a
  production feed would stream rather than preload.
- Days-to-expiry is computed from the current date, so the annualised basis
  shifts as the real calendar approaches the contract's expiry.
- Display only — no order execution, per the brief.
