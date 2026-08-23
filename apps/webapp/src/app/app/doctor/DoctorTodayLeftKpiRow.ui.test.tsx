// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import { TooltipProvider } from '@/shared/ui/doctor/primitives/tooltip';
import { DoctorTodayLeftKpiRow } from './DoctorTodayLeftKpiRow';

function task(input: {
  id: string;
  title: string;
  dueAt: string;
  patientUserId?: string | null;
  description?: string | null;
}): SpecialistTaskRow {
  return {
    id: input.id,
    ownerUserId: '00000000-0000-4000-8000-000000000010',
    patientUserId: input.patientUserId ?? null,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt,
    remindAt: null,
    isImportant: false,
    completedAt: null,
    reminderSentAt: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}

describe('DoctorTodayLeftKpiRow task KPI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the full total but previews only today and overdue tasks, then opens details', () => {
    const patientUserId = '00000000-0000-4000-8000-000000000020';
    const tasks = [
      task({
        id: '00000000-0000-4000-8000-000000000101',
        title: 'Просроченная',
        dueAt: '2026-08-22T09:00:00.000Z',
      }),
      task({
        id: '00000000-0000-4000-8000-000000000102',
        title: 'На сегодня',
        description: 'Позвонить после обеда',
        dueAt: '2026-08-23T15:00:00.000Z',
        patientUserId,
      }),
      task({
        id: '00000000-0000-4000-8000-000000000103',
        title: 'Будущая',
        dueAt: '2026-08-24T09:00:00.000Z',
      }),
    ];

    render(
      <TooltipProvider>
        <DoctorTodayLeftKpiRow
          pendingTestsTotal={0}
          unreadConversations={[]}
          unreadTotal={0}
          pendingProgramTests={[]}
          pendingProgramTestsTotal={0}
          exerciseCommentAttentionItems={[]}
          exerciseCommentAttentionTotal={0}
          exerciseCommentAttentionTruncated={false}
          tasks={tasks}
          taskPatientNames={{ [patientUserId]: 'Иванов Иван Иванович' }}
          tasksTotal={tasks.length}
          todayIso="2026-08-23"
          displayIana="Europe/Moscow"
          tasksAvailable
          tasksReadable
          taskMutationPending={false}
          onTaskComplete={vi.fn().mockResolvedValue(true)}
          onTaskSaved={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Задачи 2 3/ }));

    expect(screen.getByText('Просроченная')).toBeInTheDocument();
    expect(screen.getByText('На сегодня')).toBeInTheDocument();
    expect(screen.queryByText('Будущая')).not.toBeInTheDocument();
    expect(screen.getByText('Иванов Иван Иванович')).toBeInTheDocument();
    expect(screen.getByText('Позвонить после обеда')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выполнить' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Иванов Иван Иванович На сегодня/ }));

    expect(screen.getByRole('heading', { name: 'Задача' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выполнить' })).toBeInTheDocument();
  });

  it('shows only the gray total when there are no today or overdue tasks', () => {
    const futureTask = task({
      id: '00000000-0000-4000-8000-000000000104',
      title: 'Будущая',
      dueAt: '2026-08-24T09:00:00.000Z',
    });

    render(
      <TooltipProvider>
        <DoctorTodayLeftKpiRow
          pendingTestsTotal={0}
          unreadConversations={[]}
          unreadTotal={0}
          pendingProgramTests={[]}
          pendingProgramTestsTotal={0}
          exerciseCommentAttentionItems={[]}
          exerciseCommentAttentionTotal={0}
          exerciseCommentAttentionTruncated={false}
          tasks={[futureTask]}
          taskPatientNames={{}}
          tasksTotal={1}
          todayIso="2026-08-23"
          displayIana="Europe/Moscow"
          tasksAvailable
          tasksReadable
          taskMutationPending={false}
          onTaskComplete={vi.fn().mockResolvedValue(true)}
          onTaskSaved={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Задачи 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Задачи 0 1/ })).not.toBeInTheDocument();
  });
});
