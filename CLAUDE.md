# CLAUDE.md - AI Assistant Development Guide

This file provides comprehensive guidance for AI assistants (like Claude Code) when working with the AI Translator Chrome Extension codebase.

## Project Overview

**AI Translator** is a Chrome Extension (Manifest V3) that translates web pages using AI models. It supports three providers:
- **LM Studio**: Local AI models for privacy-focused translation
- **Ollama**: Local open-source AI models
- **OpenAI**: Cloud-based translation with API key authentication

**Core Value Proposition**: Privacy-first translation using local AI models, with fallback to cloud services.

## Architecture Deep Dive

### Three-Component System

```
┌─────────────────────────────────────┐
│         popup.html/js               │  ← User Interface Layer
│  - Settings management              │
│  - Provider selection               │
│  - Connection testing               │
│  - UI state management              │
└─────────────┬───────────────────────┘
              │ chrome.runtime.sendMessage()
              ▼
┌─────────────────────────────────────┐
│         background.js               │  ← Service Worker Layer
│  - API communication                │
│  - Translation logic                │
│  - Model detection                  │
│  - Provider abstraction             │
└─────────────┬───────────────────────┘
              │ chrome.tabs.sendMessage()
              ▼
┌─────────────────────────────────────┐
│         content.js/css              │  ← Page Manipulation Layer
│  - DOM traversal                    │
│  - Text extraction                  │
│  - Translation rendering            │
│  - State management                 │
└─────────────────────────────────────┘
```

### Critical Files and Their Responsibilities

#### `manifest.json`
- **Purpose**: Extension configuration (Manifest V3)
- **Key Permissions**:
  - `activeTab`: Access current tab
  - `storage`: Persist settings via Chrome sync
  - `scripting`: Inject content scripts
  - `contextMenus`: Right-click translation
- **Host Permissions**:
  - `http://localhost:*/*` (LM Studio/Ollama)
  - `https://*/*` (OpenAI/general web access)
- **DO NOT**: Add unnecessary permissions (privacy-focused extension)

#### `background.js` (Service Worker)
- **Purpose**: API communication and translation logic
- **Key Functions**:
  - `translateText()`: Single text segment translation
  - `translateBatchText()`: Batch translation with `<<<LM_SEPARATOR>>>`
  - `getProviderSettings()`: Provider-specific config
  - `fetchModels()`: Model detection
- **Important**: Service workers are ephemeral and restart frequently
- **State Management**: Use chrome.storage, NOT global variables
- **API Calls**: All fetch() calls must handle CORS properly

#### `content.js` (Content Script)
- **Purpose**: DOM manipulation and text extraction
- **Key Responsibilities**:
  - Find translatable text nodes (exclude `<script>`, `<style>`, `<noscript>`)
  - Store original text for restoration
  - Apply visual highlighting
  - Manage translation state
- **Important**: Content scripts are isolated from page scripts
- **Performance**: Use NodeIterator for efficient DOM traversal
- **Avoid**: XPath queries (slower), recursive functions (stack overflow risk)

#### `popup.html/js` (User Interface)
- **Purpose**: Settings and user interaction
- **Design Philosophy**: Clean, modern, minimal clicks
- **Key Features**:
  - Provider selection with dynamic UI updates
  - API key show/hide toggle
  - Connection testing with visual feedback
  - Model auto-detection
- **Important**: Popup can close at any time (save immediately)

### Data Flow Examples

#### Translation Flow
```
1. User clicks "Translate Page" in popup
   ↓
2. popup.js → chrome.tabs.sendMessage({action: 'toggleTranslation'})
   ↓
3. content.js receives message
   ↓
4. content.js extracts text nodes, batches them
   ↓
5. content.js → chrome.runtime.sendMessage({action: 'translateBatch'})
   ↓
6. background.js receives request
   ↓
7. background.js → fetch() to AI provider
   ↓
8. background.js → sendResponse({translation})
   ↓
9. content.js receives translation
   ↓
10. content.js replaces text, applies CSS highlighting
```

