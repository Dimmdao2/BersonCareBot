import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Stage 13 freeze migration filename
// eslint-disable-next-line no-secrets/no-secrets -- migration filename, not a secret
const freezeMigrationFile = '20260319_0002_stage13_freeze_legacy_subscription_tables.sql';
const MIGRATION_PATH = join(__dirname, 'migrations', 'core', freezeMigrationFile);

describe('Stage 13 freeze legacy subscription tables migration', () => {
  it('defines triggers blocking INSERT/UPDATE/DELETE on mailing_topics and user_subscriptions', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8');
    expect(sql).toContain('stage13_freeze_mailing_topics');
    expect(sql).toContain('stage13_freeze_user_subscriptions');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON mailing_topics');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON user_subscriptions');
  });

  it('raises explicit exception for frozen tables', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8');
    expect(sql).toContain("RAISE EXCEPTION 'mailing_topics is frozen (Stage 13): use webapp projection only'");
    expect(sql).toContain("RAISE EXCEPTION 'user_subscriptions is frozen (Stage 13): use webapp projection only'");
  });
});
