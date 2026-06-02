-- Phase 6: dedicated CMS section for patient /help articles (kind=article, role help_article via section slug).
INSERT INTO content_sections (slug, title, description, sort_order, is_visible, kind, system_parent_code)
VALUES (
  'help',
  'Справка',
  'Статьи базы знаний для /app/patient/help',
  0,
  true,
  'article',
  NULL
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  kind = 'article',
  system_parent_code = NULL,
  is_visible = true;