#### Settings Flow
```
1. User changes setting in popup
   ↓
2. popup.js → chrome.storage.sync.set({setting: value})
   ↓
3. Setting immediately persisted (synced across devices)
   ↓
4. background.js reads settings via chrome.storage.sync.get()
   ↓
5. Settings applied to next API call
```

## Provider-Specific Implementation Details

### LM Studio
```javascript
// Default configuration
URL: http://localhost:1234
Endpoint: /v1/chat/completions
Auth: None
CORS: Must be enabled in LM Studio settings
Model: Auto-detect or user-specified
```

**Common Issues**:
- CORS not enabled → Connection fails
- Model not loaded → Empty response
- Server not running → Connection timeout

**Testing**: Use "Test Connection" to verify `/v1/models` endpoint

### Ollama
```javascript
// Default configuration
URL: http://localhost:11434
Endpoint: /v1/chat/completions (newer) or /api/tags (older)
Auth: None
CORS: Requires OLLAMA_ORIGINS="*" environment variable
Model: Auto-detect or user-specified
```

**Common Issues**:
- OLLAMA_ORIGINS not set → CORS error
- Using old endpoint → Switch to /v1/chat/completions
- Service not running → Connection timeout

**Testing**: Check both `/v1/models` and `/api/tags` for compatibility

### OpenAI
```javascript
// Default configuration
URL: https://api.openai.com
Endpoint: /v1/chat/completions
Auth: Bearer token (API key required)
Model: User-specified (gpt-3.5-turbo, gpt-4, etc.)
```

**Common Issues**:
- Invalid API key → 401 Unauthorized
- Expired key → 401 Unauthorized
- Rate limits → 429 Too Many Requests
- Billing issues → 403 Forbidden

**Security**: API key stored in chrome.storage.sync (encrypted by browser)

## Development Guidelines

### When Making Changes

#### Adding a New Feature
1. **Read existing code first** - Understand patterns before modifying
2. **Consider all three providers** - Test with LM Studio, Ollama, AND OpenAI
3. **Update settings if needed** - Add to chrome.storage schema
4. **Test across multiple websites** - News sites, blogs, documentation
5. **Update documentation** - README.md, CLAUDE.md, code comments

#### Fixing a Bug
1. **Reproduce the bug** - Understand exact steps to trigger
2. **Check console errors** - Both extension console and page console
3. **Verify provider status** - Is it provider-specific?
4. **Test the fix thoroughly** - Multiple websites, all providers
5. **Add defensive code** - Prevent similar bugs in future

#### Refactoring Code
1. **Don't change behavior** - Pure refactor = same output
2. **Test before and after** - Verify nothing broke
3. **Keep commits focused** - One logical change per commit
4. **Update comments** - Code and comments should match

### Code Style and Conventions

#### JavaScript Standards
```javascript
// ✅ GOOD - Modern async/await
async function translateText(text, targetLanguage) {
  const { baseUrl, headers, model } = await getProviderSettings();
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {...});
  return response.json();
}

// ❌ BAD - Promise chains
function translateText(text, targetLanguage) {
  return getProviderSettings().then(settings => {
    return fetch(...).then(response => response.json());
  });
}

// ✅ GOOD - Descriptive names
const translatedTextNodes = extractTextNodes(document.body);

// ❌ BAD - Cryptic names
const ttn = extract(document.body);

// ✅ GOOD - Error handling with user feedback
try {
  const translation = await translateText(text, language);
} catch (error) {
  showError(`Translation failed: ${error.message}`);
}

// ❌ BAD - Silent failures
try {
  const translation = await translateText(text, language);
} catch (error) {
  // Nothing - user has no idea what happened
}
```

#### Chrome Extension APIs
```javascript
// ✅ GOOD - Handle message passing errors
chrome.tabs.sendMessage(tabId, message, (response) => {
  if (chrome.runtime.lastError) {
    console.error('Message failed:', chrome.runtime.lastError);
    return;
  }
  processResponse(response);
});

// ❌ BAD - Assume messages always succeed
chrome.tabs.sendMessage(tabId, message, (response) => {
  processResponse(response); // May crash if message failed
});

// ✅ GOOD - Check if content script is ready
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, {action: 'ping'});
  } catch {
    // Inject content script
    await chrome.scripting.executeScript({
      target: {tabId},
      files: ['content.js']
    });
  }
}
```

