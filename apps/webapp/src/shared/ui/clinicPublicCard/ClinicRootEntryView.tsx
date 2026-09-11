/**
 * Вырожденный корень клиники — экран, который стоит по адресу клиники вместо визитки, когда она
 * визитку выключила (#926 §17.F).
 *
 * Решение владельца 11.09, дословно: «корень клиники должен стать входом в кабинет. Не должно быть
 * исчезнувшего адреса, то есть там будет вход в кабинет, там название клиники, и что это на
 * платформе Therapysto работает». Ровно три вещи и ничего сверх: имя клиники (с её логотипом, если
 * он есть), вход в кабинет и отметка платформы.
 *
 * Чего здесь нет и почему: ни описания, ни контактов, ни адресов, ни специалистов, ни услуг —
 * клиника сняла их с публики одной галкой, и «выключено» обязано означать выключено. Сюда они и не
 * доезжают: дверь визитки при выключенном показе отдаёт только имя и логотип.
 *
 * Вид намеренно повторяет уже принятую шапку `ClinicPublicCardView` (логотип 64×64 слева, имя
 * заголовком справа) — дизайн владелец переделывает сам, второй визуальный язык заводить незачем.
 */
export type ClinicRootEntryViewModel = {
  displayName: string;
  /** Логотип из того же набора медиа двери, которым пользуется визитка; `null` — не загружен. */
  logoSrc: string | null;
  /** Адрес входа в кабинет — тот же, куда ведёт настройка «сразу открывать вход». */
  cabinetHref: string;
  /** Имя платформы одной строкой: источник — `PLATFORM_NAME`, второго имени не заводим. */
  platformName: string;
};

export function ClinicRootEntryView({ entry }: { entry: ClinicRootEntryViewModel }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        {entry.logoSrc ? (
          // Логотип живёт в медиа-хранилище арендатора и меняется по его публикации: next/image
          // потребовал бы заранее объявленного списка хостов.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.logoSrc} alt="" className="size-16 shrink-0 rounded-md object-contain" />
        ) : (
          <div
            aria-hidden
            className="size-16 shrink-0 rounded-md border border-border/60 bg-muted/30"
          />
        )}
        <h1 className="text-xl font-semibold">{entry.displayName}</h1>
      </header>

      <a
        href={entry.cabinetHref}
        className="inline-flex w-fit items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Войти в кабинет
      </a>

      <p className="text-sm text-muted-foreground">
        Работает на платформе {entry.platformName}
      </p>
    </div>
  );
}
