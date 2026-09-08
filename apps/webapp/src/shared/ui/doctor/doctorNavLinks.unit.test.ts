import { describe, expect, it } from 'vitest';
import { resolveMechanicSurfaceVisibility } from '@/app-layer/guards/requireEntitlement';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';
import { getDoctorMenuItems } from './doctorNavLinks';

const ALL_MODULES_OFF = {
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
} satisfies WorkspaceModuleEffective;

describe('doctor navigation schedule access', () => {
  it('shows schedule, but no other clinical links, to an organization manager', () => {
    const items = getDoctorMenuItems({
      capabilities: ['account.self', 'organization.management'],
    });
    const ids = items.map((item) => item.id);

    expect(ids).toContain('schedule');
    expect(ids).not.toContain('patients');
    expect(ids).not.toContain('communications');
  });

  it('hides only the promo entry when the promo mechanic is off', () => {
    const capabilities = ['account.self', 'clinical.workspace'] as const;
    const disabledItems = getDoctorMenuItems({
      capabilities,
      promoEnabled: false,
    });
    const enabledItems = getDoctorMenuItems({
      capabilities,
      promoEnabled: true,
    });
    const libraryItems = (items: ReturnType<typeof getDoctorMenuItems>) =>
      items.find((item) => item.id === 'library')?.items?.map((item) => item.id) ?? [];

    expect(libraryItems(disabledItems)).not.toContain('treatment-program-promo');
    expect(libraryItems(enabledItems)).toContain('treatment-program-promo');
    expect(libraryItems(disabledItems)).toContain('treatment-program-templates');
  });

  it('hides courses when disabled and keeps them visible when read-only', () => {
    const capabilities = ['account.self', 'clinical.workspace'] as const;
    const disabledVisibility = resolveMechanicSurfaceVisibility({
      mechanic: 'courses',
      state: 'disabled',
      policySource: 'system',
      warning: null,
    });
    const readOnlyVisibility = resolveMechanicSurfaceVisibility({
      mechanic: 'courses',
      state: 'read_only',
      policySource: 'system',
      warning: null,
    });
    const disabledIds = getDoctorMenuItems({
      capabilities,
      coursesEnabled: disabledVisibility.specialistNavigation,
    }).map((item) => item.id);
    const readOnlyIds = getDoctorMenuItems({
      capabilities,
      coursesEnabled: readOnlyVisibility.specialistNavigation,
    }).map((item) => item.id);

    expect(disabledIds).not.toContain('courses');
    expect(readOnlyIds).toContain('courses');
  });

  it('hides content and files-and-media when the CMS mechanic is off, keeps them when read-only', () => {
    const capabilities = ['account.self', 'clinical.workspace'] as const;
    const disabledVisibility = resolveMechanicSurfaceVisibility({
      mechanic: 'cms_pages',
      state: 'disabled',
      policySource: 'system',
      warning: null,
    });
    const readOnlyVisibility = resolveMechanicSurfaceVisibility({
      mechanic: 'cms_pages',
      state: 'read_only',
      policySource: 'system',
      warning: null,
    });
    const disabledIds = getDoctorMenuItems({
      capabilities,
      cmsEnabled: disabledVisibility.specialistNavigation,
    }).map((item) => item.id);
    const readOnlyIds = getDoctorMenuItems({
      capabilities,
      cmsEnabled: readOnlyVisibility.specialistNavigation,
    }).map((item) => item.id);

    expect(disabledIds).not.toContain('content');
    expect(disabledIds).not.toContain('files-and-media');
    expect(readOnlyIds).toContain('content');
    expect(readOnlyIds).toContain('files-and-media');
  });

  it('keeps Today settings independent from CMS visibility', () => {
    const capabilities = ['account.self', 'clinical.workspace'] as const;
    const readOnlyToday = resolveMechanicSurfaceVisibility({
      mechanic: 'patient_home_today',
      state: 'read_only',
      policySource: 'system',
      warning: null,
    });
    const disabledToday = resolveMechanicSurfaceVisibility({
      mechanic: 'patient_home_today',
      state: 'disabled',
      policySource: 'system',
      warning: null,
    });

    const readOnlyIds = getDoctorMenuItems({
      capabilities,
      cmsEnabled: false,
      patientHomeTodayEnabled: readOnlyToday.specialistNavigation,
    }).map((item) => item.id);
    const disabledIds = getDoctorMenuItems({
      capabilities,
      cmsEnabled: true,
      patientHomeTodayEnabled: disabledToday.specialistNavigation,
    }).map((item) => item.id);

    expect(readOnlyIds).toContain('patient-home');
    expect(readOnlyIds).not.toContain('content');
    expect(disabledIds).not.toContain('patient-home');
  });

  it('projects one effective module map without removing always-on specialist destinations', () => {
    const capabilities = ['account.self', 'clinical.workspace'] as const;
    const hiddenIds = getDoctorMenuItems({
      capabilities,
      specialistTasksEnabled: true,
      workspaceModules: ALL_MODULES_OFF,
    }).map((item) => item.id);
    const communicationsOnlyIds = getDoctorMenuItems({
      capabilities,
      specialistTasksEnabled: true,
      workspaceModules: { ...ALL_MODULES_OFF, program_comments: true },
    }).map((item) => item.id);

    expect(hiddenIds).toEqual(expect.arrayContaining(['today', 'schedule', 'patients', 'tasks']));
    expect(hiddenIds).not.toContain('communications');
    expect(hiddenIds).not.toContain('analytics');
    expect(hiddenIds).not.toContain('library');
    expect(communicationsOnlyIds).toContain('communications');
  });
});
