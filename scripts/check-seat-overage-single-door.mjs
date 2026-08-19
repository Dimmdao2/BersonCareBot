#!/usr/bin/env node
/**
 * Structural gate for AGENTS.md §5 «Один общий проход, и мимо него нельзя», applied to the seat
 * overage sale (owner decision Р-15, 19.08).
 *
 * Что предотвращает. До 19.08 «можно ли продать место и почём» решали ДВА пути одного сервиса и
 * отвечали по-разному: на кончившемся оплаченном периоде один отказывал, а второй выставлял полный
 * месячный тариф за ноль оставшихся дней, со сроком услуги, кончавшимся раньше начала. Одна
 * реализация вместо двух чинит сегодняшнее расхождение; этот гейт не даёт второй появиться завтра.
 *
 * Что требует. Любой продуктовый файл, который собирает строку счёта `invoiceKind: 'seat_overage'`,
 * обязан взять СУММУ, ОБА КОНЦА ОТРЕЗКА УСЛУГИ и СРОК ОПЛАТЫ из одного и того же значения, и это
 * значение обязано прийти из единственной двери — `decideSeatOverage` напрямую либо через
 * `resolveClinicTeamAvailability` квота-порта. Имя переменной роли не играет: проверяется, что все
 * четыре поля читаются с ОДНОГО идентификатора и что он связан с вызовом двери. Плюс: имя
 * `proratedSeatPriceMinor` не должно всплывать за пределами самой двери — цена места по частям не
 * собирается.
 *
 * Разбор идёт по дереву TypeScript, поэтому форматирование, кавычки и переносы на вердикт не влияют.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = join(repoRoot, 'apps/webapp/src');
const doorPath = join(sourceRoot, 'modules/saas-billing/seatOverage.ts');
const doorCalls = new Set(['decideSeatOverage', 'resolveClinicTeamAvailability']);
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

function isSeatOverageInvoiceLiteral(node) {
  return (
    ts.isObjectLiteralExpression(node) &&
    node.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        propertyKey(property) === 'invoiceKind' &&
        ts.isStringLiteral(property.initializer) &&
        property.initializer.text === 'seat_overage',
    )
  );
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

/** Имена, связанные с результатом вызова единственной двери (через await или напрямую). */
function collectDoorBoundNames(parsed) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const initializer = ts.isAwaitExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (ts.isCallExpression(initializer) && doorCalls.has(calleeName(initializer.expression) ?? '')) {
        names.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return names;
}

function sourceSignals(filename, source) {
  if (normalize(filename) === normalize(doorPath)) return [];
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const findings = [];
  const doorBound = collectDoorBoundNames(parsed);

  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === 'proratedSeatPriceMinor') {
      findings.push('prices a seat outside the single seat-overage door');
    }
    if (isSeatOverageInvoiceLiteral(node)) {
      const owners = new Set();
      for (const field of OFFER_FIELDS) {
        const property = node.properties.find(
          (candidate) => ts.isPropertyAssignment(candidate) && propertyKey(candidate) === field,
        );
        if (!property) {
          findings.push(`writes a seat_overage invoice without "${field}" from the door`);
          continue;
        }
        const owner = sourceIdentifier(property.initializer);
        if (owner === null) {
          findings.push(`builds seat_overage "${field}" outside the single door`);
          continue;
        }
        owners.add(owner);
      }
      if (owners.size > 1) {
        findings.push('assembles a seat_overage invoice from more than one decision');
      }
      for (const owner of owners) {
        if (!doorBound.has(owner)) {
          findings.push('writes a seat_overage invoice from a decision the door did not make');
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

const CANONICAL = `import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
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
        expiresAt: offer.invoiceExpiresAt,
      });
    });
  }`;

function selfTest() {
  const featurePath = join(sourceRoot, 'infra/repos/syntheticSeatSeller.ts');
  const fixtures = [
    [
      'seat invoice priced by its own arithmetic',
      CANONICAL.replace('amountMinor: offer.priceMinor,', 'amountMinor: seatPriceMinor,'),
    ],
    [
      'seat invoice given a second source of validity',
      CANONICAL.replace(
        'expiresAt: offer.invoiceExpiresAt,',
        'expiresAt: saasBillingInvoiceExpiresAt(now, provider.invoiceValidityDays),',
      ),
    ],
    [
      'seat invoice assembled from two decisions',
      CANONICAL.replace('servicePeriodEndsAt: offer.servicePeriodEndsAt,', 'servicePeriodEndsAt: subscription.currentPeriodEndsAt,'),
    ],
    [
      'seat invoice built from a decision the door did not make',
      CANONICAL.replace('const offer = await quota.resolveClinicTeamAvailability();', 'const offer = buildMyOwnOffer();'),
    ],
    [
      'seat price recomputed by the moved-out helper',
      `import { proratedSeatPriceMinor } from '@/modules/saas-billing/proration';
       export const price = (i) => proratedSeatPriceMinor(i);`,
    ],
  ];
  const missed = fixtures.filter(([, source]) => sourceSignals(featurePath, source).length === 0);
  const rejected = sourceSignals(featurePath, CANONICAL);
  if (missed.length > 0 || rejected.length > 0) {
    throw new Error(
      `check-seat-overage-single-door self-test failed: missed=${missed.map(([name]) => name).join(', ') || 'none'}; rejected-canonical=${rejected.join(', ') || 'none'}`,
    );
  }
  console.log(`check-seat-overage-single-door self-test: ${fixtures.length} bypass forms rejected`);
  console.log('check-seat-overage-single-door self-test: canonical door writer accepted');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const findings = productionFindings();
  if (findings.length > 0) {
    console.error('check-seat-overage-single-door: second seat-overage door detected.');
    for (const finding of findings) {
      console.error(`  - ${relative(repoRoot, finding.filename).replaceAll('\\', '/')}: ${finding.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('check-seat-overage-single-door: OK');
  }
}
