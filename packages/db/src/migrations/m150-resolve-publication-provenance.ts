export const m150ResolvePublicationProvenance = `
ALTER TABLE resolve_publications ADD COLUMN target_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE resolve_publications ADD COLUMN candidate_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE resolve_publications ADD COLUMN approved_item_ids_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE resolve_publication_threads ADD COLUMN source_fingerprint TEXT;
ALTER TABLE resolve_publication_threads ADD COLUMN operation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE resolve_publication_threads ADD COLUMN reply_attempted_at INTEGER;

UPDATE resolve_publications SET target_ref = 'refs/heads/' || branch WHERE target_ref = '' AND branch <> '';
UPDATE resolve_publication_threads SET operation_id = publication_id || ':' || thread_id WHERE operation_id = '';
`;
