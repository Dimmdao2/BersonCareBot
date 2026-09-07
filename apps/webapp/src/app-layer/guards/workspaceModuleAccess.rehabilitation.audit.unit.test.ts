import { describe, expect, it } from 'vitest';

import { createInMemorySystemSettingsPort } from '@/infra/repos/inMemorySystemSettings';
import {
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  defaultDoctorWorkspaceComposition,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import { createSystemSettingsService } from '@/modules/system-settings/service';
import {
  resolveOrganizationWorkspaceModules,
  workspaceModuleForApiPath,
} from './workspaceModuleAccess';

describe('C3M-08 rehabilitation API closure', () => {
  it.each([
    ['/api/doctor/messages', 'direct_chat'],
    ['/api/doctor/messages/conversations/ensure', 'direct_chat'],
    ['/api/doctor/messages/conversations/unread-by-patient', 'direct_chat'],
    ['/api/doctor/messages/unread-count', 'direct_chat'],
    ['/api/doctor/messages/conversation-17/read', 'direct_chat'],
    ['/api/patient/messages', 'direct_chat'],
    ['/api/patient/messages/conversation-17/read', 'direct_chat'],
    ['/api/doctor/patients/patient-17/messages-snapshot', 'direct_chat'],
    ['/api/patient/treatment-program-instances/current', 'rehabilitation'],
    ['/api/patient/treatment-program-promo/current', 'rehabilitation'],
    ['/api/patient/courses/active', 'rehabilitation'],
    ['/api/patient/diary/lfk-stats', 'rehabilitation'],
    ['/api/doctor/clinical-tests', 'rehabilitation'],
    ['/api/doctor/recommendations', 'rehabilitation'],
    ['/api/doctor/references', 'rehabilitation'],
    ['/api/doctor/test-sets', 'rehabilitation'],
    ['/api/doctor/treatment-program-templates', 'rehabilitation'],
    ['/api/doctor/patients/patient-17/exercise-calendar', 'rehabilitation'],
    ['/api/doctor/clients/patient-17/lfk-complex-exercises', 'rehabilitation'],
    ['/api/doctor/patients/patient-17/program-day-activity', 'rehabilitation'],
    ['/api/doctor/patients/patient-17/treatment-program-instances', 'rehabilitation'],
    ['/api/patient/treatment-program-instances/program-17/discussion', 'program_comments'],
    [
      '/api/patient/treatment-program-instances/program-17/items/item-2/discussion/media',
      'program_media',
    ],
    ['/api/patient/media/program-submission/presign', 'program_media'],
    ['/api/doctor/comments', 'program_comments'],
    ['/api/doctor/exercise-comments', 'program_comments'],
    ['/api/doctor/patients/patient-17/program-activity', 'program_comments'],
    [
      '/api/doctor/treatment-program-instances/program-17/items/item-2/program-note-reply',
      'program_comments',
    ],
    ['/api/doctor/treatment-program-instances/program-17/media-presign', 'program_media'],
  ] as const)('classifies %s under %s', (pathname, module) => {
    expect(workspaceModuleForApiPath(pathname)).toBe(module);
  });

  it.each([
    '/api/doctor/notes',
    '/api/doctor/tasks',
    '/api/doctor/appointments',
    '/api/doctor/patients/patient-17/medical-record',
    '/api/doctor/visits',
    '/api/patient/appointments',
  ])('does not expand rehabilitation denial to independent surface %s', (pathname) => {
    expect(workspaceModuleForApiPath(pathname)).toBeNull();
  });

  it('keeps organization preferences isolated and restores stored child choices after OFF to ON', async () => {
    const port = createInMemorySystemSettingsPort();
    const systemSettings = createSystemSettingsService(port);
    const defaults = defaultDoctorWorkspaceComposition();
    await port.upsert(
      DOCTOR_WORKSPACE_COMPOSITION_KEY,
      'doctor',
      {
        value: {
          ...defaults,
          modules: {
            ...defaults.modules,
            rehabilitation: false,
            program_comments: true,
            program_media: true,
          },
        },
      },
      'c3m-08-audit',
      { organizationId: 'organization-a' },
    );
    await port.upsert(
      DOCTOR_WORKSPACE_COMPOSITION_KEY,
      'doctor',
      { value: defaults },
      'c3m-08-audit',
      { organizationId: 'organization-b' },
    );

    const organizationAOff = await resolveOrganizationWorkspaceModules(
      { systemSettings },
      'organization-a',
    );
    const organizationB = await resolveOrganizationWorkspaceModules(
      { systemSettings },
      'organization-b',
    );

    expect(organizationAOff).toMatchObject({
      rehabilitation: false,
      program_comments: false,
      program_media: false,
    });
    expect(organizationB).toMatchObject({
      rehabilitation: true,
      program_comments: true,
      program_media: true,
    });

    await port.upsert(
      DOCTOR_WORKSPACE_COMPOSITION_KEY,
      'doctor',
      { value: defaults },
      'c3m-08-audit',
      { organizationId: 'organization-a' },
    );

    await expect(
      resolveOrganizationWorkspaceModules({ systemSettings }, 'organization-a'),
    ).resolves.toMatchObject({
      rehabilitation: true,
      program_comments: true,
      program_media: true,
    });
  });
});
