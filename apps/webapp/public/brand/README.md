# Brand assets

## Application icon sources

- `therapygo-app-icon-source.png` — Therapy Go, mark with the sphere. Use for the patient Capacitor application and the patient-installable web app on iOS and Android.
- `therapysto-app-icon-source.png` — Therapysto, mark without the sphere. Use for the specialist Capacitor application and the specialist-installable web app on iOS and Android.

These are the original supplied PNG assets. Keep them unchanged and derive platform-specific Android and PWA icon sizes from them.

Regenerate all derived Android and web assets with:

```bash
pnpm --dir apps/mobile-shell run derive:brand-assets
```

The command emits transparent square PWA assets for each product: `*-pwa-icon-192.png`,
`*-pwa-icon-512.png`, `*-pwa-icon-maskable-512.png`, and `*-apple-touch-icon.png`. The centred
mark occupies 66% of the canvas, within the maskable safe zone.

The existing black platform-administrator icon and blue future clinic-branding icon are outside this replacement and remain available.
