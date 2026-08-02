/**
 * #1069 (4a.4, owner 31.07): `patient_diaries` is a critical mechanic ("дневники у пациентов не
 * отбираем") — `IntegratorEventsDeps` has no `diaryMutationGate` at all any more (removed together
 * with the four `refuseDisabledPatientDiaries` call sites). This proves a legacy bot-sourced diary
 * event still writes through `deps.diaries` with a minimal deps object that cannot express a
 * mechanic refusal — reintroducing any such gate would require deps this object does not provide
 * and would fail to compile, or (if bolted on regardless) would divert the call away from
 * `createSymptomTracking` and fail the assertion below.
 */
import { describe, expect, it, vi } from 'vitest';
import { handleIntegratorEvent, type IntegratorEventsDeps } from './events';

describe('signed legacy diary events (critical mechanic, never gated)', () => {
  it('writes the symptom tracking straight through, with no mechanic-refusal dependency available', async () => {
    const createSymptomTracking = vi.fn();
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.tracking.created',
        payload: {
          userId: '22222222-2222-4222-8222-222222222222',
          symptomTitle: 'Боль',
        },
      },
      {
        diaries: { createSymptomTracking },
      } as unknown as IntegratorEventsDeps,
    );

    expect(result).toEqual({ accepted: true });
    expect(createSymptomTracking).toHaveBeenCalledWith({
      userId: '22222222-2222-4222-8222-222222222222',
      symptomKey: null,
      symptomTitle: 'Боль',
    });
  });

  it('writes the reminder projection through its module-owned port', async () => {
    const upsertRuleFromProjection = vi.fn().mockResolvedValue(undefined);

    const result = await handleIntegratorEvent(
      {
        eventType: 'reminder.rule.upserted',
        payload: {
          integratorRuleId: 'rule-77',
          integratorUserId: '44',
          category: 'appointment',
          isEnabled: true,
          scheduleType: 'interval_window',
          timezone: 'Europe/Moscow',
          intervalMinutes: 90,
          windowStartMinute: 480,
          windowEndMinute: 1080,
          daysMask: '1111111',
          contentMode: 'default',
          updatedAt: '2026-08-03T00:00:00.000Z',
        },
      },
      {
        diaries: {},
        reminderProjection: { upsertRuleFromProjection },
      } as unknown as IntegratorEventsDeps,
    );

    expect(result).toEqual({ accepted: true });
    expect(upsertRuleFromProjection).toHaveBeenCalledWith({
      integratorRuleId: 'rule-77',
      integratorUserId: '44',
      category: 'appointment',
      isEnabled: true,
      scheduleType: 'interval_window',
      timezone: 'Europe/Moscow',
      intervalMinutes: 90,
      windowStartMinute: 480,
      windowEndMinute: 1080,
      daysMask: '1111111',
      contentMode: 'default',
      updatedAt: '2026-08-03T00:00:00.000Z',
    });
  });

  it('writes a support delivery attempt through its module-owned port', async () => {
    const appendDeliveryEventFromProjection = vi.fn().mockResolvedValue(undefined);

    const result = await handleIntegratorEvent(
      {
        eventType: 'support.delivery.attempt.logged',
        payload: {
          organizationId: 'clinic-77',
          intentEventId: 'intent-99',
          correlationId: 'corr-100',
          channelCode: 'telegram',
          status: 'failed',
          attempt: 2,
          reason: 'timeout',
          payloadJson: { retry: true },
          occurredAt: '2026-08-03T00:00:00.000Z',
        },
      },
      {
        diaries: {},
        supportCommunication: { appendDeliveryEventFromProjection },
      } as unknown as IntegratorEventsDeps,
    );

    expect(result).toEqual({ accepted: true });
    expect(appendDeliveryEventFromProjection).toHaveBeenCalledWith({
      organizationId: 'clinic-77',
      conversationMessageId: null,
      integratorIntentEventId: 'intent-99',
      correlationId: 'corr-100',
      channelCode: 'telegram',
      status: 'failed',
      attempt: 2,
      reason: 'timeout',
      payloadJson: { retry: true },
      occurredAt: '2026-08-03T00:00:00.000Z',
    });
  });
});
