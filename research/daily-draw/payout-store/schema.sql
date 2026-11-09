-- RESEARCH ONLY. Intentionally outside netlify/database/migrations.
-- Apply only to an empty local database named mss2_draw_research.
DO $$ BEGIN
  IF current_database() <> 'mss2_draw_research' THEN
    RAISE EXCEPTION 'Local research database required';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS draw_research;
CREATE TABLE IF NOT EXISTS draw_research.awards (
  id text PRIMARY KEY CHECK (id ~ '^0x[0-9a-f]{64}$'),
  chain_id integer NOT NULL CHECK (chain_id IN (31337,31338)),
  controller text NOT NULL,
  token text NOT NULL,
  round_id numeric NOT NULL CHECK (round_id > 0 AND round_id=trunc(round_id)),
  sender text NOT NULL CHECK (sender ~ '^0x[0-9a-f]{40}$'),
  locked jsonb NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0 AND amount=trunc(amount) AND amount < power(2::numeric,256)),
  credited numeric NOT NULL DEFAULT 0 CHECK (credited >= 0 AND credited=trunc(credited) AND credited <= amount),
  phase text NOT NULL DEFAULT 'AwardPending' CHECK (phase IN ('AwardPending','Prepared','Submitted','PaidInDatabase','PartiallyCredited','ZeroCredit','ReviewRequired')),
  revision bigint NOT NULL DEFAULT 0,
  UNIQUE(chain_id,controller,token,round_id)
);
CREATE TABLE IF NOT EXISTS draw_research.sender_lanes (
  chain_id integer NOT NULL CHECK (chain_id IN (31337,31338)),
  sender text NOT NULL,
  frozen boolean NOT NULL DEFAULT false,
  reason text,
  PRIMARY KEY(chain_id,sender)
);
CREATE TABLE IF NOT EXISTS draw_research.attempts (
  id uuid PRIMARY KEY,
  award_id text NOT NULL REFERENCES draw_research.awards(id),
  operation_key text NOT NULL UNIQUE,
  chain_id integer NOT NULL CHECK (chain_id IN (31337,31338)),
  sender text NOT NULL,
  nonce numeric NOT NULL CHECK (nonce>=0 AND nonce=trunc(nonce) AND nonce<power(2::numeric,256)),
  offered numeric NOT NULL CHECK (offered>=1000000000000000000 AND offered=trunc(offered) AND offered<power(2::numeric,256)),
  calldata text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('Prepared','Submitted','Confirmed','Reverted','ReviewRequired')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(chain_id,sender,nonce),
  FOREIGN KEY(chain_id,sender) REFERENCES draw_research.sender_lanes(chain_id,sender)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_attempt_per_award ON draw_research.attempts(award_id) WHERE active;
CREATE TABLE IF NOT EXISTS draw_research.transaction_bindings (
  chain_id integer NOT NULL,
  tx_hash text NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
  attempt_id uuid NOT NULL REFERENCES draw_research.attempts(id),
  PRIMARY KEY(chain_id,tx_hash)
);
CREATE TABLE IF NOT EXISTS draw_research.settlements (
  attempt_id uuid PRIMARY KEY REFERENCES draw_research.attempts(id),
  chain_id integer NOT NULL,
  tx_hash text NOT NULL,
  block_number numeric NOT NULL,
  block_hash text NOT NULL,
  credited numeric NOT NULL CHECK (credited>=0 AND credited=trunc(credited)),
  reverted boolean NOT NULL,
  active boolean NOT NULL DEFAULT true,
  evidence jsonb NOT NULL,
  fingerprint text NOT NULL,
  UNIQUE(chain_id,tx_hash),
  FOREIGN KEY(chain_id,tx_hash) REFERENCES draw_research.transaction_bindings(chain_id,tx_hash)
);
CREATE TABLE IF NOT EXISTS draw_research.consumed_logs (
  chain_id integer NOT NULL,
  tx_hash text NOT NULL,
  log_index numeric NOT NULL,
  attempt_id uuid NOT NULL REFERENCES draw_research.attempts(id),
  PRIMARY KEY(chain_id,tx_hash,log_index)
);
CREATE TABLE IF NOT EXISTS draw_research.settlement_outbox (
  id bigserial PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  award_id text NOT NULL REFERENCES draw_research.awards(id),
  kind text NOT NULL CHECK (kind IN ('ReceiptVerified','ReceiptOrphaned')),
  state text NOT NULL DEFAULT 'HeldForAuthorityReview' CHECK (state='HeldForAuthorityReview'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS draw_research.audit (
  id bigserial PRIMARY KEY,
  award_id text NOT NULL REFERENCES draw_research.awards(id),
  kind text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION draw_research.protect_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.chain_id IS DISTINCT FROM OLD.chain_id
 OR NEW.controller IS DISTINCT FROM OLD.controller OR NEW.token IS DISTINCT FROM OLD.token
 OR NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.sender IS DISTINCT FROM OLD.sender
 OR NEW.locked IS DISTINCT FROM OLD.locked OR NEW.amount IS DISTINCT FROM OLD.amount THEN
   RAISE EXCEPTION 'Award identity and policy are immutable';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS immutable_award ON draw_research.awards;
CREATE TRIGGER immutable_award BEFORE UPDATE ON draw_research.awards
 FOR EACH ROW EXECUTE FUNCTION draw_research.protect_identity();
