-- Stage 13: freeze legacy product tables (mailing_topics, user_subscriptions).
-- WritePort no longer writes here; projection-only. This trigger prevents accidental writes.
-- SELECT remains allowed for reconciliation and audit.

CREATE OR REPLACE FUNCTION stage13_prevent_write_mailing_topics()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'mailing_topics is frozen (Stage 13): use webapp projection only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION stage13_prevent_write_user_subscriptions()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'user_subscriptions is frozen (Stage 13): use webapp projection only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stage13_freeze_mailing_topics ON mailing_topics;
CREATE TRIGGER stage13_freeze_mailing_topics
  BEFORE INSERT OR UPDATE OR DELETE ON mailing_topics
  FOR EACH ROW EXECUTE PROCEDURE stage13_prevent_write_mailing_topics();

DROP TRIGGER IF EXISTS stage13_freeze_user_subscriptions ON user_subscriptions;
CREATE TRIGGER stage13_freeze_user_subscriptions
  BEFORE INSERT OR UPDATE OR DELETE ON user_subscriptions
  FOR EACH ROW EXECUTE PROCEDURE stage13_prevent_write_user_subscriptions();
