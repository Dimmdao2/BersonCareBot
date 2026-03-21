-- Optional escape hatch for manual corrective SQL on legacy tables (session-local only).
-- SET LOCAL app.stage13_bypass = 'true';

CREATE OR REPLACE FUNCTION stage13_prevent_write_mailing_topics()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.stage13_bypass', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'mailing_topics is frozen (Stage 13): use webapp projection only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION stage13_prevent_write_user_subscriptions()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.stage13_bypass', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'user_subscriptions is frozen (Stage 13): use webapp projection only';
END;
$$ LANGUAGE plpgsql;
