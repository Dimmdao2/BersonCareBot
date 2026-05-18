import Link from "next/link";
import { HeartPulse, Menu } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

const nav = [
  { href: "#features", label: "Возможности" },
  { href: "#about", label: "О приложении" },
  { href: "#specialist", label: "Специалист" },
  { href: "#install", label: "Установка" },
] as const;

const installBtnClass = cn(
  buttonVariants({ size: "default" }),
  "rounded-xl bg-[#2F55B7] px-3 text-sm text-white hover:bg-[#2448A5] sm:px-5 sm:text-base",
);

export function LandingHeader() {
  return (
    <header className="border-b border-[#DDE3F0]/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-full items-center justify-between gap-3 px-5 sm:px-6 md:max-w-3xl md:px-6 lg:h-20 lg:max-w-6xl lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-[#17264A]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF4FF] text-[#2F55B7]">
            <HeartPulse className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-lg font-semibold tracking-tight">BersonCare</span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Разделы страницы">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[#667085] transition-colors hover:text-[#17264A]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link href={LANDING_INSTALL_HASH} className={installBtnClass}>
            <span className="sm:hidden">Установить</span>
            <span className="hidden sm:inline">Установить приложение</span>
          </Link>

          <details className="relative lg:hidden">
            <summary
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-[#DDE3F0] bg-white text-[#17264A] [&::-webkit-details-marker]:hidden"
              aria-label="Меню"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-[#DDE3F0] bg-white p-2 shadow-md">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-[#17264A] hover:bg-[#EEF4FF]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
