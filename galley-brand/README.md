# Galley brand kit

In this repository the drop-in files below are already in place in the site root, and `index.html` has the `<head>` snippet (with the live address in `og:image`). This folder keeps the logos; the editor's header uses `galley-lockup-light.svg`, or `galley-lockup-dark.svg` in dark mode.

## Drop-in layout

Put these four in the **site root**, next to `index.html`:

```
favicon.ico
favicon.svg
apple-touch-icon.png
site.webmanifest
```

Put `icons/` and `social/` alongside them. `logo/` is for documents, slides, the README and Moodle. The site itself doesn't need it.

## `<head>` snippet

```html
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#B3261E">

<meta property="og:title" content="Galley">
<meta property="og:image" content="https://YOUR-USER.github.io/galley/social/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

`og:image` must be an absolute URL. Relative paths fail on most link unfurlers (Teams, Slack, LinkedIn).

## Which logo where

| Use | File |
|---|---|
| Default, anywhere with colour | `galley-mark-red` / `galley-lockup-light` |
| Dark slides, dark UI | `galley-lockup-dark` (red mark, cream wordmark) |
| Mono, light background (print, photocopy) | `galley-mark-black` / `galley-lockup-mono-light` |
| Mono, dark background | `galley-mark-inverse` / `galley-lockup-mono-dark` |
| Watermark, emboss, no block | `galley-g-glyph.svg` |
| Wordmark only | `galley-wordmark-ink` / `-paper` |

Lockup PNGs have transparent backgrounds. Make sure the background you place them on matches the variant: light lockups on light backgrounds, dark lockups on dark ones.

## Colours

| | Hex |
|---|---|
| Printer's red | `#B3261E` |
| Ink | `#1B1A17` |
| Paper | `#F4EFE4` |

## Type

- Mark: Libre Caslon Text Bold, converted to outlines
- Wordmark: Libre Caslon Display, converted to outlines

Both fonts are free from Google Fonts (SIL Open Font License). The SVGs are outlines, so they need no web fonts. Use the same faces for UI headings to keep things consistent.
