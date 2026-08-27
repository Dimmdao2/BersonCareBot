#!/usr/bin/env node
/**
 * Единственный host-side seam «APP_BASE_URL → surface identity запроса».
 *
 * Продуктовая маршрутизация поверхностей отказывает закрыто на неизвестном `Host`, включая голый
 * loopback (`apps/webapp/src/proxy.ts` → `resolveRequestSurface`). Поэтому и health-проверка деплоя,
 * и КАЖДЫЙ фоновый loopback-вызов обязаны предъявить ровно ту identity, что настроена в
 * `APP_BASE_URL` того же env-файла. Ручная копия `Host`/`Origin` в cron-строке — ровно та ошибка,
 * из-за которой три шаблона молча получали 404 (находка B1 сводного аудита 27.08.2026).
 *
 * Режимы (по умолчанию — прежний, только `Host`, чтобы не ломать существующих вызывающих):
 *   node webapp-health-host.mjs                → test.bersoncare.ru
 *   node webapp-health-host.mjs --origin       → https://test.bersoncare.ru
 *   node webapp-health-host.mjs --scheme       → https
 *   node webapp-health-host.mjs --surface-env  → три строки KEY=value для `eval` в shell
 */

const MODES = new Set(['--host', '--origin', '--scheme', '--surface-env']);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const args = process.argv.slice(2);
const unknown = args.find((arg) => !MODES.has(arg));
if (unknown !== undefined) {
  fail(`webapp-health-host: unknown argument ${JSON.stringify(unknown)}`);
} else {
  const mode = args[args.length - 1] ?? '--host';
  const rawOrigin = process.env.APP_BASE_URL ?? '';

  try {
    const parsed = new URL(rawOrigin);
    const isHttpOrigin = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isExactOrigin = rawOrigin === parsed.origin || rawOrigin === `${parsed.origin}/`;

    if (!isHttpOrigin || !isExactOrigin || parsed.username || parsed.password) {
      throw new Error('APP_BASE_URL must be an exact HTTP(S) origin without credentials');
    }

    const scheme = parsed.protocol.replace(/:$/, '');
    if (mode === '--origin') {
      process.stdout.write(parsed.origin);
    } else if (mode === '--scheme') {
      process.stdout.write(scheme);
    } else if (mode === '--surface-env') {
      // Значения уже прошли строгую валидацию URL выше: ни пробелов, ни кавычек, ни CR/LF в них быть
      // не может, поэтому одинарные кавычки безопасны для `eval`.
      process.stdout.write(
        [
          `BCB_SURFACE_HOST='${parsed.host}'`,
          `BCB_SURFACE_ORIGIN='${parsed.origin}'`,
          `BCB_SURFACE_SCHEME='${scheme}'`,
          '',
        ].join('\n'),
      );
    } else {
      process.stdout.write(parsed.host);
    }
  } catch {
    fail('APP_BASE_URL is not a safe webapp health origin');
  }
}
