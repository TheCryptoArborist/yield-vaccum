CREATE TABLE mint_invaders_runs (
 context TEXT NOT NULL,
 run_id TEXT NOT NULL,
 payment_id TEXT NOT NULL,
 player_key TEXT NOT NULL,
 nickname TEXT NOT NULL,
 wallet_address TEXT NOT NULL,
 network TEXT NOT NULL CHECK (network IN ('robinhood','arc')),
 score INTEGER NOT NULL CHECK (score >= 0),
 wave INTEGER NOT NULL CHECK (wave > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (context,run_id),
 UNIQUE (context,payment_id)
);
CREATE INDEX mint_invaders_rank ON mint_invaders_runs (context,score DESC,wave DESC,created_at ASC);
