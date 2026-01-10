# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension that translates web pages using AI models. It supports three providers:
1. **LM Studio** - Local AI models (privacy-focused)
2. **Ollama** - Local AI models (open-source)
3. **OpenAI** - Cloud-based AI (requires API key)

The extension provides an intuitive popup interface for configuration and translates web pages while maintaining visual highlighting to distinguish translated content from original text.

## Architecture

The extension follows Chrome Extension Manifest V3 architecture with three main components:

### Service Worker (`background.js`)
- Handles all API communication with AI providers
- Manages API endpoints for LM Studio, Ollama, and OpenAI
- Implements translation logic (single and batch)
- Handles model detection and language detection
- CORS-safe API calls using Chrome extension permissions

**Key Functions**:
- `translateText(text, targetLanguage)` - Translates single text segment
- `translateBatchText(combinedText, targetLanguage)` - Translates multiple segments efficiently
- `detectLanguage(text)` - Detects source language
- `fetchModels(settings)` - Gets available models from provider
- `getProviderSettings()` - Retrieves and formats provider-specific settings

### Content Script (`content.js`)
- Injected into all web pages via manifest
- Traverses DOM to find translatable text nodes
- Excludes script/style/noscript tags
- Filters out numbers, short strings, and whitespace-only content
- Stores original text in a Map for restoration
- Applies CSS highlighting to translated elements
- Handles toggling between original and translated states

**Key Features**:
- Smart text node detection
- Batch translation for performance
- Reversible translations
- Visual feedback during translation

### Popup Interface (`popup.html`, `popup.js`)
- Modern, clean UI with Inter font and gradient design
- Dynamic provider selection (LM Studio/Ollama/OpenAI)
- API key field with show/hide toggle (for OpenAI)
- Connection testing functionality
- Model auto-detection and refresh
- Language selection (12+ languages)
- Real-time connection status indicator
- Settings persistence via Chrome sync storage

**Settings Stored**:
- `provider`: Selected AI provider
- `lmStudioUrl`: LM Studio endpoint URL
- `ollamaUrl`: Ollama endpoint URL
- `openaiUrl`: OpenAI endpoint URL
- `apiKey`: API key (for OpenAI)
- `model`: Model name (optional)
- `targetLanguage`: Translation target language

## Key Technical Details

### Provider Configuration

**LM Studio**:
- Default URL: `http://localhost:1234`
- Endpoint: `/v1/chat/completions`
- No API key required
- Requires CORS enabled in LM Studio settings

**Ollama**:
- Default URL: `http://localhost:11434`
- Endpoint: `/v1/chat/completions` (or `/api/tags` for older versions)
- No API key required
- Requires `OLLAMA_ORIGINS="*"` environment variable

**OpenAI**:
- Default URL: `https://api.openai.com`
- Endpoint: `/v1/chat/completions`
- Requires API key (Bearer token authentication)
- Standard OpenAI pricing applies

### Translation Flow

1. User clicks "Translate Page" or uses context menu
2. Content script identifies translatable text nodes
3. Text is batched using separator `<<<LM_SEPARATOR>>>`
4. Background script sends request to AI provider
5. Response is parsed and split back into segments
6. Content script replaces original text with translations
7. CSS highlighting is applied to translated elements
8. Original text is preserved for restoration

### API Communication

All providers use OpenAI-compatible `/v1/chat/completions` format:

```javascript
{
  model: "model-name",
  messages: [
    {
      role: "system",
      content: "Translation instructions..."
    },
    {
      role: "user",
      content: "Text to translate..."
    }
  ],
  temperature: 0.3  // Low temperature for consistent translations
}
```

### Visual Design

- **Color Scheme**: Modern purple gradient (`#667eea` to `#764ba2`)
- **Typography**: Inter font family with clean, modern styling
- **Icon**: SVG-based with globe, translation arrows, and sparkle effects
- **UI Elements**: Card-based layout with subtle shadows and hover effects
- **Accessibility**: High contrast, clear labels, intuitive icons

## Development Guidelines

### File Structure

