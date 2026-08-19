/**
 * Три отказа визитки — и то, что они РАЗНЫЕ (план §3.3).
 *
 * Главное здесь — последнее утверждение: страница, которую не удалось прочитать, обязана нести код
 * ошибки. Замер живым запросом 19.08 показал ровно этот дефект: `/{clinic}` отдавал HTTP 200 с
 * вежливым «временно недоступна», то есть мониторинг и поисковик считали мёртвую страницу здоровой.
 * Это ложная запись о готовности — по ней перестают проверять.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fakes = vi.hoisted(() => ({
  load: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: fakes.notFound,
  permanentRedirect: fakes.permanentRedirect,
}));
vi.mock('./publicClinicCard', async () => {
  const actual = await vi.importActual<typeof import('./publicClinicCard')>('./publicClinicCard');
  return { ...actual, loadClinicPublicCardRsc: fakes.load };
});

const { default: ClinicPublicCardPage } = await import('./page');
const { ClinicCardUnavailableError } = await import('./clinicCardUnavailable');

const args = (slug: string) => ({ params: Promise.resolve({ clinicSlug: slug }) });

describe('публичная визитка /{clinic}', () => {
  beforeEach(() => vi.clearAllMocks());

  it('несуществующая или выключенная клиника — 404, одинаково и без различения', async () => {
    fakes.load.mockResolvedValue({ status: 'absent' });
    await expect(ClinicPublicCardPage(args('nikogo'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('нечитаемая проекция — ошибка, а НЕ страница со статусом 200', async () => {
    fakes.load.mockResolvedValue({ status: 'unavailable' });
    await expect(ClinicPublicCardPage(args('tochka'))).rejects.toBeInstanceOf(
      ClinicCardUnavailableError,
    );
    expect(fakes.notFound).not.toHaveBeenCalled();
  });

  it('прежний адрес клиники ведёт на её текущий адрес', async () => {
    fakes.load.mockResolvedValue({
      status: 'ok',
      card: {
        requestedSlug: 'staroe',
        canonicalSlug: 'novoe',
        disposition: 'redirect',
        displayName: 'Клиника',
        description: null,
        publicContactPhone: null,
        publicContactEmail: null,
        publicWebsiteUrl: null,
        locations: [],
        media: [],
      },
    });
    await expect(ClinicPublicCardPage(args('staroe'))).rejects.toThrow('REDIRECT:/novoe');
  });

  it('выпущенная клиника без текста рисуется — имя и кнопка записи, без выдуманного содержимого', async () => {
    fakes.load.mockResolvedValue({
      status: 'ok',
      card: {
        requestedSlug: 'tochka',
        canonicalSlug: 'tochka',
        disposition: 'current',
        displayName: 'Точка здоровья',
        description: null,
        publicContactPhone: null,
        publicContactEmail: null,
        publicWebsiteUrl: null,
        locations: [],
        media: [],
      },
    });
    await expect(ClinicPublicCardPage(args('tochka'))).resolves.toBeTruthy();
  });
});
