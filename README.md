# AI Translator - Browser Extension

<div align="center">
  <img src="icons/icon128.png" alt="AI Translator Logo" width="128" height="128">

  **Privacy-first web page translation using local AI models or cloud APIs**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Chrome](https://img.shields.io/badge/Chrome-Supported-green.svg)](https://chrome.google.com/webstore)
  [![Firefox](https://img.shields.io/badge/Firefox-Supported-orange.svg)](https://addons.mozilla.org)
  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/)
</div>

---

## Overview

AI Translator is a browser extension that translates web pages using AI language models. It supports both **local AI models** (LM Studio, Ollama) for complete privacy and **cloud APIs** (OpenAI, OpenRouter) for convenience.

### Key Features

- **Multiple AI Providers**: LM Studio, Ollama, OpenAI, and OpenRouter compatible
- **16+ Languages**: English, Spanish, French, German, Japanese, Chinese, and more
- **Privacy-First**: Use local models for complete data privacy
- **Visual Highlighting**: Translated text is highlighted with hover-to-see-original
- **Batch Translation**: Efficient translation of entire pages
- **Smart Detection**: Automatically identifies translatable content
- **Cross-Browser**: Works on Chrome, Edge, Brave, and Firefox

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

| Provider | Type | Default URL | API Key Required |
|----------|------|-------------|------------------|
| LM Studio | Local | `http://localhost:1234` | No |
| Ollama | Local | `http://localhost:11434` | No |
| OpenAI | Cloud | `https://api.openai.com` | Yes |
| OpenRouter | Cloud | `https://openrouter.ai/api/v1` | Yes |

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
├── CLAUDE.md            # AI assistant development guide
├── SPECIFICATION.md     # Technical specification
├── CONTRIBUTING.md      # Contribution guidelines
├── LICENSE              # MIT License
└── README.md            # This file
```

---

## Development

### Prerequisites

- Node.js 18+ (for icon generation)
- Chrome, Edge, or Firefox browser

### Local Development

```bash
# Clone repository
git clone https://github.com/rennerdo30/chrome-translator-extension.git
cd chrome-translator-extension

# Install dependencies
npm install

# Regenerate icons (if modified)
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
