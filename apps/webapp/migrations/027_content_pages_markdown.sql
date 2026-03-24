-- Markdown body for CMS pages; legacy body_html remains for fallback display.
ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS body_md TEXT NOT NULL DEFAULT '';
