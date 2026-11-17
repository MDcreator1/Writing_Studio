-- These summaries are derived from authoritative rows and may be rebuilt.
CREATE TABLE document_render_stats (
  document_id uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  word_count integer NOT NULL,
  paragraph_count integer NOT NULL
);

CREATE FUNCTION lekhak_render_word_count(value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT count(*)::integer
  FROM regexp_split_to_table(value, U&'[\0009\000A\000B\000C\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+') AS word
  WHERE word <> '';
$$;

CREATE FUNCTION lekhak_refresh_document_stats(ids uuid[]) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO document_render_stats(document_id, revision, word_count, paragraph_count)
  SELECT d.id, d.revision, COALESCE(sum(lekhak_render_word_count(p.text)),0)::integer, count(p.id)::integer
  FROM documents d
  LEFT JOIN paragraphs p ON p.document_id=d.id AND NOT p.deleted
  WHERE d.id=ANY(ids)
  GROUP BY d.id
  ON CONFLICT(document_id) DO UPDATE SET
    revision=EXCLUDED.revision, word_count=EXCLUDED.word_count, paragraph_count=EXCLUDED.paragraph_count;
$$;

SELECT lekhak_refresh_document_stats(ARRAY(SELECT id FROM documents));

CREATE TABLE naming_render_stats (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  category_counts jsonb NOT NULL,
  document_source_counts jsonb NOT NULL
);

CREATE FUNCTION lekhak_refresh_naming_stats(target uuid, at_revision integer) RETURNS void
LANGUAGE sql AS $$
  WITH entries AS (
    SELECT payload->>'categoryId' AS category_id, payload->'source'->>'documentId' AS document_id
    FROM metadata_records WHERE project_id=target AND kind='naming-entry' AND NOT deleted
  ), categories AS (
    SELECT category_id, count(*) AS total FROM entries WHERE category_id IS NOT NULL GROUP BY category_id
  ), documents AS (
    SELECT document_id, count(*) AS total FROM entries WHERE document_id IS NOT NULL GROUP BY document_id
  )
  INSERT INTO naming_render_stats(project_id, revision, category_counts, document_source_counts)
  VALUES(target, at_revision,
    COALESCE((SELECT jsonb_object_agg(category_id,total) FROM categories),'{}'::jsonb),
    COALESCE((SELECT jsonb_object_agg(document_id,total) FROM documents),'{}'::jsonb))
  ON CONFLICT(project_id) DO UPDATE SET revision=EXCLUDED.revision,
    category_counts=EXCLUDED.category_counts, document_source_counts=EXCLUDED.document_source_counts;
$$;

SELECT lekhak_refresh_naming_stats(id, revision) FROM projects;

INSERT INTO schema_migrations(version) VALUES(4);
