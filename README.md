# nse-cash-future-table

Real-time NSE cash–future spread table — Node.js/WebSocket backend replays
recorded tick data, PostgreSQL stores contract reference data, React + AG
Grid frontend renders live cash/future LTP and spreads.

## Setup

1. Start Postgres:

   ```
   docker compose up -d
   ```

2. Configure the backend:

   ```
   cd backend
   cp .env.example .env
   ```

   Edit `.env` and set `DATA_DIR` to the absolute path of the folder
   containing the 4 NSE CSV files.

3. Install dependencies and start the dev server:

   ```
   npm install
   npm run dev
   ```
