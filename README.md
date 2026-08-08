# AI Translator - Browser Extension

<div align="center">
  <img src="icons/icon128.png" alt="AI Translator Logo" width="128" height="128">

  **Privacy-first web page translation using local AI models or cloud APIs**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
</div>

---

## Overview

AI Translator is a browser extension that translates the page you are reading with an AI language
model of your choice. Point it at a **local model** (LM Studio or Ollama) to keep page content on
your own machine, or at any **OpenAI-compatible cloud API** (OpenAI, OpenRouter, …) when you prefer
a hosted model.

It is loaded from source as an unpacked extension: there is no build step, no bundler and no
tracking. The whole extension is plain HTML, CSS and JavaScript on Manifest V3.

### Key features

- **Bring your own model**: LM Studio, Ollama, or any OpenAI-compatible endpoint
- **16 target languages**: English, Spanish, French, German, Japanese, Chinese and more
- **Local by default**: with LM Studio or Ollama, no page text leaves your machine
- **Hover to compare**: translated passages are marked with a dashed underline and reveal the
  original text on hover
- **Batch translation** with a progress panel you can cancel at any time
- **One-click restore** of the original page
- **Light and dark popup**, following your operating-system preference
- **Cross-browser**: Chrome, Edge, Brave and Firefox (Manifest V3)

---

## Installation

### From Source (Development)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rennerdo30/chrome-translator-extension.git
   cd chrome-translator-extension
   ```

2. **Install dependencies** (optional, for icon generation):
   ```bash
   npm install
   ```

3. **Load in Chrome/Edge/Brave**:
   - Navigate to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension folder

4. **Load in Firefox**:
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json`

---

## Configuration

### Supported AI Providers

The popup offers three provider entries. "OpenAI compatible" works with any service that speaks the
OpenAI Chat Completions API, so OpenRouter and similar gateways are configured through it by
changing the endpoint. Each provider keeps its own endpoint, so switching back and forth does not
lose a custom URL.

| Provider in the popup | Type | Default endpoint | API key |
|-----------------------|------|------------------|---------|
| LM Studio | Local | `http://localhost:1234` | Not needed |
| Ollama | Local | `http://localhost:11434` | Not needed |
| OpenAI compatible | Cloud | `https://api.openai.com` | Required |
| OpenAI compatible (OpenRouter) | Cloud | `https://openrouter.ai/api/v1` | Required |

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
2. Select "OpenAI compatible" as provider in the extension
3. Enter your API key (starts with `sk-`)

#### OpenRouter

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Select "OpenAI compatible" as provider
3. Set the endpoint to `https://openrouter.ai/api/v1`
4. Enter your OpenRouter API key

---

## Usage

### Translating a Page

**Option 1: Extension popup**
1. Click the extension icon in your toolbar
2. Select your target language
3. Click "Translate page"

**Option 2: Context menu**
1. Right-click anywhere on the page
2. Select "Translate with AI"

While a page is being translated, a progress panel appears in the bottom-right corner. Its close
button stops the run and restores what has already been replaced.

### Viewing the original text

- **Hover** a translated passage (dashed underline) to see the original in a tooltip
- Click "Restore original" in the popup to revert the whole page

### Testing the connection

1. Open the extension popup
2. Click "Test connection"
3. The badge in the header turns green when the provider answered, red when it did not; the message
   below the buttons explains what went wrong

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
├── popup.html           # Extension popup UI, including its design tokens and CSS
├── popup.js             # Popup behaviour (settings, model detection, connection test)
├── icons/               # Extension icons (16, 48, 128px)
├── generate-icons.js    # Regenerates the PNG icons from icons/icon.svg
├── SPECIFICATION.md     # Technical specification
├── CONTRIBUTING.md      # Contribution guidelines
├── LICENSE              # MIT License
└── README.md            # This file
```

---

## Development

### Tech stack

- Manifest V3, no framework and no build step — the files in the repository are the extension
- Vanilla JavaScript for the popup, service worker and content script
- Plain CSS with custom properties as design tokens (`popup.html` for the popup, `content.css` for
  the widgets injected into pages); both ship a light and a dark theme driven by
  `prefers-color-scheme` and honour `prefers-reduced-motion`
- No remote fonts, styles or scripts, as required by the extension CSP
- The only dev dependency is [sharp](https://sharp.pixelplumbing.com/), used to render the PNG icons

### Prerequisites

- Chrome, Edge, Brave or Firefox
- Node.js 18+ only if you want to regenerate the icons

### Local Development

```bash
# Clone repository
git clone https://github.com/rennerdo30/chrome-translator-extension.git
cd chrome-translator-extension

# Optional: only needed for icon generation
npm install

# Regenerate icons after editing icons/icon.svg
npm run generate-icons
```

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
| Invalid API key | Check your OpenAI/OpenRouter API key |

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
- OpenRouter
- Azure OpenAI
- Local servers (LM Studio, Ollama, llama.cpp, vLLM)
- Any OpenAI-compatible proxy

---

## Privacy

- Settings (provider, endpoint, model, target language, API key) are stored with
  `chrome.storage.sync`, i.e. in your browser profile. Nothing is sent to any server operated by
  this project.
- Page text is sent only to the endpoint you configure. With LM Studio or Ollama that endpoint is
  on your own machine; with a cloud provider the text leaves your machine and their privacy policy
  applies.
- The extension contains no analytics, no telemetry and no remote assets.

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
- [OpenRouter](https://openrouter.ai/)

---

<div align="center">
  <strong>Privacy-first translation for everyone</strong>
</div>
