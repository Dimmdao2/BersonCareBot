# Результат уборки планов, 29.07.2026

## 1. Сколько осталось

В `docs/_TODO/**` осталось **1035 открытых боксов**. В это число входят:

- 60 — отложенная mobile-инициатива;
- 35 — критерии final acceptance;
- 26 — действия владельца: юрист, DPO, Selectel.

После этих исключений остаётся **914**. Это верхняя граница по боксам, не число разных задач: одна задача
может занимать несколько строк или повторяться в планах.

| Срез | open | done | cancelled | указатели | файлов |
| --- | ---: | ---: | ---: | ---: | ---: |
| `_TODO` до (`247bade4b`) | 968 | 1090 | 194 | 7 | 491 |
| `_TODO` после | 1035 | 934 | 6 | 41 | 456 |
| архив после | 0 | 229 | 10 | 11 | 36 |

Цифры повторно измерены одной командой; расхождений с независимым срезом нет. Сам этот отчёт исключён из
числа файлов и указателей, чтобы его создание не меняло результат уборки.

**Замер сделан на коммите `43aebf660`. После него число стало 996** — и это не ошибка: лид закрыл
**39 собственных пунктов плана уборки** (`DOCS_PLAN_HYGIENE_2026-07-29.md`), когда аудиты подтвердили
их выполнение. Работа над репозиторием от этого не изменилась: без файла самого плана уборки открытых
**992**, и именно эта цифра описывает продуктовый остаток. Если пересчитать сегодня и получить 996 —
всё сходится.

## 2. Почему число выросло, а не упало

Open вырос на **67**:

- mobile: +60;
- `NIGHT_PLAN_2026-07-26.md`: +4;
- NTF-01: +8;
- nightly runbook: +2;
- Phase0: +1;
- R2: +8;
- R0: +5;
- R1: +4;
- STORE: +1;
- STORE P0: +1;
- tariffs: −18;
- пункты плана уборки: −9.

Под упразднёнными маркерами была незакрытая работа. Она вернулась в open; заявления без доказательства
тоже вернулись в open. Падение числа означало бы, что уборка скрыла эти строки.

## 3. Что уехало в архив

В архивном срезе **36 файлов: 35 записей и индекс**, а не 36 отдельных планов. Открытых боксов среди
записей — 0. Индекс: [`docs/archive/2026-07-plans/README.md`](../archive/2026-07-plans/README.md);
достижимы 35 из 35 записей.

## 4. Что осталось открытым и почему

Гейт 29.07 оставил в `_TODO` файлы с живой работой:

- `AUTONOMOUS_NIGHTLY_RUNBOOK.md` — 2;
- `PHASE0_MULTITENANT_DESIGN_LOCK.md` — 1;
- `R2_ENFORCEMENT_PREP_PLAN.md` — 8;
- `SAAS_R0_PLAN_RECONCILIATION.md` — 5;
- `SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md` — 4;
- `STORE_EXECUTION_PLAN.md` — 1;
- `STORE_P0_ENTITLEMENTS_PLAN.md` — 1.

Отдельная проблема: **1527** filesystem-target ссылок были битыми до начала уборки. Осталось **1525**:
две из них починились попутно на строке `LOG.md:424`, которую всё равно пришлось править из-за ссылки,
сломанной переносом архива. Остальных 1525 не касались — это отдельная задача и ваше решение, а не работа
этой ночи.

*(Первая редакция этой строки говорила «в этом проходе они не исправлялись» — неверно, поймано финальным
аудитом `audit-e5b-0729`. Исправлено утверждение, а не ссылки: откатывать две починенные ссылки ради
красивой формулировки было бы хуже.)*

## 5. Развилки владельца H-1…H-8

- **H-1.** `FINAL_ACCEPTANCE.md` (35) и `OWNER_ACTIONS.md` (26): оставить чекбоксы или вынести в другой
  формат? Safe default: формат сейчас не менять; помечать как не-бэклог и считать отдельно.
