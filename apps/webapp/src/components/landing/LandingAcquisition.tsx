import Image from 'next/image';
import Link from 'next/link';

const workflow = [
  {
    number: '01',
    title: 'До встречи',
    text: 'Запись появляется в расписании. Специалист видит время, формат, жалобы прошлого визита и выполнение программы.',
  },
  {
    number: '02',
    title: 'Во время',
    text: 'В карточке клиента остаются история встреч, заметки, программа, задачи и дневник.',
  },
  {
    number: '03',
    title: 'Между встречами',
    text: 'Клиент выполняет назначения, отмечает прогресс и может задать вопрос по конкретному упражнению.',
  },
] as const;

const libraryItems = [
  'Упражнения',
  'Комплексы ЛФК',
  'Клинические тесты',
  'Рекомендации',
  'Шаблоны программ',
] as const;

const questions = [
  {
    question: 'Что видит клиент?',
    answer:
      'Свою программу, назначенные упражнения и рекомендации, дневник, запись на приём и сообщения специалисту. Рабочие разделы кабинета ему недоступны.',
  },
  {
    question: 'Нужно ли клиенту устанавливать приложение?',
    answer:
      'Нет. Пространство клиента открывается в браузере телефона. При желании его можно закрепить на главном экране.',
  },
  {
    question: 'Можно ли загружать свои упражнения и видео?',
    answer:
      'Да. В рабочую библиотеку можно добавить собственные упражнения и видео, а затем включать их в программу конкретного клиента.',
  },
  {
    question: 'Где хранятся данные и кто имеет к ним доступ?',
    answer:
      'Боевые данные и файлы хранятся в российских дата-центрах. Специалист работает с карточками своих клиентов, а клиент видит только собственное пространство.',
  },
  {
    question: 'Сколько это стоит?',
    answer:
      'После пробного периода — 1 990 ₽ в месяц. До подключения тарифа банковская карта не требуется.',
    id: 'price',
  },
  {
    question: 'Как перенести текущих клиентов?',
    answer:
      'Сейчас клиентов добавляют в кабинет вручную. Автоматический импорт на этапе запуска не заявлен.',
  },
  {
    question: 'Для каких специалистов подходит Therapysto?',
    answer:
      'Сейчас Therapysto сделан для реабилитологов и специалистов по движению. Другие направления появятся позже.',
  },
] as const;

const riskLine = '14 дней бесплатно · без карты · данные хранятся в России';

const audiences = [
  'реабилитологов',
  'терапевтов',
  'нутрициологов',
  'психологов',
  'коучей',
  'специалистов по движению',
] as const;

const practiceModes = [
  {
    crop: 'massage',
    title: 'Запись и общение',
    text: 'Расписание, карточка клиента и переписка остаются в одном рабочем контексте.',
    alt: 'Специалист проводит сеанс массажа',
  },
  {
    crop: 'movement',
    title: 'Программы и сопровождение',
    text: 'Упражнения с видео, рекомендации и выполнение между встречами собраны в программе клиента.',
    alt: 'Специалист помогает клиентке выполнять упражнение',
  },
  {
    crop: 'conversation',
    title: 'Заметки и история встреч',
    text: 'Контекст сохраняется в карточке клиента — его не приходится восстанавливать перед следующим приёмом.',
    alt: 'Специалист беседует с клиенткой и ведёт записи',
  },
  {
    crop: 'online',
    title: 'Очно и дистанционно',
    text: 'Видеовстреча, сообщения и назначенная работа продолжаются в том же пространстве.',
    alt: 'Клиент участвует в видеовстрече со специалистом',
  },
] as const;

