import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TreatmentProgramInstanceDetail } from '@/modules/treatment-program/types';
import { PatientTreatmentProgramStagePageProgramSection } from './PatientTreatmentProgramStagePageProgramSection';

const stage: TreatmentProgramInstanceDetail['stages'][number] = {
  id: '33333333-3333-4333-8333-333333333333',
  instanceId: '22222222-2222-4222-8222-222222222222',
  sourceStageId: null,
  title: 'Этап',
  description: null,
  sortOrder: 1,
  localComment: null,
  skipReason: null,
  status: 'in_progress',
  startedAt: '2026-08-17T00:00:00.000Z',
  goals: null,
  objectives: null,
  expectedDurationDays: null,
  expectedDurationText: null,
  groups: [],
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      stageId: '33333333-3333-4333-8333-333333333333',
      itemType: 'exercise',
      itemRefId: '55555555-5555-4555-8555-555555555555',
      sortOrder: 1,
      comment: null,
      localComment: null,
      settings: null,
      snapshot: { title: 'Упражнение' },
      completedAt: null,
      isActionable: true,
      status: 'active',
      groupId: null,
      createdAt: '2026-08-17T00:00:00.000Z',
      lastViewedAt: null,
      effectiveComment: null,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('patient program exercise preview', () => {
  it('opens the exercise without writing a completion', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PatientTreatmentProgramStagePageProgramSection
        instanceId="22222222-2222-4222-8222-222222222222"
        stage={stage}
        base="/api/patient/treatment-program-instances/instance/items"
        busy={null}
        setBusy={vi.fn()}
        setError={vi.fn()}
        refresh={vi.fn(async () => undefined)}
        contentBlocked={false}
        itemInteraction="full"
        doneItemIds={[]}
        onDoneItemIds={vi.fn()}
        lastDoneAtIsoByItemId={{}}
        doneTodayCountByItemId={{}}
        appDisplayTimeZone="Europe/Moscow"
        planItemDoneRepeatCooldownMinutes={60}
        programCommentsInteraction={{ visible: false, enabled: false }}
      />,
    );

    const preview = screen.getByRole('link', { name: 'Открыть: Упражнение' });
    preview.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(preview);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
