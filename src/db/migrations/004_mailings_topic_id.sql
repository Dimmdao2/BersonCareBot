-- 004_mailings_topic_id.sql
ALTER TABLE mailings
ADD COLUMN topic_id integer REFERENCES mailing_topics(id);

CREATE INDEX IF NOT EXISTS idx_mailings_topic_id ON mailings(topic_id);

INSERT INTO mailing_topics(key, title)
VALUES ('legacy', 'Legacy')
ON CONFLICT (key) DO NOTHING;

UPDATE mailings
SET topic_id = (SELECT id FROM mailing_topics WHERE key = 'legacy')
WHERE topic_id IS NULL;

ALTER TABLE mailings
ALTER COLUMN topic_id SET NOT NULL;
