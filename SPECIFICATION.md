# AI Translator Extension - Technical Specification

## Version

- **Extension Version**: 1.1.0
- **Manifest Version**: 3
- **Specification Date**: 2025-01-18

---

## 1. Overview

### 1.1 Purpose

AI Translator is a browser extension that translates web page content using AI language models. It provides privacy-focused translation through local AI servers while also supporting cloud-based APIs.

### 1.2 Scope

This specification covers:
- Extension architecture and components
- API integration protocols
- Data flow and message passing
- Storage schema
- Security considerations
- Browser compatibility

---

## 2. System Architecture

### 2.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Context                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Popup     │    │   Service   │    │   Content Script    │ │
│  │  (UI Layer) │◄──►│   Worker    │◄──►│   (DOM Layer)       │ │
│  │             │    │  (API Layer)│    │                     │ │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│                   ┌─────────────────┐                          │
│                   │ Chrome Storage  │                          │
│                   │   (sync API)    │                          │
│                   └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │     External AI Providers    │
              │  (LM Studio/Ollama/OpenAI)   │
              └──────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| Popup UI | `popup.html`, `popup.js` | User interface, settings management, status display |
| Service Worker | `background.js` | API communication, translation logic, message routing |
| Content Script | `content.js`, `content.css` | DOM manipulation, text extraction, visual rendering |
| Storage | Chrome Sync API | Persistent settings storage |

---

## 3. API Integration

### 3.1 Supported API Format

The extension communicates with AI providers using the **OpenAI Chat Completions API format**:

```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <api-key>  (optional)

{
  "model": "string",
  "messages": [
    {
      "role": "system" | "user" | "assistant",
      "content": "string"
    }
  ],
  "temperature": 0.0-2.0,
  "max_tokens": integer
}
```

### 3.2 Response Format

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "translated text"
      }
    }
  ]
}
```

### 3.3 Endpoint Construction

The extension implements intelligent endpoint detection:

| User Input | Constructed Endpoint |
|------------|---------------------|
| `http://localhost:1234` | `http://localhost:1234/v1/chat/completions` |
| `https://openrouter.ai/api/v1` | `https://openrouter.ai/api/v1/chat/completions` |
| `https://api.example.com/v1/chat/completions` | `https://api.example.com/v1/chat/completions` |

### 3.4 Model Detection Endpoints

| Provider | Primary Endpoint | Fallback Endpoint |
|----------|-----------------|-------------------|
| LM Studio | `/v1/models` | - |
| Ollama | `/v1/models` | `/api/tags` |
| OpenAI | `/v1/models` | - |

---

## 4. Message Passing Protocol

### 4.1 Popup → Service Worker

| Action | Payload | Response |
|--------|---------|----------|
| `translate` | `{text, targetLanguage}` | `{success, translation}` |
| `translateBatch` | `{text, targetLanguage}` | `{success, translation}` |
| `detectLanguage` | `{text}` | `{success, language}` |
| `getModels` | `{settings}` | `{success, models[]}` |

### 4.2 Service Worker → Content Script

| Action | Payload | Response |
|--------|---------|----------|
| `toggleTranslation` | `{targetLanguage}` | `{success, isTranslating}` |
| `getTranslationStatus` | - | `{isTranslating, hasTranslations}` |
| `ping` | - | `{pong: true}` |

### 4.3 Batch Translation Protocol

Text segments are combined using a delimiter for efficient batch processing:

```
Segment 1<<<LM_SEPARATOR>>>Segment 2<<<LM_SEPARATOR>>>Segment 3
```

The AI model preserves this delimiter in the response, allowing the extension to map translations back to original segments.

---

## 5. Storage Schema

### 5.1 Chrome Sync Storage

```typescript
interface StorageSchema {
  // Provider configuration
  provider: 'lmstudio' | 'ollama' | 'openai';

  // Provider-specific URLs
  lmStudioUrl: string;  // default: 'http://localhost:1234'
  ollamaUrl: string;    // default: 'http://localhost:11434'
  openaiUrl: string;    // default: 'https://api.openai.com'

  // Authentication
  apiKey: string;       // For OpenAI/OpenRouter

  // Model configuration
  model: string;        // User-specified or auto-detected

  // Translation settings
  targetLanguage: string;  // default: 'English'
}
```

### 5.2 Default Values

```javascript
{
  provider: 'lmstudio',
  lmStudioUrl: 'http://localhost:1234',
  ollamaUrl: 'http://localhost:11434',
  openaiUrl: 'https://api.openai.com',
  apiKey: '',
  targetLanguage: 'English',
  model: ''
}
```

---

## 6. Content Script Behavior

### 6.1 Text Node Selection

The content script identifies translatable text using a TreeWalker:

```javascript
document.createTreeWalker(
  element,
  NodeFilter.SHOW_TEXT,
  {
    acceptNode: (node) => {
      // Exclude script, style, noscript elements
      // Exclude empty/whitespace-only nodes
      // Exclude nodes with only numbers/symbols
    }
  }
)
```

### 6.2 Excluded Elements

| Element | Reason |
|---------|--------|
| `<script>` | Code, not translatable |
| `<style>` | CSS, not translatable |
| `<noscript>` | Fallback content |
| `<code>` | Programming code |
| `<pre>` | Preformatted text (often code) |
| `<textarea>` | User input field |
| `<input>` | User input field |

### 6.3 Translation State Management

