import { describe, expect, it } from 'vitest';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { resolvePatientProgramInteractionPolicy } from './supportPolicy';

describe('resolvePatientProgramInteractionPolicy', () => {
  const defaults = { commentsEnabled: false, mediaEnabled: false };

  it('on support: allows comments/media unless explicitly false', () => {
    expect(
      resolvePatientProgramInteractionPolicy({
        profile: {
          patientUserId: 'u1',
          organizationId: 'org-1',
          onSupport: true,
          supportStartedAt: null,
          commentsEnabled: null,
          mediaEnabled: false,
          updatedAt: '',
          updatedBy: null,
        },
        defaultsWithoutSupport: defaults,
      }),
    ).toEqual({
      organizationId: 'org-1',
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: false,
    });
  });

  it('off support: uses doctor defaults when overrides null', () => {
    expect(
      resolvePatientProgramInteractionPolicy({
        profile: {
          patientUserId: 'u1',
          organizationId: 'org-1',
          onSupport: false,
          supportStartedAt: null,
          commentsEnabled: null,
          mediaEnabled: null,
          updatedAt: '',
          updatedBy: null,
        },
        defaultsWithoutSupport: { commentsEnabled: true, mediaEnabled: false },
      }),
    ).toEqual({
      organizationId: 'org-1',
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: false,
    });
  });

  it('off support: per-patient true overrides default off', () => {
    expect(
      resolvePatientProgramInteractionPolicy({
        profile: {
          patientUserId: 'u1',
          organizationId: 'org-1',
          onSupport: false,
          supportStartedAt: null,
          commentsEnabled: true,
          mediaEnabled: true,
          updatedAt: '',
          updatedBy: null,
        },
        defaultsWithoutSupport: defaults,
      }),
    ).toEqual({
      organizationId: 'org-1',
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: true,
    });
  });

  it('fails closed when defaults would allow interaction but no organization context exists', () => {
    expect(
      resolvePatientProgramInteractionPolicy({
        profile: null,
        defaultsWithoutSupport: { commentsEnabled: true, mediaEnabled: true },
      }),
    ).toEqual({
      organizationId: null,
      onSupport: false,
      commentsAllowed: false,
      mediaAllowed: false,
    });
  });

  it('uses active DB principal as organization context for default-without-support policy', async () => {
    await expect(
      runWithDbOrganizationPrincipal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', async () =>
        resolvePatientProgramInteractionPolicy({
          profile: null,
          defaultsWithoutSupport: { commentsEnabled: true, mediaEnabled: true },
        }),
      ),
    ).resolves.toEqual({
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: true,
    });
  });
});
