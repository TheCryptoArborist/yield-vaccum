ALTER TABLE mint_invaders_runs ADD COLUMN metrics JSONB NOT NULL DEFAULT '{}'::jsonb;
