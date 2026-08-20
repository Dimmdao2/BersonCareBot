#!/usr/bin/env node
/**
 * Отказ запускать полный CI, пока дерево ещё дописывается.
 *
 * Условий два, и они РАЗНЫЕ. «Никто не пишет» ловится по живым агентам порта. «Сведение закончено»
 * по ним не ловится вовсе: между двумя ветками писателей может не быть ни одного, а впереди ещё
 * пять слияний. Первую редакцию этого файла лид написал только под первое условие — то есть
 * закрыл ровно тот способ, которым уже обжёгся, и оставил открытым второй, названный владельцем в
 * тот же день первым словом: «Ты опять гоняешь CI ДО СВЕДЕНИЯ ВСЕХ ВЕТОК».
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
import { pathToFileURL } from 'node:url';

const ESCAPE = 'BCB_CI_ALLOW_CONCURRENT_WRITERS';

/**
 * Разбор вывода `pgrep -af agent-run.mjs` в список живых агентов порта. Вынесено отдельно и
 * экспортировано, потому что отсев чужих строк — поведение, которое обязано держаться завтра:
 * см. ci-preflight.test.mjs.
 */
export function parsePortAgents(pgrepOutput) {
  return pgrepOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, ...rest] = line.split(/\s+/);
      const args = rest.join(' ');
      return { pid, args };
    })
    // pgrep -af ловит ЛЮБУЮ строку с этой подстрокой, включая оболочку, которая сама вызывает
    // preflight или печатает pgrep: 20.08 гейт засчитал в писатели собственную bash-обёртку и
    // отказал на пустом дереве. Настоящий агент — это node, запускающий сам файл.
    .filter(({ args }) => /(^|\s|\/)node\s+\S*agent-run\.mjs(\s|$)/.test(args))
    .map(({ pid, args }) => {
      // read-only аудитор не мешает: он ничего не пишет в дерево
      const readOnly = /--sandbox[= ]read-only/.test(args);
      const runId = args.match(/--run-id[= ]([\w.-]+)/)?.[1] ?? '';
      return { pid, runId, readOnly, args };
    });
}

function livePortAgents() {
  try {
    return parsePortAgents(execFileSync('pgrep', ['-af', 'agent-run.mjs'], { encoding: 'utf8' }));
  } catch {
    return []; // pgrep возвращает 1, когда совпадений нет
  }
}

/**
 * Ветки `wt/*`, у которых есть коммиты сверх головы сведения. Пока такая есть хоть одна, состояние
 * дерева ещё дописывается: прогон измерит то, чего через час не будет.
 */
function unlandedBranches() {
  const target = process.env.BCB_CI_INTEGRATION_BRANCH ?? 'feat/doctor-ui-rebuild';
  let refs = '';
  try {
    refs = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/wt'], {
      encoding: 'utf8',
    });
  } catch {
    return []; // не git-дерево или нет веток wt/* — второе условие неприменимо
  }
  // Ветка, которую владелец держит невлитой НАМЕРЕННО, — не «забытое сведение». Без этого различия
  // гейт запрещал прогон ровно в том порядке, который владелец и задал: свести всё кроме трека D,
  // потом CI, потом деплой. Держащая ветка объявляется явно и печатается в выводе — молча она
  // не пропускается, поэтому забытая ветка по-прежнему отказывает.
  const held = new Set(
    (process.env.BCB_CI_HELD_BRANCHES ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const pending = [];
  for (const branch of refs.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (held.has(branch)) continue;
    let count = '0';
    try {
      count = execFileSync('git', ['rev-list', '--count', `${target}..${branch}`], {
        encoding: 'utf8',
      }).trim();
    } catch {
      continue; // ветка сведения не существует — сравнивать не с чем
    }
    if (count !== '0') pending.push({ branch, count });
  }
  return pending;
}

function main() {
  const agents = livePortAgents();
  const writers = agents.filter((a) => !a.readOnly);
  const pending = unlandedBranches();
  const heldNames = (process.env.BCB_CI_HELD_BRANCHES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (heldNames.length > 0) {
    // Держащая ветка не проходит молча: прогон обязан сказать, чего он НЕ мерил.
    console.warn(
      `ci-preflight: намеренно не влиты и НЕ измеряются этим прогоном: ${heldNames.join(', ')}.`,
    );
  }

  if (writers.length === 0 && pending.length === 0) {
    process.exit(0);
  }

  const allowed = process.env[ESCAPE] === '1';
  const lines = [
    'ci-preflight: полный CI не запускается.',
    '',
    ...(writers.length
      ? [
          `Условие «никто не пишет» НЕ выполнено — ${writers.length} агент(ов) пишут в дерево:`,
          ...writers.map((w) => `  pid ${w.pid}${w.runId ? ` (${w.runId})` : ''}`),
          '',
        ]
      : ['Условие «никто не пишет» выполнено: живых писателей нет.', '']),
    ...(pending.length
      ? [
          `Условие «сведение закончено» НЕ выполнено — ${pending.length} ветк(и) не влиты:`,
          ...pending.map((p) => `  ${p.branch} — ${p.count} коммит(ов) сверх ветки сведения`),
          '',
        ]
      : ['Условие «сведение закончено» выполнено: невлитых веток wt/* нет.', '']),
    'Полный CI гоняется ОДИН раз, когда сведение ЗАКОНЧЕНО: все ветки влиты, писателей нет.',
    'Правки по ходу проверяют аудитор и целевые тесты по масштабу правки — это их работа.',
    'Норматив: AGENTS.md §9 «Full CI gate», docs/ORCHESTRATION_BINDINGS.md «Полный CI гоняется В ЭТОМ дереве».',
    '',
    `Если прогон нужен именно сейчас и причина названа вслух — ${ESCAPE}=1 pnpm run ci`,
  ];

  if (allowed) {
    console.warn(
      `ci-preflight: ПРОПУЩЕНО по ${ESCAPE}=1 — живых писателей ${writers.length}, ` +
        `невлитых веток ${pending.length}.`,
    );
    process.exit(0);
  }

  console.error(lines.join('\n'));
  process.exit(1);
}

// Импорт из теста не должен выполнять гейт и не должен звать process.exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
