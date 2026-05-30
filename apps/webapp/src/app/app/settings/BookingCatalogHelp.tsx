/**
 * Краткий операторский runbook для каталога записи (own booking engine).
 */
export function BookingCatalogHelp() {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
      <h2 className="mb-2 font-semibold">Каталог записи: порядок настройки</h2>
      <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Организация и филиалы</strong> — города, филиалы, кабинеты, специалисты и
          услуги в разделах ниже.
        </li>
        <li>
          <strong className="text-foreground">Матрица доступности</strong> — привязка специалист × филиал × услуга.
        </li>
        <li>
          <strong className="text-foreground">Политики и оплата</strong> — отмена/перенос, предоплата, провайдеры.
        </li>
        <li>
          <strong className="text-foreground">Публичный канал</strong> — виджет и UTM после готовности каталога.
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Rubitime ID (филиал, специалист, услуга) нужны только при включённом мосте — для синхронизации слотов и legacy-
        записей. Каноническая запись работает без Rubitime.
      </p>
    </div>
  );
}
