import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';

export const dynamic = 'force-dynamic';

/**
 * Последняя линия, когда идентификатор сборки не удалось узнать ничем. Это НЕ время старта:
 * точный момент рестарта — операционный факт, и анониму его знать незачем (D4).
 */
const UNKNOWN_BUILD_ID = randomUUID();

/**
 * Идентификатор сборки обязан быть одинаковым у всех процессов ОДНОЙ сборки: вкладка сравнивает
 * его со своим и при расхождении перезагружается (`BuildVersionWatcher`). Хостовая выкладка ставит
 * `BUILD_ID`, docker-выкладка — нет, поэтому вторым источником идёт файл, который пишет сам Next
 * при сборке; он едет и в standalone-срезе. Значение на процесс берётся, только если не осталось
 * ничего другого — иначе обычный рестарт контейнера перезагружал бы каждую открытую вкладку.
 */
function resolveBuildId(): string {
  const envBuildId = process.env.BUILD_ID || process.env.NEXT_PUBLIC_BUILD_ID;
  if (envBuildId && envBuildId.trim().length > 0) {
    return envBuildId.trim();
  }

  try {
    const fromNext = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    if (fromNext.length > 0) return fromNext;
  } catch {
    // сборки рядом нет — остаётся значение на процесс
  }

  return UNKNOWN_BUILD_ID;
}

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/version:GET', request);
  const buildId = resolveBuildId();
  return NextResponse.json(
    { buildId },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    },
  );
}
