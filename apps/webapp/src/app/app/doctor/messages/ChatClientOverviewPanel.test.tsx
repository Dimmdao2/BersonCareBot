/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatClientOverviewPanel } from './ChatClientOverviewPanel';

const PATIENT_USER_ID = '11111111-2222-4000-8000-333333333333';

function makeVisit(overrides: Record<string, unknown>) {
  return {
    appointmentId: 'appt-1',
    startAt: '2026-01-01T10:00:00.000Z',
    endAt: '2026-01-01T10:30:00.000Z',
    durationMinutes: 30,
    status: 'confirmed',
    specialistName: 'Др. Иванов',
    branchTitle: null,
    roomTitle: null,
    serviceTitle: 'Консультация',
    wasViaPackage: false,
    packageUsageSummary: null,
    prepaymentAmountMinor: null,
    prepaymentCurrency: null,
    finalPaymentAmountMinor: null,
    finalPaymentCurrency: null,
    staffComment: null,
    ...overrides,
  };
}

function stubHistoryFetch(visits: object[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    expect(url).toContain(`/api/doctor/clients/${PATIENT_USER_ID}/history`);
    return new Response(JSON.stringify({ ok: true, timeline: [], payments: [], visits }));
  });
}

describe('ChatClientOverviewPanel — data wiring', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches history for the given patientUserId and renders it under 'Активные записи'", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal('fetch', stubHistoryFetch([makeVisit({ startAt: future, status: 'confirmed' })]));

    render(
      <ChatClientOverviewPanel
        patientUserId={PATIENT_USER_ID}
        patientDisplayName="Иванова Мария"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('Консультация')).toBeInTheDocument();
    expect(screen.getByText('Активные записи')).toBeInTheDocument();
    expect(screen.getByText('Иванова Мария')).toBeInTheDocument();
  });

  it("splits a past visit into 'История записи' and shows an empty state for 'Активные записи'", async () => {
    const past = '2020-01-01T10:00:00.000Z';
    vi.stubGlobal('fetch', stubHistoryFetch([makeVisit({ startAt: past, status: 'completed' })]));

    render(
      <ChatClientOverviewPanel
        patientUserId={PATIENT_USER_ID}
        patientDisplayName="Пациент"
        onClose={vi.fn()}
      />,
    );

    await screen.findByText('Консультация');
    expect(screen.getByText('Нет активных записей')).toBeInTheDocument();
  });

  it("shows extension-point placeholders for 'Обзор' and 'Статистика программы' without fetching extra data", async () => {
    vi.stubGlobal('fetch', stubHistoryFetch([]));

    render(
      <ChatClientOverviewPanel
        patientUserId={PATIENT_USER_ID}
        patientDisplayName="Пациент"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Нет активных записей')).toBeInTheDocument());
    expect(screen.getByText('Обзор')).toBeInTheDocument();
    expect(screen.getByText('Статистика программы')).toBeInTheDocument();
    // Оба extension-point плейсхолдера («Обзор» и «Статистика программы») содержат этот текст.
    expect(screen.getAllByText(/следующей итерации/)).toHaveLength(2);
  });

  it('shows an error state when the history request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 })),
    );

    render(
      <ChatClientOverviewPanel
        patientUserId={PATIENT_USER_ID}
        patientDisplayName="Пациент"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('Не удалось загрузить записи')).toBeInTheDocument();
  });

  it('calls onClose when the × button is clicked', async () => {
    vi.stubGlobal('fetch', stubHistoryFetch([]));
    const onClose = vi.fn();

    render(
      <ChatClientOverviewPanel
        patientUserId={PATIENT_USER_ID}
        patientDisplayName="Пациент"
        onClose={onClose}
      />,
    );

    await screen.findByText('Обзор и записи');
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть обзор и записи' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
