ALTER TABLE arcade_results DROP CONSTRAINT arcade_results_game_check;
ALTER TABLE arcade_results ADD CONSTRAINT arcade_results_game_check CHECK(game IN ('mint-flyer','mint-invaders','mint-stack'));

CREATE TABLE mint_stack_runs (
  context TEXT NOT NULL, run_id TEXT NOT NULL, payment_id TEXT NOT NULL,
  player_key TEXT NOT NULL, wallet_address TEXT NOT NULL, nickname TEXT NOT NULL,
  network TEXT NOT NULL CHECK(network IN ('arc','robinhood')),
  score INTEGER NOT NULL CHECK(score>=0), lines INTEGER NOT NULL CHECK(lines>=0),
  level INTEGER NOT NULL CHECK(level>=1), pieces INTEGER NOT NULL CHECK(pieces>=0),
  fours INTEGER NOT NULL CHECK(fours>=0), ticks INTEGER NOT NULL CHECK(ticks>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(context,run_id), UNIQUE(context,payment_id)
);
CREATE INDEX mint_stack_score ON mint_stack_runs(context,score DESC,lines DESC,created_at);
