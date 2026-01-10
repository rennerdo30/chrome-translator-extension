# 🌐 AI Translator - Chrome Extension

<div align="center">
  <img src="icons/icon128.png" alt="AI Translator Logo" width="128" height="128">

  <p><strong>Translate web pages using local AI models or OpenAI</strong></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)
</div>

---

## ✨ Features

- 🤖 **Multiple AI Providers**: Support for LM Studio, Ollama, and OpenAI
- 🌍 **12+ Languages**: Translate to English, Spanish, French, German, Japanese, and more
- 🎨 **Visual Highlighting**: Translated text is highlighted for easy identification
- ⚡ **Fast Toggle**: Instantly switch between original and translated text
- 🔒 **Privacy First**: Use local models for complete privacy
- 🎯 **Smart Detection**: Automatically detects translatable content
- 🔄 **Batch Translation**: Efficiently translates multiple text segments at once
- 🎛️ **Flexible Configuration**: Easy provider switching and model selection

## 📸 Screenshots

<div align="center">
  <img src="docs/screenshot-popup.png" alt="Extension Popup" width="400">
  <img src="docs/screenshot-translated.png" alt="Translated Page" width="400">
</div>

## 🚀 Quick Start

### Prerequisites

Choose one of the following AI providers:

#### Option 1: LM Studio (Recommended for privacy)
1. Download and install [LM Studio](https://lmstudio.ai/)
2. Load a model suitable for translation (e.g., Mistral, Llama 3, etc.)
3. Go to the "Local Server" tab and start the server (default: `http://localhost:1234`)
4. Ensure "Enable CORS" is checked

#### Option 2: Ollama
1. Install [Ollama](https://ollama.ai/)
2. Pull a model: `ollama pull llama3`
3. Set environment variable to allow browser access:
   ```bash
   export OLLAMA_ORIGINS="*"
   ```
4. Start Ollama (default: `http://localhost:11434`)

#### Option 3: OpenAI
1. Get an API key from [OpenAI Platform](https://platform.openai.com/)
2. Have your API key ready (starts with `sk-...`)

### Installation

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/yourusername/ai-translator-extension.git
   cd ai-translator-extension
   ```

2. **Install Dependencies** (for icon generation):
   ```bash
   npm install
   ```

3. **Load Extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extension folder
   - The extension icon should appear in your toolbar

## 📖 Usage

### Configuration

1. Click the extension icon in your Chrome toolbar
2. Select your **Provider** (LM Studio, Ollama, or OpenAI)
3. Enter the **API URL**:
   - LM Studio: `http://localhost:1234` (default)
   - Ollama: `http://localhost:11434` (default)
   - OpenAI: `https://api.openai.com` (default)
4. For OpenAI, enter your **API Key**
5. (Optional) Enter a specific **Model Name** or click refresh to auto-detect
6. Select your **Target Language**
7. Click **Test Connection** to verify everything works

### Translating a Page

**Method 1: Right-click Menu**
- Navigate to any web page
- Right-click anywhere on the page
- Select "Translate with AI"

**Method 2: Extension Popup**
- Click the extension icon
- Click "Translate Page"

**Restore Original**
- Click the extension icon
- Click "Restore Original"

## 🏗️ Architecture

```
┌─────────────────┐
│   popup.html    │ ← User Interface
│   popup.js      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  background.js  │ ← Service Worker (API calls)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   content.js    │ ← Page Manipulation
│   content.css   │
└─────────────────┘
```

### Key Components

- **Service Worker** (`background.js`): Handles all API communication with AI providers
- **Content Script** (`content.js`): Extracts and replaces text in web pages
- **Popup Interface** (`popup.html/js`): User controls and settings
- **Storage**: Chrome sync storage for persistent settings

## 🛠️ Development

### Project Structure

```
chrome-translator-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── content.js            # Content script for DOM manipulation
├── content.css           # Styles for translated elements
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality
├── icons/                # Extension icons
│   ├── icon.svg         # Source SVG icon
│   ├── icon16.png       # 16x16 PNG
│   ├── icon48.png       # 48x48 PNG
│   └── icon128.png      # 128x128 PNG
├── generate-icons.js     # Script to generate PNGs from SVG
├── package.json          # Node.js dependencies
├── LICENSE               # MIT License
├── README.md             # This file
└── CLAUDE.md             # AI assistant guidance
```

### Making Changes

1. **Edit Files**: Modify JavaScript, HTML, or CSS files
2. **Reload Extension**:
   - Go to `chrome://extensions/`
   - Click the reload icon on your extension
3. **Test Changes**: Open a web page and test translation

### Regenerating Icons

If you modify `icons/icon.svg`:

```bash
npm run generate-icons
```

### Adding Languages

Edit `popup.html` and add options to the `targetLanguage` select element:

```html
<option value="YourLanguage">Your Language</option>
```

### Customizing Translation Prompts

Edit the system prompts in `background.js`:

```javascript
content: `You are a professional translator. Translate to ${targetLanguage}...`
```

## 🔧 Advanced Configuration

### Model Selection

The extension can auto-detect loaded models or you can manually specify:

1. Click the refresh icon next to the Model field
2. Or manually enter a model name (e.g., `mistral-7b-instruct`)

### Custom Endpoints

You can use custom API endpoints compatible with OpenAI's chat completions format:

1. Select "OpenAI" as provider
2. Enter your custom endpoint URL
3. Add your API key if required

### Environment Variables (Ollama)

For Ollama to work with browser extensions, set:

```bash
# Linux/Mac
export OLLAMA_ORIGINS="*"

# Windows (PowerShell)
$env:OLLAMA_ORIGINS="*"
```

## 🐛 Troubleshooting

### Connection Issues

**Problem**: "Connection failed" error

**Solutions**:
- ✅ Ensure your AI provider is running
- ✅ Check the URL is correct
- ✅ For LM Studio, verify CORS is enabled
- ✅ For Ollama, set `OLLAMA_ORIGINS="*"`
- ✅ For OpenAI, verify your API key is valid

### Translation Not Working

**Problem**: Page doesn't translate

**Solutions**:
- ✅ Refresh the page and try again
- ✅ Check if the page is a restricted page (`chrome://`, `edge://`)
- ✅ Open Chrome DevTools (F12) and check for errors
- ✅ Verify the model is loaded (for LM Studio/Ollama)

### Slow Translation

**Problem**: Translation takes too long

**Solutions**:
- ✅ Use a smaller/faster model
- ✅ Reduce the amount of text on the page
- ✅ Check your computer's GPU/CPU usage
- ✅ For OpenAI, check your internet connection

### API Key Not Saved

**Problem**: API key keeps disappearing

**Solutions**:
- ✅ Ensure you click away from the field or press Enter to save
- ✅ Check Chrome sync is enabled in Chrome settings
- ✅ Try toggling the provider and back

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Icons designed with modern gradient aesthetics
- Built with Chrome Extension Manifest V3
- Compatible with OpenAI-style APIs
- Inspired by the need for privacy-preserving translation tools

## 🔗 Links

- [Report a Bug](../../issues)
- [Request a Feature](../../issues)
- [LM Studio Documentation](https://lmstudio.ai/docs)
- [Ollama Documentation](https://ollama.ai/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)

---

<div align="center">
  Made with ❤️ for privacy-conscious users

  ⭐ Star this repo if you find it useful!
</div>
