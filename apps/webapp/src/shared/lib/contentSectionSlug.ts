/** Валидация slug раздела контента (doctor CMS + rename). */

export type ContentSectionSlugValidation = { ok: true; slug: string } | { ok: false; error: string };

export function validateContentSectionSlug(raw: string): ContentSectionSlugValidation {
  const slug = raw.trim();
  if (!slug) return { ok: false, error: "Заполните slug" };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Slug: только латиница, цифры и дефис" };
  }
  if (/^-+$/.test(slug)) {
    return { ok: false, error: "Slug не может состоять только из дефисов" };
  }
  return { ok: true, slug };
}
