import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegalFooterLinks } from '@/shared/ui/patient/LegalFooterLinks';
import styles from './TherapyGoLoginShell.module.css';

type TherapyGoLoginShellProps = {
  children: ReactNode;
  supportContactHref: string;
  installHref: string;
};

/** TherapyGo owns this presentation; only the authentication mechanics inside remain shared. */
export function TherapyGoLoginShell({
  children,
  supportContactHref,
  installHref,
}: TherapyGoLoginShellProps) {
  return (
    <div id="therapygo-login-shell" className={styles.shell}>
      <header className={styles.header}>
        <nav className={styles.headerLinks} aria-label="Помощь и установка">
          <Link href={supportContactHref}>Помощь</Link>
          <Link className={styles.installLink} href={installHref}>
            Установить приложение
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.entry} aria-labelledby="therapygo-login-title">
          <Image
            className={styles.wordmark}
            src="/brand/therapygo-lockup-horizontal.png"
            alt="TherapyGo"
            width={1086}
            height={362}
            sizes="(max-width: 640px) 260px, 340px"
            priority
          />
          <p className={styles.kicker}>Кабинет клиента</p>
          <h1 id="therapygo-login-title" className={styles.title}>
            Всё, что назначил специалист — рядом
          </h1>
          <p className={styles.description}>
            Программы, упражнения, встречи и материалы — в одном месте.
          </p>
          <div className={styles.auth}>{children}</div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© TherapyGo · платформа Therapysto</span>
        <LegalFooterLinks supportHref={supportContactHref} />
      </footer>
    </div>
  );
}