#### DOM Manipulation
```javascript
// ✅ GOOD - Efficient NodeIterator
const walker = document.createNodeIterator(
  document.body,
  NodeFilter.SHOW_TEXT,
  {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (parent.matches('script, style, noscript')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  }
);

// ❌ BAD - Slow recursive function
function findTextNodes(element) {
  let textNodes = [];
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      textNodes.push(child);
    } else {
      textNodes = textNodes.concat(findTextNodes(child));
    }
  }
  return textNodes;
}
```

### Testing Protocol

#### Before Committing ANY Change

**Functional Testing**:
- [ ] Extension loads without errors in `chrome://extensions/`
- [ ] All three providers connect successfully
- [ ] Translation works on at least 3 different websites
- [ ] "Restore Original" reverses translation correctly
- [ ] Settings persist after browser restart
- [ ] Context menu "Translate with AI" works
- [ ] Connection test shows correct status

**Website Testing** (test on these types):
- [ ] Static content (Wikipedia article)
- [ ] Dynamic content (Twitter/X, Reddit)
- [ ] News site (CNN, BBC)
- [ ] Documentation site (MDN, GitHub README)
- [ ] E-commerce site (Amazon product page)

**Provider Testing**:
- [ ] LM Studio: With model loaded
- [ ] LM Studio: Without model (should show friendly error)
- [ ] Ollama: With OLLAMA_ORIGINS set
- [ ] Ollama: Without OLLAMA_ORIGINS (should show CORS error with hint)
- [ ] OpenAI: With valid API key
- [ ] OpenAI: With invalid API key (should show auth error)

