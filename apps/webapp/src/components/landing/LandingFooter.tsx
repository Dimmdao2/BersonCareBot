import Link from "next/link";
import { landingBody, landingBodySecondary, landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function LandingFooter() {
  return (
    <footer className="overflow-x-hidden border-t border-[#DDE3F0] bg-white py-6 sm:py-8">
      <div className={landingContainer}>
        <div className="grid min-w-0 gap-6 md:grid-cols-2 md:items-start">
          <div>
            <p className="text-base font-semibold text-[#17264A]">BersonCare</p>
            <p className={cn(landingBody, "mt-2")}>Пациентский кабинет для реабилитации и сопровождения.</p>
          </div>

          <div className={cn("flex flex-col gap-2", landingBodySecondary)}>
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
