/**
 * Краткий операторский runbook для каталога записи v2 (очная запись).
 */
export function BookingCatalogHelp() {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
      <h2 className="mb-2 font-semibold">Каталог записи: порядок настройки</h2>
      <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Города</strong> — код (например, moscow, spb) и название для экрана выбора.
        </li>
        <li>
          <strong className="text-foreground">Филиалы</strong> — привязка к городу и обязательный{" "}
          <span className="font-mono text-foreground">rubitime_branch_id</span> из Rubitime.
        </li>
        <li>
          <strong className="text-foreground">Специалисты</strong> — привязка к филиалу и{" "}
          <span className="font-mono text-foreground">rubitime_cooperator_id</span>.
        </li>
        <li>
          <strong className="text-foreground">Услуги</strong> — глобальный каталог: название, длительность, цена (в копейках),
          без привязки к городу.
        </li>
        <li>
          <strong className="text-foreground">Связки филиал — услуга</strong> — для каждой пары филиал+услуга укажите
          специалиста и <span className="font-mono text-foreground">rubitime_service_id</span>. Одна услуга на филиал — одна
          строка (уникальная пара филиал+услуга).
        </li>
      </ol>
      <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
        Без корректных Rubitime ID интегратор не сможет запросить слоты и создать запись в Rubitime. ID нужно сверить с
        кабинетом Rubitime или с зафиксированной таблицей маппинга.
      </p>
    </div>
  );
}
