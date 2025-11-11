BEGIN;

-- 1) Stats per (pat_id, patient_fk)
CREATE TEMP TABLE _pat_stats ON COMMIT DROP AS
SELECT
  pid.pat_id,
  pid.patient_fk,
  MAX( (pid.entity_id = 'elvasoft')::int ) AS has_elvasoft,
  COALESCE(p.num_studies, 0)               AS num_studies,
  p.updated_time
FROM public.patient_id pid
JOIN public.patient   p ON p.pk = pid.patient_fk
GROUP BY pid.pat_id, pid.patient_fk, p.num_studies, p.updated_time;

-- pat_ids to process (multi owner or any non-elvasoft id rows)
CREATE TEMP TABLE _pat_needs_fix ON COMMIT DROP AS
SELECT pat_id
FROM (
  SELECT pid.pat_id,
         COUNT(DISTINCT pid.patient_fk) AS distinct_patients,
         COUNT(*) FILTER (WHERE COALESCE(pid.entity_id,'') <> 'elvasoft') AS non_elva_ids
  FROM public.patient_id pid
  GROUP BY pid.pat_id
) x
WHERE distinct_patients > 1 OR non_elva_ids > 0;

-- 2) Canonical chooser
CREATE TEMP TABLE _canonical ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    s.pat_id,
    s.patient_fk,
    ROW_NUMBER() OVER (
      PARTITION BY s.pat_id
      ORDER BY s.has_elvasoft DESC, s.num_studies DESC, s.updated_time DESC, s.patient_fk ASC
    ) AS rn
  FROM _pat_stats s
  WHERE s.pat_id IN (SELECT pat_id FROM _pat_needs_fix)
)
SELECT pat_id, patient_fk
FROM ranked
WHERE rn = 1;

-- 3) Move studies others -> canonical
UPDATE public.study st
SET patient_fk = c.patient_fk
FROM _canonical c
WHERE st.patient_fk IN (
  SELECT ps.patient_fk
  FROM _pat_stats ps
  WHERE ps.pat_id = c.pat_id AND ps.patient_fk <> c.patient_fk
);

-- 4) Reattach ALL patient_id to canonical + enforce issuer = elvasoft
UPDATE public.patient_id pid
SET patient_fk = c.patient_fk,
    entity_id  = 'elvasoft',
    version    = COALESCE(pid.version, 0)
FROM _canonical c
WHERE pid.pat_id = c.pat_id
  AND (pid.patient_fk <> c.patient_fk OR COALESCE(pid.entity_id,'') <> 'elvasoft');

-- Deduplicate exact duplicates on canonical (keep smallest pk)
WITH d AS (
  SELECT pk,
         ROW_NUMBER() OVER (
           PARTITION BY patient_fk, pat_id,
                        COALESCE(entity_id,''), COALESCE(entity_uid,''),
                        COALESCE(entity_uid_type,''), COALESCE(pat_id_type_code,'')
           ORDER BY pk
         ) rn
  FROM public.patient_id
)
DELETE FROM public.patient_id p
USING d
WHERE p.pk = d.pk AND d.rn > 1;

-- Remove any leftover non-elvasoft rows (defensive) for pat_ids we touched
DELETE FROM public.patient_id pid
USING _canonical c
WHERE pid.pat_id = c.pat_id
  AND COALESCE(pid.entity_id,'') <> 'elvasoft';

-- 5) Recompute counters
UPDATE public.patient p
SET num_studies = (SELECT COUNT(*) FROM public.study s WHERE s.patient_fk = p.pk)
WHERE EXISTS (SELECT 1 FROM _pat_stats ps WHERE ps.patient_fk = p.pk)
   OR EXISTS (SELECT 1 FROM _canonical  c  WHERE c.patient_fk = p.pk);

-- 6) Delete only truly unreferenced patients
-- 6a. Candidates: no studies and no patient_id rows
DROP TABLE IF EXISTS _del_patients;
CREATE TEMP TABLE _del_patients ON COMMIT DROP AS
SELECT p.pk
FROM public.patient p
LEFT JOIN public.patient_id pid ON pid.patient_fk = p.pk
WHERE p.num_studies = 0
  AND pid.patient_fk IS NULL;

-- 6b. Remove from _del_patients any pk that is still referenced by ANY FK to public.patient
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      n.nspname  AS sch,
      c.relname  AS tbl,
      a.attname  AS col
    FROM   pg_constraint con
    JOIN   pg_class      c  ON c.oid = con.conrelid
    JOIN   pg_namespace  n  ON n.oid = c.relnamespace
    JOIN   unnest(con.conkey) k(attnum) ON true
    JOIN   pg_attribute  a  ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE  con.contype   = 'f'
       AND con.confrelid = 'public.patient'::regclass
  LOOP
    EXECUTE format(
      'DELETE FROM _del_patients dp
       WHERE EXISTS (SELECT 1 FROM %I.%I ch WHERE ch.%I = dp.pk)',
       r.sch, r.tbl, r.col
    );
  END LOOP;
END$$;

-- 6c. Now safe to delete remaining truly unreferenced patients
DELETE FROM public.patient p
WHERE p.pk IN (SELECT pk FROM _del_patients);

ROLLBACK;