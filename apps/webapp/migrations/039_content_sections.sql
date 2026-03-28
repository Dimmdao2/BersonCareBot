-- CMS: разделы контента (управляются из doctor CMS, не хардкод).
CREATE TABLE IF NOT EXISTS content_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_sections_sort ON content_sections(sort_order, title);

INSERT INTO content_sections (slug, title, description, sort_order) VALUES
  ('emergency', 'Скорая помощь', 'Быстрые рекомендации при острых состояниях', 1),
  ('warmups', 'Разминки', 'Разминочные упражнения', 2),
  ('workouts', 'Тренировки', 'Комплексы тренировок', 3),
  ('lessons', 'Полезные уроки', 'Обучающие материалы', 4),
  ('materials', 'Полезные материалы', 'Дополнительные ресурсы', 5)
ON CONFLICT (slug) DO NOTHING;
