CREATE TABLE staged_batches (
  project_id uuid NOT NULL REFERENCES projects(id), operation_id uuid NOT NULL,
  actor_id uuid NOT NULL, digest text NOT NULL, total_bytes integer NOT NULL,
  chunk_count integer NOT NULL, committed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,operation_id),
  CHECK (total_bytes BETWEEN 1 AND 67108864), CHECK (chunk_count BETWEEN 1 AND 512)
);
CREATE INDEX staged_batches_expiry ON staged_batches(created_at);
CREATE TABLE staged_chunks (
  project_id uuid NOT NULL, operation_id uuid NOT NULL, chunk_index integer NOT NULL,
  content text NOT NULL, PRIMARY KEY(project_id,operation_id,chunk_index),
  FOREIGN KEY(project_id,operation_id) REFERENCES staged_batches(project_id,operation_id) ON DELETE CASCADE
);
INSERT INTO schema_migrations(version) VALUES(2);
