import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';

// L-10, 18.08. Обновление незанятого черновика счёта под покупаемый тариф переписывает
// `amount_minor` — сумму, которую клиника должна. Первый заход выдал арендной роли
// `app_clinic_billing` UPDATE на эту колонку, чтобы drizzle-запись перестала падать с 42501, и это
// решение отменено: сегодня худшее, что может сделать принуждённый вызов под арендной ролью (баг,
// инъекция, неосторожный будущий код), — получить отказ; с грантом худшее — изменить сумму счёта.
//
// Отказ, который ловят эти проверки, дорогой и молчаливый: грант на денежную колонку не роняет ни
// сборку, ни тесты, ни живой экран — он просто расширяет то, что арендатор способен переписать, и
// заметить это можно только сверкой прав.
// #1069 owner decision 2026-09-05 (period grid) — the seam grew a 4th argument
// (`p_billing_period_code`) naming the period of the pair being refreshed; DROP+CREATE changed its
// identity (see the migration owning this signature).
const REFRESH_SEAM = 'app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid,text)';
const MONEY_COLUMNS = ['amount_minor', 'additional_seat_quantity'];
const DATABASES = ['bcb_webapp_dev', 'bersoncarebot_test'];

const columnPrivilege = (grant, priv) =>
  (grant?.privs ?? []).find((entry) => entry && typeof entry === 'object' && entry.priv === priv);

test('арендная роль не может переписать сумму своего счёта ни колонкой, ни таблицей', () => {
  for (const database of DATABASES) {
    const grant = declaration.databases[database].tables['public.saas_billing_invoices']
      .grants?.app_clinic_billing;
    assert(grant, `${database}: у app_clinic_billing нет объявленных прав на счета`);
    // Табличный (бесколоночный) UPDATE накрыл бы денежные колонки целиком.
    assert(
      !(grant.privs ?? []).includes('UPDATE'),
      `${database}: app_clinic_billing получил табличный UPDATE на saas_billing_invoices`,
    );
    const update = columnPrivilege(grant, 'UPDATE');
    for (const column of MONEY_COLUMNS) {
      assert(
        !(update?.columns ?? []).includes(column),
        `${database}: app_clinic_billing получил UPDATE на saas_billing_invoices.${column}`,
      );
    }
  }
});

test('сумму черновика переписывает только узкий шов, и выводит её сам из подписки', () => {
  const seam = declaration.portContext.functions[REFRESH_SEAM];
  assert(seam, `не объявлен ${REFRESH_SEAM}`);
  assert.equal(seam.security, 'DEFINER');
  assert.equal(seam.owner, 'app_seam_org_commerce_owner');
  assert.deepEqual(seam.execute, ['app_clinic_billing']);
  assert.deepEqual(seam.proconfig, ['search_path=pg_catalog']);

  const surfaces = Object.fromEntries(
    (seam.relationSurfaces ?? []).map((surface) => [surface.relation, surface]),
  );
  // Пишет шов ровно в счёт — и только те колонки, из которых состоит цена периода.
  const invoice = surfaces['public.saas_billing_invoices'];
  assert(invoice, `${REFRESH_SEAM} не объявляет поверхность счетов`);
  assert.deepEqual([...invoice.operations].sort(), ['SELECT', 'UPDATE']);
  for (const column of MONEY_COLUMNS) {
    assert(invoice.operationColumns?.UPDATE?.includes(column), `шов не пишет ${column}`);
  }
  assert.deepEqual(Object.keys(surfaces).sort(), [
    'public.saas_billing_invoices',
    'public.saas_billing_subscriptions',
    'public.saas_tariff_period_prices',
    'public.saas_tariffs',
  ]);
  // Сумма выводится ВНУТРИ шва: без чтения подписки (пары+мест), матрицы цен (цены за период) и
  // строки тарифа (валюты/названия) вывести её неоткуда, а значит она пришла бы аргументом от
  // вызывающего — ровно то, чего быть не должно.
  assert.deepEqual(surfaces['public.saas_billing_subscriptions'].operations, ['SELECT']);
  for (const column of [
    'tariff_id', 'billing_period_code', 'pending_tariff_id', 'pending_billing_period_code',
    'paid_additional_seats',
  ]) {
    assert(
      surfaces['public.saas_billing_subscriptions'].columns.includes(column),
      `шов не читает подписку по ${column}`,
    );
  }
  // #1069 owner decision 2026-09-05 (period grid) — цена больше не читается из
  // `saas_tariffs.price_minor`, а приходит из денежной матрицы по паре.
  assert.deepEqual(surfaces['public.saas_tariff_period_prices'].operations, ['SELECT']);
  for (const column of ['tariff_id', 'billing_period_code', 'price_minor']) {
    assert(
      surfaces['public.saas_tariff_period_prices'].columns.includes(column),
      `шов не читает матрицу цен по ${column}`,
    );
  }
  assert.deepEqual(surfaces['public.saas_tariffs'].operations, ['SELECT']);
  for (const column of ['additional_seat_price_minor', 'currency']) {
    assert(surfaces['public.saas_tariffs'].columns.includes(column), `шов не читает тариф по ${column}`);
  }
  // Шов не пишет ни в подписку, ни в матрицу цен, ни в тариф: они остаются справочниками, только
  // счёт меняется этим швом.
  for (const relation of [
    'public.saas_billing_subscriptions',
    'public.saas_tariff_period_prices',
    'public.saas_tariffs',
  ]) {
    assert(
      !surfaces[relation].operations.includes('UPDATE'),
      `${REFRESH_SEAM} пишет в ${relation}`,
    );
  }
});
