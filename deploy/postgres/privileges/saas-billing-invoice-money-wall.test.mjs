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
const REFRESH_SEAM = 'app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid)';
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
    'public.saas_tariffs',
  ]);
  // Сумма выводится ВНУТРИ шва: без чтения подписки (мест) и строки тарифа (цены) вывести её
  // неоткуда, а значит она пришла бы аргументом от вызывающего — ровно то, чего быть не должно.
  assert.deepEqual(surfaces['public.saas_billing_subscriptions'].operations, ['SELECT']);
  for (const column of ['tariff_id', 'pending_tariff_id', 'paid_additional_seats']) {
    assert(
      surfaces['public.saas_billing_subscriptions'].columns.includes(column),
      `шов не читает подписку по ${column}`,
    );
  }
  assert.deepEqual(surfaces['public.saas_tariffs'].operations, ['SELECT']);
  for (const column of ['price_minor', 'additional_seat_price_minor', 'currency', 'billing_period']) {
    assert(surfaces['public.saas_tariffs'].columns.includes(column), `шов не читает тариф по ${column}`);
  }
  // Шов не пишет ни в подписку, ни в тариф: тариф остаётся справочником, подписка меняется оплатой.
  for (const relation of ['public.saas_billing_subscriptions', 'public.saas_tariffs']) {
    assert(
      !surfaces[relation].operations.includes('UPDATE'),
      `${REFRESH_SEAM} пишет в ${relation}`,
    );
  }
});
