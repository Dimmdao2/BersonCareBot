import { describe, expect, it } from 'vitest';

import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import {
  requireWorkspaceModuleForPage,
  workspaceModuleDisabledResponse,
} from '@/app-layer/guards/workspaceModuleAccess';
import {
  defaultDoctorWorkspaceClientDefaults,
  defaultDoctorWorkspaceComposition,
  DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  parseDoctorWorkspaceClientDefaults,
  parseDoctorWorkspaceComposition,
  resolveWorkspaceModuleEffective,
  type DoctorWorkspaceComposition,
  type WorkspaceModuleAvailability,
} from './doctorWorkspaceComposition';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';
import { createSystemSettingsService } from './service';

const ALL_AVAILABLE = {
  medical_record: true,
  encounters: true,
  rehabilitation: true,
  direct_chat: true,
  program_comments: true,
  program_media: true,
  mailings: true,
  analytics: true,
  client_portal: true,
  video_meetings: true,
} satisfies WorkspaceModuleAvailability;

const ALL_UNAVAILABLE = {
  medical_record: false,
  encounters: false,
  rehabilitation: false,
  direct_chat: false,
  program_comments: false,
  program_media: false,
  mailings: false,
  analytics: false,
  client_portal: false,
  video_meetings: false,
} satisfies WorkspaceModuleAvailability;

function compositionWith(
  modules: Partial<DoctorWorkspaceComposition['modules']>,
): DoctorWorkspaceComposition {
  const defaults = defaultDoctorWorkspaceComposition();
  return {
    ...defaults,
    modules: Object.freeze({ ...defaults.modules, ...modules }),
  };
}

describe('doctor workspace composition foundation', () => {
  it('keeps every already-available module visible when no preference row exists', () => {
    const composition = parseDoctorWorkspaceComposition(null);

    expect(resolveWorkspaceModuleEffective(composition, ALL_AVAILABLE)).toEqual(ALL_AVAILABLE);
  });

  it('projects the accepted channel and symptom compatibility defaults when no structured row exists', () => {
    expect(parseDoctorWorkspaceClientDefaults(null)).toEqual({
      version: 1,
      channelDefaults: {
        direct_chat: 'all',
        program_comments: 'on_support',
        program_media: 'on_support',
      },
      patientSymptomTrackingDefault: 'all',
    });
    expect(
      parseDoctorWorkspaceClientDefaults(null, {
        legacyCommentsWithoutSupportEnabled: true,
        legacyMediaWithoutSupportEnabled: true,
      }),
    ).toEqual({
      version: 1,
      channelDefaults: {
        direct_chat: 'all',
        program_comments: 'all',
        program_media: 'all',
      },
      patientSymptomTrackingDefault: 'all',
    });
    expect(
      defaultDoctorWorkspaceClientDefaults({
        legacyCommentsWithoutSupportEnabled: false,
        legacyMediaWithoutSupportEnabled: false,
      }),
    ).toMatchObject({
      channelDefaults: { program_comments: 'on_support', program_media: 'on_support' },
    });
  });

  it('never broadens upstream module availability', () => {
    const effective = resolveWorkspaceModuleEffective(
      defaultDoctorWorkspaceComposition(),
      ALL_UNAVAILABLE,
    );

    expect(effective).toEqual(ALL_UNAVAILABLE);
  });

  it('turns direct and transitive descendants effective-OFF without rewriting child preferences', () => {
    const rehabilitationOff = compositionWith({ rehabilitation: false });
    const rehabilitationBefore = { ...rehabilitationOff.modules };
    const withoutRehabilitation = resolveWorkspaceModuleEffective(rehabilitationOff, ALL_AVAILABLE);
    expect(withoutRehabilitation).toMatchObject({
      medical_record: true,
      encounters: true,
      rehabilitation: false,
      direct_chat: true,
      program_comments: false,
      program_media: false,
    });
    expect(rehabilitationOff.modules).toEqual(rehabilitationBefore);

    const commentsOff = compositionWith({ program_comments: false });
    expect(resolveWorkspaceModuleEffective(commentsOff, ALL_AVAILABLE)).toMatchObject({
      rehabilitation: true,
      program_comments: false,
      program_media: false,
    });

    const portalOff = compositionWith({ client_portal: false });
    expect(resolveWorkspaceModuleEffective(portalOff, ALL_AVAILABLE)).toMatchObject({
      rehabilitation: true,
      direct_chat: false,
      program_comments: false,
      program_media: false,
      client_portal: false,
    });
  });

  it('rejects unknown versions, unknown keys, and non-boolean stored module values', () => {
    for (const invalid of [
      { value: { version: 2, modules: {} } },
      { value: { version: 1, modules: { booking: true } } },
      { value: { version: 1, modules: { analytics: 'yes' } } },
    ]) {
      expect(() => parseDoctorWorkspaceComposition(invalid)).toThrowError(
        RuntimeSettingUnavailableError,
      );
    }
  });

  it('rejects malformed persisted channel defaults instead of broadening them', () => {
    for (const invalid of [
      { value: { version: 2, channelDefaults: {}, patientSymptomTrackingDefault: 'all' } },
      {
        value: {
          version: 1,
          channelDefaults: {
            direct_chat: 'all',
            program_comments: 'all',
            program_media: 'all',
            booking: 'all',
          },
          patientSymptomTrackingDefault: 'all',
        },
      },
      {
        value: {
          version: 1,
          channelDefaults: {
            direct_chat: 'unsupported',
            program_comments: 'all',
            program_media: 'all',
          },
          patientSymptomTrackingDefault: 'all',
        },
      },
    ]) {
      expect(() => parseDoctorWorkspaceClientDefaults(invalid)).toThrowError(
        RuntimeSettingUnavailableError,
      );
    }
  });

  it('rejects malformed structured defaults at the canonical service write boundary', async () => {
    const service = createSystemSettingsService(createInMemorySystemSettingsPort());

    await expect(
      service.updateSetting(
        DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
        'doctor',
        {
          value: {
            version: 1,
            channelDefaults: {
              direct_chat: 'all',
              program_comments: 'all',
              program_media: 'invalid',
            },
            patientSymptomTrackingDefault: 'all',
          },
        },
        'audit-fixture',
        { organizationId: 'org-a' },
      ),
    ).rejects.toThrow(`invalid_setting_value: ${DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY}`);
  });

  it('fails closed when a stored preference row has a malformed value', async () => {
    const port = createInMemorySystemSettingsPort();
    await port.upsert(DOCTOR_WORKSPACE_COMPOSITION_KEY, 'doctor', null, 'audit-fixture', {
      organizationId: 'org-a',
    });
    const service = createSystemSettingsService(port);

    await expect(
      service.getDoctorWorkspaceComposition({ organizationId: 'org-a' }),
    ).rejects.toBeInstanceOf(RuntimeSettingUnavailableError);
  });

  it('keeps explicit old values and exposes newly missing module keys by compatibility default', () => {
    const parsed = parseDoctorWorkspaceComposition({
      value: { version: 1, modules: { medical_record: false } },
    });

    expect(parsed.modules).toEqual({
      ...ALL_AVAILABLE,
      medical_record: false,
    });
  });

  it('returns the stable typed denial outcomes for disabled pages and mutations', async () => {
    const response = workspaceModuleDisabledResponse('analytics');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'workspace_module_disabled',
      module: 'analytics',
    });
    expect(() => requireWorkspaceModuleForPage(true)).not.toThrow();
    expect(() => requireWorkspaceModuleForPage(false)).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
