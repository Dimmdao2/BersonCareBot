import Link from "next/link";
import { LANDING_BOOKING_HREF, LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

export function LandingFooter() {
  return (
    <footer className="border-t border-[#DDE3F0] bg-white py-8">
      <div className="mx-auto max-w-full px-5 text-sm text-[#667085] sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="grid gap-6 md:grid-cols-3 md:items-start">
          <div>
            <p className="font-semibold text-[#17264A]">BersonCare</p>
            <p className="mt-2">Пациентский кабинет для реабилитации и сопровождения.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Link href={LANDING_INSTALL_HASH} className="w-fit text-[#2F55B7] hover:text-[#2448A5]">Установить приложение</Link>
            <Link href={LANDING_BOOKING_HREF} className="w-fit text-[#2F55B7] hover:text-[#2448A5]">Записаться</Link>
          </div>

          <div className="flex flex-col gap-2">
            <Link href="https://dmitryberson.ru" className="w-fit hover:text-[#17264A]" target="_blank" rel="noreferrer">dmitryberson.ru</Link>
            <Link href="https://t.me/dmitryberson" className="w-fit hover:text-[#17264A]" target="_blank" rel="noreferrer">Telegram: @dmitryberson</Link>
            <Link href="https://t.me/dimmdao" className="w-fit hover:text-[#17264A]" target="_blank" rel="noreferrer">Запись: @dimmdao</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
