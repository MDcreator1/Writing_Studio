CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE projects (
  id uuid PRIMARY KEY, title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  type text NOT NULL CHECK (type IN ('novel','story','news')),
  language text NOT NULL CHECK (language IN ('hi','en')),
  metadata jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  PRIMARY KEY(project_id,user_id)
);
CREATE INDEX memberships_user ON memberships(user_id,project_id);
CREATE TABLE parts (
  project_id uuid NOT NULL REFERENCES projects(id), id uuid NOT NULL,
  title text NOT NULL, order_key bigint NOT NULL, revision integer NOT NULL,
  deleted boolean NOT NULL DEFAULT false, PRIMARY KEY(project_id,id)
);
CREATE TABLE documents (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), part_id uuid,
  kind text NOT NULL CHECK (kind IN ('chapter','draft','recovery','trash','article')),
  title text NOT NULL, settings jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0,
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE(project_id,id), FOREIGN KEY(project_id,part_id) REFERENCES parts(project_id,id)
);
CREATE INDEX documents_project ON documents(project_id,id);
CREATE TABLE paragraphs (
  id uuid NOT NULL, document_id uuid NOT NULL REFERENCES documents(id),
  order_key bigint NOT NULL, text text NOT NULL CHECK (length(text) <= 1048576),
  separator text NOT NULL CHECK (separator IN ('', E'\n', E'\r', E'\r\n')),
  revision integer NOT NULL, deleted boolean NOT NULL DEFAULT false,
  PRIMARY KEY(document_id,id)
);
CREATE INDEX paragraphs_range ON paragraphs(document_id,deleted,order_key,id);
CREATE TABLE metadata_records (
  project_id uuid NOT NULL REFERENCES projects(id), kind text NOT NULL,
  id uuid NOT NULL, payload jsonb NOT NULL, revision integer NOT NULL,
  deleted boolean NOT NULL DEFAULT false, PRIMARY KEY(project_id,kind,id),
  CHECK (kind IN ('naming-category','naming-entry','fact','dictionary-rule','project-settings','note'))
);
CREATE TABLE operation_receipts (
  project_id uuid NOT NULL REFERENCES projects(id), operation_id uuid NOT NULL,
  actor_id uuid NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,operation_id)
);
CREATE TABLE change_log (
  project_id uuid NOT NULL REFERENCES projects(id), revision integer NOT NULL,
  operation_id uuid NOT NULL, changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,revision)
);
INSERT INTO schema_migrations(version) VALUES(1);
