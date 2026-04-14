-- CMS: разделы и страницы только для залогиненных пациентов (tier patient).
-- Если requires_auth = true, гости и onboarding без tier patient не видят материал в пациентском UI.

ALTER TABLE content_sections ADD COLUMN IF NOT EXISTS requires_auth BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS requires_auth BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN content_sections.requires_auth IS 'If true, only tier-patient session may browse this section on /app/patient.';
COMMENT ON COLUMN content_pages.requires_auth IS 'If true, only tier-patient session may open this page.';
