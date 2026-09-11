/**
 * Что ловит этот файл: приглашение одной клиники, показанное под логотипом ДРУГОЙ.
 *
 * Поломка дорогая и молчаливая одновременно. Дорогая — человек видит чужой бренд над экраном, где
 * подтверждает почту и получает доступ к кабинету, то есть арендатор подменён ровно там, где
 * доверие и решает. Молчаливая — страница выглядит совершенно нормально, никто ничего не заметит.
 *
 * Oracle — решения владельца, не реализация: «он видит логотип терапии, логотип клиники» (10.09) и
 * разграничение 11.09 «нет логотипа клиники, потому что небрендированная; логотип терапии как раз
 * есть». Разметку этот файл не трогает: UI принимается живой проверкой (§10a).
 */
import { describe, expect, it } from 'vitest';
import { joinBrandFor } from './joinBrand';

const OWN = '00000000-0000-4000-8000-0000000000a1';
const FOREIGN = '00000000-0000-4000-8000-0000000000a2';
const LOGO = 'https://media.example.test/org-logo/berson.png';

const brandedSurface = (organizationId: string) => ({
  organizationId,
  patientBrand: { logoUrl: LOGO },
});

describe('чей бренд над приглашением', () => {
  it('хост клиники и её же приглашение — её логотип', () => {
    expect(joinBrandFor(brandedSurface(OWN), OWN)).toEqual({ clinicLogoUrl: LOGO });
  });

  it('хост ЧУЖОЙ клиники — ни её логотипа, ни нашего локапа', () => {
    expect(joinBrandFor(brandedSurface(FOREIGN), OWN)).toEqual({});
  });

  it('приглашение неизвестно — логотип не ставится даже на её собственном хосте', () => {
    expect(joinBrandFor(brandedSurface(OWN), null)).toEqual({});
  });

  it('клиника без опубликованного логотипа — шапки нет, имя придёт с приглашением', () => {
    expect(joinBrandFor({ organizationId: OWN, patientBrand: {} }, OWN)).toEqual({});
  });

  it('общий пациентский вход — наш локап: сюда уводит редирект с чужого хоста', () => {
    expect(joinBrandFor({ organizationId: undefined, patientBrand: undefined }, OWN)).toEqual({
      platformLockup: true,
    });
  });

  it('поверхность не резолвится — экран всё равно подписан', () => {
    expect(joinBrandFor(null, OWN)).toEqual({ platformLockup: true });
  });
});
