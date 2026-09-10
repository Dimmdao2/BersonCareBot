#!/usr/bin/env node
/**
 * Structural gate for AGENTS.md §5 «Один общий проход, и мимо него нельзя», applied to ОБЕИМ
 * покупкам внутри оплаченного периода: место сверх тарифа (Р-15, 19.08; срок счёта — Р-19, 20.08)
 * и пакет объёма файлов (владелец 10.09.2026, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`).
 *
 * Что предотвращает. До 19.08 «можно ли продать место и почём» решали ДВА пути одного сервиса и
 * отвечали по-разному: на кончившемся оплаченном периоде один отказывал, а второй выставлял полный
 * месячный тариф за ноль оставшихся дней, со сроком услуги, кончавшимся раньше начала. Одна
 * реализация вместо двух чинит сегодняшнее расхождение; этот гейт не даёт второй появиться завтра.
 *
 * Почему один гейт на оба вида, а не второй файл рядом. Продажа объёма устроена ровно так же, как
 * продажа места, и проверять её надо ровно тем же. Скопированный гейт разошёлся бы с оригиналом так
 * же молча, как разъезжаются скопированные правила, — а расходящийся гейт хуже отсутствующего: он
 * зелёный и ничего не держит. Поэтому вид покупки здесь — СТРОКА В ТАБЛИЦЕ {@link DOORS}, а не
 * вторая копия разбора.
 *
 * Что требует. Любой продуктовый файл, который собирает строку счёта `invoiceKind: '<вид>'`,
 * обязан взять СУММУ, ОБА КОНЦА ОТРЕЗКА УСЛУГИ и СРОК ОПЛАТЫ из одного и того же значения, и это
 * значение обязано прийти из единственной двери этого вида — напрямую либо через квота-порт. Имя
 * переменной роли не играет: проверяется, что все четыре поля читаются с ОДНОГО идентификатора и
 * что он связан с вызовом двери. Плюс: денежные помощники (`proratedSeatPriceMinor`,
 * `proratedRemainingPeriodAmountMinor`) не должны всплывать за пределами дверей — цена покупки по
 * частям снаружи не собирается. Срок оплаты (`expiresAt`) с 20.08 (Р-19) — конец того же отрезка
 * услуги, что и `servicePeriodEndsAt`, а не отдельная настройка «длительность от выставления»;
 * гейт этого не навязывает (дверь вправе посчитать поле как угодно), но по-прежнему требует, чтобы
 * оно пришло ОТТУДА ЖЕ, откуда сумма и отрезок услуги, — второй источник срока запрещён так же, как
 * второй источник цены.
 *
 * Разбор идёт по дереву TypeScript, поэтому форматирование, кавычки и переносы на вердикт не влияют.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(repoRoot, 'apps/webapp/src');
const modulePath = (name) => join(sourceRoot, 'modules/saas-billing', name);

/**
 * Виды покупки внутри периода и единственная дверь каждого. Новый вид добавляется СТРОКОЙ сюда —
 * и с этого момента он проверяется тем же разбором, что и остальные.
 */
const DOORS = [
  {
    kind: 'seat_overage',
    doorPath: modulePath('seatOverage.ts'),
    doorCalls: new Set(['decideSeatOverage', 'resolveClinicTeamAvailability']),
  },
  {
    kind: 'storage_package',
    doorPath: modulePath('storagePackage.ts'),
    doorCalls: new Set(['decideStoragePackagePurchase', 'resolveStoragePackagePurchase']),
  },
];

/**
 * Денежная арифметика покупки живёт только за дверьми. `proratedRemainingPeriodAmountMinor` —
 * общая формула остатка периода, ею считают ОБЕ двери и больше никто; `proratedSeatPriceMinor` —
 * внутренний помощник двери мест.
 */
const PRICE_HELPERS = [
  { name: 'proratedSeatPriceMinor', allowedIn: [modulePath('seatOverage.ts')] },
  {
    name: 'proratedRemainingPeriodAmountMinor',
    allowedIn: [modulePath('proration.ts'), ...DOORS.map((door) => door.doorPath)],
  },
];

const OFFER_FIELDS = ['amountMinor', 'servicePeriodStartsAt', 'servicePeriodEndsAt', 'expiresAt'];

