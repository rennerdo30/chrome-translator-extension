// Provider preset defaults (shared shape with popup.js PROVIDER_DEFAULT_URLS)
const PROVIDER_DEFAULT_URLS = {
  lmstudio: 'http://localhost:1234',
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com',
  deepseek: 'https://api.deepseek.com'
};

// Providers whose default model should be pre-selected when none is configured.
// Note: DeepSeek retired 'deepseek-chat'/'deepseek-reasoner' on 2026-07-24;
// the current lineup is deepseek-v4-flash (fast/cheap) and deepseek-v4-pro.
const PROVIDER_DEFAULT_MODELS = {
  deepseek: 'deepseek-v4-flash'
};

// Providers that authenticate with a Bearer API key
const API_KEY_PROVIDERS = ['openai', 'deepseek'];

// Translation cache (chrome.storage.local). Entries are keyed by
// provider/model/target language/exact source text, so any change in the
// source text (or provider setup) is a cache miss and gets retranslated.
const CACHE_STORAGE_KEY = 'translationCache';
const MAX_CACHE_ENTRIES = 10000; // ~2 MB of chrome.storage.local; acts as a per-site "locale file"

chrome.runtime.onInstalled.addListener(async () => {
  // Only set defaults for keys that don't already exist
  const defaults = {
    provider: 'lmstudio',
    lmStudioUrl: PROVIDER_DEFAULT_URLS.lmstudio,
    ollamaUrl: PROVIDER_DEFAULT_URLS.ollama,
    openaiUrl: PROVIDER_DEFAULT_URLS.openai,
    deepseekUrl: PROVIDER_DEFAULT_URLS.deepseek,
    apiKey: '',
    targetLanguage: 'English',
    model: '',
    autoTranslateSites: []
  };

  const existing = await chrome.storage.sync.get(Object.keys(defaults));
  const toSet = {};

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (existing[key] === undefined) {
      toSet[key] = defaultValue;
    }
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
  }

  // Create context menu (use try-catch in case it already exists)
  try {
    chrome.contextMenus.create({
      id: "translatePage",
      title: "Translate with AI",
      contexts: ["page", "selection"]
    });
  } catch (e) {
    // Menu already exists, ignore
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translatePage") {
    if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      console.warn('Cannot translate this page');
      return;
    }

    const settings = await chrome.storage.sync.get(['targetLanguage']);
    const targetLanguage = settings.targetLanguage || 'English';

    try {
      // Try sending message first
      await chrome.tabs.sendMessage(tab.id, {
        action: 'toggleTranslation',
        targetLanguage: targetLanguage
      });
    } catch (error) {
      console.log('Content script not ready, injecting...', error);
      // If fails, inject script and retry
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });

        // Wait a bit for script to initialize
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              action: 'toggleTranslation',
              targetLanguage: targetLanguage
            });
          } catch (retryError) {
            console.error('Failed to translate after injection:', retryError);
          }
        }, 100);
      } catch (injectionError) {
        console.error('Failed to inject content script:', injectionError);
      }
    }
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translateText(request.text, request.targetLanguage)
      .then(translation => sendResponse({ success: true, translation }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'translateBatch') {
    translateBatchText(request.text, request.targetLanguage)
      .then(translation => sendResponse({ success: true, translation }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'detectLanguage') {
    detectLanguage(request.text)
      .then(language => sendResponse({ success: true, language }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  } else if (request.action === 'getModels') {
    fetchModels(request.settings)
      .then(models => sendResponse({ success: true, models }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getCachedTranslations') {
    getCachedTranslations(request.texts, request.targetLanguage)
      .then(translations => sendResponse({ success: true, translations }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'storeCachedTranslations') {
    storeCachedTranslations(request.entries, request.targetLanguage)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Cache key includes provider, model and target language so switching any of
// them never reuses a stale translation; the exact source text is part of the
// key, so a changed word on the page is a miss and gets retranslated.
function buildCacheKey(provider, model, targetLanguage, text) {
  return JSON.stringify([provider || 'lmstudio', model || '', targetLanguage || '', text]);
}

async function getCachedTranslations(texts, targetLanguage) {
  const { provider, model } = await getProviderSettings();
  const stored = await chrome.storage.local.get(CACHE_STORAGE_KEY);
  const cache = stored[CACHE_STORAGE_KEY] || {};
  const translations = {};

  for (const text of texts || []) {
    const entry = cache[buildCacheKey(provider, model, targetLanguage, text)];
    if (entry && entry.translation) {
      translations[text] = entry.translation;
    }
  }

  console.debug(`Translation cache: ${Object.keys(translations).length}/${(texts || []).length} hits`);
  return translations;
}

// Serialize cache writes: parallel batches finishing at the same time would
// otherwise lose entries through read-modify-write races.
let cacheWriteQueue = Promise.resolve();

function storeCachedTranslations(entries, targetLanguage) {
  const write = cacheWriteQueue.then(async () => {
    if (!entries || entries.length === 0) return;

    const { provider, model } = await getProviderSettings();
    const stored = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const cache = stored[CACHE_STORAGE_KEY] || {};
    const now = Date.now();

    for (const { text, translation } of entries) {
      if (text && translation) {
        cache[buildCacheKey(provider, model, targetLanguage, text)] = { translation, ts: now };
      }
    }

    // Evict oldest entries beyond the cap
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
      for (const key of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) {
        delete cache[key];
      }
    }

    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
  });

  // Keep the queue alive even if one write fails
  cacheWriteQueue = write.catch(error => console.error('Cache write failed:', error));
  return write;
}

async function getProviderSettings() {
  const settings = await chrome.storage.sync.get(['provider', 'lmStudioUrl', 'ollamaUrl', 'openaiUrl', 'deepseekUrl', 'apiKey', 'model']);
  let baseUrl = '';
  let headers = {
    'Content-Type': 'application/json'
  };

  switch (settings.provider) {
    case 'ollama':
      baseUrl = settings.ollamaUrl || PROVIDER_DEFAULT_URLS.ollama;
      break;
    case 'openai':
      baseUrl = settings.openaiUrl || PROVIDER_DEFAULT_URLS.openai;
      break;
    case 'deepseek':
      baseUrl = settings.deepseekUrl || PROVIDER_DEFAULT_URLS.deepseek;
      break;
    case 'lmstudio':
    default:
      baseUrl = settings.lmStudioUrl || PROVIDER_DEFAULT_URLS.lmstudio;
      break;
  }

  if (API_KEY_PROVIDERS.includes(settings.provider)) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  }

  // Remove trailing slash if present
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const model = settings.model || PROVIDER_DEFAULT_MODELS[settings.provider] || '';

  return { baseUrl, headers, model, provider: settings.provider };
}

// Helper function to construct the correct API endpoint URL
// Handles cases where user enters full URL with /v1 already included
function getApiEndpoint(baseUrl, endpoint = '/v1/chat/completions') {
  // Normalize the base URL
  let url = baseUrl.trim();
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // Check if the URL already contains /v1 path
  // Common patterns: /v1, /api/v1, /v1/chat, etc.
  const hasV1Path = /\/v1(\/|$)/.test(url);

  if (hasV1Path) {
    // URL already contains /v1, check if it has the full endpoint
    if (url.endsWith('/chat/completions')) {
      return url;
    }
    if (url.endsWith('/v1')) {
      return `${url}/chat/completions`;
    }
    // URL has /v1 somewhere but might have more path - append remaining
    // e.g., https://api.example.com/api/v1 -> https://api.example.com/api/v1/chat/completions
    if (!url.includes('/chat/completions')) {
      return `${url}/chat/completions`;
    }
    return url;
  }

  // No /v1 in URL, append the full endpoint
  return `${url}${endpoint}`;
}

// Helper function to format API errors with helpful messages
function formatApiError(status, errorText) {
  const errorBody = errorText ? ` - ${errorText.substring(0, 200)}` : '';

  switch (status) {
    case 401:
      return `Authentication failed (401). Please check your API key.${errorBody}`;
    case 403:
      return `Access forbidden (403). Your API key may not have permission or billing may be disabled.${errorBody}`;
    case 404:
      return `Endpoint not found (404). Please verify the API URL is correct.${errorBody}`;
    case 405:
      return `Method not allowed (405). The API URL may be incorrect or the endpoint doesn't support this request.${errorBody}`;
    case 429:
      return `Rate limit exceeded (429). Please wait before making more requests.${errorBody}`;
    case 500:
    case 502:
    case 503:
      return `Server error (${status}). The AI service may be temporarily unavailable.${errorBody}`;
    default:
      return `API error (${status})${errorBody}`;
  }
}

// Helper function to construct models endpoint URL
function getModelsEndpoint(baseUrl) {
  let url = baseUrl.trim();
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  const hasV1Path = /\/v1(\/|$)/.test(url);

  if (hasV1Path) {
    // URL contains /v1, extract base and append /models
    if (url.endsWith('/v1')) {
      return `${url}/models`;
    }
    // URL has /v1 somewhere in the middle (e.g., /api/v1)
    // Find the /v1 part and append /models after it
    const v1Index = url.lastIndexOf('/v1');
    const afterV1 = url.substring(v1Index + 3);
    if (afterV1 === '' || afterV1 === '/') {
      return `${url.substring(0, v1Index + 3)}/models`;
    }
    // Has more path after /v1, just append /models to base v1 path
    return `${url.substring(0, v1Index + 3)}/models`;
  }

  return `${url}/v1/models`;
}

async function fetchModels(settings) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let baseUrl = '';
    let headers = { 'Content-Type': 'application/json' };

    switch (settings.provider) {
      case 'ollama':
        baseUrl = settings.ollamaUrl || PROVIDER_DEFAULT_URLS.ollama;
        break;
      case 'openai':
        baseUrl = settings.openaiUrl || PROVIDER_DEFAULT_URLS.openai;
        break;
      case 'deepseek':
        baseUrl = settings.deepseekUrl || PROVIDER_DEFAULT_URLS.deepseek;
        break;
      case 'lmstudio':
      default:
        baseUrl = settings.lmStudioUrl || PROVIDER_DEFAULT_URLS.lmstudio;
        break;
    }

    if (API_KEY_PROVIDERS.includes(settings.provider) && settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    // Use helper to construct correct models endpoint
    let endpoint = getModelsEndpoint(baseUrl);

    try {
      const response = await fetch(endpoint, {
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }

      // If /v1/models fails with 404, try Ollama's /api/tags endpoint
      if (response.status === 404 && settings.provider === 'ollama') {
        const ollamaResponse = await fetch(`${baseUrl}/api/tags`, {
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        if (ollamaResponse.ok) {
          const ollamaData = await ollamaResponse.json();
          // Convert Ollama format to OpenAI format
          return (ollamaData.models || []).map(m => ({ id: m.name, object: 'model' }));
        }
      }

      // For OpenAI-compatible APIs (OpenRouter, Together, etc.) that don't have /models endpoint
      // Just return an empty array but don't throw - the API might still work for chat
      if (response.status === 404 && API_KEY_PROVIDERS.includes(settings.provider)) {
        // Return a placeholder to indicate the API is likely accessible
        // User needs to manually specify the model name
        return [{ id: settings.model || 'manual-model', object: 'model', note: 'Specify model manually' }];
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // If it's an abort error, provide a clearer message
      if (fetchError.name === 'AbortError') {
        throw new Error('Connection timeout');
      }
      throw fetchError;
    }
  } catch (error) {
    throw new Error(`Failed to connect to ${settings.provider}: ${error.message}`);
  }
}

async function detectLanguage(text) {
  const TIMEOUT_MS = 30000; // 30 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { baseUrl, headers, model } = await getProviderSettings();
    const apiEndpoint = getApiEndpoint(baseUrl);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: model || "local-model",
        messages: [
          {
            role: "system",
            content: "You are a language detection expert. Detect the language of the given text and respond with only the language name in English (e.g., 'English', 'Spanish', 'French', 'German', etc.). Be precise and consistent."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 50
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(formatApiError(response.status, errorText));
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Language detection timed out. The AI server may be slow or unresponsive.');
    }
    throw new Error(`Language detection failed: ${error.message}`);
  }
}

async function translateBatchText(combinedText, targetLanguage) {
  const TIMEOUT_MS = 60000; // 60 second timeout for batch (larger content)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { baseUrl, headers, model } = await getProviderSettings();
    const apiEndpoint = getApiEndpoint(baseUrl);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: model || "local-model",
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the following text segments to ${targetLanguage}. Each segment is separated by '<<<LM_SEPARATOR>>>'. Maintain the same separator pattern in your response. Only return the translated text segments with separators, no explanations or additional content.`
          },
          {
            role: "user",
            content: combinedText
          }
        ],
        temperature: 0.3
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(formatApiError(response.status, errorText));
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Translation timed out. The AI server may be slow or unresponsive.');
    }
    throw new Error(`Batch translation failed: ${error.message}`);
  }
}

async function translateText(text, targetLanguage) {
  const TIMEOUT_MS = 30000; // 30 second timeout for single text
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { baseUrl, headers, model } = await getProviderSettings();
    const apiEndpoint = getApiEndpoint(baseUrl);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: model || "local-model",
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the following text to ${targetLanguage}. Only return the translated text, no explanations or additional content.`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.3
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(formatApiError(response.status, errorText));
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Translation timed out. The AI server may be slow or unresponsive.');
    }
    throw new Error(`Translation failed: ${error.message}`);
  }
}