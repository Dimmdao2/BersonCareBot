-- Final migration number 0358 — assigned at merge (0356/0357 were taken by branches that landed first).
-- #1069 Т3 (owner 03.08): "не вижу места где правятся шаблоны... вынес в отдельную вкладку и
-- правил там через полноценный редактор". Each tariff gets its own list of marketing letters; a
-- ladder notification row will reference one by id instead of embedding its text.
--
-- Existing notification rows (all landed today, Т2/Т7) have no `templateId` key at all — the
-- app reads a missing key as "no template chosen" and keeps rendering their existing `template`
-- text unchanged (§T3 boundary #4), so no data transformation is needed here beyond adding the
-- list tariffs store their templates in.
ALTER TABLE public.saas_tariffs
  ADD COLUMN mailing_templates jsonb NOT NULL DEFAULT '[]'::jsonb;
