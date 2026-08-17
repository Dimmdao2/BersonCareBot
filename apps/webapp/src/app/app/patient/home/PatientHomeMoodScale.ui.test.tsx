import { existsSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { PatientHomeMoodCheckin } from './PatientHomeMoodCheckin';

/**
 * Owner decision 18.08: шкала самочувствия берёт иконки из bundled-папки, а не из настроек клиники.
 * Поломка, которую ловим: пациент клиники Б получает в шкале URL вида `/api/media/<uuid>`,
 * принадлежащий медиа клиники А (платформенная строка `patient_home_mood_icons` с
 * `organization_id IS NULL`), и видит пять битых картинок 404 вместо иконок.
 */
const BUNDLED_MOOD_SRC = [1, 2, 3, 4, 5].map((score) => `/patient/home/icons/mood/${score}.png`);

afterEach(() => {
  cleanup();
});

function renderedMoodImageSources(): string[] {
  return [1, 2, 3, 4, 5].map((score) => {
    const button = screen.getByRole('button', { name: new RegExp(`Самочувствие ${score} из 5`) });
    const img = button.querySelector('img');
    expect(img, `шкала самочувствия: у оценки ${score} нет картинки`).not.toBeNull();
    return img!.getAttribute('src') ?? '';
  });
}

describe('шкала самочувствия на главной пациента', () => {
  it('рисует пять bundled-иконок без единого обращения к медиа клиники', () => {
    render(<PatientHomeMoodCheckin personalTierOk anonymousGuest={false} />);

    const sources = renderedMoodImageSources();

    expect(sources).toEqual(BUNDLED_MOOD_SRC);
    expect(sources.some((src) => src.startsWith('/api/media/'))).toBe(false);
  });

  it('рисует те же пять иконок при повторном монтировании — клиника на них не влияет', () => {
    // Компонент не принимает ни настроек, ни organizationId: единственный источник — bundled-папка.
    render(<PatientHomeMoodCheckin personalTierOk anonymousGuest={false} />);
    const first = renderedMoodImageSources();
    cleanup();

    render(<PatientHomeMoodCheckin personalTierOk anonymousGuest={false} />);
    const second = renderedMoodImageSources();

    expect(second).toEqual(first);
    expect(second).toEqual(BUNDLED_MOOD_SRC);
  });

  it('каждый bundled-путь существует в public/, иначе пациент увидит битую картинку', () => {
    const publicDir = path.resolve(__dirname, '../../../../../public');
    for (const src of BUNDLED_MOOD_SRC) {
      expect(existsSync(path.join(publicDir, src)), `нет файла public${src}`).toBe(true);
    }
  });
});
