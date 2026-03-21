import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const pages = [
  { section: "emergency", slug: "back-pain", title: "Острая боль в спине", summary: "Быстрые рекомендации и безопасные первые шаги.", body_html: "", sort_order: 1 },
  { section: "emergency", slug: "neck-pain", title: "Острая боль в шее", summary: "Короткие рекомендации для снижения нагрузки.", body_html: "", sort_order: 2 },
  { section: "emergency", slug: "panic-attack", title: "Паническая атака", summary: "Поддерживающий сценарий с базовым дыханием.", body_html: "", sort_order: 3 },
  { section: "lessons", slug: "neck-warmup", title: "Разминка для шеи", summary: "Короткая сессия для безопасного старта дня.", body_html: "", sort_order: 1 },
  { section: "lessons", slug: "back-basics", title: "Базовые принципы разгрузки спины", summary: "Объяснение базовых привычек.", body_html: "", sort_order: 2 },
  { section: "lessons", slug: "breathing-reset", title: "Дыхательная пауза при стрессе", summary: "Короткая практика для быстрого восстановления.", body_html: "", sort_order: 3 },
];

async function seed() {
  for (const p of pages) {
    await pool.query(
      `INSERT INTO content_pages (section, slug, title, summary, body_html, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (section, slug) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()`,
      [p.section, p.slug, p.title, p.summary, p.body_html, p.sort_order]
    );
  }
  console.log(`Seeded ${pages.length} content pages.`);
  await pool.end();
}

seed().catch((e) => { console.error(e); process.exit(1); });
