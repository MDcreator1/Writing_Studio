CREATE TABLE external_project_refs (
  owner_id uuid NOT NULL REFERENCES workspaces(owner_id),
  id uuid NOT NULL,
  folder_label text NOT NULL,
  title text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,id)
);
INSERT INTO schema_migrations(version) VALUES(7);
