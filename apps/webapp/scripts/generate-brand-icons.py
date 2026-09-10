#!/usr/bin/env python3
"""Пересборка иконок приложений из брендовых исходников.

Владелец 10.09.2026: «те что сейчас лежат — слишком большие поля белого, иконки смотрятся мелковато…
оцени как лучше (какие поля обычно делают) чтобы было не от края до края но и не мелко».

Ответ не одно число: поле зависит от того, кто рисует иконку на экране, и именно поэтому один кроп
руками не годится — из одного и того же глифа нужны РАЗНЫЕ поля. Нормы зашиты в SPECS ниже, каждая
со своим основанием. Граница глифа считается по альфа-каналу, а не отмеряется на глаз, поэтому
срезать лишнего физически нечем.

Запуск (из `apps/webapp/public`): python3 ../scripts/generate-brand-icons.py
"""

from PIL import Image
import numpy as np

def glyph(path):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    ys, xs = np.where(a[..., 3] > 10)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

def render(g, size, fill, bg=None):
    """fill — доля холста, которую занимает САМАЯ ДЛИННАЯ сторона глифа."""
    target = size * fill
    scale = target / max(g.size)
    w, h = max(1, round(g.size[0] * scale)), max(1, round(g.size[1] * scale))
    small = g.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), bg if bg else (0, 0, 0, 0))
    canvas.alpha_composite(small, ((size - w) // 2, (size - h) // 2))
    return canvas

WHITE = (255, 255, 255, 255)
# Доли взяты из платформенных правил, а не на глаз:
#   favicon      — на 16–32 px каждый пиксель на счету, поля почти не нужны;
#   PWA «any»    — иконка показывается как есть, небольшое поле по краю;
#   apple-touch  — сетка Apple: содержимое ≈80% холста, фон непрозрачный (iOS игнорирует альфу);
#   maskable     — безопасная зона Android/PWA это КРУГ диаметром 80% холста, поэтому квадратный
#                  глиф вписывается стороной ≈0.8/√2≈0.57; берём 0.58 и заливаем фон до края.
SPECS = [
    ('favicon-32.png',            32,  0.94, None),
    ('pwa-icon-192.png',         192,  0.88, None),
    ('pwa-icon-512.png',         512,  0.88, None),
    ('pwa-icon-maskable-512.png',512,  0.58, WHITE),
    ('apple-touch-icon.png',     180,  0.80, WHITE),
]

for brand, src in (('therapysto', 'brand/therapysto-app-icon-source.png'),
                   ('therapygo', 'brand/therapygo-app-icon-source.png')):
    g = glyph(src)
    for suffix, size, fill, bg in SPECS:
        out = f'{brand}-{suffix}'
        render(g, size, fill, bg).save(out, optimize=True)
        print(f'{out:44s} {size}x{size} fill={fill:.0%} bg={"white" if bg else "transparent"}')
