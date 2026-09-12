import { describe, expect, it } from 'vitest';

import { createTestSetsService } from './service';
import type { ClinicalTestsPort, TestSetsPort } from './ports';
import type { ClinicalTest, TestSet } from './types';

/**
 * Дверь, которую сторожит этот файл: СОСТАВ набора тестов проверяется ЧТЕНИЕМ теста, поэтому чтение
 * внутри записи обязано видеть ровно то же, что видит врач в выборе.
 *
 * Как это сломалось живьём на S0б (12.09.2026, найдено проходом по приёмке): страница набора уже
 * передавала `includePlatformBase` и предлагала врачу платформенный тест в диалоге «Выбор из
 * справочника», а `setTestSetItems` звал `testsPort.getById(id)` БЕЗ флага. Платформенный тест для
 * этого чтения не существовал, и сохранение падало с «Тест не найден: <uuid>» — на тест, который
 * приложение само только что предложило. Набор при этом успевал создаться пустым.
 *
 * Дорого и тихо: карточка платформенного материала обещает врачу «доступен для назначения», а
 * назначение не проходит; ошибка выглядит как поломка данных, а не как отсутствующий флаг.
 *
 * Oracle — не формулировка сообщения, а поведение: с включённым тарифом платформенный тест в набор
 * попадает, без него — нет. Поэтому фейковый порт отдаёт платформенную строку ТОЛЬКО когда чтение
 * пришло с флагом, ровно как настоящий `pgClinicalTests` с его предикатом платформенного слоя.
 */

const OWN_TEST_ID = '00000000-0000-4000-8000-0000000030a1';
const PLATFORM_TEST_ID = '00000000-0000-4000-8000-0000000030a2';
const SET_ID = '00000000-0000-4000-8000-0000000030a3';

function clinicalTest(id: string, ownerKind: 'organization' | 'platform'): ClinicalTest {
  return {
    id,
    title: ownerKind === 'platform' ? 'Базовая библиотека: тест' : 'Свой тест',
    description: null,
    testType: null,
    assessmentKind: null,
    bodyRegionId: null,
    media: [],
    tags: [],
    isArchived: false,
    ownerKind,
    scoring: null,
    rawText: null,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
  } as unknown as ClinicalTest;
}

function fakePorts() {
  const replaced: { testId: string; sortOrder: number; comment: string | null }[][] = [];
  const readFlags: (boolean | undefined)[] = [];

  const testsPort = {
    async getById(id: string, options?: { includePlatformBase?: boolean }) {
      readFlags.push(options?.includePlatformBase);
      if (id === OWN_TEST_ID) return clinicalTest(id, 'organization');
      // Платформенная строка видна чтению только с флагом — это и есть предикат платформенного слоя.
      if (id === PLATFORM_TEST_ID && options?.includePlatformBase === true) {
        return clinicalTest(id, 'platform');
      }
      return null;
    },
  } as unknown as ClinicalTestsPort;

  const setsPort = {
    async getById(id: string) {
      return { id, title: 'Набор', isArchived: false } as unknown as TestSet;
    },
    async replaceItems(_id: string, items: { testId: string; sortOrder: number; comment: string | null }[]) {
      replaced.push(items);
    },
  } as unknown as TestSetsPort;

  return { setsPort, testsPort, replaced, readFlags };
}

describe('состав набора тестов и платформенный слой', () => {
  it('кладёт в набор платформенный тест, когда вызывающая сторона разрешила платформенный слой', async () => {
    const { setsPort, testsPort, replaced, readFlags } = fakePorts();
    const service = createTestSetsService(setsPort, testsPort);

    await service.setTestSetItems(
      SET_ID,
      [
        { testId: OWN_TEST_ID, sortOrder: 0, comment: null },
        { testId: PLATFORM_TEST_ID, sortOrder: 1, comment: null },
      ],
      { includePlatformBase: true },
    );

    expect(replaced).toHaveLength(1);
    expect(replaced[0].map((it) => it.testId)).toEqual([OWN_TEST_ID, PLATFORM_TEST_ID]);
    // Флаг обязан дойти до КАЖДОГО чтения состава, а не до первого.
    expect(readFlags).toEqual([true, true]);
  });

  it('без разрешения платформенного слоя платформенный тест в набор не попадает', async () => {
    const { setsPort, testsPort, replaced } = fakePorts();
    const service = createTestSetsService(setsPort, testsPort);

    await expect(
      service.setTestSetItems(SET_ID, [{ testId: PLATFORM_TEST_ID, sortOrder: 0, comment: null }], {
        includePlatformBase: false,
      }),
    ).rejects.toThrow(/Тест не найден/);
    expect(replaced).toHaveLength(0);
  });

  it('своя строка набора не зависит от платформенного флага', async () => {
    const { setsPort, testsPort, replaced } = fakePorts();
    const service = createTestSetsService(setsPort, testsPort);

    await service.setTestSetItems(SET_ID, [{ testId: OWN_TEST_ID, sortOrder: 0, comment: null }]);

    expect(replaced[0].map((it) => it.testId)).toEqual([OWN_TEST_ID]);
  });
});
