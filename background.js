chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    provider: 'lmstudio',
    lmStudioUrl: 'http://localhost:1234',
    ollamaUrl: 'http://localhost:11434',
    openaiUrl: 'https://api.openai.com',
    apiKey: '',
    targetLanguage: 'English',
    enabled: false
  });

  chrome.contextMenus.create({
    id: "translatePage",
    title: "Translate with AI",
    contexts: ["page", "selection"]
  });
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
  } else if (request.action === 'getModels') {
    fetchModels(request.settings)
      .then(models => sendResponse({ success: true, models }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function getProviderSettings() {
  const settings = await chrome.storage.sync.get(['provider', 'lmStudioUrl', 'ollamaUrl', 'openaiUrl', 'apiKey', 'model']);
  let baseUrl = '';
  let headers = {
    'Content-Type': 'application/json'
  };

  switch (settings.provider) {
    case 'ollama':
      baseUrl = settings.ollamaUrl || 'http://localhost:11434';
      break;
    case 'openai':
      baseUrl = settings.openaiUrl || 'https://api.openai.com';
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
      break;
    case 'lmstudio':
    default:
      baseUrl = settings.lmStudioUrl || 'http://localhost:1234';
      break;
  }

  // Remove trailing slash if present
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  return { baseUrl, headers, model: settings.model, provider: settings.provider };
}

async function fetchModels(settings) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let baseUrl = '';
    let headers = { 'Content-Type': 'application/json' };

    switch (settings.provider) {
      case 'ollama':
        baseUrl = settings.ollamaUrl || 'http://localhost:11434';
        break;
      case 'openai':
        baseUrl = settings.openaiUrl || 'https://api.openai.com';
        if (settings.apiKey) {
          headers['Authorization'] = `Bearer ${settings.apiKey}`;
        }
        break;
      case 'lmstudio':
      default:
        baseUrl = settings.lmStudioUrl || 'http://localhost:1234';
        break;
    }

    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    // Try /v1/models endpoint first (standard OpenAI format)
    let endpoint = `${baseUrl}/v1/models`;

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
      if (response.status === 404 && settings.provider === 'openai') {
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
  try {
    const { baseUrl, headers, model } = await getProviderSettings();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: headers,
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

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    throw new Error(`Language detection failed: ${error.message}`);
  }
}

async function translateBatchText(combinedText, targetLanguage) {
  try {
    const { baseUrl, headers, model } = await getProviderSettings();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: headers,
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

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    throw new Error(`Batch translation failed: ${error.message}`);
  }
}

async function translateText(text, targetLanguage) {
  try {
    const { baseUrl, headers, model } = await getProviderSettings();

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: headers,
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

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    throw new Error(`Translation failed: ${error.message}`);
  }
}