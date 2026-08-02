// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  getMechanicMutationAvailability: vi.fn(),
  requireEntitlementForRead: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  requireEntitlementForMutationAction: vi.fn(),
  requireEntitlementForReadAction: vi.fn(),
  entitlementMutationRefusalMessage: (action: string) =>
    'Невозможно ' +
    action +
    ': этот раздел не входит в ваш тариф. Чтобы выполнить действие, включите этот раздел в тарифе клиники.',
  entitlementMutationRefusalResponse: (mechanic: string, action: string) =>
    new Response(
      JSON.stringify({
        ok: false,
        error: 'entitlement_required',
        mechanic,
        message: `Невозможно ${action}: этот раздел не входит в ваш тариф.`,
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    ),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  requireDoctorWorkspaceContext: vi.fn(),
  requireOrganizationManagementContext: vi.fn(),
  requirePatientAccessWithPhone: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
}));
vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: vi.fn(),
  clearDiaryPurgeReauth: vi.fn(),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 60,
  checkAuthConfirmRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(
    <T>(_ctx: unknown, _operation: string, fn: () => T): T => fn(),
  ),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(...args: unknown[]): T => (args.at(-1) as () => T)()),
}));
vi.mock('@/app-layer/media/clientMediaFolders', () => ({
  pgEnsureClientPatientFolder: vi.fn(),
}));
vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: vi.fn(),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicMutationAvailability,
  requireEntitlementForRead,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { requireEntitlementForMutationAction } from '@/app-layer/guards/requireEntitlement';
import {
  requireClinicManagementApiContext,
  requireDoctorWorkspaceApiContext,
  requireDoctorWorkspaceContext,
  requireOrganizationManagementContext,
  requirePatientAccessWithPhone,
  requirePatientApiBusinessAccess,
} from '@/app-layer/guards/requireRole';
import { getCurrentSession } from '@/modules/auth/service';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import { POST as createCourse } from '@/app/api/doctor/courses/route';
import { POST as startExternalCalendar } from '@/app/api/admin/google-calendar/start/route';
import { PATCH as updateWarmupSchedule } from '@/app/api/doctor/clients/[userId]/warmup-schedule/route';
import {
  GET as getNotificationTemplates,
  PUT as saveNotificationTemplate,
} from '@/app/api/doctor/notification-templates/route';
import { POST as submitRatingFeedback } from '@/app/api/patient/material-ratings/feedback/route';
import { PUT as saveMaterialRating } from '@/app/api/patient/material-ratings/route';
import { POST as createPatientFile } from '@/app/api/doctor/patients/[userId]/files/route';
import {
  GET as getPromoProgram,
  PATCH as updatePromoProgram,
} from '@/app/api/doctor/treatment-program-promo/route';
import { PATCH as updateAdminSetting } from '@/app/api/admin/settings/route';
import { POST as updatePatientPromo } from '@/app/api/patient/treatment-program-promo/action/route';
import { savePatientHomePracticeTargetAction } from '@/app/app/doctor/patient-home/patientHomeDoctorSettingsActions';
import { saveContentSection } from '@/app/app/doctor/content/sections/actions';
import { PatientTabFiles } from '@/app/app/doctor/patients/[userId]/tabs/PatientTabFiles';
import { pgEnsureClientPatientFolder } from '@/app-layer/media/clientMediaFolders';
import { POST as recordWarmupCompletion } from '@/app/api/patient/practice/completion/route';
import { POST as recordWarmupVideoView } from '@/app/api/patient/daily-warmup/video-viewed/route';
import {
  addPatientHomeItem,
  deletePatientHomeItem,
  reorderPatientHomeBlocks,
  reorderPatientHomeItems,
  retargetPatientHomeItem,
  togglePatientHomeBlockVisibility,
  updatePatientHomeItemVisibility,
} from '@/app/app/settings/patient-home/actions';
import { POST as createPatientReminder } from '@/app/api/patient/reminders/create/route';
import {
  DELETE as deletePatientReminder,
  PATCH as updatePatientReminder,
} from '@/app/api/patient/reminders/[id]/route';
import { updateReminderRule } from '@/app/app/patient/reminders/actions';
import { saveOrgBranding } from '@/app/app/settings/brandingActions';
import { createOrgBrandingService } from '@/modules/org-branding/service';
import {
  archiveDoctorExerciseCore,
  saveDoctorExerciseCore,
  unarchiveDoctorExerciseCore,
} from '@/app/app/doctor/exercises/actionsShared';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { createLfkExercisesService } from '@/modules/lfk-exercises/service';
import type { Exercise } from '@/modules/lfk-exercises/types';
import { createLfkTemplatesService } from '@/modules/lfk-templates/service';
import type { Template } from '@/modules/lfk-templates/types';
import { persistLfkTemplateDraft } from '@/app/app/doctor/lfk-templates/actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