```javascript
// State variables
let isTranslating: boolean;        // Currently translating
let shouldStopTranslation: boolean; // User requested stop
let originalTexts: Map<Node, {text, originalNode}>;
let translatedTexts: Map<Node, string>;
```

### 6.4 Visual Indicators

Translated text receives the CSS class `lm-translated`:

```css
.lm-translated {
  background-color: rgba(255, 255, 0, 0.2);
  border-bottom: 1px dotted #666;
  cursor: help;
}
```

---

## 7. Error Handling

### 7.1 HTTP Error Mapping

| Status Code | User Message |
|-------------|--------------|
| 401 | Authentication failed. Please check your API key. |
| 403 | Access forbidden. API key may lack permission or billing disabled. |
| 404 | Endpoint not found. Please verify the API URL. |
| 405 | Method not allowed. The API URL may be incorrect. |
| 429 | Rate limit exceeded. Please wait before retrying. |
| 5xx | Server error. The AI service may be temporarily unavailable. |

### 7.2 Timeout Configuration

| Operation | Timeout | Reason |
|-----------|---------|--------|
| Model detection | 5 seconds | Quick connectivity check |
| Single text translation | 30 seconds | Standard request |
| Batch translation | 60 seconds | Larger payload |
| Language detection | 30 seconds | Standard request |

---

## 8. Security Considerations

### 8.1 Permissions

```json
{
  "permissions": [
    "activeTab",      // Access current tab only
    "storage",        // Persist settings
    "scripting",      // Inject content scripts
    "contextMenus"    // Right-click menu
  ],
  "host_permissions": [
    "http://localhost:*/*",   // Local AI servers
    "http://127.0.0.1:*/*",   // Local AI servers
    "https://*/*"              // Cloud APIs
  ]
}
```

### 8.2 Data Handling

- **API Keys**: Stored in Chrome sync storage (encrypted by browser)
- **Page Content**: Sent to AI provider for translation (user's choice)
- **No Telemetry**: Extension does not collect or transmit usage data
- **Local-First**: Local providers keep all data on user's machine

### 8.3 Content Security

- No `eval()` or dynamic code execution
- No inline scripts in HTML
- No external script loading
- Input validation on all user-provided URLs

---

## 9. Browser Compatibility

### 9.1 Supported Browsers

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 88+ | Full support |
| Edge | 88+ | Full support |
| Brave | 1.20+ | Full support |
| Firefox | 109+ | Via `browser_specific_settings` |

### 9.2 Manifest V3 Features Used

- Service Workers (background scripts)
- `chrome.storage.sync` API
- `chrome.scripting` API
- `chrome.contextMenus` API
- `chrome.tabs.sendMessage` API

---

## 10. Performance Considerations

### 10.1 Batch Processing

- Text nodes are batched (configurable batch size)
- Reduces API calls and improves throughput
- Default batch size: 10 text segments

### 10.2 Memory Management

- Original text maps cleared on restore
- Translated text maps cleared on restore
- Event listeners removed when not needed

### 10.3 DOM Updates

- Translations applied as text content updates
- No full page re-renders
- CSS classes applied efficiently

---

## 11. Future Considerations

### 11.1 Planned Features

- [ ] Selection-only translation
- [ ] Translation history/cache
- [ ] Custom system prompts
- [ ] Multiple provider profiles
- [ ] Keyboard shortcuts

### 11.2 API Enhancements

- [ ] Streaming responses support
- [ ] Token usage tracking
- [ ] Response caching

---

## Appendix A: Translation Prompts

### A.1 Batch Translation System Prompt

```
You are a professional translator. Translate the following text segments
to {targetLanguage}. Each segment is separated by '<<<LM_SEPARATOR>>>'.
Maintain the same separator pattern in your response. Only return the
translated text segments with separators, no explanations or additional content.
```

### A.2 Single Text System Prompt

```
You are a professional translator. Translate the following text to
{targetLanguage}. Only return the translated text, no explanations
or additional content.
```

### A.3 Language Detection System Prompt

```
You are a language detection expert. Detect the language of the given
text and respond with only the language name in English (e.g., 'English',
'Spanish', 'French', 'German', etc.). Be precise and consistent.
```

---

## Appendix B: Event Flow Diagrams

### B.1 Translation Flow

```
User clicks "Translate Page"
        │
        ▼
┌─────────────────┐
│ popup.js        │
│ saveSettings()  │
│ sendMessage()   │
└────────┬────────┘
         │ {action: 'toggleTranslation'}
         ▼
┌─────────────────┐
│ content.js      │
│ toggleTranslation()
│ getTextNodes()  │
│ processBatches()│
└────────┬────────┘
         │ {action: 'translateBatch'}
         ▼
┌─────────────────┐
│ background.js   │
│ translateBatch()│
│ fetch(API)      │
└────────┬────────┘
         │ API Response
         ▼
┌─────────────────┐
│ content.js      │
│ applyTranslation()
│ updateDOM()     │
└─────────────────┘
```

### B.2 Settings Flow

```
User changes provider
        │
        ▼
┌─────────────────┐
│ popup.js        │
│ updateProviderUI()
│ updateUrlInputDefault()
│ saveSettings()  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ chrome.storage  │
│ .sync.set()     │
└─────────────────┘
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-11 | Initial specification |
| 1.1.0 | 2025-01-18 | Added URL path handling, timeouts, error messages |
