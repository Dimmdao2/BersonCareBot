import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerRefresh = vi.fn();
const actionMocks = vi.hoisted(() => ({
  practice: vi.fn(),
  cooldowns: vi.fn(),
  rotation: vi.fn(),
  moodIcons: vi.fn(),
  sectionVisibility: vi.fn(),
  sectionAuth: vi.fn(),
  sectionReorder: vi.fn(),
  pageAuth: vi.fn(),
  pageReorder: vi.fn(),
  lifecycle: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }),
  usePathname: () => '/app/doctor/content',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-hot-toast', () => ({ default: toastMocks }));
vi.mock('@/app/app/doctor/content/sections/sectionVisibilityActions', () => ({
  setSectionVisibility: actionMocks.sectionVisibility,
  setSectionRequiresAuth: actionMocks.sectionAuth,
}));
vi.mock('@/app/app/doctor/content/sections/reorderContentSections', () => ({
  reorderContentSections: actionMocks.sectionReorder,
}));
vi.mock('@/app/app/doctor/content/contentPageAuthActions', () => ({
  setContentPageRequiresAuth: actionMocks.pageAuth,
}));
vi.mock('@/app/app/doctor/content/reorderContentPages', () => ({
  reorderContentPagesInSection: actionMocks.pageReorder,
}));
vi.mock('@/app/app/doctor/content/lifecycleActions', () => ({
  applyContentLifecycle: actionMocks.lifecycle,
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
import { ContentSectionsListClient } from '@/app/app/doctor/content/sections/ContentSectionsListClient';
import { ContentPagesSectionList } from '@/app/app/doctor/content/ContentPagesSectionList';
import { ContentLifecycleDropdown } from '@/app/app/doctor/content/ContentLifecycleDropdown';
import { PatientDailyWarmupVideoEngagement } from '@/app/app/patient/content/[slug]/PatientDailyWarmupVideoEngagement';

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
        warmupsEnabled={true}
        activePaneKey="warmups"
        onPaneChange={vi.fn()}
        onCreateSection={vi.fn()}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Главная пациента' })).not.toBeInTheDocument();
  });

  it('removes the warmups navigation entry when its mechanic is off', () => {
    render(
      <ContentNav
        articleSections={[]}
        patientHomeTodayEnabled
        warmupsEnabled={false}
        activePaneKey="warmups"
        onPaneChange={vi.fn()}
        onCreateSection={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Разминки' })).not.toBeInTheDocument();
  });

  it('keeps CMS lists readable without offering mutations during the read-only ladder step', () => {
    const nav = render(
      <ContentNav
        articleSections={[{ slug: 'articles', title: 'Статьи', isVisible: true }]}
        canManageCms={false}
        patientHomeTodayEnabled
        warmupsEnabled
        activePaneKey="section:articles"
        onPaneChange={vi.fn()}
        onCreateSection={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Статьи' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Раздел' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Скрыть раздел' })).not.toBeInTheDocument();
    nav.unmount();

    const pages = render(
      <ContentPagesSectionList
        sectionSlug="articles"
        sectionTitle="Статьи"
        canManageCms={false}
        initialPages={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            section: 'articles',
            slug: 'article',
            title: 'Статья',
            sortOrder: 0,
            isPublished: true,
            requiresAuth: false,
            archivedAt: null,
            deletedAt: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('Статья')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Статья' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Публичная страница' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Снять с публикации' })).not.toBeInTheDocument();
    pages.unmount();

    render(
      <ContentSectionsListClient
        canManageCms={false}
        initialSections={[
          {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'articles',
            title: 'Статьи',
            sortOrder: 0,
            isVisible: true,
            requiresAuth: false,
            coverImageUrl: null,
            iconImageUrl: null,
            kind: 'article',
            systemParentCode: null,
            pagesInSection: 1,
          },
        ]}
      />,
    );
    expect(screen.getByText('articles')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Статьи' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Виден пациенту' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Действия' })).not.toBeInTheDocument();
  });

  it('shows CMS refusals from nav, section, page, and lifecycle handlers', async () => {
    const nav = render(
      <ContentNav
        articleSections={[{ slug: 'articles', title: 'Статьи', isVisible: true }]}
        patientHomeTodayEnabled
        warmupsEnabled
        activePaneKey="section:articles"
        onPaneChange={vi.fn()}
        onCreateSection={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть раздел' }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(REFUSAL));
    nav.unmount();

    const sections = render(
      <ContentSectionsListClient
        initialSections={[
          {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'warmups',
            title: 'Разминки',
            sortOrder: 0,
            isVisible: true,
            requiresAuth: false,
            coverImageUrl: null,
            iconImageUrl: null,
            kind: 'system',
            systemParentCode: 'warmups',
            pagesInSection: 1,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Виден пациенту' }));
    fireEvent.click(screen.getByRole('button', { name: 'Публично в каталоге' }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(3));
    sections.unmount();

    const pages = render(
      <ContentPagesSectionList
        sectionSlug="warmups"
        sectionTitle="Разминки"
        initialPages={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            section: 'warmups',
            slug: 'warmup',
            title: 'Разминка',
            sortOrder: 0,
            isPublished: false,
            requiresAuth: false,
            archivedAt: null,
            deletedAt: null,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Публичная страница' }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(4));
    pages.unmount();

    render(
      <ContentLifecycleDropdown
        page={{
          id: '22222222-2222-4222-8222-222222222222',
          isPublished: false,
          archivedAt: null,
          deletedAt: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(5));
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

  it('shows the backend refusal when creating the warmup completion itself', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(REFUSAL));
  });

  it('shows the backend refusal when warmup video tracking is blocked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, message: REFUSAL }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(
      <PatientDailyWarmupVideoEngagement
        mode="hosted"
        contentPageId="22222222-2222-4222-8222-222222222222"
        iframeSrc="https://video.example.test/embed"
        title="Разминка"
      />,
    );

    fireEvent.pointerDown(screen.getByTitle('Разминка').parentElement!);
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

  it('keeps promo statistics readable but hides mutation controls in read-only mode', () => {
    render(
      <DefaultPromoProgramClient
        initialTemplateId="22222222-2222-4222-8222-222222222222"
        templates={[{ id: '22222222-2222-4222-8222-222222222222', title: 'Промо' }]}
        stats={{ activePromo: 3, completedPromo: 5 }}
        canMutate={false}
      />,
    );

    expect(screen.getByText('Активных экземпляров: 3')).toBeInTheDocument();
    expect(screen.getByText('Завершённых экземпляров: 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Обновить' })).not.toBeInTheDocument();
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
