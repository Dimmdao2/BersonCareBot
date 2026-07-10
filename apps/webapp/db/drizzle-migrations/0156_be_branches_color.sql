ALTER TABLE be_branches
  ADD COLUMN IF NOT EXISTS color text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'be_branches_color_hex_check'
      AND conrelid = 'be_branches'::regclass
  ) THEN
    ALTER TABLE be_branches
      ADD CONSTRAINT be_branches_color_hex_check
      CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;
