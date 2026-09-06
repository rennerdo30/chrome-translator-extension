# Chrome Web Store Listing — AI Translator

Everything needed to fill in the Chrome Web Store Developer Dashboard.

## Basics

- **Name**: AI Translator
- **Category**: Productivity → Tools
- **Language**: English (add German as a second listing language — the extension UI ships `en` and `de` locales)
- **Privacy policy URL**: `https://github.com/rennerdo30/chrome-translator-extension/blob/main/PRIVACY.md`
  (or a GitHub Pages URL if preferred — the dashboard requires a working link)

## Summary (max 132 characters)

> Translate any website or image with your own AI: local models (LM Studio, Ollama) or cloud APIs (OpenAI, DeepSeek). Privacy-first.

German:

> Übersetze Webseiten und Bilder mit eigener KI: lokale Modelle (LM Studio, Ollama) oder Cloud-APIs (OpenAI, DeepSeek). Privat.

## Detailed description (EN)

```
Translate any web page — and even images — using AI models YOU control.

AI Translator connects to your own AI provider instead of a translation service:
• Local models via LM Studio or Ollama: page content never leaves your machine
• Cloud APIs: OpenAI, DeepSeek, or any OpenAI-compatible endpoint (OpenRouter, proxies, …)

LIKE AN i18n LAYER FOR ANY WEBSITE
Every translated segment is cached on your device. Enable "Auto-translate this
site" and revisited pages render in your language instantly — only new or
changed text is sent to the AI. Identical strings are translated once,
single-page apps and lazy-loaded content are picked up automatically.

IMAGE TRANSLATION
Right-click any image → "Translate image with AI". A built-in OCR engine
extracts the text inside your browser (no extra setup or API key), your AI
provider translates it, and the result is shown on the image.

FEATURES
• 16 target languages
• Configurable parallel requests and batch size per provider
• Editable model picker with recommendations plus live model detection
• Hover any translated text to see the original; restore with one click
• Cache export/import to move your translations between browsers
• English and German UI

PRIVACY
No telemetry, no developer servers, no accounts. Data goes only to the AI
endpoint you configure. See the privacy policy for details.
```

## Detailed description (DE)

```
Übersetze jede Webseite — und sogar Bilder — mit KI-Modellen, die DU kontrollierst.

AI Translator verbindet sich mit deinem eigenen KI-Anbieter:
• Lokale Modelle über LM Studio oder Ollama: Seiteninhalte verlassen deinen Rechner nicht
• Cloud-APIs: OpenAI, DeepSeek oder jeder OpenAI-kompatible Endpunkt

WIE EINE i18n-EBENE FÜR JEDE WEBSEITE
Jedes übersetzte Segment wird lokal zwischengespeichert. Mit „Diese Seite
automatisch übersetzen" erscheinen besuchte Seiten sofort in deiner Sprache —
nur neuer oder geänderter Text geht an die KI. Single-Page-Apps und
nachgeladene Inhalte werden automatisch erkannt.

BILDÜBERSETZUNG
Rechtsklick auf ein Bild → „Bild mit KI übersetzen". Die integrierte
Texterkennung läuft im Browser (keine Einrichtung nötig), dein Anbieter
übersetzt, das Ergebnis erscheint am Bild.

DATENSCHUTZ
Keine Telemetrie, keine Entwickler-Server, keine Konten. Daten gehen nur an
den von dir konfigurierten KI-Endpunkt.
```

## Single purpose statement

> Translates web page content and image text into the user's chosen language using an AI endpoint the user configures.

## Permission justifications (dashboard "Privacy practices" tab)

| Permission | Justification |
|---|---|
| `activeTab` | Determine the current tab to translate when the user clicks the toolbar popup or context menu. |
| `storage` | Persist user settings (provider, API key, languages) in sync storage and the translation cache in local storage. |
| `scripting` | Inject the content script that replaces page text with translations when it is not yet loaded (e.g. context-menu use on an already-open tab). |
| `contextMenus` | Provide the "Translate with AI" and "Translate image with AI" right-click entries. |
| `offscreen` | Host the bundled Tesseract OCR engine (an offscreen document running a Web Worker) for image translation. |
| Host permission `https://*/*` | Two needs: (1) the user may configure any OpenAI-compatible API endpoint, whose origin is unknown in advance; (2) the service worker fetches images the user asks to translate from the page's origin. |
| Host permissions `http://localhost:*/*`, `http://127.0.0.1:*/*` | Reach local AI servers (LM Studio on :1234, Ollama on :11434) — the privacy-first mode of this extension. |
| Content script on `http://*/*`, `https://*/*` | Translation must work on any site the user chooses; per-site auto-translate needs the script present at page load. The script is inert unless the user translates or has opted the site in. |

## Data-use disclosures (check in dashboard)

- **Website content** — collected: yes (page text / image text), transmitted to: the AI endpoint the user configures, purpose: app functionality (translation). Not sold, not used for unrelated purposes, not used for creditworthiness.
- **Authentication information** — the user's API key is stored in browser sync storage and sent only to the user's configured endpoint.
- Everything else (location, web history, user activity, personal communications…): **not collected**.
- Remote code: **none** (Tesseract.js is bundled; OCR language files are data, not code).

## Assets checklist

- [x] Icon 128×128 (`icons/icon128.png`)
- [ ] 1–5 screenshots, 1280×800 or 640×400 PNG (popup with settings; a translated page with progress UI; image translation overlay)
- [ ] Optional small promo tile 440×280

## Packaging

The store upload ZIP is produced by CI (see `.github/workflows/release.yml`) or manually:

```bash
zip -r ai-translator.zip manifest.json background.js content.js content.css \
  popup.html popup.js offscreen.html offscreen.js icons/ vendor/ _locales/
```

Do not include `.git`, `.github`, docs, or CLAUDE.md in the store package.
