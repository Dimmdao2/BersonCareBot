import Image from 'next/image';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';

export function RoleLoginPortalHeader({
  portal,
  surfaceName,
  brandLogoUrl = null,
  brandedSurface = false,
}: {
  portal: RoleLoginPortal;
  surfaceName: string;
  /** Логотип арендатора с уже опознанной поверхности; `null` — логотипа нет. */
  brandLogoUrl?: string | null;
  /** Поверхность клиники, а не общий TherapyGo: решает, чей знак показывать. */
  brandedSurface?: boolean;
}) {
  // Doctor-портал (вход после разлогина) — без описательного блока и без ссылки на пациентский
  // вход: только вертикальный лого-лок-ап Therapysto (иконка + подпись уже в самом файле).
  // Родитель (AppEntryLoginContent) центрирует всю группу по высоте — этому блоку своя
  // вертикальная поправка не нужна — владелец, 12.09.
  if (portal === 'doctor') {
    return (
      <div className="flex flex-col items-center">
        <Image
          src="/brand/therapysto-lockup-vertical.png"
          alt="Therapysto"
          width={132}
          height={130}
          priority
          unoptimized
        />
      </div>
    );
  }

  // Admin-портал — глобал-админ платформы, один вход без выбора режима: только сама форма, без
  // описания и без ссылки на другой логин (владелец, 12.09: «только форма входа без всяких ссылок
  // на другие режимы входа и лишних пояснений»). Свой mark пространства вместо общего Therapysto —
  // тот же admin-mark-transparent-source.png, из которого уже собран admin PWA-манифест/иконки.
  if (portal === 'admin') {
    return (
      <div className="flex flex-col items-center">
        <Image
          src="/brand/admin-mark-transparent-source.png"
          alt="Therapysto Admin"
          width={112}
          height={98}
          priority
          unoptimized
        />
      </div>
    );
  }

  // Пациентский вход. Владелец 15.09 про прежнюю зелёную карточку с заголовком и описанием:
  // «Вырезать к черту. У обычного входа должен быть логотип терапиго, а у брендированных
  // приложений — их логотип и название организации». Поэтому здесь не текстовый блок, а знак:
  // на обычном входе — лок-ап TherapyGo (тот же файл, что в `TherapyGoLoginShell`), на домене
  // клиники — её логотип и её имя. Клиника без загруженного логотипа остаётся с именем: пустого
  // места на месте знака быть не должно. Ссылки «Открыть кабинет специалистов» здесь нет: владелец
  // 15.09 велел убрать и её — пациентский вход не предлагает уйти в чужой кабинет. Кабинет
  // специалистов живёт на своём хосте, и попадают туда по своему адресу.
  return (
    <div className="mt-2 flex flex-col items-center gap-3">
      {brandLogoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- server-validated /api/media URL */}
          <img
            src={brandLogoUrl}
            alt=""
            className="size-16 rounded-2xl object-cover"
          />
          <p className="text-center text-base font-semibold text-foreground">{surfaceName}</p>
        </>
      ) : brandedSurface ? (
        <p className="text-center text-base font-semibold text-foreground">{surfaceName}</p>
      ) : (
        <Image
          src="/brand/therapygo-lockup-horizontal.png"
          alt="TherapyGo"
          width={817}
          height={302}
          sizes="260px"
          className="h-auto w-[200px]"
          priority
        />
      )}
    </div>
  );
}
