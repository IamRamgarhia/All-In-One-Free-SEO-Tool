# SEO Tool — Browser Extension

A lightweight Chrome / Edge extension that pairs with the SEO Tool desktop
app. It adds a popup + right-click menu so you can capture the current page
into your tool with one click — no copy/paste.

## What it does

**Popup** (click the extension icon):
- Shows the current tab's title + URL
- **Add as client** — opens `/clients/new` with the URL prefilled
- **Add as competitor** — opens `/competitors`
- **Watch changes** — opens `/monitor` with the URL prefilled
- **Audit now** — opens `/grader` with the URL prefilled

**Right-click context menu** (any page or link):
- Add this site as a client
- Add as competitor
- Audit this URL
- Watch this page for changes

## Install (developer mode)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Toggle **Developer mode** in the top-right
3. Click **Load unpacked**
4. Pick the `extension/` folder of this repo
5. Pin the icon to your toolbar

## Configuration

The extension assumes the SEO Tool runs at `http://localhost:3000`. If
you use a different port, click the ⚙ icon in the popup and update.

## Icons

Place `icon-16.png`, `icon-48.png`, `icon-128.png` under `extension/icons/`.
The manifest references these but they're not bundled — drop in your own
square logos (PNG with transparent background works best).

## Files

- `manifest.json` — Manifest v3 declaration
- `popup.html` / `popup.js` — toolbar popup UI
- `background.js` — service worker, registers context menus
- `content.js` — runs on every page, extracts meta on demand
