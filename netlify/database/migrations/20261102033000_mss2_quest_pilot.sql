-- Additive, isolated quest storage. No arcade tables or token accounting change.
CREATE TABLE quest_rate_limits (
  scope text NOT NULL, key text NOT NULL, window timestamptz NOT NULL, hits integer NOT NULL CHECK(hits > 0),
  PRIMARY KEY(scope,key,window)
);
CREATE INDEX quest_rate_expiry ON quest_rate_limits(window);
CREATE TABLE quest_challenges (
  scope text NOT NULL, nonce text NOT NULL, wallet text NOT NULL CHECK(wallet ~ '^0x[0-9a-f]{40}$'),
  network text NOT NULL CHECK(network IN ('arc','robinhood')), origin text NOT NULL,
  message text NOT NULL, binding_hash text NOT NULL, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY(scope,nonce)
);
CREATE INDEX quest_challenge_expiry ON quest_challenges(expires_at);
CREATE TABLE quest_sessions (
  scope text NOT NULL, token_hash text NOT NULL, wallet text NOT NULL CHECK(wallet ~ '^0x[0-9a-f]{40}$'),
  network text NOT NULL CHECK(network IN ('arc','robinhood')), expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY(scope,token_hash)
);
CREATE INDEX quest_session_expiry ON quest_sessions(expires_at);
CREATE TABLE quest_campaigns (
  scope text NOT NULL, id uuid NOT NULL, title text NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
  summary text NOT NULL CHECK(length(summary) BETWEEN 20 AND 1200),
  network text NOT NULL CHECK(network IN ('arc','robinhood')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, review_ends_at timestamptz NOT NULL,
  participant_cap integer NOT NULL CHECK(participant_cap BETWEEN 1 AND 1000),
  terms_version integer NOT NULL DEFAULT 1 CHECK(terms_version=1),
  reward_kind text NOT NULL DEFAULT 'points_only' CHECK(reward_kind='points_only'),
  created_by text NOT NULL CHECK(created_by ~ '^0x[0-9a-f]{40}$'), created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(scope,id), CHECK(ends_at>starts_at AND review_ends_at>ends_at)
);
CREATE TABLE quest_members (
  scope text NOT NULL, campaign_id uuid NOT NULL, wallet text NOT NULL CHECK(wallet ~ '^0x[0-9a-f]{40}$'),
  joined_at timestamptz NOT NULL DEFAULT NOW(), accepted_terms integer NOT NULL CHECK(accepted_terms=1),
  quiz_attempts integer NOT NULL DEFAULT 0 CHECK(quiz_attempts BETWEEN 0 AND 5), quiz_last_at timestamptz,
  PRIMARY KEY(scope,campaign_id,wallet), FOREIGN KEY(scope,campaign_id) REFERENCES quest_campaigns(scope,id)
);
CREATE TABLE quest_submissions (
  scope text NOT NULL, campaign_id uuid NOT NULL, wallet text NOT NULL,
  task text NOT NULL CHECK(task IN ('quiz','contribution')),
  status text NOT NULL CHECK(status IN ('pending','approved','rejected')),
  content text NOT NULL DEFAULT '' CHECK(length(content)<=2000),
  reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500), reviewer text,
  submitted_at timestamptz NOT NULL DEFAULT NOW(), reviewed_at timestamptz,
  PRIMARY KEY(scope,campaign_id,wallet,task),
  FOREIGN KEY(scope,campaign_id,wallet) REFERENCES quest_members(scope,campaign_id,wallet)
);
CREATE TABLE quest_points (
  scope text NOT NULL, campaign_id uuid NOT NULL, wallet text NOT NULL, task text NOT NULL,
  points integer NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(scope,campaign_id,wallet,task),
  FOREIGN KEY(scope,campaign_id,wallet,task) REFERENCES quest_submissions(scope,campaign_id,wallet,task),
  CHECK((task='quiz' AND points=50) OR (task='contribution' AND points=100))
);
CREATE TABLE quest_audit (
  scope text NOT NULL, id uuid NOT NULL, campaign_id uuid NOT NULL, actor text NOT NULL,
  action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(scope,id), FOREIGN KEY(scope,campaign_id) REFERENCES quest_campaigns(scope,id)
);
CREATE INDEX quest_review_queue ON quest_submissions(scope,status,submitted_at) WHERE task='contribution';
-- Frozen campaign rules: only open/closed state transitions remain mutable.
CREATE FUNCTION guard_quest_campaign_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.title,NEW.summary,NEW.network,NEW.starts_at,NEW.ends_at,NEW.review_ends_at,NEW.participant_cap,NEW.terms_version,NEW.reward_kind,NEW.created_by)
    IS DISTINCT FROM (OLD.title,OLD.summary,OLD.network,OLD.starts_at,OLD.ends_at,OLD.review_ends_at,OLD.participant_cap,OLD.terms_version,OLD.reward_kind,OLD.created_by) THEN
    RAISE EXCEPTION 'Published quest terms are immutable';
  END IF;
  IF (OLD.status='open' AND NEW.status='draft') OR (OLD.status='closed' AND NEW.status<>'closed') THEN
    RAISE EXCEPTION 'A quest cannot be reset or reopened';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER quest_campaign_terms BEFORE UPDATE ON quest_campaigns FOR EACH ROW EXECUTE FUNCTION guard_quest_campaign_terms();
