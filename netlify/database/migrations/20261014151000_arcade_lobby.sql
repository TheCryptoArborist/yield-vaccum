CREATE TABLE arcade_pilots (
 context TEXT NOT NULL, wallet_address TEXT NOT NULL, pilot_id UUID NOT NULL DEFAULT gen_random_uuid(),
 PRIMARY KEY(context,wallet_address), UNIQUE(context,pilot_id)
);
CREATE TABLE arcade_results (
 context TEXT NOT NULL, game TEXT NOT NULL CHECK(game IN ('mint-flyer','mint-invaders')), run_id TEXT NOT NULL,
 player_key TEXT NOT NULL, wallet_address TEXT NOT NULL, nickname TEXT NOT NULL,
 score INTEGER NOT NULL CHECK(score>=0), tie_break INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(context,game,run_id),
 FOREIGN KEY(context,wallet_address) REFERENCES arcade_pilots(context,wallet_address)
);
CREATE INDEX arcade_results_player ON arcade_results(context,player_key);
CREATE INDEX arcade_results_wallet ON arcade_results(context,wallet_address,created_at DESC);
INSERT INTO arcade_pilots(context,wallet_address)
 SELECT DISTINCT context,lower(wallet_address) FROM mint_invaders_runs ON CONFLICT DO NOTHING;
INSERT INTO arcade_results(context,game,run_id,player_key,wallet_address,nickname,score,tie_break,created_at)
 SELECT context,'mint-invaders',run_id,player_key,lower(wallet_address),nickname,score,wave,created_at FROM mint_invaders_runs ON CONFLICT DO NOTHING;
