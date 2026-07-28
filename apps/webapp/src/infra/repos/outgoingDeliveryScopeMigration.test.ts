import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const journalPath = new URL('../../../db/drizzle-migrations/meta/_journal.json', import.meta.url);

describe('0260 outgoing delivery journal entry', () => {
  it('pins migration 0260 in the Drizzle journal', () => {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<Record<string, unknown>>;
    };
    // This test owns migration 0260 — so it pins 0260 and the block that followed it BY POSITION,
    // not by tail slice. A tail slice re-broke on every unrelated migration (0270 shifted it out of
    // the window) and taught nothing about 0260. The invariant that matters here is that each entry
    // sits at the array position equal to its own idx, which the separate journal-sync check enforces
    // globally; here we assert the exact block this migration belongs to.
    expect(journal.entries.slice(260, 270)).toEqual([
      {
        idx: 260,
        version: '7',
        when: 1793539200057,
        tag: '0260_outgoing_delivery_scope_text_ids',
        breakpoints: true,
      },
      {
        idx: 261,
        version: '7',
        when: 1793539200058,
        tag: '0261_platform_registration_events_read',
        breakpoints: true,
      },
      {
        idx: 262,
        version: '7',
        when: 1793539200059,
        tag: '0262_remove_rubitime_data',
        breakpoints: true,
      },
      {
        idx: 263,
        version: '7',
        when: 1793539200060,
        tag: '0263_retire_provider_provenance_names',
        breakpoints: true,
      },
      {
        idx: 264,
        version: '7',
        when: 1793539200061,
        tag: '0264_platform_integration_availability',
        breakpoints: true,
      },
      {
        idx: 265,
        version: '7',
        when: 1793539200062,
        tag: '0265_platform_support_conversations_read',
        breakpoints: true,
      },
      {
        idx: 266,
        version: '7',
        when: 1793539200063,
        tag: '0266_password_login_bruteforce_protection',
        breakpoints: true,
      },
      {
        idx: 267,
        version: '7',
        when: 1793539200065,
        tag: '0267_platform_organization_members_directory',
        breakpoints: true,
      },
      {
        idx: 268,
        version: '7',
        when: 1793539200066,
        tag: '0268_integrator_global_delivery_attempt_audit',
        breakpoints: true,
      },
      {
        idx: 269,
        version: '7',
        when: 1793539200067,
        tag: '0269_remove_specialist_signup_slug_reservation',
        breakpoints: true,
      },
    ]);
  });
});