```
chrome-translator-extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js          # Service worker for API calls
├── content.js            # Content script for page manipulation
├── content.css           # Styles for translated elements
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality and settings
├── icons/                # Extension icons (SVG + PNG)
├── generate-icons.js     # Node.js script to convert SVG to PNG
├── package.json          # Node.js dependencies
├── LICENSE               # MIT License
├── README.md             # User documentation
├── CONTRIBUTING.md       # Contributor guidelines
└── CLAUDE.md             # This file (AI assistant guidance)
```

### Code Style

- **JavaScript**: Modern ES6+ syntax, async/await preferred
- **Error Handling**: Try-catch blocks with user-friendly error messages
- **Comments**: JSDoc for public functions, inline for complex logic
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Security**: No eval(), sanitize user input, validate API responses

### Testing Workflow

1. **Load Extension**: Chrome → `chrome://extensions/` → Load unpacked
2. **Test Providers**: Verify LM Studio, Ollama, and OpenAI all work
3. **Test Translation**: Try on various websites (news, blogs, documentation)
4. **Check Console**: Look for errors in extension console and page console
5. **Test Settings**: Verify settings save and persist across sessions
6. **Test Edge Cases**: Empty pages, very long text, special characters

### Common Development Commands

```bash
# Install dependencies (for icon generation)
npm install

# Generate PNG icons from SVG
npm run generate-icons

# Load extension in Chrome
# Navigate to chrome://extensions/ and click "Load unpacked"
```

### Debugging Tips

**Service Worker Issues**:
- Check `chrome://extensions/` → Extension details → "Inspect views: service worker"
- Service worker stops after inactivity, check logs for initialization errors

**Content Script Issues**:
- Open DevTools (F12) on translated page
- Check Console for content script errors
- Use `console.log()` to trace execution

**API Issues**:
- Verify provider is running (LM Studio/Ollama)
- Check CORS settings for local providers
- Validate API key for OpenAI
- Use "Test Connection" button in popup

### Security Considerations

- API keys stored in Chrome sync storage (encrypted by browser)
- No API keys sent to third parties (except OpenAI for their service)
- HTTPS enforced for OpenAI endpoints
- Input sanitization for user-provided URLs
- CSP (Content Security Policy) defined in manifest

### Performance Optimization

- Batch translation reduces API calls
- Text filtering avoids translating unnecessary content
- Efficient DOM traversal with NodeIterator
- Translation state cached in content script
- Settings cached to reduce storage reads

## Known Limitations

1. **Dynamic Content**: Translations don't auto-update for dynamically loaded content
2. **Restricted Pages**: Cannot translate `chrome://`, `edge://`, or extension pages
3. **Complex Layouts**: Some CSS-heavy layouts may have visual issues
4. **Rate Limits**: OpenAI has rate limits; local models don't
5. **Model Quality**: Translation quality depends on model capabilities

## Future Enhancement Ideas

- Auto-detect source language
- Translation history/cache
- Custom language pairs
- Partial page translation (selection only)
- Real-time translation for dynamic content
- Multiple model profiles
- Translation quality feedback
- Offline mode with cached translations
- Support for more providers (Anthropic Claude, etc.)

## Troubleshooting Guide

**Connection Failed**:
- Verify provider is running
- Check URL format (include `http://` or `https://`)
- For LM Studio: Enable CORS
- For Ollama: Set `OLLAMA_ORIGINS="*"`
- For OpenAI: Verify API key format

**Translation Not Working**:
- Refresh the page and try again
- Check if page is restricted
- Verify model is loaded (for local providers)
- Check Chrome DevTools console for errors

**API Key Issues**:
- Ensure API key field is visible (OpenAI provider selected)
- Click away from field to trigger save
- Check Chrome sync is enabled
- Try clearing extension data and re-entering

## Dependencies

### Runtime Dependencies
- None (runs in browser)

### Development Dependencies
- `sharp` (v0.33.1+) - For SVG to PNG conversion

### Browser Requirements
- Chrome 88+ or Chromium-based browser
- Manifest V3 support

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines.

## License

MIT License - See [LICENSE](LICENSE) file.

---

**For Claude Code**: When working with this codebase:
1. Always test changes with all three providers
2. Maintain the existing code style and architecture
3. Update relevant documentation (README, CLAUDE.md, comments)
4. Consider security implications of changes
5. Test on multiple website types
6. Preserve user settings and translations when possible
7. Follow the principle of least privilege for permissions
