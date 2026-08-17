// Provider preset defaults (shared shape with background.js PROVIDER_DEFAULT_URLS)
const PROVIDER_DEFAULT_URLS = {
  lmstudio: 'http://localhost:1234',
  ollama: 'http://localhost:11434',
  openai: 'https://api.openai.com',
  deepseek: 'https://api.deepseek.com'
};

// Providers that authenticate with a Bearer API key
const API_KEY_PROVIDERS = ['openai', 'deepseek'];

// Per-provider hint for the model input when none is configured
const PROVIDER_MODEL_PLACEHOLDERS = {
  deepseek: 'deepseek-v4-flash'
};
const DEFAULT_MODEL_PLACEHOLDER = 'Auto-detect';

// Recommended models per provider, shown as suggestions in the editable
// model dropdown (verified against provider docs, August 2026)
const PROVIDER_MODEL_RECOMMENDATIONS = {
  deepseek: [
    { id: 'deepseek-v4-flash', note: 'Recommended: fast, inexpensive, ideal for translation' },
    { id: 'deepseek-v4-pro', note: 'Highest quality, slower and pricier' }
  ],
  openai: [
    { id: 'gpt-5-mini', note: 'Recommended: good quality/cost balance' },
    { id: 'gpt-5-nano', note: 'Fastest and cheapest' },
    { id: 'gpt-5.4-mini', note: 'Newer mid-tier' }
  ],
  ollama: [
    { id: 'qwen3', note: 'Strong multilingual (if installed)' },
    { id: 'llama3.3', note: 'General purpose (if installed)' },
    { id: 'gemma3', note: 'Lightweight (if installed)' }
  ],
  lmstudio: [] // suggestions come from the local server via model refresh
};

// Per-provider execution defaults (kept in sync with content.js).
// Local servers process one request at a time, so parallel requests only
// queue up; cloud APIs handle concurrency and larger batches well.
const PROVIDER_EXECUTION_DEFAULTS = {
  lmstudio: { parallelRequests: 1, batchSize: 10 },
  ollama: { parallelRequests: 1, batchSize: 10 },
  openai: { parallelRequests: 4, batchSize: 20 },
  deepseek: { parallelRequests: 4, batchSize: 20 }
};
const FALLBACK_EXECUTION_DEFAULTS = { parallelRequests: 1, batchSize: 10 };
const MIN_PARALLEL_REQUESTS = 1;
const MAX_PARALLEL_REQUESTS = 10;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 50;

function getExecutionDefaults(provider) {
  return PROVIDER_EXECUTION_DEFAULTS[provider] || FALLBACK_EXECUTION_DEFAULTS;
}

function clampNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

