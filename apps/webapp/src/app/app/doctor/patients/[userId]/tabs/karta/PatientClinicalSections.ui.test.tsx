import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnamnesisState } from '@/modules/patient-clinical/ports';
import { PatientClinicalSections } from './PatientClinicalSections';

/**
 * DISEASE-EDIT-05A / LIFE-LIFESTYLE-01..04: the fullscreen single-field editor introduced for
 * «Анамнез заболевания» and «Образ жизни» reuses the shared `DoctorModal` presentation="fullscreen-text"
 * contract (covered independently in DoctorModal.ui.test.tsx). This file locks in the observable
 * contract at this call site: both actions present, cancel is a true no-op, save calls the existing
 * typed endpoint exactly once with the right shape, and the lifestyle flow never surfaces a date to
 * the doctor.
 */

const userId = '11111111-1111-4111-8111-111111111111';

function stubAnamnesisFetch() {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok: true, json: async () => ({ ok: true }) }) as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSections(anamnesis: AnamnesisState, onAnamnesisRefresh = vi.fn()) {
  return {
    onAnamnesisRefresh,
    ...render(
      <PatientClinicalSections
        userId={userId}
        patientName="Иванова Мария"
        patientOnSupport={false}
        complaints={[]}
        complaintHistory={[]}
        diagnoses={[]}
        diagnosisHistory={[]}
        loading={false}
        fetchError={false}
        onClinicalRefresh={() => undefined}
        anamnesis={anamnesis}
        anamnesisLoading={false}
        anamnesisError={false}
        onAnamnesisRefresh={onAnamnesisRefresh}
        initialComorbidities={[]}
      />,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DiseaseAnamnesisSection editor (DISEASE-EDIT-03..05A)', () => {
  it('has both Отмена/Сохранить actions; cancel preserves the old text; save calls the endpoint once and refreshes', async () => {
    const fetchMock = stubAnamnesisFetch();
    const { onAnamnesisRefresh } = renderSections({
      trauma: [],
      illness: [],
      lifestyle: [],
      disease: 'Старый текст анамнеза',
    });

    fireEvent.click(screen.getByTitle('Изменить анамнез заболевания'));
    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByPlaceholderText('Анамнез заболевания') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Старый текст анамнеза');
    expect(document.activeElement).toBe(textarea);

    // Cancel: change the draft, then discard it.
    fireEvent.change(textarea, { target: { value: 'Черновик, который не должен сохраниться' } });
    fireEvent.click(within(dialog).getByText('Отмена'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Старый текст анамнеза')).toBeTruthy();

    // Reopen and save for real.
    fireEvent.click(screen.getByTitle('Изменить анамнез заболевания'));
    const reopened = await screen.findByRole('dialog');
    const reopenedTextarea = within(reopened).getByPlaceholderText(
      'Анамнез заболевания',
    ) as HTMLTextAreaElement;
    expect(reopenedTextarea.value).toBe('Старый текст анамнеза');
    fireEvent.change(reopenedTextarea, { target: { value: 'Новый текст анамнеза' } });
    fireEvent.click(within(reopened).getByText('Сохранить'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ section: 'disease', text: 'Новый текст анамнеза' });
    expect(onAnamnesisRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('LifeAnamnesisSection — «Образ жизни» single current value (LIFE-LIFESTYLE-01..04)', () => {
  it('shows only the latest text, no date control or label, and updates the existing entry on save', async () => {
    const fetchMock = stubAnamnesisFetch();
    const { onAnamnesisRefresh } = renderSections({
      trauma: [],
      illness: [],
      lifestyle: [
        { id: 'ls-old', date: '01.01.2025', text: 'Раньше не курил' },
        { id: 'ls-latest', date: '15.03.2026', text: 'Курит, не занимается спортом' },
      ],
    });

    expect(screen.getByText('Курит, не занимается спортом')).toBeTruthy();
    // LIFE-LIFESTYLE-02: no record date is ever rendered next to the value on the main card.
    expect(screen.queryByText('15.03.2026')).toBeNull();
    expect(screen.queryByText('01.01.2025')).toBeNull();

    fireEvent.click(screen.getByTitle('Изменить: Образ жизни'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Дата/i)).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: /дата/i })).toBeNull();
    const textarea = within(dialog).getByPlaceholderText('Образ жизни') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Курит, не занимается спортом');
    expect(document.activeElement).toBe(textarea);

    fireEvent.change(textarea, { target: { value: 'Бросил курить, начал бегать' } });
    fireEvent.click(within(dialog).getByText('Сохранить'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      section: 'lifestyle',
      entryId: 'ls-latest',
      recordDate: '2026-03-15',
      text: 'Бросил курить, начал бегать',
    });
    expect(onAnamnesisRefresh).toHaveBeenCalledTimes(1);
  });

  it('creates a new entry (no entryId) when there is no existing value yet', async () => {
    const fetchMock = stubAnamnesisFetch();
    renderSections({ trauma: [], illness: [], lifestyle: [] });

    const lifestyleSection = screen.getByText('Образ жизни').closest('section');
    expect(lifestyleSection).not.toBeNull();
    expect(within(lifestyleSection as HTMLElement).getByText('—')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Изменить: Образ жизни'));
    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByPlaceholderText('Образ жизни') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    fireEvent.change(textarea, { target: { value: 'Не курит' } });
    fireEvent.click(within(dialog).getByText('Сохранить'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.entryId).toBeUndefined();
    expect(body).toMatchObject({ section: 'lifestyle', text: 'Не курит' });
    expect(body.recordDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
