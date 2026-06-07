-- 00148_strip_orphan_tags.sql
-- Clean up seed-residue tags. Removes the default experiment-tag definitions
-- left by the dev seed script, then strips any orphan tag label (a label on a
-- sample/experiment with no matching project tag definition) so previously
-- unremovable "stuck" tags disappear from production entities.

-- +goose Up

-- 1. Drop the known seed experiment-tag definitions.
DELETE FROM project_experiment_tags
 WHERE label IN ('approval', 'auth', 'regression', 'mcp', 'pat', 'readback');

-- 2. Strip orphan labels from experiments (labels with no matching definition
--    for that experiment's project — includes the seed labels deleted above).
UPDATE experiments e
   SET tags = COALESCE((
         SELECT jsonb_agg(elem)
           FROM jsonb_array_elements_text(e.tags) AS elem
          WHERE EXISTS (
                SELECT 1 FROM project_experiment_tags pet
                 WHERE pet.project_id = e.project_id AND pet.label = elem)
       ), '[]'::jsonb),
       updated_at = now()
 WHERE e.tags <> '[]'::jsonb
   AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(e.tags) AS elem
          WHERE NOT EXISTS (
                SELECT 1 FROM project_experiment_tags pet
                 WHERE pet.project_id = e.project_id AND pet.label = elem));

-- 3. Strip orphan labels from samples.
UPDATE samples s
   SET tags = COALESCE((
         SELECT jsonb_agg(elem)
           FROM jsonb_array_elements_text(s.tags) AS elem
          WHERE EXISTS (
                SELECT 1 FROM project_sample_tags pst
                 WHERE pst.project_id = s.project_id AND pst.label = elem)
       ), '[]'::jsonb),
       updated_at = now()
 WHERE s.tags <> '[]'::jsonb
   AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(s.tags) AS elem
          WHERE NOT EXISTS (
                SELECT 1 FROM project_sample_tags pst
                 WHERE pst.project_id = s.project_id AND pst.label = elem));

-- +goose Down
-- Irreversible: deleted tag definitions and stripped labels cannot be restored.
SELECT 1;
