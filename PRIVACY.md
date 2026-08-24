# Privacy Policy — AI Translator

*Last updated: 2026-08-18*

AI Translator is a browser extension that translates web pages and images using an AI provider **you configure yourself**. It is built privacy-first: the developer operates no servers, and no data is ever sent to the developer.

## What data is processed, and where it goes

- **Web page text**: When you start a translation (via the popup, the context menu, or a site you explicitly enabled auto-translate for), the visible text of that page is sent to the **AI endpoint you configured** — a local server (LM Studio, Ollama) or a cloud API (OpenAI, DeepSeek, or any OpenAI-compatible endpoint). With a local provider, page text never leaves your machine.
- **Images**: When you use "Translate image with AI", the image is processed by the **built-in OCR engine inside your browser** by default; only the extracted *text* is then sent to your configured translation endpoint. If you switch to "vision model endpoint" mode, the image itself is sent to the vision endpoint you configured.
- **API keys**: Stored in `chrome.storage.sync`, which is encrypted and synced by your browser as part of your browser profile. Keys are only ever sent to the corresponding API endpoint you configured.
- **Settings** (provider, URLs, model, target language, execution settings, auto-translate site list): stored in `chrome.storage.sync`.
- **Translation caches**: Stored locally on your device in `chrome.storage.local`. They never leave your device unless you use the manual "Export Cache" feature.
- **OCR language data**: The built-in OCR downloads language files (data, not code) from the tessdata CDN (`tessdata.projectnaptha.com`) once and caches them.

## What is NOT collected

- No analytics, telemetry, or usage statistics.
- No data is sent to the extension developer — there is no developer server.
- No browsing history is recorded.
- No data is sold or shared with third parties. The only parties receiving data are the AI endpoints **you** configure.

## Your choices

- Use a local provider (LM Studio, Ollama) and the built-in OCR to keep all content on your machine.
- Auto-translate only runs on sites you explicitly enable; disable it per site at any time.
- Remove the extension to delete all locally stored data; clear synced settings via your browser's sync settings.

## Third-party services

If you configure a cloud provider, that provider's privacy policy applies to the text (or, in vision-endpoint mode, images) sent to it — e.g. [OpenAI](https://openai.com/policies/privacy-policy/) or [DeepSeek](https://platform.deepseek.com/downloads/DeepSeek%20Privacy%20Policy.html).

## Contact

Questions: open an issue at <https://github.com/rennerdo30/chrome-translator-extension/issues>.

---

# Datenschutzerklärung — AI Translator (Deutsch)

*Stand: 18.08.2026*

AI Translator übersetzt Webseiten und Bilder über einen **von Ihnen selbst konfigurierten** KI-Anbieter. Der Entwickler betreibt keine Server; es werden niemals Daten an den Entwickler gesendet.

## Verarbeitete Daten

- **Seitentext**: Wird beim Start einer Übersetzung an den von Ihnen konfigurierten Endpunkt gesendet — lokal (LM Studio, Ollama) oder Cloud (OpenAI, DeepSeek u. a.). Bei lokalen Anbietern verlässt der Text Ihren Rechner nicht.
- **Bilder**: Standardmäßig erfolgt die Texterkennung **im Browser** (integrierte OCR); nur der erkannte Text geht an den Übersetzungsanbieter. Im Modus „Vision-Endpunkt" wird das Bild an den von Ihnen konfigurierten Vision-Endpunkt gesendet.
- **API-Schlüssel und Einstellungen**: In `chrome.storage.sync` gespeichert (vom Browser verschlüsselt und synchronisiert).
- **Übersetzungs-Caches**: Nur lokal auf Ihrem Gerät (`chrome.storage.local`).
- **OCR-Sprachdaten**: Werden einmalig von der tessdata-CDN geladen (Daten, kein Code).

## Nicht erhoben werden

Keine Telemetrie, keine Analysen, kein Browserverlauf, keine Weitergabe oder Verkauf von Daten. Daten erhalten ausschließlich die von **Ihnen** konfigurierten KI-Endpunkte.

## Kontakt

Fragen: <https://github.com/rennerdo30/chrome-translator-extension/issues>
