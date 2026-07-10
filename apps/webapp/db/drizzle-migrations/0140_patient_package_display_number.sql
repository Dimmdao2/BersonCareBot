CREATE SEQUENCE IF NOT EXISTS be_patient_packages_display_number_seq;

ALTER TABLE be_patient_packages
  ADD COLUMN IF NOT EXISTS display_number integer;

ALTER SEQUENCE be_patient_packages_display_number_seq
  OWNED BY be_patient_packages.display_number;

WITH numbered AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at, id)::integer AS display_number
  FROM be_patient_packages
  WHERE display_number IS NULL
)
UPDATE be_patient_packages pp
SET display_number = numbered.display_number
FROM numbered
WHERE pp.id = numbered.id;

SELECT setval(
  'be_patient_packages_display_number_seq',
  COALESCE((SELECT max(display_number) FROM be_patient_packages), 0) + 1,
  false
);

ALTER TABLE be_patient_packages
  ALTER COLUMN display_number SET DEFAULT nextval('be_patient_packages_display_number_seq'),
  ALTER COLUMN display_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'be_patient_packages_display_number_check'
      AND conrelid = 'be_patient_packages'::regclass
  ) THEN
    ALTER TABLE be_patient_packages
      ADD CONSTRAINT be_patient_packages_display_number_check CHECK (display_number > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_be_patient_packages_display_number_unique
  ON be_patient_packages (display_number);
