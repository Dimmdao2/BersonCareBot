'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { landingContainer } from '@/components/landing/landingTypography';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STAFF_SURFACE_NAME } from '@/config/productSurfaceNames';

const navItems = [
  { label: 'Продукт', href: '#product' },
  { label: 'Как работает', href: '#workflow' },
  { label: 'Возможности', href: '#features' },
  { label: 'Тарифы', href: '#pricing' },
] as const;

const SCROLL_COMPACT_THRESHOLD_PX = 12;

export function LandingHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onScroll() {
      setIsCompact(window.scrollY > SCROLL_COMPACT_THRESHOLD_PX);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    function onOutsideClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutsideClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutsideClick);
    };
  }, [isOpen]);

  const heightClass = isCompact ? 'h-14 lg:h-16' : 'h-16 lg:h-20';

  return (
    <>
      <div aria-hidden className={cn('shrink-0 transition-[height] duration-300', heightClass)} />
      <header
        ref={headerRef}
        className={cn(
          'fixed inset-x-0 top-0 z-30 border-b border-[#DDE5EF] bg-white/95 backdrop-blur transition-shadow',
          isCompact && 'shadow-sm',
        )}
      >
        <div
          className={cn(
            landingContainer,
            'flex items-center gap-3 transition-[height] duration-300',
            heightClass,
          )}
        >
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-[#17264A]"
          >
            <Image
              src="/apple-touch-icon.png"
              alt=""
              width={36}
              height={36}
              className="h-8 w-8 rounded-xl sm:h-9 sm:w-9"
              priority
            />
            <span className="hidden text-lg sm:inline">{STAFF_SURFACE_NAME}</span>
          </Link>

          <nav
            aria-label="Основная навигация"
            className="ml-auto hidden items-center gap-6 lg:flex"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-[#526276] transition hover:text-[#406CA7]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-4">
            <Link
              href="/app"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-[#406CA7] transition hover:bg-[#F3F6FA] lg:inline-flex"
            >
              Войти
            </Link>
            <Link
              href="/app?intent=specialist"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#406CA7] px-4 text-sm font-semibold text-white transition hover:bg-[#315A8D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#406CA7]/25 sm:px-5"
            >
              <span className="sm:hidden">Создать</span>
              <span className="hidden sm:inline">Создать кабинет</span>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={isOpen}
              aria-controls="landing-nav"
              onClick={() => setIsOpen((value) => !value)}
              className="h-10 w-10 shrink-0 rounded-full text-[#17264A] hover:bg-[#F3F6FA] focus-visible:ring-[#406CA7]/30 lg:hidden"
            >
              {isOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </Button>
          </div>
        </div>

        {isOpen ? (
          <nav
            id="landing-nav"
            aria-label="Меню"
            className="border-t border-[#E4EAF1] bg-white shadow-lg lg:hidden"
          >
            <div className={cn(landingContainer, 'py-3')}>
              <ul className="flex flex-col">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className="flex w-full py-3 text-base font-medium text-[#17264A]"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-[#E4EAF1] pt-3">
                <Link
                  href="/app"
                  onClick={() => setIsOpen(false)}
                  className="flex py-3 text-base font-semibold text-[#406CA7]"
                >
                  У меня есть приглашение / Войти
                </Link>
                <Link
                  href="/app/contact-support?from=clinic-demo"
                  onClick={() => setIsOpen(false)}
                  className="flex py-3 text-base font-medium text-[#526276]"
                >
                  Запросить демо для клиники
                </Link>
              </div>
            </div>
          </nav>
        ) : null}
      </header>
    </>
  );
}
