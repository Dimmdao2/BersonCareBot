import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const journal = readFileSync(
  new URL('../../../db/drizzle-migrations/meta/_journal.json', import.meta.url),
  'utf8',
);

describe('platform organization-members directory boundary', () => {
  it('registers the renumbered migration 0267 exactly', () => {
    const entries = (
      JSON.parse(journal) as {
        entries: Array<Record<string, unknown>>;
      }
    ).entries;
    // 268 -> 267: the reserved 0267 work needed no migration, so the directory migration closes
    // that gap while preserving its SQL and timestamp.
    expect(entries.find((entry) => entry.idx === 267)).toEqual({
      idx: 267,
      version: '7',
      when: 1793539200065,
      tag: '0267_platform_organization_members_directory',
      breakpoints: true,
    });
  });
});
