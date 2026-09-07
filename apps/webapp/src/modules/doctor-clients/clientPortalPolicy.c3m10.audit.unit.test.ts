/**
 * C3M-10 blind acceptance oracle — organization-scoped client-portal policy.
 * Oracle: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.4 (`client_portal`
 * gates invite controls and private org surfaces), §C3M.6 («для него достаточно workspace switch и
 * индивидуального `inherit | allow | deny`») and §C3M.8 («preference никогда не расширяет уже
 * вычисленную доступность»; «выключенный client portal блокирует private org content, но не удаляет
 * identity/enrollment»).
 *
 * WHAT BREAKS WITHOUT THIS:
 * 1. A client whose portal the organization denied still resolves `client_portal: true`, so every
 *    private surface answers 200 and a new activation invite can be issued for them.
 * 2. Rollout reads a stored `null` (inherit) as deny, and every existing linked client silently
 *    loses the portal the day the column ships.
 * 3. A per-client `allow` is treated as an override of the workspace switch, so a preference
 *    re-opens a portal the organization turned off.
 * 4. The portal denial leaks sideways into unrelated modules (medical record, encounters,
 *    rehabilitation, mailings, analytics), taking the specialist's own screens down with it.
 */
import { describe, expect, it } from 'vitest';

import { applyClientChannelPolicyToWorkspaceModules } from '@/app-layer/guards/workspaceModuleAccess';
import { defaultDoctorWorkspaceComposition } from '@/modules/system-settings/doctorWorkspaceComposition';
import { resolveClientChannelPolicy, type ClientSupportProfile } from './supportPolicy';

const CHANNEL_DEFAULTS = {
  direct_chat: 'all',
  program_comments: 'all',
  program_media: 'all',
} as const;

const baseProfile: ClientSupportProfile = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patientUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  onSupport: false,
  supportStartedAt: null,
  directChatEnabled: null,
  commentsEnabled: null,
  mediaEnabled: null,
  portalEnabled: null,
  updatedAt: '2026-09-07T00:00:00.000Z',
  updatedBy: null,
};

function portalAllowedFor(portalEnabled: boolean | null | undefined): boolean {
  return (
    resolveClientChannelPolicy({
      profile: portalEnabled === undefined ? null : { ...baseProfile, portalEnabled },
      defaults: CHANNEL_DEFAULTS,
    }).portalAllowed !== false
  );
}

describe('C3M-10 client portal policy', () => {
  it('keeps the portal for inherit and for a client with no support profile at all', () => {
    expect(portalAllowedFor(null)).toBe(true);
    expect(portalAllowedFor(undefined)).toBe(true);
    expect(portalAllowedFor(true)).toBe(true);
  });

  it('denies the portal for an explicit per-client deny', () => {
    expect(portalAllowedFor(false)).toBe(false);
  });

  it('closes the portal and its dependent channels for a denied client', () => {
    const modules = defaultDoctorWorkspaceComposition().modules;

    const effective = applyClientChannelPolicyToWorkspaceModules(modules, {
      portalAllowed: false,
      directChatAllowed: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });

    expect(effective).toMatchObject({
      client_portal: false,
      direct_chat: false,
      program_comments: false,
      program_media: false,
    });
  });

  it('leaves specialist-side modules untouched when only the portal is denied', () => {
    const modules = defaultDoctorWorkspaceComposition().modules;

    const effective = applyClientChannelPolicyToWorkspaceModules(modules, {
      portalAllowed: false,
      directChatAllowed: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });

    expect(effective).toMatchObject({
      medical_record: modules.medical_record,
      encounters: modules.encounters,
      rehabilitation: modules.rehabilitation,
      mailings: modules.mailings,
      analytics: modules.analytics,
    });
  });

  it('never lets a per-client allow reopen a portal the workspace switched off', () => {
    const modules = { ...defaultDoctorWorkspaceComposition().modules, client_portal: false };

    const effective = applyClientChannelPolicyToWorkspaceModules(modules, {
      portalAllowed: true,
      directChatAllowed: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });

    expect(effective).toMatchObject({
      client_portal: false,
      direct_chat: false,
      program_comments: false,
      program_media: false,
    });
  });
});