function listProductionTypeScript(dir) {
  return readdirSync(dir).flatMap((name) => {
    const absolute = join(dir, name);
    if (statSync(absolute).isDirectory()) return listProductionTypeScript(absolute);
    return /\.(?:[cm]?ts|tsx)$/.test(name) &&
      !name.includes('.test.') &&
      !name.includes('.spec.') &&
      !name.endsWith('.d.ts')
      ? [absolute]
      : [];
  });
}

function propertyKey(property) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name)) return property.name.text;
  if (ts.isStringLiteral(property.name)) return property.name.text;
  return null;
}

/** Вид покупки, счёт за которую собирает этот объектный литерал, либо null. */
function proratedInvoiceKind(node) {
  if (!ts.isObjectLiteralExpression(node)) return null;
  for (const property of node.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      propertyKey(property) === 'invoiceKind' &&
      ts.isStringLiteral(property.initializer) &&
      DOORS.some((door) => door.kind === property.initializer.text)
    ) {
      return property.initializer.text;
    }
  }
  return null;
}

/** Идентификатор, с которого читается поле: `offer.priceMinor` → `offer`. Иначе — null. */
function sourceIdentifier(expression) {
  return ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
    ? expression.expression.text
    : null;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

/** Имена, связанные с результатом вызова двери (через await или напрямую), по видам покупки. */
function collectDoorBoundNames(parsed) {
  const names = new Map(DOORS.map((door) => [door.kind, new Set()]));
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const initializer = ts.isAwaitExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (ts.isCallExpression(initializer)) {
        const callee = calleeName(initializer.expression) ?? '';
        for (const door of DOORS) {
          if (door.doorCalls.has(callee)) names.get(door.kind).add(node.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return names;
}

function sourceSignals(filename, source) {
  const absolute = normalize(filename);
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const findings = [];
  const doorBound = collectDoorBoundNames(parsed);
  const forbiddenHelpers = new Set(
    PRICE_HELPERS.filter(
      (helper) => !helper.allowedIn.some((allowed) => normalize(allowed) === absolute),
    ).map((helper) => helper.name),
  );

  const visit = (node) => {
    if (ts.isIdentifier(node) && forbiddenHelpers.has(node.text)) {
      findings.push(`prices a purchase outside the single door ("${node.text}")`);
    }
    const kind = proratedInvoiceKind(node);
    if (kind !== null) {
      const owners = new Set();
      for (const field of OFFER_FIELDS) {
        const property = node.properties.find(
          (candidate) => ts.isPropertyAssignment(candidate) && propertyKey(candidate) === field,
        );
        if (!property) {
          findings.push(`writes a ${kind} invoice without "${field}" from the door`);
          continue;
        }
        const owner = sourceIdentifier(property.initializer);
        if (owner === null) {
          findings.push(`builds ${kind} "${field}" outside the single door`);
          continue;
        }
        owners.add(owner);
      }
      if (owners.size > 1) {
        findings.push(`assembles a ${kind} invoice from more than one decision`);
      }
      for (const owner of owners) {
        if (!doorBound.get(kind).has(owner)) {
          findings.push(`writes a ${kind} invoice from a decision the door did not make`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return [...new Set(findings)];
}

function productionFindings() {
  return listProductionTypeScript(sourceRoot).flatMap((filename) =>
    sourceSignals(filename, readFileSync(filename, 'utf8')).map((detail) => ({ filename, detail })),
  );
}

const CANONICAL_SEAT = `import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
  export async function sell(tx, input) {
    return transactionQuotaPort.withinLock(tx, input, async (quota) => {
      const offer = await quota.resolveClinicTeamAvailability();
      if (offer.outcome !== 'purchasable') return offer;
      return insert(tx, {
        invoiceKind: 'seat_overage',
        amountMinor: offer.priceMinor,
        currency: offer.currency,
        servicePeriodStartsAt: offer.servicePeriodStartsAt,
        servicePeriodEndsAt: offer.servicePeriodEndsAt,
        // Р-19: срок счёта за место — конец того же отрезка услуги, ОТТУДА ЖЕ, откуда сумма.
        expiresAt: offer.servicePeriodEndsAt,
      });
    });
  }`;

const CANONICAL_STORAGE = `import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
  export async function sellStorage(tx, input) {
    return transactionQuotaPort.withinLock(tx, input, async (quota) => {
      const offer = await quota.resolveStoragePackagePurchase(input.storagePackageId);
      if (offer.outcome !== 'purchasable') return offer;
      return insert(tx, {
        invoiceKind: 'storage_package',
        storagePackageId: input.storagePackageId,
        amountMinor: offer.amountMinor,
        currency: offer.currency,
        servicePeriodStartsAt: offer.servicePeriodStartsAt,
        servicePeriodEndsAt: offer.servicePeriodEndsAt,
        expiresAt: offer.expiresAt,
      });
    });
  }`;

function selfTest() {
  const featurePath = join(sourceRoot, 'infra/repos/syntheticProratedSeller.ts');
  const fixtures = [
    [
      'seat invoice priced by its own arithmetic',
      CANONICAL_SEAT.replace('amountMinor: offer.priceMinor,', 'amountMinor: seatPriceMinor,'),
    ],
    [
      'seat invoice given a second source of validity',
      CANONICAL_SEAT.replace(
        'expiresAt: offer.servicePeriodEndsAt,',
        'expiresAt: saasBillingInvoiceExpiresAt(now, provider.invoiceValidityDays),',
      ),
    ],
    [
      'seat invoice assembled from two decisions',
      CANONICAL_SEAT.replace(
        'servicePeriodEndsAt: offer.servicePeriodEndsAt,',
        'servicePeriodEndsAt: subscription.currentPeriodEndsAt,',
      ),
    ],
    [
      'seat invoice built from a decision the door did not make',
      CANONICAL_SEAT.replace(
        'const offer = await quota.resolveClinicTeamAvailability();',
        'const offer = buildMyOwnOffer();',
      ),
    ],
    [
      'seat price recomputed by the moved-out helper',
      `import { proratedSeatPriceMinor } from '@/modules/saas-billing/proration';
       export const price = (i) => proratedSeatPriceMinor(i);`,
    ],
    [
      'storage invoice priced by its own arithmetic',
      CANONICAL_STORAGE.replace(
        'amountMinor: offer.amountMinor,',
        'amountMinor: packagePriceMinor - paidPriceMinor,',
      ),
    ],
    [
      'storage invoice given a second source of validity',
      CANONICAL_STORAGE.replace('expiresAt: offer.expiresAt,', 'expiresAt: subscription.currentPeriodEndsAt,'),
    ],
    [
      'storage invoice built from a decision the door did not make',
      CANONICAL_STORAGE.replace(
        'const offer = await quota.resolveStoragePackagePurchase(input.storagePackageId);',
        'const offer = buildMyOwnStorageOffer();',
      ),
    ],
    [
      'storage invoice missing the service window',
      CANONICAL_STORAGE.replace('servicePeriodStartsAt: offer.servicePeriodStartsAt,', ''),
    ],
    [
      'storage price recomputed by the shared remainder formula outside the door',
      `import { proratedRemainingPeriodAmountMinor } from '@/modules/saas-billing/proration';
       export const price = (i) => proratedRemainingPeriodAmountMinor(i);`,
    ],
    [
      'a seat decision used to write a storage invoice',
      CANONICAL_STORAGE.replace(
        'const offer = await quota.resolveStoragePackagePurchase(input.storagePackageId);',
        'const offer = await quota.resolveClinicTeamAvailability();',
      ),
    ],
  ];
  const missed = fixtures.filter(([, source]) => sourceSignals(featurePath, source).length === 0);
  const rejected = [
    ...sourceSignals(featurePath, CANONICAL_SEAT),
    ...sourceSignals(featurePath, CANONICAL_STORAGE),
  ];
  if (missed.length > 0 || rejected.length > 0) {
    throw new Error(
      `check-prorated-purchase-single-door self-test failed: missed=${missed.map(([name]) => name).join(', ') || 'none'}; rejected-canonical=${rejected.join(', ') || 'none'}`,
    );
  }
  console.log(`check-prorated-purchase-single-door self-test: ${fixtures.length} bypass forms rejected`);
  console.log('check-prorated-purchase-single-door self-test: canonical door writers accepted');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const findings = productionFindings();
  if (findings.length > 0) {
    console.error('check-prorated-purchase-single-door: second purchase door detected.');
    for (const finding of findings) {
      console.error(`  - ${relative(repoRoot, finding.filename).replaceAll('\\', '/')}: ${finding.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('check-prorated-purchase-single-door: OK');
  }
}
