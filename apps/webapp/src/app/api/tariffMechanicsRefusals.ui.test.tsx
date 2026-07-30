import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerRefresh = vi.fn();
const actionMocks = vi.hoisted(() => ({
  practice: vi.fn(),
  cooldowns: vi.fn(),
  rotation: vi.fn(),
  moodIcons: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  usePathname: () => '/app/doctor/content',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-hot-toast', () => ({ default: toastMocks }));
vi.mock('@/app/app/doctor/content/sections/sectionVisibilityActions', () => ({
  setSectionVisibility: vi.fn(),
}));
vi.mock('@/app/app/doctor/patient-home/patientHomeDoctorSettingsActions', () => ({
  savePatientHomePracticeTargetAction: actionMocks.practice,
  savePatientHomeRepeatCooldownsAction: actionMocks.cooldowns,
  savePatientHomeWarmupRotationAction: actionMocks.rotation,
  savePatientHomeMoodIconsAction: actionMocks.moodIcons,
}));

import { ContentNav } from '@/app/app/doctor/content/ContentNav';
import { PatientHomeMoodCheckin } from '@/app/app/patient/home/PatientHomeMoodCheckin';
import { PatientContentPracticeComplete } from '@/app/app/patient/content/[slug]/PatientContentPracticeComplete';
import { DoctorClientWarmupSchedulePanel } from '@/app/app/doctor/clients/DoctorClientWarmupSchedulePanel';
import { DefaultPromoProgramClient } from '@/app/app/doctor/treatment-program-promo/DefaultPromoProgramClient';
import { PatientHomePracticeTargetPanel } from '@/app/app/settings/patient-home/PatientHomePracticeTargetPanel';
import { PatientHomeRepeatCooldownPanel } from '@/app/app/settings/patient-home/PatientHomeRepeatCooldownPanel';
import { PatientHomeDailyWarmupRotationPanel } from '@/app/app/settings/patient-home/PatientHomeDailyWarmupRotationPanel';
import { PatientHomeMoodIconsPanel } from '@/app/app/doctor/patient-home/PatientHomeMoodIconsPanel';

const REFUSAL =
  'Невозможно выполнить действие: этот раздел не входит в ваш тариф. Чтобы выполнить действие, включите этот раздел в тарифе клиники.';
const moodOptions = [1, 2, 3, 4, 5].map((score) => ({
  score: score as 1 | 2 | 3 | 4 | 5,
  label: `Оценка ${score}`,
  imageUrl: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actionMocks)) {
    action.mockResolvedValue({ ok: false, error: REFUSAL });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('tariff refusal UI', () => {
  it('removes the Today navigation entry when its mechanic is off', () => {
    render(
      <ContentNav
        articleSections={[]}
        patientHomeTodayEnabled={false}
        activePaneKey="warmups"
        onPaneChange={vi.fn()}
        onCreateSection={vi.fn()}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Главная пациента' })).not.toBeInTheDocument();
  });

  it('shows the backend mood refusal instead of a generic save error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, message: REFUSAL }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(
      <PatientHomeMoodCheckin moodOptions={moodOptions} personalTierOk anonymousGuest={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Самочувствие 4 из 5/ }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(REFUSAL));
  });

  it('shows the backend warmup-feeling refusal from the PATCH flow', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, id: '33333333-3333-4333-8333-333333333333' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, message: REFUSAL }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      );
    render(
      <PatientContentPracticeComplete
        contentPageId="22222222-2222-4222-8222-222222222222"
        contentPath="/app/patient/content/warmup"
        practiceSource="daily_warmup"
        guest={false}
        needsActivation={false}
        moodIconOptions={moodOptions}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отметить выполнение' }));
    fireEvent.click(await screen.findByRole('button', { name: /Самочувствие 4 из 5/ }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(REFUSAL));
  });

  it('shows the backend warmup schedule refusal in the panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (!init?.method) {
        return new Response(
          JSON.stringify({
            ok: true,
            rule: {
              id: 'rule',
              scheduleType: 'slots_v1',
              scheduleData: { timesLocal: ['09:00'], dayFilter: 'weekdays' },
              enabled: true,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ ok: false, message: REFUSAL }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    });
    render(<DoctorClientWarmupSchedulePanel userId="22222222-2222-4222-8222-222222222222" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();
  });

  it('shows backend promo refusals for both save and refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, message: REFUSAL }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(
      <DefaultPromoProgramClient
        initialTemplateId="22222222-2222-4222-8222-222222222222"
        templates={[{ id: '22222222-2222-4222-8222-222222222222', title: 'Промо' }]}
        stats={{ activePromo: 0, completedPromo: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(REFUSAL));
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(2));
  });

  it('shows returned errors in every Today settings panel', async () => {
    const cases = [
      {
        node: <PatientHomePracticeTargetPanel initialTarget={3} />,
        action: actionMocks.practice,
      },
      {
        node: (
          <PatientHomeRepeatCooldownPanel initialWarmupMinutes={30} initialPlanItemMinutes={30} />
        ),
        action: actionMocks.cooldowns,
      },
      {
        node: (
          <PatientHomeDailyWarmupRotationPanel initialEnabled={false} initialTimes={['09:00']} />
        ),
        action: actionMocks.rotation,
      },
      {
        node: <PatientHomeMoodIconsPanel initialOptions={moodOptions} />,
        action: actionMocks.moodIcons,
      },
    ];

    for (const testCase of cases) {
      const view = render(testCase.node);
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(REFUSAL);
      expect(testCase.action).toHaveBeenCalledOnce();
      view.unmount();
    }
  });
});
