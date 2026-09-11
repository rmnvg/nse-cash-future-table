-- Safely re-runnable: drop in dependency-irrelevant but consistent order.
DROP TABLE IF EXISTS fo_contracts;
DROP TABLE IF EXISTS cm_contracts;

-- NSECM cash/stock contracts
CREATE TABLE cm_contracts (
  token            integer primary key,
  symbol           text not null,
  instrument_type  text,
  contract_name    text
);

-- NSEFO futures (only FUTSTK rows, filtered at ingestion time, not here)
CREATE TABLE fo_contracts (
  token            integer primary key,
  symbol           text not null,
  instrument_type  text not null,
  expiry_date      timestamptz not null,
  lot_size         integer,
  contract_name    text
);

CREATE INDEX idx_cm_contracts_symbol ON cm_contracts (symbol);
CREATE INDEX idx_fo_contracts_symbol_expiry ON fo_contracts (symbol, expiry_date);
