/**
 * Краткий runbook для настройки записи (solo-specialist UX).
 */
export function BookingCatalogHelp() {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
      <h2 className="mb-2 font-semibold">Порядок настройки</h2>
      <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Локации и услуги</strong> — места приёма и общий каталог услуг.
        </li>
        <li>
          <strong className="text-foreground">Доступность</strong> — где какая услуга доступна.
        </li>
        <li>
          <strong className="text-foreground">Расписание</strong> — рабочие дни и исключения по локациям.
        </li>
        <li>
          <strong className="text-foreground">Публичная запись</strong> — ссылка для пациентов после настройки каталога.
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Связь с Rubitime — только на вкладке Rubitime, если включена интеграция.
      </p>
    </div>
  );
}
