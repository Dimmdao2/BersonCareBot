// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientTabOverview } from './patients/[userId]/tabs/PatientTabOverview';
import { DoctorGlobalTasksSection } from './DoctorGlobalTasksSection';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('specialist task tariff UI', () => {
  it('removes Today task controls when specialist tasks are unavailable', () => {
    render(<DoctorGlobalTasksSection available={false} initialTasks={[]} todayIso="2026-08-02" />);

    expect(screen.queryByRole('button', { name: 'Новая' })).not.toBeInTheDocument();
    expect(screen.queryByText('Нет открытых задач')).not.toBeInTheDocument();
  });

  it('keeps existing Today tasks readable, but removes their mutation controls, in read-only mode', () => {
    render(
      <DoctorGlobalTasksSection
        available={false}
        initialTasks={[
          {
            id: '00000000-0000-4000-8000-000000004069',
            ownerUserId: '00000000-0000-4000-8000-000000002069',
            patientUserId: null,
            title: 'Позвонить пациенту',
            description: null,
            dueAt: null,
            remindAt: null,
            reminderSentAt: null,
            isImportant: false,
            completedAt: null,
            createdAt: '2026-08-02T00:00:00.000Z',
            updatedAt: '2026-08-02T00:00:00.000Z',
          },
        ]}
        todayIso="2026-08-02"
      />,
    );

    expect(screen.getByText('Позвонить пациенту')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Новая' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выполнить' })).not.toBeInTheDocument();
  });

  it('removes the patient-card task editor when specialist tasks are unavailable', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(
      <PatientTabOverview
        userId="00000000-0000-4000-8000-000000003069"
        specialistTasksAvailable={false}
      />,
    );

    expect(screen.queryByTitle('Добавить задачу')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Название задачи…')).not.toBeInTheDocument();
  });
});