- **H-2.** Оставить один архивный корень `docs/archive/` и слить туда `docs/_ARCHIVE/`? Safe default: да.
- **H-3.** R0.3/R0.4/R0.6/R0.7/R0.9 и R1.1/R1.4/R1.5/R1.6 — история audit-FAIL или работа? Safe default:
  пока open; рекомендация — оставить прозой как историю.
- **H-4.** Отложенный фильтр «мои пациенты» в `R2_ENFORCEMENT_PREP_PLAN.md` не имеет отмены владельца.
  Safe default: оставить open.
- **H-5.** Branding/custom-domain из `STORE_EXECUTION_PLAN.md` потерян или не начинался? Safe default:
  оставить open.
- **H-6.** Остаточные spoofing-proofs в `PHASE0_MULTITENANT_DESIGN_LOCK.md` не завершены. Safe default:
  оставить open как работу.
- **H-7.** Форма `ВЕДЁТСЯ В <файл> §<раздел> — «первые слова требования»` отличается от исходного
  `<файл>:<строка>`. Safe default: оставить якорь по разделу; номера строк сдвигаются.
- **H-8.** Для trial-policy при создании организации и checkout/status page нет пунктов в `SAAS_S4`.
  Safe default: оба требования остаются open в `TARIFFS_PAYMENTS_ADMIN_PLAN.md` до решения — добавить их в
  `SAAS_S4` или отменить словами владельца.

## 6. Как перепроверить

Команда считает строки только вне fenced-блоков. Текущий срез исключает этот отчёт.

```bash
measure_ref() {
  ref=$1
  root=$2
  mapfile -t files < <(git -c core.quotePath=false ls-tree -r --name-only "$ref" -- "$root")
  {
    for file in "${files[@]}"; do
      git show "$ref:$file" | awk '
        /^```/ { fenced=!fenced; next }
        !fenced && /^[[:space:]]*-[[:space:]]*\[ \]/ { open++ }
        !fenced && /^[[:space:]]*-[[:space:]]*\[x\]/ { done++ }
        !fenced && /^[[:space:]]*-[[:space:]]*\[-\]/ { cancelled++ }
        !fenced && /ВЕДЁТСЯ В/ { pointers++ }
        END { print open+0, done+0, cancelled+0, pointers+0 }
      '
    done
  } | awk -v ref="$ref" -v root="$root" -v files="${#files[@]}" '
    { open+=$1; done+=$2; cancelled+=$3; pointers+=$4 }
    END {
      printf "%s %s open=%d done=%d cancelled=%d pointers=%d files=%d\n",
        ref, root, open+0, done+0, cancelled+0, pointers+0, files
    }
  '
}

measure_tree() {
  root=$1
  result=docs/_TODO/PLAN_HYGIENE_RESULT_2026-07-29.md
  mapfile -d '' files < <(find "$root" -type f ! -path "$result" -print0 | sort -z)
  awk -v root="$root" -v files="${#files[@]}" '
    FNR == 1 { fenced=0 }
    /^```/ { fenced=!fenced; next }
    !fenced && /^[[:space:]]*-[[:space:]]*\[ \]/ { open++ }
    !fenced && /^[[:space:]]*-[[:space:]]*\[x\]/ { done++ }
    !fenced && /^[[:space:]]*-[[:space:]]*\[-\]/ { cancelled++ }
    !fenced && /ВЕДЁТСЯ В/ { pointers++ }
    END {
      printf "WORKTREE %s open=%d done=%d cancelled=%d pointers=%d files=%d\n",
        root, open+0, done+0, cancelled+0, pointers+0, files
    }
  ' "${files[@]}"
}

measure_ref 247bade4b docs/_TODO
measure_tree docs/_TODO
measure_tree docs/archive/2026-07-plans
```

Исключения из верхней границы:

```bash
count_open() {
  find "$1" -type f -print0 | sort -z | xargs -0 awk '
    FNR == 1 { fenced=0 }
    /^```/ { fenced=!fenced; next }
    !fenced && /^[[:space:]]*-[[:space:]]*\[ \]/ { n++ }
    END { print n+0 }
  '
}

count_open docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE
count_open docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/FINAL_ACCEPTANCE.md
count_open docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_ACTIONS.md
```
