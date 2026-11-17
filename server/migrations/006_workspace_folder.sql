ALTER TABLE workspaces ADD COLUMN folder_hint text;
INSERT INTO schema_migrations(version) VALUES(6);
