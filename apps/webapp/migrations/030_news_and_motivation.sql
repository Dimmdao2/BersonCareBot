CREATE TABLE IF NOT EXISTS news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  is_visible BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  published_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_items_visible ON news_items(is_visible, sort_order DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS motivational_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body_text TEXT NOT NULL,
  author TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motivational_quotes_active ON motivational_quotes(is_active, sort_order);
