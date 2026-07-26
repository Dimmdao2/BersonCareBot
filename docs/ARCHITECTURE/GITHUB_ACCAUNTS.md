# **GitHub Multi-Account Convention (Server)**

## **Назначение**

На сервере используется два независимых GitHub-аккаунта:

- `dimmdao` — основной аккаунт.
- `Dimmdao2` — дополнительный аккаунт (например, для отдельной подписки Cursor/Claude/GitHub и увеличения лимитов).

Запрещено переключать SSH-ключи вручную через редактирование `~/.ssh/config` при переходе между аккаунтами.

Используется постоянная схема с двумя SSH-host aliases.

---

## **SSH-конфигурация**

Файл:

```text
~/.ssh/config
```

Содержимое:

```text
Host github-dimmdao
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes

Host github-dimmdao2
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_key
  IdentitiesOnly yes
```

### **Назначение ключей**

```text
~/.ssh/id_ed25519
```

Авторизуется как:

```text
dimmdao
```

Проверка:

```bash
ssh -T github-dimmdao
```

Ожидаемый результат:

```text
Hi dimmdao!
```

---

```text
~/.ssh/github_key
```

Авторизуется как:

```text
Dimmdao2
```

Проверка:

```bash
ssh -T github-dimmdao2
```

Ожидаемый результат:

```text
Hi Dimmdao2!
```

---

## **Настройка remote для репозиториев (фактическая, проверено 2026-07-26)**

⚠️ **Имена remote в рабочем каталоге НЕ совпадают с именами аккаунтов. Не додумывай — сверяйся с таблицей.**

| имя remote | URL | аккаунт GitHub | роль |
| --- | --- | --- | --- |
| `origin` | `git@github-dimmdao2:Dimmdao2/BersonCareBot.git` | **Dimmdao2** | dev / бэкап (прод-деплой выключен `if:false`) |
| `dimmdao` | `git@github-dimmdao:dimmdao/BersonCareBot.git` | **dimmdao** | **производственный** (ручной workflow «Deploy (production)») |

То есть `origin` — это **Dimmdao2**, а не основной аккаунт. Рабочие ветки трекают `origin`
(`branch.<name>.remote = origin`).

Эта же карта записана в [`AGENTS.md`](../../AGENTS.md) → «Операционные правила · Deploy / push»,
и именно она была верной, когда текст ниже ещё врал. **При расхождении двух документов побеждает
`AGENTS.md`** — он единая точка входа для агентов. Правишь одно — синхронизируй второе.

Проверка (единственный надёжный способ — смотреть URL, а не имя):

```bash
git remote -v
```

---

## **Рабочая схема**

**Правило: пушим ВСЕГДА в оба аккаунта.** Пуш в один — это не бэкап; ровно так в ночь на 2026-07-26
34 коммита оказались только в одном аккаунте, а агент отчитался, что бэкапа нет вообще.

Ветка разработки (пример — текущая):

```bash
git push dimmdao feat/doctor-ui-rebuild && git push origin feat/doctor-ui-rebuild
```

Проверка, что оба аккаунта на одном коммите (обе строки обязаны совпасть с `git rev-parse HEAD`):

```bash
git ls-remote dimmdao refs/heads/feat/doctor-ui-rebuild
git ls-remote origin  refs/heads/feat/doctor-ui-rebuild
```

Получение изменений:

```bash
git pull origin <branch>     # из Dimmdao2
git pull dimmdao <branch>    # из dimmdao
```

🔴 **`main` и `test` агент не пушит никогда** — ни в один из аккаунтов. Это отдельный запрет,
он не отменяется тем, что ветку разработки пушить обязательно.

---

## **Правило при миграции репозитория между аккаунтами**

Перед сменой удалённого репозитория обязательно:

1. Зафиксировать текущее состояние:

```bash
git add -A
git commit -m "Backup current actual state"
```

1. Создать резервную ветку:

```bash
git branch backup-before-github-sync
```

или тег:

```bash
git tag backup-before-github-sync-YYYYMMDD
```

1. Проверить отсутствие локальных изменений:

```bash
git status
```

Ожидаемый результат:

```text
nothing to commit, working tree clean
```

---

## **Проверка безопасности перед push**

Посмотреть коммиты, которые есть локально, но отсутствуют на удалённом репозитории:

```bash
git log --oneline origin/main..HEAD
```

Посмотреть коммиты, которые есть на удалённом репозитории, но отсутствуют локально:

```bash
git log --oneline HEAD..origin/main
```

Если второй список пустой, локальная ветка содержит всё необходимое.

---

## **Инцидент 2026-06-10**

При возврате с аккаунта `Dimmdao2` на `dimmdao` локальная ветка содержала большое количество актуальных коммитов, а GitHub-репозиторий `dimmdao/BersonCareBot` был значительно устаревшим.

После проверки:

```bash
ssh -T github-dimmdao
git ls-remote origin
git fetch origin
```

было подтверждено, что локальная ветка содержит все актуальные изменения.

Синхронизация выполнена обычным:

```bash
git push origin main
```

без использования force push.

Результат:

```text
61597f98..13529add main -> main
```

Актуальное состояние проекта успешно сохранено в репозитории `dimmdao/BersonCareBot`.