**Edge Cases**:
- [ ] Very long text (>1000 words)
- [ ] Empty page
- [ ] Page with special characters (emoji, CJK, RTL languages)
- [ ] Page with iframes
- [ ] Protected pages (should gracefully fail: chrome://, edge://)

**Console Checks**:
- [ ] No errors in extension service worker console
- [ ] No errors in page console
- [ ] No warnings about deprecated APIs

#### Regression Testing

After major changes, verify these don't break:
1. Provider switching (LM Studio → Ollama → OpenAI)
2. API key show/hide toggle
3. Model refresh button
4. Language selection persistence
5. Translation on page reload (should start fresh)

### Security Considerations

#### API Key Handling
```javascript
// ✅ GOOD - Store in Chrome sync (encrypted)
await chrome.storage.sync.set({apiKey: userInput});

// ❌ BAD - Store in localStorage (not encrypted, not synced)
localStorage.setItem('apiKey', userInput);

// ✅ GOOD - Never log API keys
console.log('Testing connection...');

// ❌ BAD - Logging sensitive data
console.log('API Key:', apiKey);
```

#### Input Validation
```javascript
// ✅ GOOD - Validate URLs
const url = apiUrlInput.value;
if (!url.startsWith('http://') && !url.startsWith('https://')) {
  showError('URL must start with http:// or https://');
  return;
}

// ✅ GOOD - Sanitize before using
const safeUrl = url.trim().replace(/\/+$/, ''); // Remove trailing slashes

// ❌ BAD - Trust user input blindly
const response = await fetch(apiUrlInput.value); // Could be malicious
```

#### Content Security Policy
- **DO NOT** use `eval()` or `new Function()`
- **DO NOT** use inline scripts in HTML
- **DO NOT** load external scripts (except from CDNs in manifest)
- **DO** validate all data from AI providers before rendering

### Performance Optimization

#### Batch Translation
```javascript
// ✅ GOOD - Batch multiple texts into one API call
const combined = texts.join('<<<LM_SEPARATOR>>>');
const result = await translateBatchText(combined, language);
const translations = result.split('<<<LM_SEPARATOR>>>');

// ❌ BAD - Individual API calls (slow, expensive)
for (const text of texts) {
  const translation = await translateText(text, language);
  translations.push(translation);
}
```

#### DOM Updates
```javascript
// ✅ GOOD - Batch DOM updates
const fragment = document.createDocumentFragment();
textNodes.forEach(node => {
  node.textContent = translations[index++];
  fragment.appendChild(node);
});
container.appendChild(fragment);

// ❌ BAD - Individual DOM updates (causes reflows)
textNodes.forEach(node => {
  node.textContent = translations[index++];
  container.appendChild(node); // Reflow on each iteration!
});
```

#### Storage Access
```javascript
// ✅ GOOD - Batch storage reads
const settings = await chrome.storage.sync.get([
  'provider', 'apiUrl', 'apiKey', 'model', 'targetLanguage'
]);

// ❌ BAD - Multiple storage reads (slow)
const provider = await chrome.storage.sync.get('provider');
const apiUrl = await chrome.storage.sync.get('apiUrl');
// ... many more reads
```

## Common Pitfalls and Solutions

### Pitfall 1: Service Worker Restarts
**Problem**: Service workers restart after ~30 seconds of inactivity. Global variables are lost.

**Solution**: Store state in chrome.storage, not global variables.
```javascript
// ❌ BAD
let translationCache = {};

// ✅ GOOD
async function getCachedTranslation(key) {
  const {cache} = await chrome.storage.local.get('cache');
  return cache?.[key];
}
```

### Pitfall 2: Content Script Injection Timing
**Problem**: Trying to send messages before content script loads.

**Solution**: Inject content script on demand or check if ready.
```javascript
// ✅ GOOD
async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Content script not ready, inject it
    await chrome.scripting.executeScript({
      target: {tabId},
      files: ['content.js']
    });
    // Wait a bit for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    return await chrome.tabs.sendMessage(tabId, message);
  }
}
```

### Pitfall 3: CORS Issues
**Problem**: Direct fetch() from popup fails due to CORS.

**Solution**: Always make API calls from background.js (service worker).
```javascript
// ❌ BAD - In popup.js
const response = await fetch('http://localhost:1234/v1/models');

// ✅ GOOD - In popup.js
const models = await chrome.runtime.sendMessage({action: 'getModels'});

// ✅ GOOD - In background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getModels') {
    fetchModels().then(sendResponse);
    return true; // Keep channel open for async response
  }
});
```

### Pitfall 4: Text Node Filtering
**Problem**: Translating everything causes issues (numbers, code, etc.).

**Solution**: Filter text intelligently.
```javascript
// ✅ GOOD
function isTranslatable(text) {
  text = text.trim();
  if (text.length < 3) return false; // Too short
  if (/^\d+$/.test(text)) return false; // Only numbers
  if (/^[^a-zA-Z]+$/.test(text)) return false; // No letters
  return true;
}
```

### Pitfall 5: Memory Leaks
**Problem**: Storing references to DOM nodes prevents garbage collection.

**Solution**: Use WeakMap or store minimal data.
```javascript
// ✅ GOOD - WeakMap allows garbage collection
const originalTextMap = new WeakMap();
originalTextMap.set(node, originalText);

// ❌ BAD - Strong reference prevents GC
const originalTextMap = new Map();
originalTextMap.set(node, originalText); // Node can't be GC'd
```

## Debugging Guide

### Extension Not Loading
1. Check `chrome://extensions/` for errors
2. Verify manifest.json syntax (JSON.parse it)
3. Check all file paths in manifest are correct
4. Look for syntax errors in JS files

### Translation Not Working
1. **Check Extension Console**: `chrome://extensions/` → Inspect service worker
2. **Check Page Console**: F12 on translated page
3. **Verify Provider**: Test Connection button
4. **Check Network Tab**: Look for failed API calls
5. **Verify Content Script**: `chrome.tabs.sendMessage` working?

### Provider Connection Failing
**LM Studio**:
- Is LM Studio running? Check port 1234
- Is CORS enabled? LM Studio settings → Enable CORS
- Is a model loaded? Load a model in LM Studio

**Ollama**:
- Is Ollama running? `ollama list` in terminal
- Is OLLAMA_ORIGINS set? `echo $OLLAMA_ORIGINS`
- Try: `OLLAMA_ORIGINS="*" ollama serve`

**OpenAI**:
- Is API key valid? Check OpenAI dashboard
- Is billing enabled? Check OpenAI billing
- Rate limits? Check error message for 429

### Settings Not Saving
1. Check chrome.storage.sync.set() is called
2. Verify sync is enabled in Chrome settings
3. Check storage quota (sync has limits)
4. Look for errors in console

## File-by-File Checklist

### When Modifying `manifest.json`
- [ ] Validate JSON syntax
- [ ] Only add necessary permissions
- [ ] Update version number if needed
- [ ] Test extension loads after changes
- [ ] Check all referenced files exist

### When Modifying `background.js`
- [ ] Test with all three providers
- [ ] Verify error handling for API failures
- [ ] Check timeout handling
- [ ] Ensure proper message listeners
- [ ] Test service worker restart scenarios

### When Modifying `content.js`
- [ ] Test on multiple website types
- [ ] Verify text extraction logic
- [ ] Check DOM manipulation performance
- [ ] Test restoration (toggle off/on)
- [ ] Verify no memory leaks

### When Modifying `popup.js`
- [ ] Test UI state updates
- [ ] Verify settings save correctly
- [ ] Check connection testing
- [ ] Test provider switching
- [ ] Verify API key show/hide

### When Modifying `popup.html`
- [ ] Validate HTML structure
- [ ] Test responsive design
- [ ] Check accessibility (labels, ARIA)
- [ ] Verify CSS doesn't break layout
- [ ] Test with different zoom levels

## Version Control Best Practices

### Commit Messages
Follow conventional commits:
```
feat: add support for custom model parameters
fix: resolve API key not saving on provider switch
docs: update README with Ollama environment variable
style: improve popup button hover states
refactor: simplify translation batching logic
test: add connection testing for all providers
chore: update dependencies and regenerate icons
```

### What to Commit
- ✅ Source code (JS, HTML, CSS)
- ✅ Configuration (manifest.json)
- ✅ Documentation (README, CLAUDE.md)
- ✅ Icons (SVG + generated PNGs)
- ✅ License file

### What NOT to Commit
- ❌ node_modules/
- ❌ package-lock.json (unless needed)
- ❌ .DS_Store (macOS)
- ❌ API keys or secrets
- ❌ Personal test files
- ❌ Build artifacts (.crx, .pem)

## Future Enhancement Considerations

When adding features, consider:

### Auto-detect Source Language
- Use AI to detect source language first
- Update UI to show detected language
- Cache detection to avoid redundant calls

### Translation History
- Store recent translations in chrome.storage.local
- Add "Recent Translations" dropdown
- Implement cache expiration

### Selection Translation
- Add context menu for selected text only
- Translate inline without replacing
- Show translation in tooltip/popup

### Custom Prompts
- Allow users to customize system prompts
- Add prompt templates for different use cases
- Store prompts in settings

### Multiple Profiles
- Allow saving provider configurations
- Quick switch between profiles
- Import/export settings

## Resources and References

### Chrome Extension APIs
- [Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [chrome.tabs API](https://developer.chrome.com/docs/extensions/reference/tabs/)
- [chrome.runtime API](https://developer.chrome.com/docs/extensions/reference/runtime/)

### AI Provider APIs
- [LM Studio Docs](https://lmstudio.ai/docs)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

### Development Tools
- Chrome Extensions DevTools
- Chrome DevTools (Console, Network, Storage)
- Git for version control

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Generate icons from SVG
npm run generate-icons

# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select project directory

# Reload extension after changes
# Click reload icon in chrome://extensions/

# View service worker console
# chrome://extensions/ → Extension details → Inspect views: service worker

# View content script console
# F12 on any translated page
```

---

**Remember**: This is a privacy-focused extension. Always prioritize user privacy, security, and transparency in all development decisions.
