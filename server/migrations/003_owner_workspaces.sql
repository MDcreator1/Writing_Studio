CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO workspaces(id, owner_id)
SELECT DISTINCT user_id, user_id FROM memberships WHERE role = 'owner';

ALTER TABLE projects ADD COLUMN workspace_id uuid REFERENCES workspaces(id);

UPDATE projects p
SET workspace_id = (
  SELECT m.user_id FROM memberships m
  WHERE m.project_id = p.id AND m.role = 'owner'
  ORDER BY m.user_id LIMIT 1
);

CREATE INDEX projects_workspace ON projects(workspace_id, id);
ALTER TABLE parts ADD COLUMN synopsis text NOT NULL DEFAULT '';
ALTER TABLE metadata_records DROP CONSTRAINT metadata_records_kind_check;
ALTER TABLE metadata_records ADD CHECK (kind IN ('naming-category','naming-entry','fact','dictionary-rule','project-settings','note','news-article'));

INSERT INTO schema_migrations(version) VALUES(3);
