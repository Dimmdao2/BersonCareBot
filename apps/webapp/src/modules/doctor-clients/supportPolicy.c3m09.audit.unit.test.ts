import { describe, expect, it } from 'vitest';

import { applyClientChannelPolicyToWorkspaceModules } from '@/app-layer/guards/workspaceModuleAccess';
import { defaultDoctorWorkspaceComposition } from '@/modules/system-settings/doctorWorkspaceComposition';
import {
  isClientChannelAllowed,
  resolveClientChannelPolicy,
  type ClientSupportProfile,
} from './supportPolicy';

const profile: ClientSupportProfile = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patientUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  onSupport: false,
  supportStartedAt: null,
  directChatEnabled: true,
  commentsEnabled: false,
  mediaEnabled: true,
  updatedAt: '2026-09-07T00:00:00.000Z',
  updatedBy: null,
};

describe('C3M-09 client communication policy', () => {
  it('gives explicit client choices precedence over workspace defaults', () => {
    const policy = resolveClientChannelPolicy({
      profile,
      defaults: { direct_chat: 'off', program_comments: 'all', program_media: 'off' },
    });

    expect(policy).toEqual({
      portalAllowed: true,
      directChatAllowed: true,
      commentsAllowed: false,
      mediaAllowed: true,
    });
    expect(isClientChannelAllowed(policy, 'mediaAllowed')).toBe(false);
  });

  it('makes on_support inheritance follow the current support state', () => {
    const defaults = {
      direct_chat: 'on_support',
      program_comments: 'on_support',
      program_media: 'on_support',
    } as const;

    expect(
      resolveClientChannelPolicy({
        profile: {
          ...profile,
          directChatEnabled: null,
          commentsEnabled: null,
          mediaEnabled: null,
        },
        defaults,
      }),
    ).toEqual({
      portalAllowed: true,
      directChatAllowed: false,
      commentsAllowed: false,
      mediaAllowed: false,
    });
    expect(
      resolveClientChannelPolicy({
        profile: {
          ...profile,
          onSupport: true,
          directChatEnabled: null,
          commentsEnabled: null,
          mediaEnabled: null,
        },
        defaults,
      }),
    ).toEqual({
      portalAllowed: true,
      directChatAllowed: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });
  });

  it('never recreates a channel disabled by workspace or a required parent', () => {
    const modules = defaultDoctorWorkspaceComposition().modules;
    const effective = applyClientChannelPolicyToWorkspaceModules(
      { ...modules, direct_chat: false, program_comments: false, program_media: true },
      { directChatAllowed: true, commentsAllowed: false, mediaAllowed: true },
    );

    expect(effective).toMatchObject({
      direct_chat: false,
      program_comments: false,
      program_media: false,
    });
  });

  it('keeps the client portal out of the support-group channel defaults', () => {
    const groupDefaults = {
      direct_chat: 'on_support',
      program_comments: 'on_support',
      program_media: 'on_support',
    } as const;
    const inheriting = { ...profile, directChatEnabled: null, commentsEnabled: null, mediaEnabled: null };

    // Outside the group every group-driven channel closes, but the portal is not a group channel.
    expect(
      resolveClientChannelPolicy({ profile: inheriting, defaults: groupDefaults }).portalAllowed,
    ).toBe(true);
    // Joining the group opens the group channels and still does not decide the portal.
    expect(
      resolveClientChannelPolicy({
        profile: { ...inheriting, onSupport: true },
        defaults: groupDefaults,
      }).portalAllowed,
    ).toBe(true);
    // Only the client's own portal exception closes it, group membership notwithstanding.
    expect(
      resolveClientChannelPolicy({
        profile: { ...inheriting, onSupport: true, portalEnabled: false },
        defaults: groupDefaults,
      }).portalAllowed,
    ).toBe(false);
  });
});
