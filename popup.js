// i18n helper: falls back to the given English text if the message is missing
function t(key, substitutions, fallback) {
  const message = chrome.i18n.getMessage(key, substitutions);
  return message || fallback || key;
}

// Replace static texts with the active locale (elements carry data-i18n attributes)
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const message = chrome.i18n.getMessage(el.dataset.i18n);
    if (message) el.textContent = message;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const message = chrome.i18n.getMessage(el.dataset.i18nTitle);
    if (message) el.title = message;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const message = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (message) el.placeholder = message;
  });
}

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
    { id: 'deepseek-v4-flash', noteKey: 'recDeepseekFlash', note: 'Recommended: fast, inexpensive, ideal for translation' },
    { id: 'deepseek-v4-pro', noteKey: 'recDeepseekPro', note: 'Highest quality, slower and pricier' }
  ],
  openai: [
    { id: 'gpt-5-mini', noteKey: 'recGpt5Mini', note: 'Recommended: good quality/cost balance' },
    { id: 'gpt-5-nano', noteKey: 'recGpt5Nano', note: 'Fastest and cheapest' },
    { id: 'gpt-5.4-mini', noteKey: 'recGpt54Mini', note: 'Newer mid-tier' }
  ],
  ollama: [
    { id: 'qwen3', noteKey: 'recQwen3', note: 'Strong multilingual (if installed)' },
    { id: 'llama3.3', noteKey: 'recLlama33', note: 'General purpose (if installed)' },
    { id: 'gemma3', noteKey: 'recGemma3', note: 'Lightweight (if installed)' }
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
  applyI18n();

  // Element references
  const providerSelect = document.getElementById('provider');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const eyeIcon = document.getElementById('eyeIcon');
  const modelNameInput = document.getElementById('modelName');
  const modelDropdown = document.getElementById('modelDropdown');
  const modelDropdownToggle = document.getElementById('modelDropdownToggle');
  const refreshModelsBtn = document.getElementById('refreshModels');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const parallelRequestsInput = document.getElementById('parallelRequests');
  const batchSizeInput = document.getElementById('batchSize');
  const autoTranslateSiteCheckbox = document.getElementById('autoTranslateSite');
  const visionModeSelect = document.getElementById('visionMode');
  const ocrLanguagesGroup = document.getElementById('ocrLanguagesGroup');
  const visionOcrLanguagesInput = document.getElementById('visionOcrLanguages');
  const visionEndpointGroup = document.getElementById('visionEndpointGroup');
  const visionUrlInput = document.getElementById('visionUrl');
  const visionModelInput = document.getElementById('visionModel');
  const visionApiKeyInput = document.getElementById('visionApiKey');
  const translateBtn = document.getElementById('translateBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const testConnectionBtn = document.getElementById('testConnection');
  const statusDiv = document.getElementById('status');
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');

  let isTranslating = false;
  // Model ids reported by the current provider's /models endpoint
  let availableModelIds = [];
  // Filter only applies while the user is typing — opening the dropdown via
  // the toggle always shows the full list, regardless of the current value
  let modelFilterActive = false;

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

  // Image translation settings
  const visionSettings = await chrome.storage.sync.get(['visionMode', 'visionOcrLanguages', 'visionUrl', 'visionModel', 'visionApiKey']);
  visionModeSelect.value = visionSettings.visionMode || 'builtin';
  visionOcrLanguagesInput.value = visionSettings.visionOcrLanguages || 'eng';
  visionUrlInput.value = visionSettings.visionUrl || 'http://localhost:11434';
  visionModelInput.value = visionSettings.visionModel || '';
  visionApiKeyInput.value = visionSettings.visionApiKey || '';
  updateVisionUI();

  function updateVisionUI() {
    const builtin = visionModeSelect.value === 'builtin';
    ocrLanguagesGroup.classList.toggle('hidden', !builtin);
    visionEndpointGroup.classList.toggle('hidden', builtin);
  }

  async function saveVisionSettings() {
    await chrome.storage.sync.set({
      visionMode: visionModeSelect.value,
      visionOcrLanguages: visionOcrLanguagesInput.value.trim() || 'eng',
      visionUrl: visionUrlInput.value.trim(),
      visionModel: visionModelInput.value.trim(),
      visionApiKey: visionApiKeyInput.value
    });
  }

  visionModeSelect.addEventListener('change', async () => {
    updateVisionUI();
    await saveVisionSettings();
  });
  visionOcrLanguagesInput.addEventListener('change', saveVisionSettings);
  visionUrlInput.addEventListener('change', saveVisionSettings);
  visionModelInput.addEventListener('change', saveVisionSettings);
  visionApiKeyInput.addEventListener('change', saveVisionSettings);

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
      ? t('statusAutoTranslateOn', [currentHostname], `Auto-translate enabled for ${currentHostname}`)
      : t('statusAutoTranslateOff', [currentHostname], `Auto-translate disabled for ${currentHostname}`), 'success');
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
    showStatus(t('statusCannotTranslatePage', undefined, 'Cannot translate this page'), 'error');
    translateBtn.disabled = true;
    restoreBtn.disabled = true;
  }

  // Event listeners for settings changes
  providerSelect.addEventListener('change', async () => {
    updateProviderUI();
    await updateUrlInputDefault();
    await updateExecutionInputDefaults();
    await saveSettings();
    // Refresh connection state and the model list for the new provider
    testConnection();
  });
  apiUrlInput.addEventListener('change', async () => {
    // A different endpoint serves different models — drop the stale list
    availableModelIds = [];
    renderModelDropdown();
    await saveSettings();
  });
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
    modelNameInput.placeholder = PROVIDER_MODEL_PLACEHOLDERS[provider] || t('placeholderAutoDetect', undefined, DEFAULT_MODEL_PLACEHOLDER);
    // Models from the previous provider are no longer valid
    availableModelIds = [];
    renderModelDropdown();
  }

  // --- Editable model combobox -------------------------------------------
  // The dropdown always shows our per-provider recommendations plus every
  // model reported by the provider's /models endpoint; the input stays freely
  // editable for anything else.

  function setAvailableModels(modelIds) {
    availableModelIds = modelIds || [];
    renderModelDropdown();
  }

  function buildModelOption(id, note) {
    const option = document.createElement('div');
    option.className = 'combobox-option';
    option.setAttribute('role', 'option');
    const name = document.createElement('span');
    name.textContent = id;
    option.appendChild(name);
    if (note) {
      const noteEl = document.createElement('span');
      noteEl.className = 'option-note';
      noteEl.textContent = note;
      option.appendChild(noteEl);
    }
    option.addEventListener('click', async () => {
      modelNameInput.value = id;
      closeModelDropdown();
      await saveSettings();
    });
    return option;
  }

  // The provider dropdown entry may point at a different OpenAI-compatible
  // API (e.g. "OpenAI" with a DeepSeek or OpenRouter URL) — pick the
  // recommendation set for the API the URL actually targets
  function getRecommendationProvider() {
    const url = (apiUrlInput.value || '').toLowerCase();
    if (url.includes('deepseek')) return 'deepseek';
    if (url.includes('openai')) return 'openai';
    return providerSelect.value;
  }

  function renderModelDropdown() {
    let recommendations = PROVIDER_MODEL_RECOMMENDATIONS[getRecommendationProvider()] || [];
    // Once the endpoint reports its models, only recommend what it serves
    if (availableModelIds.length > 0) {
      recommendations = recommendations.filter(r => availableModelIds.includes(r.id));
    }
    const recommendedIds = new Set(recommendations.map(r => r.id));
    const fetched = availableModelIds.filter(id => !recommendedIds.has(id));

    const typed = modelFilterActive ? modelNameInput.value.trim().toLowerCase() : '';
    const matchesFilter = id => !typed || id.toLowerCase().includes(typed);

    modelDropdown.innerHTML = '';

    const visibleRecommendations = recommendations.filter(r => matchesFilter(r.id));
    if (visibleRecommendations.length > 0) {
      const header = document.createElement('div');
      header.className = 'combobox-section';
      header.textContent = t('dropdownRecommended', undefined, 'Recommended');
      modelDropdown.appendChild(header);
      visibleRecommendations.forEach(r => modelDropdown.appendChild(buildModelOption(r.id, t(r.noteKey, undefined, r.note))));
    }

    const visibleFetched = fetched.filter(matchesFilter);
    if (visibleFetched.length > 0) {
      const header = document.createElement('div');
      header.className = 'combobox-section';
      header.textContent = t('dropdownAvailable', undefined, 'Available models');
      modelDropdown.appendChild(header);
      visibleFetched.forEach(id => modelDropdown.appendChild(buildModelOption(id)));
    }

    if (modelDropdown.childElementCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'combobox-empty';
      empty.textContent = typed
        ? t('dropdownNoMatch', undefined, 'No matching models — free text is fine')
        : t('dropdownNoModels', undefined, 'No models detected yet — use Test Connection or type a model name');
      modelDropdown.appendChild(empty);
    }
  }

  function openModelDropdown(withFilter = false) {
    modelFilterActive = withFilter;
    renderModelDropdown();
    modelDropdown.classList.remove('hidden');
  }

  function closeModelDropdown() {
    modelFilterActive = false;
    modelDropdown.classList.add('hidden');
  }

  modelDropdownToggle.addEventListener('click', () => {
    if (modelDropdown.classList.contains('hidden')) {
      openModelDropdown(false);
    } else {
      closeModelDropdown();
    }
  });

  modelNameInput.addEventListener('input', () => {
    openModelDropdown(true);
  });

  modelNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModelDropdown();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.combobox')) {
      closeModelDropdown();
    }
  });

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
      showStatus(t('statusRefreshPage', undefined, 'Error: Please refresh the page'), 'error');
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
      showStatus(t('statusRefreshPage', undefined, 'Error: Please refresh the page'), 'error');
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
        setAvailableModels(modelIds);
        // Only auto-select when the user has not chosen a model yet
        if (!modelNameInput.value) {
          modelNameInput.value = modelIds[0];
          await saveSettings();
          showStatus(t('statusModelsFound', [String(modelIds.length), modelIds[0]], `Found ${modelIds.length} model(s). Selected: ${modelIds[0]}`), 'success');
        } else {
          showStatus(t('statusModelsFoundPick', [String(modelIds.length)], `Found ${modelIds.length} model(s) — open the model field to pick one`), 'success');
        }
      } else {
        showStatus(t('statusNoModels', undefined, 'No models found'), 'error');
      }
    } catch (error) {
      showStatus(t('statusRefreshFailed', [error.message], `Failed: ${error.message}`), 'error');
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
      return { valid: false, error: t('errUrlEmpty', undefined, 'URL cannot be empty') };
    }

    const trimmedUrl = url.trim();

    // Must start with http:// or https://
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return { valid: false, error: t('errUrlScheme', undefined, 'URL must start with http:// or https://') };
    }

    // Try to parse as URL
    try {
      const parsed = new URL(trimmedUrl);
      // Basic sanity check - must have a hostname
      if (!parsed.hostname) {
        return { valid: false, error: t('errUrlHost', undefined, 'URL must have a valid hostname') };
      }
      return { valid: true, url: trimmedUrl };
    } catch (e) {
      return { valid: false, error: t('errUrlInvalid', undefined, 'Invalid URL format') };
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
      statusText.textContent = t('statusOnline', undefined, 'Online');
      connectionStatus.title = t('statusOnline', undefined, 'Connected');
    } else if (connected === false) {
      connectionStatus.classList.add('error');
      statusText.textContent = t('statusOffline', undefined, 'Offline');
      connectionStatus.title = text || t('statusOffline', undefined, 'Connection failed');
    } else {
      statusText.textContent = t('statusChecking', undefined, 'Checking...');
      connectionStatus.title = t('statusTesting', undefined, 'Testing connection...');
    }
  }

  async function testConnection() {
    const saved = await saveSettings();
    if (!saved) return; // URL validation failed
    updateConnectionIndicator(null);
    showStatus(t('statusTesting', undefined, 'Testing connection...'), '');

    try {
      const settingsObj = await getSettingsObject();
      const response = await chrome.runtime.sendMessage({
        action: 'getModels',
        settings: settingsObj
      });

      if (response.success) {
        updateConnectionIndicator(true);
        setAvailableModels(response.models.map(m => m.id));
        showStatus(t('statusConnected', [String(response.models.length)], `Connected! Found ${response.models.length} model(s)`), 'success');
      } else {
        throw new Error(response.error || 'Connection failed');
      }
    } catch (error) {
      updateConnectionIndicator(false, error.message);
      showStatus(t('statusConnectionFailed', [error.message], `Connection failed: ${error.message}`), 'error');
    }
  }

  // --- Cache export/import ------------------------------------------------
  // chrome.storage.sync only holds ~100 KB, far too small for the translation
  // cache — settings sync via the Google account, the cache does not. These
  // buttons let users carry the cache to another browser manually.

  const exportCacheBtn = document.getElementById('exportCache');
  const importCacheBtn = document.getElementById('importCache');
  const importCacheFileInput = document.getElementById('importCacheFile');
  const CACHE_EXPORT_FORMAT = 'ai-translator-cache';
  const CACHE_EXPORT_VERSION = 1;

  // Newer timestamp wins on conflicting entries
  function mergeCache(existing, imported) {
    const merged = { ...existing };
    for (const [key, entry] of Object.entries(imported || {})) {
      if (!entry || typeof entry !== 'object') continue;
      if (!merged[key] || (entry.ts || 0) > (merged[key].ts || 0)) {
        merged[key] = entry;
      }
    }
    return merged;
  }

  exportCacheBtn.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get(['translationCache', 'imageTranslationCache']);
    const translationCache = stored.translationCache || {};
    const imageTranslationCache = stored.imageTranslationCache || {};
    const entryCount = Object.keys(translationCache).length + Object.keys(imageTranslationCache).length;

    const payload = {
      format: CACHE_EXPORT_FORMAT,
      version: CACHE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      translationCache,
      imageTranslationCache
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-translator-cache-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showStatus(t('statusCacheExported', [String(entryCount)], `Cache exported (${entryCount} entries)`), 'success');
  });

  importCacheBtn.addEventListener('click', () => importCacheFileInput.click());

  importCacheFileInput.addEventListener('change', async () => {
    const file = importCacheFileInput.files[0];
    importCacheFileInput.value = '';
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      if (payload.format !== CACHE_EXPORT_FORMAT || typeof payload.translationCache !== 'object') {
        throw new Error(t('errUrlInvalid', undefined, 'Invalid file format'));
      }

      const stored = await chrome.storage.local.get(['translationCache', 'imageTranslationCache']);
      const mergedTranslations = mergeCache(stored.translationCache || {}, payload.translationCache);
      const mergedImages = mergeCache(stored.imageTranslationCache || {}, payload.imageTranslationCache);
      await chrome.storage.local.set({
        translationCache: mergedTranslations,
        imageTranslationCache: mergedImages
      });

      const entryCount = Object.keys(mergedTranslations).length + Object.keys(mergedImages).length;
      showStatus(t('statusCacheImported', [String(entryCount)], `Cache imported (${entryCount} entries)`), 'success');
    } catch (error) {
      showStatus(t('statusCacheImportFailed', [error.message], `Cache import failed: ${error.message}`), 'error');
    }
  });

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
