#!/usr/bin/env node
/**
 * Отказ запускать полный CI, пока дерево ещё дописывается.
 *
 * Что предотвращает. Полный прогон измеряет ОДНО состояние репозитория. Если в этот момент ветки ещё
 * сводятся или агенты ещё пишут, измеренного состояния к концу работы не будет: зелёный результат
 * относится к дереву, которого не станет, красный может принадлежать половине слияния. Плюс прогон
 * отбирает восемь ядер у тех, кто в этот момент работает.
 *
 * Почему это ЗДЕСЬ, а не в правиле. Правило про это существовало с 27.07 и было нарушено 20.08 тем же
 * лидом, который его писал: он посмотрел на чистое `git status`, увидел пусто и решил, что писателей
 * нет — а пятеро писали в своих клонах. Правило, которое проверяет человек, проверяется настроением;
 * отказ на входе не проверяется вовсе. Из двух правил, действовавших в ту ночь, устояло ровно то,
 * которое было ЗАШИТО в порт (`land` без строки вердикта физически не проходит).
 *
 * Обойти можно `BCB_CI_ALLOW_CONCURRENT_WRITERS=1` — осознанно и с причиной, а не по привычке.
 */
import { execFileSync } from 'node:child_process';

const ESCAPE = 'BCB_CI_ALLOW_CONCURRENT_WRITERS';

function livePortAgents() {
  let out = '';
  try {
    out = execFileSync('pgrep', ['-af', 'agent-run.mjs'], { encoding: 'utf8' });
  } catch {
    return []; // pgrep возвращает 1, когда совпадений нет
  }
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, ...rest] = line.split(/\s+/);
      const args = rest.join(' ');
      // read-only аудитор не мешает: он ничего не пишет в дерево
      const readOnly = /--sandbox[= ]read-only/.test(args);
      const runId = args.match(/--run-id[= ]([\w.-]+)/)?.[1] ?? '';
      return { pid, runId, readOnly, args };
    });
}

const agents = livePortAgents();
const writers = agents.filter((a) => !a.readOnly);

if (writers.length === 0) {
  process.exit(0);
}

const allowed = process.env[ESCAPE] === '1';
const lines = [
  `ci-preflight: полный CI не запускается — в работе ${writers.length} агент(ов), пишущих в дерево:`,
  ...writers.map((w) => `  pid ${w.pid}${w.runId ? ` (${w.runId})` : ''}`),
  '',
  'Полный CI гоняется ОДИН раз, когда сведение ЗАКОНЧЕНО: все ветки влиты, писателей нет.',
  'Правки по ходу проверяют аудитор и целевые тесты по масштабу правки — это их работа.',
  'Норматив: AGENTS.md §9 «Full CI gate», docs/ORCHESTRATION_BINDINGS.md «Полный CI гоняется В ЭТОМ дереве».',
  '',
  `Если прогон нужен именно сейчас и причина названа вслух — ${ESCAPE}=1 pnpm run ci`,
];

if (allowed) {
  console.warn(`ci-preflight: ПРОПУЩЕНО по ${ESCAPE}=1 при ${writers.length} живых писателях.`);
  process.exit(0);
}

console.error(lines.join('\n'));
process.exit(1);
