/**
 * Единственное свойство, ради которого публичная ветка медиа вообще существует:
 * анонимный посетитель получает медиа ЭТОЙ визитки и ничего больше.
 *
 * Проверяется поведением маршрута, а не формой кода: в публичную ветку подставляется `uuid` файла,
 * который в базе ЕСТЬ и принадлежит ТОЙ ЖЕ клинике, но в карточку не входит, — и отдельно `uuid`
 * файла ЧУЖОЙ клиники. Оба обязаны получить 404. Порт при этом возвращает настоящую карточку:
 * тест не подменяет отказ, он подменяет только источник данных.
 *
 * Так это устроено потому, что общий чокпоинт `/api/media/{uuid}` не ослабляется ни на строку:
 * корень отдаёт карточку ВМЕСТЕ с её набором медиа, и маршрут умеет отдать только то, что в этом
 * наборе лежит. Чужому `uuid` в этой ветке нечему соответствовать — отказ по построению.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const CARD_LOGO_ID = '11111111-1111-4111-8111-111111111111';
/** Файл той же клиники, который владелец в карточку не поставил. */
const SAME_CLINIC_OTHER_FILE = '22222222-2222-4222-8222-222222222222';
/** Файл другой клиники. */
const FOREIGN_CLINIC_FILE = '33333333-3333-4333-8333-333333333333';

const fakes = vi.hoisted(() => ({
  readPublicCard: vi.fn(),
  presignGetUrl: vi.fn(),
  stampBootstrapPrincipal: vi.fn(),
  readSaasTestLocalMedia: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/media/s3Client', () => ({ presignGetUrl: fakes.presignGetUrl }));
vi.mock('@/app-layer/media/localSaasTestFixtureMedia', () => ({
  readSaasTestLocalMedia: fakes.readSaasTestLocalMedia,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ clinicPublicCard: service }),
}));

import { createClinicPublicCardService } from '@/modules/clinic-public-card/service';
import type { ClinicPublicCardPort } from '@/modules/clinic-public-card/ports';

const port = {
  readPublicCard: (slug: string) => fakes.readPublicCard(slug),
  readCardSettings: async () => null,
  saveCard: async () => {
    throw new Error('not used');
  },
} as unknown as ClinicPublicCardPort;

const service = createClinicPublicCardService(port);

const { GET } = await import('./media/[mediaId]/route');

function request(mediaId: string) {
  return GET(new Request(`http://localhost/tochka/media/${mediaId}`), {
    params: Promise.resolve({ clinicSlug: 'tochka', mediaId }),
  });
}

describe('GET /{clinic}/media/{uuid}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.presignGetUrl.mockResolvedValue('https://storage.example/signed');
    fakes.readPublicCard.mockResolvedValue({
      requestedSlug: 'tochka',
      canonicalSlug: 'tochka',
      disposition: 'current',
      displayName: 'Точка здоровья',
      description: null,
      publicContactPhone: null,
      publicContactEmail: null,
      publicWebsiteUrl: null,
      locations: [],
      media: [
        {
          id: CARD_LOGO_ID,
          role: 'logo',
          mimeType: 'image/png',
          s3Key: 'org/logo.png',
          storedPath: null,
        },
      ],
    });
  });

  it('отдаёт медиа, которое карточка действительно несёт', async () => {
    const response = await request(CARD_LOGO_ID);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example/signed');
  });

  it('файл той же клиники, которого нет в карточке, не отдаётся', async () => {
    const response = await request(SAME_CLINIC_OTHER_FILE);
    expect(response.status).toBe(404);
    expect(fakes.presignGetUrl).not.toHaveBeenCalled();
  });

  it('файл чужой клиники не отдаётся', async () => {
    const response = await request(FOREIGN_CLINIC_FILE);
    expect(response.status).toBe(404);
    expect(fakes.presignGetUrl).not.toHaveBeenCalled();
  });

  it('неопубликованная клиника не отдаёт даже собственное медиа', async () => {
    fakes.readPublicCard.mockResolvedValue(null);
    const response = await request(CARD_LOGO_ID);
    expect(response.status).toBe(404);
    expect(fakes.presignGetUrl).not.toHaveBeenCalled();
  });

  it('нечитаемая проекция — это 503, а не «файла нет»', async () => {
    fakes.readPublicCard.mockRejectedValue(Object.assign(new Error('denied'), { code: '42501' }));
    const response = await request(CARD_LOGO_ID);
    expect(response.status).toBe(503);
  });
});
