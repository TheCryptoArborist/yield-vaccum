CREATE TABLE mint_flyer_trials (
  wallet TEXT PRIMARY KEY CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  player_key TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  network TEXT NOT NULL CHECK (network IN ('robinhood', 'arc')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
