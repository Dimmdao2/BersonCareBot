# CHECKLIST — test optimization track

- [ ] `INVENTORY.md` заполнен для всех `e2e/*.test.ts` (классификация + overlap статус не «unknown» там, где уже сравнили).
- [ ] `BASELINE.md` содержит дату, команды, результаты; для «after» добавлен второй блок замеров (желательно ≥3 прогона).
- [ ] Каждый кандидат на удаление имеет written justification (duplicate / low-value).
- [ ] **Replacement mapping** задокументирован: `old path` → `new path(s)` в `LOG.md` или отдельной таблице в конце трека.
- [ ] Контракты из `PLAN.md` проверены вручную после изменений (список семейств сценариев).
- [ ] Между коммитами: соблюдён `.cursor/rules/test-execution-policy.md` (step / phase); полный webapp/integrator suite — когда закрыт пакет работ, не после каждого файла.
- [ ] `pnpm run ci` зелёный **перед пушем** в remote (не обязателен после каждого локального коммита).
- [ ] `.github/workflows/ci.yml` **не меняли** в рамках трека; если не трогали — N/A на сравнение.
- [ ] `docs/REPORTS/TEST_AND_API_DI_OPTIMIZATION_INDEX_*.md` или `LOG.md` обновлены ссылкой на итог и цифрами after.
