CREATE TABLE cloud_accounts (
  username text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(5);
