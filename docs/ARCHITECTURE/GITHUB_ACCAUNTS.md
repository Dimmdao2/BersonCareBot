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

## **Настройка remote для репозиториев**

### **Репозиторий основного аккаунта**

Пример:

```bash
git remote set-url origin git@github-dimmdao:dimmdao/BersonCareBot.git
```

Проверка:

```bash
git remote -v
```

Результат:

```text
origin  git@github-dimmdao:dimmdao/BersonCareBot.git
```

---

### **Второй аккаунт**

Дополнительный remote:

```bash
git remote add dimmdao2 git@github-dimmdao2:Dimmdao2/BersonCareBot.git
```

Проверка:

```text
dimmdao2 git@github-dimmdao2:Dimmdao2/BersonCareBot.git
```

---

## **Рабочая схема**

Пуш в основной аккаунт:

```bash
git push origin main
```

Получение изменений из основного аккаунта:

```bash
git pull origin main
```

---

Пуш во второй аккаунт:

```bash
git push dimmdao2 main
```

Получение изменений из второго аккаунта:

```bash
git pull dimmdao2 main
```

---

Одновременная синхронизация обоих аккаунтов:

```bash
git push origin main && git push dimmdao2 main
```

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