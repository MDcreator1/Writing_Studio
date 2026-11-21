ALTER TABLE cloud_accounts ADD COLUMN status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','blocked','banned','deleted'));
ALTER TABLE projects ADD COLUMN admin_blocked boolean NOT NULL DEFAULT false;
CREATE TABLE admin_credentials (
  user_id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  env_key text
);
INSERT INTO schema_migrations(version) VALUES(8);
