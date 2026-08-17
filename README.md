# AI Translator - Browser Extension

<div align="center">
  <img src="icons/icon128.png" alt="AI Translator Logo" width="128" height="128">

  **Privacy-first web page translation using local AI models or cloud APIs**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
</div>

---

## Overview

AI Translator is a Chromium browser extension that translates web pages using AI language models. It supports both **local AI models** (LM Studio, Ollama) for complete privacy and **cloud APIs** (OpenAI, DeepSeek, OpenRouter) for convenience.

Text nodes are collected from the page, sent to the configured chat-completions endpoint in batches, and replaced in place with the translation — the original stays available on hover and can be restored in one click.

### Key Features

- **Multiple AI Providers**: LM Studio, Ollama, OpenAI, DeepSeek, and any OpenAI-compatible endpoint (OpenRouter, proxies, …)
- **16 Target Languages**: English, Spanish, French, German, Japanese, Chinese, and more
- **Privacy-First**: Use local models so page content never leaves your machine
- **Visual Highlighting**: Translated text is highlighted with hover-to-see-original
- **Batch Translation**: Page text is sent in configurable batches, with an in-page progress bar you can stop at any time
- **Parallel Execution**: Batch size and the number of simultaneous requests are configurable per provider — local providers default to sequential requests, cloud providers to 4 parallel requests
- **Translation Cache**: Every translated segment is cached locally (keyed by provider, model, language and the exact source text) — repeated strings are translated once, revisits are served without API calls, and any changed text is automatically retranslated
- **Auto-Translate per Site**: Opt a site in and it is translated on every visit — combined with the cache, browsing feels like the site ships a locale for your language
- **Dynamic Content**: While translation is active, content added later (single-page apps, infinite scroll, lazy loading) is detected and translated automatically in the background
- **Resilient**: A batch whose response does not line up is retried, then falls back to translating each chunk individually
- **Smart Detection**: Skips `<script>`, `<style>`, `<noscript>`, editable fields, whitespace, pure numbers and text that already looks like the target language — with script-aware length rules, so short CJK headings (e.g. 情報) are still translated

---

## Installation

### From Source (Development)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rennerdo30/chrome-translator-extension.git
   cd chrome-translator-extension
   ```

   There is no build step — the extension loads straight from the source folder.

2. **Load in Chrome/Edge/Brave**:
   - Navigate to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension folder

### Browser support

Chrome, Edge and Brave (any Chromium browser with Manifest V3) are supported.

Firefox is **not** working yet, even though `manifest.json` already carries a `browser_specific_settings.gecko` block: the background script is declared only as `background.service_worker`, and Firefox does not implement background service workers for MV3 — it needs `background.scripts` as well. Until that is added (and the code checked against Firefox's event-page lifecycle), loading it via `about:debugging` will not translate anything.

---

## Configuration

### Supported AI Providers

| Provider | Type | Default URL | API Key Required |
|----------|------|-------------|------------------|
| LM Studio | Local | `http://localhost:1234` | No |
| Ollama | Local | `http://localhost:11434` | No |
| OpenAI | Cloud | `https://api.openai.com` | Yes |
| DeepSeek | Cloud | `https://api.deepseek.com` | Yes |
| OpenRouter | Cloud | `https://openrouter.ai/api/v1` | Yes |

The dropdown offers four entries — LM Studio, Ollama, OpenAI and DeepSeek. OpenRouter and other OpenAI-compatible endpoints are used by picking **OpenAI** and replacing the URL.

Settings (provider, per-provider URL, model, API key, per-provider execution settings) are kept in `chrome.storage.sync`, so they follow your browser profile across devices — including the API key. Use a local provider if you would rather nothing synced at all.

### Execution Settings

Two settings in the popup control how page text is sent to the provider. Both are stored per provider, so switching providers switches to that provider's values:

| Setting | Range | Local default (LM Studio, Ollama) | Cloud default (OpenAI, DeepSeek) |
|---------|-------|-----------------------------------|----------------------------------|
| Parallel Requests | 1–10 | 1 (sequential) | 4 |
| Batch Size (text chunks per request) | 1–50 | 10 | 20 |

