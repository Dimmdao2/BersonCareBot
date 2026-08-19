import { describe, expect, it, vi } from 'vitest';
import { createClinicPublicCardService, normalizePublicWebsiteUrl } from './service';
import type { ClinicPublicCardPort, SaveClinicPublicCardInput } from './ports';

const ORG = '44444444-4444-4444-8444-444444444444';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function serviceWithSpy() {
  const saveCard = vi.fn(async (input: SaveClinicPublicCardInput) => ({
    description: input.description,
    publicContactPhone: input.publicContactPhone,
    publicContactEmail: input.publicContactEmail,
    publicWebsiteUrl: input.publicWebsiteUrl,
    logoMediaId: input.logoMediaId,
    photoMediaIds: input.photoMediaIds,
    cardIsPublished: input.cardIsPublished,
  }));
  const port = {
    readPublicCard: vi.fn(async () => null),
    readCardSettings: vi.fn(async () => null),
    saveCard,
  } as unknown as ClinicPublicCardPort;
  return { service: createClinicPublicCardService(port), saveCard, port };
}

const base = {
  organizationId: ORG,
  description: null,
  publicContactPhone: null,
  publicContactEmail: null,
  publicWebsiteUrl: null,
  logoMediaId: null,
  photoMediaIds: [] as string[],
  cardIsPublished: true,
};

describe('адрес сайта клиники', () => {
  it('схема, которую браузер не откроет, значением не становится', () => {
    // Ссылка на публичной странице, которую может открыть кто угодно, — не место для javascript:.
    expect(normalizePublicWebsiteUrl('javascript:alert(1)')).toBe('invalid');
    expect(normalizePublicWebsiteUrl('data:text/html,<b>x')).toBe('invalid');
  });

  it('обычный адрес принимается и достраивается до схемы', () => {
    expect(normalizePublicWebsiteUrl('clinic.ru')).toBe('https://clinic.ru/');
    expect(normalizePublicWebsiteUrl('http://clinic.ru/about')).toBe('http://clinic.ru/about');
  });
});

describe('сохранение визитки', () => {
  it('невалидный адрес сайта до записи не доходит', async () => {
    const { service, saveCard } = serviceWithSpy();
    const result = await service.saveCard({ ...base, publicWebsiteUrl: 'javascript:alert(1)' });
    expect(result).toEqual({ ok: false, code: 'website_invalid' });
    expect(saveCard).not.toHaveBeenCalled();
  });

  it('одна и та же фотография дважды — отказ, а не тихое схлопывание', async () => {
    const { service, saveCard } = serviceWithSpy();
    const result = await service.saveCard({ ...base, photoMediaIds: [A, A] });
    expect(result).toEqual({ ok: false, code: 'duplicate_photo' });
    expect(saveCard).not.toHaveBeenCalled();
  });

  it('порядок фотографий сохраняется как введён', async () => {
    const { service, saveCard } = serviceWithSpy();
    const result = await service.saveCard({ ...base, photoMediaIds: [B, A] });
    expect(result.ok).toBe(true);
    expect(saveCard.mock.calls[0]?.[0].photoMediaIds).toEqual([B, A]);
  });

  it('описание длиннее предела не сохраняется', async () => {
    const { service, saveCard } = serviceWithSpy();
    const result = await service.saveCard({ ...base, description: 'x'.repeat(4001) });
    expect(result).toEqual({ ok: false, code: 'description_too_long' });
    expect(saveCard).not.toHaveBeenCalled();
  });

  it('пустые поля становятся отсутствием значения, а не пустой строкой на странице', async () => {
    const { service, saveCard } = serviceWithSpy();
    await service.saveCard({ ...base, description: '   ', publicContactPhone: '' });
    const written = saveCard.mock.calls[0]?.[0];
    expect(written?.description).toBeNull();
    expect(written?.publicContactPhone).toBeNull();
  });
});
