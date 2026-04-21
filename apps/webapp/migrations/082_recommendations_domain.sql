-- Область контента рекомендации (фильтр в каталоге врача).

ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS domain text;

CREATE INDEX IF NOT EXISTS idx_recommendations_domain ON recommendations (domain);
