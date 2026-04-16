#!/usr/bin/env bash
# Guard: Media Preview must use shared URL helpers and MediaThumb — no raw /api/media/.../preview in app code,
# no <img src={*.url}> in list/grid/picker, no preview URL props on <img> outside MediaThumb.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0

LIST_PATHS=(
  src/shared/ui/media
  src/app/app/doctor/content
  src/app/app/doctor/exercises
  src/app/app/patient/diary/lfk
)

if rg -n '<img[^>\n]*src=\{\s*item\.url\s*\}' \
  "${LIST_PATHS[@]}" \
  --glob '*.tsx' \
  --glob '!**/*Lightbox*' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: forbidden <img src={item.url}> in list/grid/picker paths"
  rg -n '<img[^>\n]*src=\{\s*item\.url\s*\}' "${LIST_PATHS[@]}" \
    --glob '*.tsx' \
    --glob '!**/*Lightbox*' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

if rg -n '<img[^>\n]*src=\{\s*complex\.coverImageUrl' \
  "${LIST_PATHS[@]}" \
  --glob '*.tsx' \
  --glob '!**/*Lightbox*' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: forbidden <img src={complex.coverImageUrl}> (LFK list must use preview only)"
  rg -n '<img[^>\n]*src=\{\s*complex\.coverImageUrl' "${LIST_PATHS[@]}" \
    --glob '*.tsx' \
    --glob '!**/*Lightbox*' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

if rg -n '<img[^>\n]*src=\{\s*[A-Za-z0-9_.]+\.url\s*\}' \
  "${LIST_PATHS[@]}" \
  --glob '*.tsx' \
  --glob '!**/*Lightbox*' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: forbidden <img src={*.url}> in list/grid/picker paths (use MediaThumb / preview URLs)"
  rg -n '<img[^>\n]*src=\{\s*[A-Za-z0-9_.]+\.url\s*\}' "${LIST_PATHS[@]}" \
    --glob '*.tsx' \
    --glob '!**/*Lightbox*' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

if rg -n '<img[^>\n]*src=\{\s*[^}]+\.coverImageUrl' \
  "${LIST_PATHS[@]}" \
  --glob '*.tsx' \
  --glob '!**/*Lightbox*' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: forbidden <img src={*.coverImageUrl}> in list/grid/picker paths"
  rg -n '<img[^>\n]*src=\{\s*[^}]+\.coverImageUrl' "${LIST_PATHS[@]}" \
    --glob '*.tsx' \
    --glob '!**/*Lightbox*' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

# previewSmUrl / previewMdUrl on <img> must only appear inside MediaThumb.tsx
if rg -n '<img[^>\n]*src=\{\s*[^}]+\.preview(Sm|Md)Url' \
  src \
  --glob '*.tsx' \
  --glob '!**/MediaThumb.tsx' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: forbidden <img src={*.previewSmUrl|previewMdUrl}> outside MediaThumb.tsx"
  rg -n '<img[^>\n]*src=\{\s*[^}]+\.preview(Sm|Md)Url' \
    src \
    --glob '*.tsx' \
    --glob '!**/MediaThumb.tsx' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

# Literal preview path construction outside shared/lib/mediaPreviewUrls.ts (allow Next route handlers + comments in types).
if rg -n '/api/media/[^\s\"'\''`]*/preview/(sm|md)' \
  src \
  --glob '*.ts' \
  --glob '*.tsx' \
  --glob '!**/shared/lib/mediaPreviewUrls.ts' \
  --glob '!**/modules/media/types.ts' \
  --glob '!**/app/api/media/**' \
  --glob '!**/*.test.ts' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: forbidden /api/media/.../preview/sm|md string outside shared/lib/mediaPreviewUrls.ts (and API route files)"
  rg -n '/api/media/[^\s\"'\''`]*/preview/(sm|md)' \
    src \
    --glob '*.ts' \
    --glob '*.tsx' \
    --glob '!**/shared/lib/mediaPreviewUrls.ts' \
    --glob '!**/modules/media/types.ts' \
    --glob '!**/app/api/media/**' \
    --glob '!**/*.test.ts' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

if rg -n 'API_MEDIA_ID_RE' \
  src \
  --glob '*.ts' \
  --glob '*.tsx' \
  --glob '!**/shared/lib/mediaPreviewUrls.ts' \
  --glob '!**/*.test.ts' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: API_MEDIA_ID_RE must only appear in shared/lib/mediaPreviewUrls.ts"
  rg -n 'API_MEDIA_ID_RE' \
    src \
    --glob '*.ts' \
    --glob '*.tsx' \
    --glob '!**/shared/lib/mediaPreviewUrls.ts' \
    --glob '!**/*.test.ts' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

if rg -n '^\s*(export\s+)?(const|let|var)\s+API_MEDIA_ID_RE\b' \
  src \
  --glob '*.ts' \
  --glob '*.tsx' \
  --glob '!**/shared/lib/mediaPreviewUrls.ts' \
  --glob '!**/*.test.ts' \
  --glob '!**/*.test.tsx' \
  2>/dev/null | grep -q .; then
  echo "check-media-preview-invariants: forbidden local API_MEDIA_ID_RE declaration outside shared/lib/mediaPreviewUrls.ts"
  rg -n '^\s*(export\s+)?(const|let|var)\s+API_MEDIA_ID_RE\b' \
    src \
    --glob '*.ts' \
    --glob '*.tsx' \
    --glob '!**/shared/lib/mediaPreviewUrls.ts' \
    --glob '!**/*.test.ts' \
    --glob '!**/*.test.tsx' || true
  fail=1
fi

exit "$fail"
