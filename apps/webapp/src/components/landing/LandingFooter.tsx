import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { LANDING_BOOKING_HREF, LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

export function LandingFooter() {
  return (
    <footer className="border-t border-[#DDE3F0] bg-white py-10">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">

          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 text-[#17264A]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2F55B7]">
                <HeartPulse className="h-4 w-4 text-white" aria-hidden />
              </span>
              <span className="text-base font-semibold">BersonCare</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#667085]">
              Пациентский кабинет для реабилитации и сопровождения.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2 text-sm leading-6 text-[#667085]">
            <Link href={LANDING_INSTALL_HASH} className="w-fit font-medium text-[#2F55B7] hover:text-[#2448A5]">
              Установить приложение
            </Link>
            <Link href={LANDING_BOOKING_HREF} className="w-fit font-medium text-[#2F55B7] hover:text-[#2448A5]">
              Записаться
            </Link>
          </div>

          {/* Contacts */}
          <div className="flex flex-col gap-2 text-sm leading-6 text-[#667085]">
            <Link href="https://dmitryberson.ru" className="w-fit hover:text-[#17264A]" target="_blank" rel="noreferrer">
              dmitryberson.ru
            </Link>
            <Link href="https://t.me/dmitryberson" className="w-fit hover:text-[#17264A]" target="_blank" rel="noreferrer">
              Telegram: @dmitryberson
            </Link>
            <Link href="https://t.me/dimmdao" className="w-fit hover:text-[#17264A]" target="_blank" rel="noreferrer">
              Запись: @dimmdao
            </Link>
          </div>

        </div>
      </div>
    </footer>
  );
}
