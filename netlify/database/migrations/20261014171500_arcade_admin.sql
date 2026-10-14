CREATE TABLE arcade_admin_challenges (
 context TEXT NOT NULL, nonce UUID NOT NULL, wallet TEXT NOT NULL, network TEXT NOT NULL CHECK(network IN ('arc','robinhood')),
 origin TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(context,nonce)
);
CREATE INDEX arcade_admin_challenge_wallet ON arcade_admin_challenges(context,wallet,created_at);
CREATE TABLE arcade_admin_sessions (
 context TEXT NOT NULL, token_hash TEXT NOT NULL, wallet TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(context,token_hash)
);
ALTER TABLE arcade_results ADD COLUMN network TEXT CHECK(network IN ('arc','robinhood'));
UPDATE arcade_results r SET network=i.network FROM mint_invaders_runs i
 WHERE r.context=i.context AND r.game='mint-invaders' AND r.run_id=i.run_id;