document.addEventListener('DOMContentLoaded', async () => {
  // Element references
  const providerSelect = document.getElementById('provider');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const eyeIcon = document.getElementById('eyeIcon');
  const modelNameInput = document.getElementById('modelName');
  const modelOptionsList = document.getElementById('modelOptions');
  const refreshModelsBtn = document.getElementById('refreshModels');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const parallelRequestsInput = document.getElementById('parallelRequests');
  const batchSizeInput = document.getElementById('batchSize');
  const autoTranslateSiteCheckbox = document.getElementById('autoTranslateSite');
  const translateBtn = document.getElementById('translateBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const testConnectionBtn = document.getElementById('testConnection');
  const statusDiv = document.getElementById('status');
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');

  let isTranslating = false;

  // Load saved settings
  const settings = await chrome.storage.sync.get([
    'provider',
    'lmStudioUrl',
    'ollamaUrl',
    'openaiUrl',
    'deepseekUrl',
    'apiKey',
    'targetLanguage',
    'model',
    'executionSettings'
  ]);

  providerSelect.value = settings.provider || 'lmstudio';
  updateProviderUI();

  // Set initial URL based on provider
  if (providerSelect.value === 'lmstudio') {
    apiUrlInput.value = settings.lmStudioUrl || PROVIDER_DEFAULT_URLS.lmstudio;
  } else if (providerSelect.value === 'ollama') {
    apiUrlInput.value = settings.ollamaUrl || PROVIDER_DEFAULT_URLS.ollama;
  } else if (providerSelect.value === 'openai') {
    apiUrlInput.value = settings.openaiUrl || PROVIDER_DEFAULT_URLS.openai;
  } else if (providerSelect.value === 'deepseek') {
    apiUrlInput.value = settings.deepseekUrl || PROVIDER_DEFAULT_URLS.deepseek;
  }

  apiKeyInput.value = settings.apiKey || '';
  modelNameInput.value = settings.model || '';
  targetLanguageSelect.value = settings.targetLanguage || 'English';
  applyExecutionInputs(providerSelect.value, settings.executionSettings);

  // Check current translation status
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Auto-translate checkbox reflects whether the current site is enabled
  let currentHostname = null;
  try {
    if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      currentHostname = new URL(tab.url).hostname;
    }
  } catch (error) {
    console.warn('Could not determine current hostname:', error);
  }

  if (currentHostname) {
    const { autoTranslateSites } = await chrome.storage.sync.get(['autoTranslateSites']);
    autoTranslateSiteCheckbox.checked = (autoTranslateSites || []).includes(currentHostname);
  } else {
    autoTranslateSiteCheckbox.disabled = true;
  }

  autoTranslateSiteCheckbox.addEventListener('change', async () => {
    if (!currentHostname) return;
    const { autoTranslateSites } = await chrome.storage.sync.get(['autoTranslateSites']);
    const sites = new Set(autoTranslateSites || []);
    if (autoTranslateSiteCheckbox.checked) {
      sites.add(currentHostname);
    } else {
      sites.delete(currentHostname);
    }
    await chrome.storage.sync.set({ autoTranslateSites: [...sites] });
    showStatus(autoTranslateSiteCheckbox.checked
      ? `Auto-translate enabled for ${currentHostname}`
      : `Auto-translate disabled for ${currentHostname}`, 'success');
  });

  if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://') && !tab.url.startsWith('about:')) {
    sendMessageToContentScript(tab.id, { action: 'getTranslationStatus' })
      .then(response => {
        if (response) {
          updateUI(response.isTranslating, response.hasTranslations);
        }
      })
      .catch(() => {
        console.log('Content script not ready');
      });
  } else {
    showStatus('Cannot translate this page', 'error');
    translateBtn.disabled = true;
    restoreBtn.disabled = true;
  }

  // Event listeners for settings changes
  providerSelect.addEventListener('change', async () => {
    updateProviderUI();
    await updateUrlInputDefault();
    await updateExecutionInputDefaults();
    await saveSettings();
  });
  apiUrlInput.addEventListener('change', saveSettings);
  apiKeyInput.addEventListener('change', saveSettings);
  modelNameInput.addEventListener('change', saveSettings);
  targetLanguageSelect.addEventListener('change', saveSettings);
  parallelRequestsInput.addEventListener('change', saveSettings);
  batchSizeInput.addEventListener('change', saveSettings);

  // Toggle API key visibility
  toggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    eyeIcon.innerHTML = isPassword
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  function updateProviderUI() {
    const provider = providerSelect.value;
    if (API_KEY_PROVIDERS.includes(provider)) {
      apiKeyGroup.classList.remove('hidden');
    } else {
      apiKeyGroup.classList.add('hidden');
    }
    modelNameInput.placeholder = PROVIDER_MODEL_PLACEHOLDERS[provider] || DEFAULT_MODEL_PLACEHOLDER;
    updateModelOptions(provider);
  }

  // Fill the editable model dropdown: recommended models first, then models
  // reported by the provider (deduplicated)
  function updateModelOptions(provider, fetchedModelIds = []) {
    const recommendations = PROVIDER_MODEL_RECOMMENDATIONS[provider] || [];
    const seen = new Set();
    modelOptionsList.innerHTML = '';

    for (const { id, note } of recommendations) {
      seen.add(id);
      const option = document.createElement('option');
      option.value = id;
      option.label = note;
      modelOptionsList.appendChild(option);
    }

    for (const id of fetchedModelIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const option = document.createElement('option');
      option.value = id;
      modelOptionsList.appendChild(option);
    }
  }

  async function updateUrlInputDefault() {
    const provider = providerSelect.value;

    // Load saved URLs to preserve custom URLs when switching providers
    const saved = await chrome.storage.sync.get(['lmStudioUrl', 'ollamaUrl', 'openaiUrl', 'deepseekUrl']);

    if (provider === 'lmstudio') {
      apiUrlInput.value = saved.lmStudioUrl || PROVIDER_DEFAULT_URLS.lmstudio;
    } else if (provider === 'ollama') {
      apiUrlInput.value = saved.ollamaUrl || PROVIDER_DEFAULT_URLS.ollama;
    } else if (provider === 'openai') {
      apiUrlInput.value = saved.openaiUrl || PROVIDER_DEFAULT_URLS.openai;
    } else if (provider === 'deepseek') {
      apiUrlInput.value = saved.deepseekUrl || PROVIDER_DEFAULT_URLS.deepseek;
    } else {
      apiUrlInput.value = PROVIDER_DEFAULT_URLS[provider] || '';
    }
  }

  // Fill the parallel/batch inputs with the provider's saved override or its defaults
  function applyExecutionInputs(provider, executionSettings) {
    const defaults = getExecutionDefaults(provider);
    const overrides = (executionSettings && executionSettings[provider]) || {};

    parallelRequestsInput.value = clampNumber(overrides.parallelRequests, MIN_PARALLEL_REQUESTS, MAX_PARALLEL_REQUESTS, defaults.parallelRequests);
    batchSizeInput.value = clampNumber(overrides.batchSize, MIN_BATCH_SIZE, MAX_BATCH_SIZE, defaults.batchSize);
    parallelRequestsInput.placeholder = defaults.parallelRequests;
    batchSizeInput.placeholder = defaults.batchSize;
  }

  async function updateExecutionInputDefaults() {
    const saved = await chrome.storage.sync.get(['executionSettings']);
    applyExecutionInputs(providerSelect.value, saved.executionSettings);
  }

  // Translate button
  translateBtn.addEventListener('click', async () => {
    const saved = await saveSettings();
    if (!saved) return; // URL validation failed
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) return;

    try {
      await sendMessageToContentScript(tab.id, {
        action: 'toggleTranslation',
        targetLanguage: targetLanguageSelect.value
      });
      updateUI(true, false);
      window.close();
    } catch (error) {
      showStatus('Error: Please refresh the page', 'error');
    }
  });

  // Restore button
  restoreBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) return;

    try {
      await sendMessageToContentScript(tab.id, {
        action: 'toggleTranslation',
        targetLanguage: targetLanguageSelect.value
      });
      updateUI(false, false);
      window.close();
    } catch (error) {
      showStatus('Error: Please refresh the page', 'error');
    }
  });

  // Test connection button
  testConnectionBtn.addEventListener('click', testConnection);

  // Refresh models button
  refreshModelsBtn.addEventListener('click', async () => {
    const saved = await saveSettings();
    if (!saved) return; // URL validation failed

    // Add spinning animation
    const svg = refreshModelsBtn.querySelector('svg');
    svg.style.animation = 'spin 0.6s linear infinite';

    try {
      const settingsObj = await getSettingsObject();
      const response = await chrome.runtime.sendMessage({
        action: 'getModels',
        settings: settingsObj
      });

      if (response.success && response.models.length > 0) {
        const modelIds = response.models.map(m => m.id);
        updateModelOptions(providerSelect.value, modelIds);
        // Only auto-select when the user has not chosen a model yet
        if (!modelNameInput.value) {
          modelNameInput.value = modelIds[0];
          await saveSettings();
          showStatus(`Found ${modelIds.length} model(s). Selected: ${modelIds[0]}`, 'success');
        } else {
          showStatus(`Found ${modelIds.length} model(s) — open the model field to pick one`, 'success');
        }
      } else {
        showStatus('No models found', 'error');
      }
    } catch (error) {
      showStatus(`Failed: ${error.message}`, 'error');
    } finally {
      svg.style.animation = '';
    }
  });

  async function getSettingsObject() {
    const stored = await chrome.storage.sync.get(['lmStudioUrl', 'ollamaUrl', 'openaiUrl', 'deepseekUrl']);
    return {
      provider: providerSelect.value,
      lmStudioUrl: providerSelect.value === 'lmstudio' ? apiUrlInput.value : stored.lmStudioUrl,
      ollamaUrl: providerSelect.value === 'ollama' ? apiUrlInput.value : stored.ollamaUrl,
      openaiUrl: providerSelect.value === 'openai' ? apiUrlInput.value : stored.openaiUrl,
      deepseekUrl: providerSelect.value === 'deepseek' ? apiUrlInput.value : stored.deepseekUrl,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value,
      targetLanguage: targetLanguageSelect.value
    };
  }

  // Validate URL format
  function validateUrl(url) {
    if (!url || url.trim() === '') {
      return { valid: false, error: 'URL cannot be empty' };
    }

    const trimmedUrl = url.trim();

    // Must start with http:// or https://
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return { valid: false, error: 'URL must start with http:// or https://' };
    }

    // Try to parse as URL
    try {
      const parsed = new URL(trimmedUrl);
      // Basic sanity check - must have a hostname
      if (!parsed.hostname) {
        return { valid: false, error: 'URL must have a valid hostname' };
      }
      return { valid: true, url: trimmedUrl };
    } catch (e) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  async function saveSettings() {
    // Validate URL before saving
    const urlValidation = validateUrl(apiUrlInput.value);
    if (!urlValidation.valid) {
      showStatus(urlValidation.error, 'error');
      return false;
    }

    const settings = {
      provider: providerSelect.value,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value,
      targetLanguage: targetLanguageSelect.value
    };

    // Save URL for the specific provider (use validated URL)
    const cleanUrl = urlValidation.url;
    if (providerSelect.value === 'lmstudio') {
      settings.lmStudioUrl = cleanUrl;
    } else if (providerSelect.value === 'ollama') {
      settings.ollamaUrl = cleanUrl;
    } else if (providerSelect.value === 'openai') {
      settings.openaiUrl = cleanUrl;
    } else if (providerSelect.value === 'deepseek') {
      settings.deepseekUrl = cleanUrl;
    }

    // Save execution settings per provider (merge to keep other providers' overrides)
    const provider = providerSelect.value;
    const defaults = getExecutionDefaults(provider);
    const parallelRequests = clampNumber(parallelRequestsInput.value, MIN_PARALLEL_REQUESTS, MAX_PARALLEL_REQUESTS, defaults.parallelRequests);
    const batchSize = clampNumber(batchSizeInput.value, MIN_BATCH_SIZE, MAX_BATCH_SIZE, defaults.batchSize);
    // Reflect clamped values back so the UI matches what is stored
    parallelRequestsInput.value = parallelRequests;
    batchSizeInput.value = batchSize;

    const stored = await chrome.storage.sync.get(['executionSettings']);
    settings.executionSettings = {
      ...(stored.executionSettings || {}),
      [provider]: { parallelRequests, batchSize }
    };

    await chrome.storage.sync.set(settings);
    return true;
  }

  function updateUI(translating, hasTranslations) {
    isTranslating = translating;

    // Offer "Restore" while translating AND after a completed run
    if (translating || hasTranslations) {
      translateBtn.classList.add('hidden');
      restoreBtn.classList.remove('hidden');
    } else {
      translateBtn.classList.remove('hidden');
      restoreBtn.classList.add('hidden');
    }
  }

  function showStatus(message, type = '') {
    statusDiv.textContent = message;
    statusDiv.className = 'status-message';
    if (type) {
      statusDiv.classList.add(type);
    }
  }

  function updateConnectionIndicator(connected, text) {
    connectionStatus.className = 'status-indicator';
    if (connected === true) {
      connectionStatus.classList.add('connected');
      statusText.textContent = 'Online';
      connectionStatus.title = 'Connected';
    } else if (connected === false) {
      connectionStatus.classList.add('error');
      statusText.textContent = 'Offline';
      connectionStatus.title = text || 'Connection failed';
    } else {
      statusText.textContent = 'Checking...';
      connectionStatus.title = 'Testing connection...';
    }
  }

  async function testConnection() {
    const saved = await saveSettings();
    if (!saved) return; // URL validation failed
    updateConnectionIndicator(null);
    showStatus('Testing connection...', '');

    try {
      const settingsObj = await getSettingsObject();
      const response = await chrome.runtime.sendMessage({
        action: 'getModels',
        settings: settingsObj
      });

      if (response.success) {
        updateConnectionIndicator(true);
        updateModelOptions(providerSelect.value, response.models.map(m => m.id));
        showStatus(`Connected! Found ${response.models.length} model(s)`, 'success');
      } else {
        throw new Error(response.error || 'Connection failed');
      }
    } catch (error) {
      updateConnectionIndicator(false, error.message);
      showStatus(`Connection failed: ${error.message}`, 'error');
    }
  }

  // Test connection on load
  testConnection();

  function sendMessageToContentScript(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
});