export function LandingAcquisition() {
  return (
    <main className="main-site">
      <header className="site-header">
        <Link className="main-brand" href="#top" aria-label="Therapysto — к началу страницы">
          <Image
            alt=""
            height={911}
            priority
            src="/brand/therapysto-mark.png"
            unoptimized
            width={1006}
          />
          <span>Therapysto</span>
        </Link>
        <nav className="site-nav" aria-label="Основная навигация">
          <a href="#workspace">Рабочий день</a>
          <a href="#client-work">Работа с клиентом</a>
          <a href="#library">Возможности</a>
          <a href="#price">Цены</a>
        </nav>
        <Link className="site-login" href="/app">
          Войти
        </Link>
      </header>

      <section className="main-hero" id="top" aria-labelledby="hero-title">
        <div className="main-hero-center">
          <Image
            alt="Therapysto"
            className="main-lockup"
            height={981}
            priority
            src="/brand/therapysto-lockup-vertical.png"
            unoptimized
            width={1003}
          />
          <div className="main-hero-copy">
            <h1 id="hero-title">Вся ваша практика в одном месте.</h1>
            <p className="hero-care-line">
              <span>Вы заботитесь о клиентах —</span>
              <span>мы заботимся о вас.</span>
            </p>
            <div className="main-audience-line">
              <span>Для</span>
              <span className="main-audience-window" aria-hidden="true">
                <span className="main-audience-track">
                  {audiences.map((audience) => (
                    <span key={audience}>{audience}</span>
                  ))}
                  <span>{audiences[0]}</span>
                </span>
              </span>
              <span className="sr-only">
                реабилитологов, терапевтов, нутрициологов, психологов, коучей и специалистов по
                движению
              </span>
            </div>
          </div>
          <div className="main-hero-actions">
            <Link className="main-primary" href="/app?intent=specialist">
              Создать кабинет
            </Link>
            <Link className="main-secondary" href="#workspace">
              Посмотреть, как устроено
            </Link>
          </div>
        </div>
      </section>

      <section className="practices-section" aria-labelledby="practices-title">
        <div className="section-shell">
          <div className="practices-intro">
            <p className="section-kicker">Для разных практик</p>
            <h2 id="practices-title">
              Забота может быть разной. Therapysto — одно пространство для всех.
            </h2>
            <p>
              Приём может проходить в кабинете, в зале или по видео. Therapysto связывает рабочие
              процессы вокруг клиента, не заставляя специалиста подстраивать практику под сервис.
            </p>
          </div>
          <div className="practices-grid">
            {practiceModes.map((practice) => (
              <article
                className={`practice-item practice-item-${practice.crop}`}
                key={practice.crop}
              >
                <figure className={`practice-visual practice-crop-${practice.crop}`}>
                  <Image
                    alt={practice.alt}
                    fill
                    sizes="(max-width: 720px) 94vw, 44vw"
                    src="/landing/care-practices.jpg"
                    unoptimized
                  />
                </figure>
                <div className="practice-copy">
                  <h3>{practice.title}</h3>
                  <p>{practice.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="time-section" aria-labelledby="time-title">
        <div className="time-stage">
          <figure className="time-visual">
            <Image
              alt="Специалист за рабочим столом — больше времени на главное"
              fill
              sizes="100vw"
              src="/landing/time-for-what-matters.jpg"
              unoptimized
            />
          </figure>
          <div className="time-copy">
            <p className="section-kicker">Рабочее пространство</p>
            <h2 id="time-title">Запись, заметки и назначения — части одного процесса.</h2>
            <p>
              Не нужно помнить, где лежит история клиента, как отправить программу и в каком чате
              осталось сообщение. Открываете карточку и продолжаете работу с того места, где
              остановились.
            </p>
          </div>
        </div>
      </section>

      <aside className="trust-line" aria-label="О продукте">
        <span>Сделано практикующим реабилитологом.</span>
        <span>
          Работает в собственной практике с 2025 года: около 200 клиентов и 1 500 выполненных
          программ.
        </span>
      </aside>

      <section className="workspace-section" id="workspace" aria-labelledby="workspace-title">
        <div className="workspace-ribbon" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="section-shell workspace-heading">
          <div>
            <p className="section-kicker">Рабочий день специалиста</p>
            <h2 id="workspace-title">Все ваши потребности в одном приложении.</h2>
          </div>
          <div className="workspace-copy">
            <p>
              Расписание в одном сервисе, заметки в таблице, программа ссылками в мессенджере. Перед
              каждым приёмом контекст приходится собирать заново.
            </p>
            <p>
              В Therapysto запись, клиент, программа и сообщения связаны между собой. На экране
              «Сегодня» — ближайшая запись, задачи, сообщения и динамика; из него один переход в
              расписание или карточку.
            </p>
          </div>
        </div>
        <div className="workspace-proof-stage">
          <figure className="workspace-product">
            <Image
              alt="Экран Сегодня в кабинете Дмитрия Берсона с ближайшей записью, задачами и динамикой"
              fill
              sizes="(max-width: 760px) 94vw, 86vw"
              src="/product/doctor-today.png"
              unoptimized
            />
          </figure>
          <figure className="workspace-mobile-product">
            <Image
              alt="Мобильный экран Сегодня в кабинете Дмитрия Берсона"
              fill
              sizes="(max-width: 760px) 64vw, 22vw"
              src="/product/doctor-mobile-today.png"
              unoptimized
            />
          </figure>
        </div>
      </section>

      <section className="workflow-section" aria-labelledby="workflow-title">
        <div className="section-shell">
          <div className="workflow-intro">
            <p className="section-kicker">Как устроена работа</p>
            <h2 id="workflow-title">От первой записи до работы между встречами.</h2>
          </div>
          <div className="workflow-list">
            {workflow.map((item) => (
              <article className="workflow-item" key={item.number}>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <div className="workflow-proof" aria-label="Расписание и карточка клиента Therapysto">
            <figure>
              <Image
                alt="Расписание специалиста в Therapysto"
                fill
                sizes="(max-width: 760px) 92vw, 58vw"
                src="/product/doctor-schedule.png"
                unoptimized
              />
            </figure>
            <figure>
              <Image
                alt="Мобильная карточка клиента в кабинете специалиста"
                fill
                sizes="(max-width: 760px) 66vw, 24vw"
                src="/product/doctor-mobile-client.png"
                unoptimized
              />
            </figure>
          </div>
        </div>
      </section>

      <section className="patient-section" id="client-work" aria-labelledby="patient-title">
        <div className="section-shell patient-layout">
          <div className="patient-copy">
            <p className="section-kicker">Работа между встречами</p>
            <h2 id="patient-title">Клиент знает, что делать после встречи.</h2>
            <p>
              Назначенная программа открывается у него в телефоне: упражнения с видео и инструкцией,
              рекомендации, отметка выполнения и вопрос специалисту по конкретному упражнению.
              Приложение устанавливать не нужно.
            </p>
            <p>Вы видите до приёма, что было сделано, в какие дни и где болело.</p>
            <p className="patient-note">
              Клиент видит только своё пространство — без рабочих разделов специалиста.
            </p>
          </div>
          <div className="patient-proof">
            <figure className="patient-doctor-response">
              <span>Что видит специалист</span>
              <Image
                alt="Календарь выполнения программы в карточке клиента"
                fill
                sizes="(max-width: 760px) 92vw, 44vw"
                src="/product/doctor-client.png"
                unoptimized
              />
            </figure>
            <div className="patient-screens" aria-label="Программа и упражнение на стороне клиента">
              <figure className="patient-screen patient-screen-program">
                <Image
                  alt="Программа клиента в Therapysto"
                  fill
                  sizes="(max-width: 760px) 58vw, 18vw"
                  src="/product/patient-program.png"
                  unoptimized
                />
              </figure>
              <figure className="patient-screen patient-screen-exercise">
                <Image
                  alt="Экран выполнения упражнения с видео и отметкой выполнения"
                  fill
                  sizes="(max-width: 760px) 58vw, 18vw"
                  src="/product/patient-exercise.png"
                  unoptimized
                />
              </figure>
            </div>
          </div>
        </div>
      </section>

      <section className="client-section" aria-labelledby="client-title">
        <div className="section-shell client-layout">
          <div className="client-copy">
            <p className="section-kicker">Карточка клиента</p>
            <h2 id="client-title">Не вспоминать всё заново перед приёмом.</h2>
            <p>
              История встреч, заметки, назначения и выполнение хранятся в одной карточке. Открываете
              её — и видите, что происходило с прошлого раза.
            </p>
            <p>
              Программа строится по этапам: у каждого этапа цель, задачи и тест, по которому этап
              закрывается.
            </p>
            <dl className="client-facts">
              <div>
                <dt>На приёме</dt>
                <dd>история, заметки и назначения</dd>
              </div>
              <div>
                <dt>После</dt>
                <dd>программа и выполнение по дням</dd>
              </div>
            </dl>
          </div>
          <div className="client-product-stack">
            <figure className="client-product">
              <Image
                alt="Карточка клиента Дмитрия Берсона с программой и календарём выполнения"
                fill
                sizes="(max-width: 760px) 94vw, 61vw"
                src="/product/doctor-client.png"
                unoptimized
              />
            </figure>
            <figure className="client-mobile-product">
              <Image
                alt="Мобильная карточка клиента в кабинете Дмитрия Берсона"
                fill
                sizes="(max-width: 760px) 64vw, 21vw"
                src="/product/doctor-mobile-client.png"
                unoptimized
              />
            </figure>
          </div>
        </div>
      </section>

      <section className="library-section" id="library" aria-labelledby="library-title">
        <div className="section-shell library-layout">
          <div className="library-copy">
            <p className="section-kicker">Рабочая библиотека</p>
            <h2 id="library-title">Не начинать каждое назначение с нуля.</h2>
            <p>
              Свои упражнения и видео, снятые на приёме, готовые материалы и тесты собираются в
              программу конкретного клиента и выстраиваются в последовательный план.
            </p>
          </div>
          <ol className="library-list">
            {libraryItems.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="author-section" aria-labelledby="author-title">
        <div className="section-shell author-layout">
          <div className="author-copy">
            <p className="section-kicker">О продукте</p>
            <h2 id="author-title">Кто это сделал.</h2>
            <p>
              Дмитрий Берсон — реабилитолог, кинезиолог и остеопат. С 2014 года занимается
              восстановлением при боли и после травм и операций. Therapysto собран для собственной
              практики и используется в ней ежедневно. На вопросы по продукту отвечает автор.
            </p>
            <a href="https://dmitryberson.ru" target="_blank" rel="noreferrer">
              dmitryberson.ru <span aria-hidden="true">↗</span>
            </a>
          </div>
          <figure className="author-portrait">
            <Image
              alt="Дмитрий Берсон"
              fill
              sizes="(max-width: 760px) 78vw, 30vw"
              src="/brand/dmitry-berson.png"
              unoptimized
            />
          </figure>
        </div>
      </section>

      <section className="faq-section" aria-labelledby="faq-title">
        <div className="section-shell faq-layout">
          <div className="faq-heading">
            <p className="section-kicker">По существу</p>
            <h2 id="faq-title">Перед тем как начать.</h2>
          </div>
          <div className="faq-list">
            {questions.map((item) => (
              <details {...('id' in item ? { id: item.id } : {})} key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="final-section" aria-labelledby="final-title">
        <div className="final-ribbon" aria-hidden="true">
          <i />
        </div>
        <div className="section-shell final-copy">
          <Image alt="" height={911} src="/brand/therapysto-mark.png" unoptimized width={1006} />
          <h2 id="final-title">Забота не заканчивается после приёма.</h2>
          <Link className="final-action" href="/app?intent=specialist">
            Создать кабинет
          </Link>
          <p className="risk-line risk-line-light">{riskLine}</p>
        </div>
      </section>

      <footer className="site-footer">
        <Link className="main-brand" href="#top">
          <Image alt="" height={911} src="/brand/therapysto-mark.png" unoptimized width={1006} />
          <span>Therapysto</span>
        </Link>
        <p>Кабинет реабилитолога и специалиста по движению.</p>
        <div>
          <Link href="/app">Войти</Link>
          <a href="https://dmitryberson.ru" target="_blank" rel="noreferrer">
            Автор
          </a>
        </div>
      </footer>
    </main>
  );
}
