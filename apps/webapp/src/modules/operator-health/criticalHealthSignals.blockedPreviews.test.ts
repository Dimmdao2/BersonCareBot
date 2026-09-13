/**
 * Поручение владельца 14.09.2026: «надо уведомить глобал админа и просто записать эти медиа в
 * отложенные до исправления».
 *
 * Сигнал обязан уметь И зажечься, И погаснуть сам: он считает НЕ накопленные отказы, а файлы,
 * которые прямо сейчас нечем разобрать. Инструмент появился, строки уехали из `blocked` — число
 * стало нулём, и тревога снялась без участия человека. Ровно этим он отличается от счётчика
 * `failed`, который только растёт и потому вечно красный (урок 19.08, см. соседний тест).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyCriticalHealthSignals,
  classifyOperatorHealthBannerSignals,
  type CriticalHealthSignalsInput,
} from './criticalHealthSignals';

const healthy: CriticalHealthSignalsInput = {
  webappDb: 'up',
  integratorApi: 'ok',
  outgoingDelivery: { deadTotal: 0, deadRecent: 0, dueBacklog: 0 },
  backupJobs: {},
  probeConsecutiveFailRuns: 0,
  videoTranscodeStatus: 'ok',
};

describe('файлы, которые нечем разобрать', () => {
  it('дано: строки отложены из-за отсутствующего декодера → когда классификация → тогда глобальный админ разбужен и в тексте названо число', () => {
    const input = { ...healthy, blockedMediaPreviews: 3 };

    const candidates = classifyCriticalHealthSignals(input);
    const blocked = candidates.find((c) => c.topic === 'media_preview_blocked');

    expect(blocked).toBeDefined();
    expect(blocked?.lines.join(' ')).toContain('3');
    expect(classifyOperatorHealthBannerSignals({ ...input, operatorIncidentsOpenCount: 0 })).toBe(
      true,
    );
  });

  it('дано: инструмент вернулся и отложенных не осталось → когда классификация → тогда сигнала нет', () => {
    const input = { ...healthy, blockedMediaPreviews: 0 };

    expect(
      classifyCriticalHealthSignals(input).some((c) => c.topic === 'media_preview_blocked'),
    ).toBe(false);
    expect(classifyOperatorHealthBannerSignals({ ...input, operatorIncidentsOpenCount: 0 })).toBe(
      false,
    );
  });
});
