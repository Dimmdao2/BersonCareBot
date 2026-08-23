import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import { getDoctorScreenTitle } from '@/shared/ui/doctorScreenTitles';
import { DoctorTasksPageClient } from './DoctorTasksPageClient';

const task: SpecialistTaskRow = {
  id: 'task-1',
  organizationId: 'org-1',
  ownerUserId: 'doctor-1',
  patientUserId: 'patient-1',
  title: 'Проверить упражнения',
  description: 'Посмотреть технику выполнения',
  dueAt: '2026-08-23T09:30:00.000Z',
  remindAt: null,
  isImportant: false,
  completedAt: null,
  reminderSentAt: null,
  createdAt: '2026-08-22T09:00:00.000Z',
  updatedAt: '2026-08-22T09:00:00.000Z',
};

const commonProps = {
  initialTasks: [task],
  initialPatientNames: { 'patient-1': 'Дмитрий Берсон' },
  displayIana: 'Europe/Moscow',
  todayIso: '2026-08-23',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DoctorTasksPageClient', () => {
  it('shows task summary, opens actions only in details, completes it, and keeps read-only view immutable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const mutable = render(<DoctorTasksPageClient {...commonProps} canMutate />);

    expect(getDoctorScreenTitle('/app/doctor/tasks')).toBe('Задачи');
    expect(screen.getByText('Дмитрий Берсон')).toBeInTheDocument();
    expect(screen.getByText('Проверить упражнения')).toBeInTheDocument();
    expect(screen.getByText('Посмотреть технику выполнения')).toBeInTheDocument();
    expect(screen.getByText('Просрочено')).toBeInTheDocument();
    expect(screen.getByText(/23\.08\.2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выполнить' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Проверить упражнения').closest('button')!);
    expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Выполнить' }));

    await waitFor(() => expect(screen.getByText('Нет открытых задач')).toBeInTheDocument());
    expect(screen.getByText('Выберите задачу')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/doctor/tasks/task-1/complete', {
      method: 'POST',
    });

    mutable.unmount();
    render(<DoctorTasksPageClient {...commonProps} canMutate={false} />);
    expect(screen.queryByRole('button', { name: 'Новая задача' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Проверить упражнения').closest('button')!);
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выполнить' })).not.toBeInTheDocument();
  });
});
