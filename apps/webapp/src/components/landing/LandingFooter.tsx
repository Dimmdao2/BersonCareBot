import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-[#DDE3F0] bg-white py-6 sm:py-8">
      <div className="mx-auto max-w-full px-4 text-xs text-[#667085] sm:px-6 sm:text-sm md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <div>
            <p className="font-semibold text-[#17264A]">BersonCare</p>
            <p className="mt-2">Пациентский кабинет для реабилитации и сопровождения.</p>
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