const workspace = { organizationId: ORG_ID, session: { user: { userId: USER_ID } } };
const denied = { ok: false as const, response: NextResponse.json({ ok: false }, { status: 403 }) };

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDoctorWorkspaceApiContext).mockResolvedValue({
    ok: true,
    ctx: workspace,
  } as never);
  vi.mocked(requireClinicManagementApiContext).mockResolvedValue({
    ok: true,
    ctx: workspace,
  } as never);
  vi.mocked(requirePatientApiBusinessAccess).mockResolvedValue({
    ok: true,
    session: workspace.session,
  } as never);
  vi.mocked(requirePatientAccessWithPhone).mockResolvedValue(workspace.session as never);
  vi.mocked(getCurrentSession).mockResolvedValue(null);
  vi.mocked(requireDoctorWorkspaceContext).mockResolvedValue(workspace as never);
  vi.mocked(requireOrganizationManagementContext).mockResolvedValue(workspace as never);
  vi.mocked(requireEntitlementForRead).mockResolvedValue(denied);
  vi.mocked(requireEntitlementForMutation).mockResolvedValue(denied);
  vi.mocked(requireEntitlementForRead).mockResolvedValue(denied);
  vi.mocked(getMechanicMutationAvailability).mockResolvedValue({ available: true });
  vi.mocked(resolvePatientEnrollmentOrganizationId).mockResolvedValue({
    ok: true,
    organizationId: ORG_ID,
  });
  vi.mocked(buildAppDeps).mockReturnValue({
    courses: { createCourse: vi.fn() },
    notifTemplates: {
      getManagedTemplates: vi.fn(),
      getManagedPresentation: vi.fn(),
      saveManagedTemplate: vi.fn(),
      saveManagedPresentation: vi.fn(),
    },
    systemSettings: { getSetting: vi.fn().mockResolvedValue({ valueJson: { value: false } }) },
    contentSections: { getBySlug: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    doctorClientsPort: { getClientIdentityForOrganization: vi.fn() },
    patientFiles: { createFile: vi.fn() },
    orgEntitlements: {},
    patientOrganization: {},
    materialRating: {
      putForPatient: vi.fn().mockResolvedValue({
        ok: true,
        aggregate: { avg: 5, count: 1, distribution: [0, 0, 0, 0, 1] },
        myStars: 5,
      }),
    },
    materialRatingFeedback: {
      submitPatientFeedback: vi.fn().mockResolvedValue({ ok: true, id: TARGET_ID }),
    },
  } as unknown as ReturnType<typeof buildAppDeps>);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('tariff and platform mutation gates', () => {
  it('refuses reading promo configuration when promo is disabled', async () => {
    const response = await getPromoProgram();

    expect(response.status).toBe(403);
    expect(requireEntitlementForRead).toHaveBeenCalledWith(workspace, 'promo');
  });

  it('refuses course creation when courses are not included in the tariff', async () => {
    const response = await createCourse(
      request('https://app.example.test/api/doctor/courses', {
        title: 'Курс',
        programTemplateId: TARGET_ID,
      }),
    );

    expect(response.status).toBe(403);
  });

  it('refuses saving a clinic notification template when branding is disabled', async () => {
    const response = await saveNotificationTemplate(
      request('https://app.example.test/api/doctor/notification-templates', {
        kind: 'template',
        event: 'created',
        audience: 'patient',
        channels: {
          email: { subject: 's', plainText: 't' },
          telegram: { text: 't' },
          max: { text: 't' },
          smsc: { text: 't' },
          web_push: { title: 't', text: 't' },
        },
        expectedUpdatedAt: null,
      }),
    );

    expect(response.status).toBe(403);
  });

  it('does not expose clinic notification-template controls when branding is disabled', async () => {
    const response = await getNotificationTemplates();

    expect(response.status).toBe(403);
    expect(buildAppDeps().notifTemplates.getManagedTemplates).not.toHaveBeenCalled();
    expect(buildAppDeps().notifTemplates.getManagedPresentation).not.toHaveBeenCalled();
  });

  it('keeps published clinic notification templates readable but marks their mutations unavailable in read-only access', async () => {
    vi.mocked(requireEntitlementForRead).mockResolvedValue({ ok: true } as never);
    vi.mocked(getMechanicMutationAvailability).mockResolvedValue({
      available: false,
      reason: 'commercial_read_only',
    });
    vi.mocked(buildAppDeps).mockReturnValue({
      notifTemplates: {
        getManagedTemplates: vi.fn().mockResolvedValue([]),
        getManagedPresentation: vi.fn().mockResolvedValue({
          presentation: { layout: 'organization', signature: 'Клиника', contacts: 'Контакты' },
        }),
      },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await getNotificationTemplates();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      brandingMutationAvailable: false,
      presentation: { presentation: { signature: 'Клиника' } },
    });
  });

  it('refuses external-calendar connection visibly when it is not included in the tariff', async () => {
    const response = await startExternalCalendar();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'entitlement_required',
      mechanic: 'external_calendar',
      message: 'Невозможно подключить внешний календарь: этот раздел не входит в ваш тариф.',
    });
  });

  it('refuses warmup/promo writes visibly when their mechanics are disabled', async () => {
    const [warmupResponse, promoResponse] = await Promise.all([
      updateWarmupSchedule(
        request('https://app.example.test/api/doctor/clients/' + TARGET_ID + '/warmup-schedule', {
          timesLocal: ['09:00'],
        }),
        { params: Promise.resolve({ userId: TARGET_ID }) },
      ),
      updatePromoProgram(
        request('https://app.example.test/api/doctor/treatment-program-promo', {
          templateId: TARGET_ID,
        }),
      ),
    ]);

    for (const [response, mechanic, action] of [
      [warmupResponse, 'warmups', 'изменить расписание разминок'],
      [promoResponse, 'promo', 'изменить промо-программу'],
    ] as const) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: 'entitlement_required',
        mechanic,
        message: 'Невозможно ' + action + ': этот раздел не входит в ваш тариф.',
      });
    }
  });

  it('refuses Today configuration visibly when it is not included in the tariff', async () => {
    vi.mocked(requireDoctorWorkspaceContext).mockResolvedValue({
      ...workspace,
      membershipRole: 'owner',
    } as never);
    vi.mocked(requireEntitlementForMutationAction).mockResolvedValue({
      ok: false,
      reason: 'entitlement_required',
      mechanic: 'patient_home_today',
    } as never);

    await expect(savePatientHomePracticeTargetAction(3)).resolves.toMatchObject({
      ok: false,
      error:
        'Невозможно изменить настройки главной страницы пациента: этот раздел не входит в ваш тариф. Чтобы выполнить действие, включите этот раздел в тарифе клиники.',
    });
  });

  it('refuses patient completion and video-view writes while warmups are off', async () => {
    vi.mocked(buildAppDeps).mockReturnValue({
      patientOrganization: {},
      patientPractice: { record: vi.fn() },
      patientDailyWarmupVideoViews: { insertIfMissing: vi.fn() },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const [completionResponse, videoResponse] = await Promise.all([
      recordWarmupCompletion(
        request('https://app.example.test/api/patient/practice/completion', {
          contentPageId: TARGET_ID,
          source: 'daily_warmup',
        }),
      ),
      recordWarmupVideoView(
        request('https://app.example.test/api/patient/daily-warmup/video-viewed', {
          contentPageId: TARGET_ID,
        }),
      ),
    ]);

    for (const [response, action] of [
      [completionResponse, 'отметить выполнение разминки'],
      [videoResponse, 'зафиксировать просмотр разминки'],
    ] as const) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        mechanic: 'warmups',
        message: `Невозможно ${action}: этот раздел не входит в ваш тариф.`,
      });
    }
  });

  it('refuses every daily-warmup block/item mutation while warmups are off', async () => {
    const patientHomeBlocks = {
      setBlockVisibility: vi.fn(),
      reorderBlocks: vi.fn(),
      addItem: vi.fn(),
      getItemById: vi.fn().mockResolvedValue({
        id: TARGET_ID,
        blockCode: 'daily_warmup',
        targetType: 'content_page',
        targetRef: TARGET_ID,
      }),
      updateItem: vi.fn(),
      deleteItem: vi.fn(),
      reorderItems: vi.fn(),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      patientHomeBlocks,
    } as unknown as ReturnType<typeof buildAppDeps>);

    const cases = [
      () => togglePatientHomeBlockVisibility('daily_warmup', false),
      () => reorderPatientHomeBlocks(['daily_warmup', 'situations']),
      () =>
        addPatientHomeItem({
          blockCode: 'daily_warmup',
          targetType: 'content_page',
          targetRef: TARGET_ID,
        }),
      () => updatePatientHomeItemVisibility(TARGET_ID, false),
      () => deletePatientHomeItem(TARGET_ID),
      () => reorderPatientHomeItems('daily_warmup', [TARGET_ID]),
      () =>
        retargetPatientHomeItem({
          itemId: TARGET_ID,
          targetType: 'content_page',
          targetRef: '44444444-4444-4444-8444-444444444444',
        }),
    ];

    for (const invoke of cases) {
      vi.mocked(requireEntitlementForMutationAction)
        .mockReset()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          reason: 'entitlement_required',
          mechanic: 'warmups',
        } as never);
      await expect(invoke()).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('этот раздел не входит в ваш тариф'),
      });
    }

    expect(patientHomeBlocks.setBlockVisibility).not.toHaveBeenCalled();
    expect(patientHomeBlocks.reorderBlocks).not.toHaveBeenCalled();
    expect(patientHomeBlocks.addItem).not.toHaveBeenCalled();
    expect(patientHomeBlocks.updateItem).not.toHaveBeenCalled();
    expect(patientHomeBlocks.deleteItem).not.toHaveBeenCalled();
    expect(patientHomeBlocks.reorderItems).not.toHaveBeenCalled();
  });

  it('refuses every patient warmup-reminder write while warmups are off', async () => {
    const reminders = {
      listRulesByUser: vi.fn().mockResolvedValue([
        {
          id: TARGET_ID,
          linkedObjectType: 'content_section',
          linkedObjectId: 'daily-warmups',
        },
      ]),
      createObjectReminder: vi.fn(),
      updateRule: vi.fn(),
      deleteReminder: vi.fn(),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      patientOrganization: {},
      reminders,
      contentSections: {
        getBySlug: vi.fn().mockResolvedValue({ systemParentCode: 'warmups' }),
      },
      contentPages: { getById: vi.fn().mockResolvedValue(null) },
      patientHomeBlocks: {},
      systemSettings: {},
    } as unknown as ReturnType<typeof buildAppDeps>);

    const createResponse = await createPatientReminder(
      request('https://app.example.test/api/patient/reminders/create', {
        linkedObjectType: 'content_section',
        linkedObjectId: 'daily-warmups',
        schedule: {
          scheduleType: 'interval_window',
          intervalMinutes: 60,
          windowStartMinute: 540,
          windowEndMinute: 600,
          daysMask: '1111111',
        },
      }),
    );
    const updateResponse = await updatePatientReminder(
      request('https://app.example.test/api/patient/reminders/' + TARGET_ID, {
        enabled: false,
      }),
      { params: Promise.resolve({ id: TARGET_ID }) },
    );
    const deleteResponse = await deletePatientReminder(
      new Request('https://app.example.test/api/patient/reminders/' + TARGET_ID, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: TARGET_ID }) },
    );
    const actionResult = await updateReminderRule({
      ruleId: TARGET_ID,
      intervalMinutes: 60,
      windowStartMinute: 540,
      windowEndMinute: 600,
      daysMask: '1111111',
    });

    for (const response of [createResponse, updateResponse, deleteResponse]) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        mechanic: 'warmups',
        message: expect.stringContaining('этот раздел не входит в ваш тариф'),
      });
    }
    expect(actionResult).toMatchObject({
      ok: false,
      error: expect.stringContaining('этот раздел не входит в ваш тариф'),
    });
    expect(reminders.createObjectReminder).not.toHaveBeenCalled();
    expect(reminders.updateRule).not.toHaveBeenCalled();
    expect(reminders.deleteReminder).not.toHaveBeenCalled();
  });

  it.each([
    [
      'patient_home_daily_practice_target',
      'patient_home_today',
      'изменить настройки главной страницы пациента',
    ],
    ['patient_default_promo_treatment_program_template_id', 'promo', 'изменить промо-программу'],
  ])(
    'refuses shared setting %s through its targeted mechanic guard',
    async (key, mechanic, action) => {
      const response = await updateAdminSetting(
        request('https://app.example.test/api/admin/settings', { key, value: 3 }),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        mechanic,
        message: `Невозможно ${action}: этот раздел не входит в ваш тариф.`,
      });
    },
  );

  it.each([
    ['clinic_smtp_outbound', 'clinic_smtp'],
    ['clinic_smsc_api_key', 'clinic_sms'],
    ['clinic_telegram_bot_token', 'clinic_telegram_bot'],
    ['clinic_max_bot_api_key', 'clinic_max_bot'],
  ] as const)(
    'refuses clinic delivery setting %s without its independent %s entitlement',
    async (key, mechanic) => {
      const response = await updateAdminSetting(
        request('https://app.example.test/api/admin/settings', {
          key,
          value:
            key === 'clinic_smtp_outbound'
              ? {
                  host: 'smtp.clinic.test',
                  port: 587,
                  secure: false,
                  user: 'clinic',
                  password: 'secret',
                  from: 'clinic@example.test',
                }
              : 'secret',
        }),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: 'entitlement_required',
        mechanic,
      });
      expect(requireEntitlementForMutation).toHaveBeenCalledWith(workspace, mechanic);
    },
  );

  it('writes a clinic delivery credential only to the authenticated clinic organization and redacts the response', async () => {
    vi.mocked(requireEntitlementForMutation).mockResolvedValue({ ok: true });
    const getSetting = vi.fn().mockImplementation(async (key: string) =>
      key === 'platform_integration_availability'
        ? {
            key,
            scope: 'admin',
            organizationId: null,
            valueJson: {
              value: {
                version: 1,
                integrations: {
                  telegram: true,
                  max: true,
                  email: true,
                  smsc: true,
                  web_push: true,
                  google_calendar: true,
                  yandex_calendar: false,
                },
              },
            },
          }
        : null,
    );
    const updateSetting = vi.fn().mockResolvedValue({
      key: 'clinic_telegram_bot_token',
      scope: 'admin',
      organizationId: ORG_ID,
      valueJson: { value: 'secret-token' },
      updatedAt: '2026-08-02T00:00:00.000Z',
      updatedBy: USER_ID,
    });
    vi.mocked(buildAppDeps).mockReturnValue({
      systemSettings: { getSetting, updateSetting },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await updateAdminSetting(
      request('https://app.example.test/api/admin/settings', {
        key: 'clinic_telegram_bot_token',
        value: 'secret-token',
      }),
    );

    expect(response.status).toBe(200);
    expect(updateSetting).toHaveBeenCalledWith(
      'clinic_telegram_bot_token',
      'admin',
      { value: 'secret-token' },
      USER_ID,
      { organizationId: ORG_ID },
    );
    await expect(response.json()).resolves.toMatchObject({
      setting: {
        organizationId: ORG_ID,
        valueJson: { value: '[REDACTED]' },
      },
    });
  });

  it('does not reach a clinic settings write when clinic-management authorization is denied', async () => {
    vi.mocked(requireClinicManagementApiContext).mockResolvedValue(denied);
    const updateSetting = vi.fn();
    vi.mocked(buildAppDeps).mockReturnValue({
      systemSettings: { updateSetting },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await updateAdminSetting(
      request('https://app.example.test/api/admin/settings', {
        key: 'clinic_telegram_bot_token',
        value: 'secret-token',
      }),
    );

    expect(response.status).toBe(403);
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('does not configure a clinic channel while the platform integration is globally disabled', async () => {
    vi.mocked(requireEntitlementForMutation).mockResolvedValue({ ok: true });
    const getSetting = vi.fn().mockImplementation(async (key: string) =>
      key === 'platform_integration_availability'
        ? {
            key,
            scope: 'admin',
            organizationId: null,
            valueJson: {
              value: {
                version: 1,
                integrations: {
                  telegram: false,
                  max: true,
                  email: true,
                  smsc: true,
                  web_push: true,
                  google_calendar: true,
                  yandex_calendar: false,
                },
              },
            },
          }
        : null,
    );
    const updateSetting = vi.fn().mockResolvedValue({
      key: 'clinic_telegram_bot_token',
      scope: 'admin',
      organizationId: ORG_ID,
      valueJson: { value: 'secret-token' },
      updatedAt: '2026-08-02T00:00:00.000Z',
      updatedBy: USER_ID,
    });
    vi.mocked(buildAppDeps).mockReturnValue({
      systemSettings: { getSetting, updateSetting },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await updateAdminSetting(
      request('https://app.example.test/api/admin/settings', {
        key: 'clinic_telegram_bot_token',
        value: 'secret-token',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'integration_disabled' });
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('checks both Today and warmups before changing shared warmup settings', async () => {
    vi.mocked(requireEntitlementForMutation)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(denied);

    const response = await updateAdminSetting(
      request('https://app.example.test/api/admin/settings', {
        key: 'patient_home_daily_warmup_rotation_enabled',
        value: true,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      mechanic: 'warmups',
      message: 'Невозможно изменить настройки разминок: этот раздел не входит в ваш тариф.',
    });
  });

  it('refuses creating a CMS section in the warmups cluster', async () => {
    vi.mocked(requireEntitlementForMutationAction)
      .mockResolvedValueOnce({
        ok: false,
        reason: 'entitlement_required',
        mechanic: 'warmups',
      } as never);
    const form = new FormData();
    form.set('slug', 'daily-warmups');
    form.set('title', 'Разминки');
    form.set('placement', 'warmups');

    await expect(saveContentSection(null, form)).resolves.toMatchObject({
      ok: false,
      error:
        'Невозможно изменить контент разминок: этот раздел не входит в ваш тариф. Чтобы выполнить действие, включите этот раздел в тарифе клиники.',
    });
  });

  it('refuses patient promo mutation before it can materialize an instance', async () => {
    const response = await updatePatientPromo(
      request('https://app.example.test/api/patient/treatment-program-promo/action', {
        templateStageItemId: TARGET_ID,
        markComplete: true,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      mechanic: 'promo',
      message: 'Невозможно изменить промо-программу: этот раздел не входит в ваш тариф.',
    });
  });

  it('refuses both rating writes while material ratings are disabled platform-wide', async () => {
    const ratingResponse = await saveMaterialRating(
      request('https://app.example.test/api/patient/material-ratings', {
        targetKind: 'content_page',
        targetId: TARGET_ID,
        stars: 5,
      }),
    );
    const feedbackResponse = await submitRatingFeedback(
      request('https://app.example.test/api/patient/material-ratings/feedback', {
        contentPageId: TARGET_ID,
        ratingValue: 3,
      }),
    );

    expect(ratingResponse.status).toBe(403);
    await expect(ratingResponse.json()).resolves.toMatchObject({
      error: 'material_ratings_disabled',
    });
    expect(feedbackResponse.status).toBe(403);
    await expect(feedbackResponse.json()).resolves.toMatchObject({
      error: 'material_ratings_disabled',
    });
  });

  it('refuses file metadata creation visibly when the assigned tariff has no file limit', async () => {
    const createFile = vi.fn();
    vi.mocked(requireEntitlementForMutation).mockResolvedValue({ ok: true });
    vi.mocked(buildAppDeps).mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: TARGET_ID }),
      },
      patientFiles: { createFile },
      orgEntitlements: {
        getSnapshot: vi.fn().mockResolvedValue({
          tariff: { mechanics: {}, quotas: {}, includedSeats: null },
          overrides: [],
          access: { lifecycle: 'active', tariffId: 'tariff', source: 'assignment' },
        }),
      },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await createPatientFile(
      request('https://app.example.test/api/doctor/patients/' + TARGET_ID + '/files', {
        category: 'анализ',
        fileName: 'result.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
      }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'file_storage_limit_not_configured',
    });
    expect(createFile).not.toHaveBeenCalled();
  });

  it('refuses file metadata creation visibly when the file storage quota is exhausted, without creating the patient folder', async () => {
    const createFile = vi.fn();
    const getStorageUsedBytes = vi.fn().mockResolvedValue(1_000);
    vi.mocked(requireEntitlementForMutation).mockResolvedValue({ ok: true });
    vi.mocked(buildAppDeps).mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: TARGET_ID }),
      },
      patientFiles: { createFile, getStorageUsedBytes },
      orgEntitlements: {
        getSnapshot: vi.fn().mockResolvedValue({
          tariff: {
            mechanics: {},
            quotas: {
              files: { kind: 'numeric', limit: 1_000, unit: 'bytes', warningAtPercent: null },
            },
            includedSeats: null,
          },
          overrides: [],
          access: { lifecycle: 'active', tariffId: 'tariff', source: 'assignment' },
        }),
      },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await createPatientFile(
      request('https://app.example.test/api/doctor/patients/' + TARGET_ID + '/files', {
        category: 'анализ',
        fileName: 'result.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
      }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'file_storage_limit_reached',
    });
    expect(createFile).not.toHaveBeenCalled();
    expect(pgEnsureClientPatientFolder).not.toHaveBeenCalled();
  });

  it.each([
    [
      'file_storage_limit_not_configured',
      'Невозможно загрузить файл: в тарифе клиники не настроен объём файлов. Настройте объём файлов в тарифе клиники, чтобы разрешить загрузку.',
    ],
    [
      'file_storage_limit_reached',
      'Невозможно загрузить файл: хранилище клиники заполнено. Увеличьте объём файлов в тарифе клиники, чтобы загружать новые файлы.',
    ],
  ])('keeps the upload refusal visible for %s', async (error, message) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { container } = render(
      createElement(PatientTabFiles, { userId: TARGET_ID, initialFiles: [] }),
    );

    fireEvent.click(screen.getByTitle('Загрузить файл'));
    const input = container.querySelector<HTMLInputElement>('#upload-file-input');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: { files: [new File(['result'], 'result.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
  });

  it('refuses saving a clinic brand when branding is disabled, without touching the port', async () => {
    const brandingPort = {
      getCoreContext: vi.fn(),
      getPublishedRevision: vi.fn(),
      getDraftRevision: vi.fn(),
      saveDraft: vi.fn(),
      publishDraft: vi.fn(),
      unpublish: vi.fn(),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      orgBranding: createOrgBrandingService({
        port: brandingPort,
        resolveBrandingAccess: async () => ({
          mechanic: 'branding',
          state: 'disabled',
          policySource: 'mechanic',
          warning: null,
        }),
      }),
    } as unknown as ReturnType<typeof buildAppDeps>);

    await expect(
      saveOrgBranding({ displayName: 'Клиника', logoMediaId: null }),
    ).resolves.toEqual({ ok: false, error: 'entitlement_disabled' });
    expect(brandingPort.saveDraft).not.toHaveBeenCalled();
    expect(brandingPort.publishDraft).not.toHaveBeenCalled();
  });

  it('keeps clinic-owned exercise creation, editing, and archiving available while the platform library is disabled', async () => {
    const lfkExercises = {
      createExercise: vi.fn().mockResolvedValue({ id: 'created-exercise' }),
      getExercise: vi.fn().mockResolvedValue({ id: TARGET_ID, isArchived: false }),
      updateExercise: vi.fn().mockResolvedValue({ id: TARGET_ID }),
      archiveExercise: vi.fn().mockResolvedValue(undefined),
      unarchiveExercise: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      lfkExercises,
      references: { listActiveItemsByCategoryCode: vi.fn().mockResolvedValue([]) },
    } as unknown as ReturnType<typeof buildAppDeps>);
    vi.mocked(requireEntitlementForMutationAction).mockResolvedValue({
      ok: false,
      reason: 'entitlement_required',
      mechanic: 'exercise_catalog',
    } as never);

    const exerciseForm = new FormData();
    exerciseForm.set('title', 'Наклоны');
    const updateForm = new FormData();
    updateForm.set('id', TARGET_ID);
    updateForm.set('title', 'Наклоны с поворотом');
    const archiveForm = new FormData();
    archiveForm.set('id', TARGET_ID);

    const [createResult, updateResult, archiveResult, unarchiveResult] = await Promise.all([
      saveDoctorExerciseCore(exerciseForm),
      saveDoctorExerciseCore(updateForm),
      archiveDoctorExerciseCore(archiveForm),
      unarchiveDoctorExerciseCore(archiveForm),
    ]);

    expect(createResult).toMatchObject({ ok: true, exerciseId: 'created-exercise', wasUpdate: false });
    expect(updateResult).toMatchObject({ ok: true, exerciseId: TARGET_ID, wasUpdate: true });
    expect(archiveResult).toMatchObject({ kind: 'archived', id: TARGET_ID });
    expect(unarchiveResult).toMatchObject({ kind: 'unarchived', id: TARGET_ID });
    expect(lfkExercises.createExercise).toHaveBeenCalledOnce();
    expect(lfkExercises.updateExercise).toHaveBeenCalledOnce();
    expect(lfkExercises.archiveExercise).toHaveBeenCalledOnce();
    expect(lfkExercises.unarchiveExercise).toHaveBeenCalledOnce();
    expect(requireEntitlementForMutationAction).not.toHaveBeenCalledWith(
      workspace,
      'exercise_catalog',
    );
  });

  it('never mutates a platform-owned exercise through the real service, even though the tariff mutation gate no longer runs', async () => {
    const PLATFORM_EXERCISE_ID = 'platform-exercise-id';
    const platformExercise: Exercise = {
      id: PLATFORM_EXERCISE_ID,
      ownerKind: 'platform',
      catalogScope: 'catalog',
      title: 'Platform squat',
      description: null,
      regionRefId: null,
      regionRefIds: [],
      loadType: null,
      difficulty1_10: null,
      contraindications: null,
      tags: null,
      isArchived: false,
      createdBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      media: [],
    };
    // Mirrors the real repo's `organization_id = ORG_ID_EXPR` scoping (pgLfkExercises.ts):
    // reads only see a platform row when explicitly requested, writes never touch it.
    const fakePort = {
      list: vi.fn().mockResolvedValue([]),
      listTitlesByIds: vi.fn().mockResolvedValue(new Map()),
      getById: vi.fn(async (id: string, options?: { includePlatformBase?: boolean }) => {
        if (id !== PLATFORM_EXERCISE_ID) return null;
        return options?.includePlatformBase ? platformExercise : null;
      }),
      create: vi.fn(),
      update: vi.fn(async () => null),
      archive: vi.fn(async () => false),
      unarchive: vi.fn(async () => false),
      getExerciseUsageSummary: vi.fn(),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      lfkExercises: createLfkExercisesService(fakePort),
      references: { listActiveItemsByCategoryCode: vi.fn().mockResolvedValue([]) },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const updateForm = new FormData();
    updateForm.set('id', PLATFORM_EXERCISE_ID);
    updateForm.set('title', 'Hijacked title');
    const archiveForm = new FormData();
    archiveForm.set('id', PLATFORM_EXERCISE_ID);

    const [updateResult, archiveResult, unarchiveResult] = await Promise.all([
      saveDoctorExerciseCore(updateForm),
      archiveDoctorExerciseCore(archiveForm),
      unarchiveDoctorExerciseCore(archiveForm),
    ]);

    expect(updateResult).toMatchObject({ ok: false, error: 'Упражнение не найдено' });
    expect(archiveResult).toMatchObject({ kind: 'invalid' });
    expect(unarchiveResult).toMatchObject({ kind: 'invalid' });
    expect(fakePort.update).not.toHaveBeenCalled();
    expect(fakePort.archive).not.toHaveBeenCalled();
    expect(fakePort.unarchive).not.toHaveBeenCalled();
  });

  it('never mutates a platform-owned LFK complex template through the real service, even though the tariff mutation gate no longer runs', async () => {
    const PLATFORM_TEMPLATE_ID = 'platform-template-id';
    const platformTemplate: Template = {
      id: PLATFORM_TEMPLATE_ID,
      ownerKind: 'platform',
      title: 'Platform complex',
      description: null,
      status: 'published',
      createdBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      exercises: [],
    };
    // Mirrors the real repo's `organization_id = ORG_ID_EXPR` scoping (pgLfkTemplates.ts):
    // reads only see a platform row when explicitly requested, writes never touch it.
    const fakePort = {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(async (id: string, options?: { includePlatformBase?: boolean }) => {
        if (id !== PLATFORM_TEMPLATE_ID) return null;
        return options?.includePlatformBase ? platformTemplate : null;
      }),
      create: vi.fn(),
      update: vi.fn(async () => null),
      updateExercises: vi.fn(),
      setStatus: vi.fn(async () => null),
      getTemplateUsageSummary: vi.fn(),
    };
    vi.mocked(buildAppDeps).mockReturnValue({
      lfkTemplates: createLfkTemplatesService(fakePort),
    } as unknown as ReturnType<typeof buildAppDeps>);
    vi.mocked(requireEntitlementForReadAction).mockResolvedValue({ ok: true } as never);

    const result = await persistLfkTemplateDraft({
      templateId: PLATFORM_TEMPLATE_ID,
      title: 'Hijacked complex',
      description: null,
      exercises: [],
    });

    expect(result).toMatchObject({ ok: false, error: 'Шаблон не найден' });
    expect(fakePort.update).not.toHaveBeenCalled();
    expect(fakePort.updateExercises).not.toHaveBeenCalled();
  });
});