Local servers usually process one request at a time, so raising parallel requests mainly helps with cloud APIs or local servers configured for concurrent inference.

### Translation Cache & Auto-Translate

Translations are cached in `chrome.storage.local` (device-local, max 10,000 entries, oldest evicted first). The cache key contains the provider, model, target language and the exact source text, so:

- Identical strings on a page (menus, "Read more" links, …) are translated once and reused everywhere.
- Reloading or revisiting a page restores translations instantly without any API call.
- If a sentence changes on the page, it no longer matches the cache and is retranslated automatically — the progress popup shows the split, e.g. "Done — 12 from cache, 3 newly translated".

Enable **Auto-translate this site** in the popup to translate a site on every visit. Together with the cache this effectively gives any website an i18n layer for your target language: cached pages render translated immediately, and only new or changed content is sent to the AI provider.

### Setting Up Local Providers

#### LM Studio

1. Download [LM Studio](https://lmstudio.ai/)
2. Load a translation-capable model (Mistral, Llama 3, Qwen, etc.)
3. Start the local server (Local Server tab)
4. **Important**: Enable CORS in server settings

#### Ollama

1. Install [Ollama](https://ollama.ai/)
2. Pull a model: `ollama pull llama3.2`
3. Enable browser access:
   ```bash
   # Linux/macOS
   export OLLAMA_ORIGINS="*"
   ollama serve

   # Windows PowerShell
   $env:OLLAMA_ORIGINS="*"
   ollama serve
   ```

### Setting Up Cloud Providers

#### OpenAI

1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Select "OpenAI" as provider in the extension
3. Enter your API key (starts with `sk-`)

#### DeepSeek

1. Get an API key from the [DeepSeek Platform](https://platform.deepseek.com/api_keys)
2. Select "DeepSeek" as provider in the extension
3. Enter your API key — the model defaults to `deepseek-v4-flash` if none is set

> **Note**: The legacy model names `deepseek-chat` and `deepseek-reasoner` were retired by DeepSeek on 2026-07-24. Use `deepseek-v4-flash` (fast, inexpensive — recommended for translation) or `deepseek-v4-pro` (highest quality).

### Model Recommendations

The model field is an editable dropdown: it suggests recommended models per provider plus everything reported by the provider's `/models` endpoint (via "Test Connection" or the refresh button), and you can always type any model name manually.

| Provider | Recommended | Alternative |
|----------|-------------|-------------|
| DeepSeek | `deepseek-v4-flash` | `deepseek-v4-pro` (higher quality) |
| OpenAI | `gpt-5-mini` | `gpt-5-nano` (cheapest), `gpt-5.4-mini` |
| Ollama | `qwen3` (strong multilingual) | `llama3.3`, `gemma3` |
| LM Studio | whatever model is loaded | use the refresh button to detect |

#### OpenRouter

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Select "OpenAI" as provider (OpenRouter uses OpenAI-compatible API)
3. Set URL to `https://openrouter.ai/api/v1`
4. Enter your OpenRouter API key

---

## Usage

### Translating a Page

**Option 1: Extension Popup**
1. Click the extension icon in your toolbar
2. Select your target language
3. Click "Translate Page"

**Option 2: Context Menu**
1. Right-click anywhere on the page
2. Select "Translate with AI"

### Viewing Original Text

- **Hover** over any translated text to see the original in a tooltip
- Click "Restore Original" in the popup to revert all translations

### Testing Connection

1. Open the extension popup
2. Click "Test Connection"
3. A green indicator shows successful connection

---

## Supported Languages

| Language | Language | Language | Language |
|----------|----------|----------|----------|
| English | Spanish | French | German |
| Italian | Portuguese | Russian | Japanese |
| Korean | Chinese | Arabic | Hindi |
| Dutch | Polish | Turkish | Vietnamese |

---

## Architecture

```
┌─────────────────────────────────────┐
│         popup.html/js               │  User Interface
│  - Settings management              │
│  - Provider selection               │
│  - Connection testing               │
└─────────────┬───────────────────────┘
              │ chrome.runtime.sendMessage()
              ▼
┌─────────────────────────────────────┐
│         background.js               │  Service Worker
│  - API communication                │
│  - Translation logic                │
│  - Model detection                  │
└─────────────┬───────────────────────┘
              │ chrome.tabs.sendMessage()
              ▼
┌─────────────────────────────────────┐
│         content.js/css              │  Content Script
│  - DOM traversal                    │
│  - Text extraction                  │
│  - Translation rendering            │
└─────────────────────────────────────┘
```

### File Structure

```
chrome-translator-extension/
├── manifest.json        # Extension configuration (Manifest V3)
├── background.js        # Service worker for API calls
├── content.js           # Content script for DOM manipulation
├── content.css          # Styles for translated elements
├── popup.html           # Extension popup UI with embedded CSS
├── popup.js             # Popup functionality
├── icons/               # Extension icons (16, 48, 128px)
├── SPECIFICATION.md     # Technical specification
├── CONTRIBUTING.md      # Contribution guidelines
├── LICENSE              # MIT License
└── README.md            # This file
```

---

## Development

### Prerequisites

- Chrome, Edge or Brave
- A reachable AI provider (local or cloud) to translate against

Plain JavaScript, HTML and CSS — no bundler, no dependencies, nothing to install.

### Testing Changes

1. Make your code changes
2. Go to `chrome://extensions/`
3. Click the reload icon on the extension
4. Test on a web page

### Debugging

- **Service Worker**: `chrome://extensions/` → Details → Inspect views: service worker
- **Content Script**: Open DevTools (F12) on any page
- **Popup**: Right-click extension icon → Inspect popup

---

## Troubleshooting

### "Connection Failed" Error

| Cause | Solution |
|-------|----------|
| Provider not running | Start LM Studio/Ollama server |
| Wrong URL | Verify the API endpoint URL |
| CORS blocked | Enable CORS in LM Studio; set `OLLAMA_ORIGINS="*"` for Ollama |
| Invalid API key | Check your OpenAI/DeepSeek/OpenRouter API key |

### "405 Method Not Allowed" Error

This usually means the URL path is incorrect. The extension now handles this automatically, but ensure:
- LM Studio: `http://localhost:1234` (not `/v1/...`)
- Ollama: `http://localhost:11434` (not `/api/...`)
- OpenRouter: `https://openrouter.ai/api/v1`

### Translation Not Working

1. Refresh the page and try again
2. Check if it's a restricted page (`chrome://`, `edge://`, `about:`)
3. Verify a model is loaded (for local providers)
4. Check DevTools console for errors

### Slow Translation

- Increase "Parallel Requests" and "Batch Size" in the popup (most useful with cloud providers)
- Use a smaller/faster model
- Check GPU utilization for local models
- Consider using a cloud provider for large pages

---

## API Compatibility

This extension works with any API that implements the OpenAI Chat Completions format:

```
POST /v1/chat/completions
{
  "model": "model-name",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ]
}
```

Compatible services include:
- OpenAI API
- DeepSeek API
- OpenRouter
- Azure OpenAI
- Local servers (LM Studio, Ollama, llama.cpp, vLLM)
- Any OpenAI-compatible proxy

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests and verify functionality
5. Commit: `git commit -m 'feat: add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

---

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

---

## Links

- [Report a Bug](https://github.com/rennerdo30/chrome-translator-extension/issues)
- [Request a Feature](https://github.com/rennerdo30/chrome-translator-extension/issues)
- [LM Studio](https://lmstudio.ai/)
- [Ollama](https://ollama.ai/)
- [OpenAI API](https://platform.openai.com/docs)
- [DeepSeek API](https://api-docs.deepseek.com/)
- [DeepSeek Platform (API keys)](https://platform.deepseek.com/api_keys)
- [OpenRouter](https://openrouter.ai/)

---

<div align="center">
  <strong>Privacy-first translation for everyone</strong>
</div>
