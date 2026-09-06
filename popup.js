/* Popup UI for the AI Translator extension. */

// --- Constants -------------------------------------------------------------

const PROVIDER = {
  LM_STUDIO: 'lmstudio',
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  DEEPSEEK: 'deepseek'
};

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
const DEFAULT_URLS = {
  [PROVIDER.LM_STUDIO]: 'http://localhost:1234',
  [PROVIDER.OLLAMA]: 'http://localhost:11434',
  [PROVIDER.OPENAI]: 'https://api.openai.com',
  [PROVIDER.DEEPSEEK]: 'https://api.deepseek.com'
};

// storage key that holds the endpoint of each provider
const URL_STORAGE_KEY = {
  [PROVIDER.LM_STUDIO]: 'lmStudioUrl',
  [PROVIDER.OLLAMA]: 'ollamaUrl',
  [PROVIDER.OPENAI]: 'openaiUrl',
  [PROVIDER.DEEPSEEK]: 'deepseekUrl'
};

// Providers that authenticate with a Bearer API key
const API_KEY_PROVIDERS = [PROVIDER.OPENAI, PROVIDER.DEEPSEEK];

// Per-provider hint for the model input when none is configured
const PROVIDER_MODEL_PLACEHOLDERS = {
  [PROVIDER.DEEPSEEK]: 'deepseek-v4-flash'
};
const DEFAULT_MODEL_PLACEHOLDER = 'Auto-detect';

// Recommended models per provider, shown as suggestions in the editable
// model dropdown (verified against provider docs, August 2026)
const PROVIDER_MODEL_RECOMMENDATIONS = {
  [PROVIDER.DEEPSEEK]: [
    { id: 'deepseek-v4-flash', noteKey: 'recDeepseekFlash', note: 'Recommended: fast, inexpensive, ideal for translation' },
    { id: 'deepseek-v4-pro', noteKey: 'recDeepseekPro', note: 'Highest quality, slower and pricier' }
  ],
  [PROVIDER.OPENAI]: [
    { id: 'gpt-5-mini', noteKey: 'recGpt5Mini', note: 'Recommended: good quality/cost balance' },
    { id: 'gpt-5-nano', noteKey: 'recGpt5Nano', note: 'Fastest and cheapest' },
    { id: 'gpt-5.4-mini', noteKey: 'recGpt54Mini', note: 'Newer mid-tier' }
  ],
  [PROVIDER.OLLAMA]: [
    { id: 'qwen3', noteKey: 'recQwen3', note: 'Strong multilingual (if installed)' },
    { id: 'llama3.3', noteKey: 'recLlama33', note: 'General purpose (if installed)' },
    { id: 'gemma3', noteKey: 'recGemma3', note: 'Lightweight (if installed)' }

  ],
  [PROVIDER.LM_STUDIO]: [] // suggestions come from the local server via model refresh
};

// Per-provider execution defaults (kept in sync with content.js).
// Local servers process one request at a time, so parallel requests only
// queue up; cloud APIs handle concurrency and larger batches well.
const PROVIDER_EXECUTION_DEFAULTS = {
  [PROVIDER.LM_STUDIO]: { parallelRequests: 1, batchSize: 10 },
  [PROVIDER.OLLAMA]: { parallelRequests: 1, batchSize: 10 },
  [PROVIDER.OPENAI]: { parallelRequests: 4, batchSize: 20 },
  [PROVIDER.DEEPSEEK]: { parallelRequests: 4, batchSize: 20 }
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

const SETTINGS_KEYS = [
  'provider',
  'lmStudioUrl',
  'ollamaUrl',
  'openaiUrl',
  'deepseekUrl',
  'apiKey',
  'targetLanguage',
  'model',
  'executionSettings'
];

const DEFAULT_PROVIDER = PROVIDER.LM_STUDIO;
const DEFAULT_TARGET_LANGUAGE = 'English';

const UNSUPPORTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'moz-extension://',
  'view-source:',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com'
];

const ACTION = {
  TOGGLE_TRANSLATION: 'toggleTranslation',
  RESTORE_TRANSLATION: 'restoreTranslation',
  GET_TRANSLATION_STATUS: 'getTranslationStatus',
  GET_MODELS: 'getModels'
};

const STATUS_VARIANT = {
  NEUTRAL: '',
  SUCCESS: 'success',
  ERROR: 'error'
};

// Single source of truth for user-facing copy, so no message is assembled
// from sentence fragments.
const MESSAGES = {
  urlEmpty: 'Enter the API endpoint of your provider.',
  urlScheme: 'The endpoint must start with http:// or https://.',
  urlHost: 'The endpoint needs a valid host name.',
  urlInvalid: 'That endpoint is not a valid URL.',
  unsupportedPage: 'This browser page cannot be translated. Open a normal website and try again.',
  pageNotReady: 'Reload the page, then try translating again.',
  testing: 'Testing connection…',
  connected: (count) =>
    isPlural(count)
      ? `Connected. ${formatCount(count)} models available.`
      : 'Connected. 1 model available.',
  connectionFailed: (reason) => `Connection failed: ${reason}`,
  modelsFoundSelected: (count, model) =>
    isPlural(count)
      ? `Found ${formatCount(count)} models. Model set to ${model}.`
      : `Found 1 model. Model set to ${model}.`,
  modelsFoundPick: (count) =>
    isPlural(count)
      ? `Found ${formatCount(count)} models. Open the model field to pick one.`
      : 'Found 1 model. Open the model field to pick one.',
  noModels: 'No models found. Load a model in your provider first.',
  modelLookupFailed: (reason) => `Could not list models: ${reason}`,
  unknownError: 'Unknown error'
};

const CONNECTION_LABEL = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Checking…'
};

const CONNECTION_TITLE = {
  online: 'Connected to the translation provider',
  offline: 'Not connected',
  checking: 'Testing the connection…'
};

const EYE_ICON_OPEN =
  '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
const EYE_ICON_CLOSED =
  '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

const API_KEY_TOGGLE_LABEL = {
  show: 'Show API key',
  hide: 'Hide API key'
};

const CSS_CLASS = {
  hidden: 'hidden',
  spinning: 'is-spinning',
  connected: 'connected',
  checking: 'checking',
  error: 'error',
  statusMessage: 'status-message',
  statusIndicator: 'status-indicator'
};

/** Locale-aware number formatting for counts shown in the UI. */
function formatCount(value) {
  return new Intl.NumberFormat(navigator.language).format(value);
}

/** True when a count needs the plural wording of a message. */
function isPlural(count) {
  return new Intl.PluralRules('en').select(count) !== 'one';
}

function isUnsupportedUrl(url) {
  if (!url) return true;
  return UNSUPPORTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// --- UI --------------------------------------------------------------------

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
  const statusMessage = document.getElementById('status');
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');
  const pageNotice = document.getElementById('pageNotice');
  const pageNoticeText = document.getElementById('pageNoticeText');

  let isTranslating = false;
  // Model ids reported by the current provider's /models endpoint
  let availableModelIds = [];
  // Filter only applies while the user is typing — opening the dropdown via
  // the toggle always shows the full list, regardless of the current value
  let modelFilterActive = false;

  const settings = await chrome.storage.sync.get(SETTINGS_KEYS);

  providerSelect.value = settings.provider || DEFAULT_PROVIDER;
  updateProviderUI();
  apiUrlInput.value =
    settings[URL_STORAGE_KEY[providerSelect.value]] || DEFAULT_URLS[providerSelect.value] || '';
  apiKeyInput.value = settings.apiKey || '';
  modelNameInput.value = settings.model || '';
  targetLanguageSelect.value = settings.targetLanguage || DEFAULT_TARGET_LANGUAGE;
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

  // Reflect what the content script is currently doing on the active tab.
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

  if (tab && tab.id && !isUnsupportedUrl(tab.url)) {
    sendMessageToContentScript(tab.id, { action: ACTION.GET_TRANSLATION_STATUS })
      .then((response) => {
        if (response) {
          updateUI(response.isTranslating, response.hasTranslations);
        }
      })
      .catch((error) => {
        console.debug('Content script not reachable yet:', error && error.message);
      });
  } else {
    showPageNotice(t('statusCannotTranslatePage', undefined, MESSAGES.unsupportedPage));

    translateBtn.disabled = true;
    restoreBtn.disabled = true;
  }

  // --- Settings persistence ------------------------------------------------

  providerSelect.addEventListener('change', async () => {
    updateProviderUI();
    await applyProviderUrlDefault();
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

  toggleApiKeyBtn.addEventListener('click', () => {
    const reveal = apiKeyInput.type === 'password';
    apiKeyInput.type = reveal ? 'text' : 'password';
    toggleApiKeyBtn.setAttribute('aria-pressed', String(reveal));
    const label = reveal ? API_KEY_TOGGLE_LABEL.hide : API_KEY_TOGGLE_LABEL.show;
    toggleApiKeyBtn.setAttribute('aria-label', label);
    toggleApiKeyBtn.title = label;
    eyeIcon.innerHTML = reveal ? EYE_ICON_CLOSED : EYE_ICON_OPEN;
  });

  function updateProviderUI() {
    const provider = providerSelect.value;
    apiKeyGroup.classList.toggle(CSS_CLASS.hidden, !API_KEY_PROVIDERS.includes(provider));
    modelNameInput.placeholder = PROVIDER_MODEL_PLACEHOLDERS[provider] || t('placeholderAutoDetect', undefined, DEFAULT_MODEL_PLACEHOLDER);

    // Models from the previous provider are no longer valid
    availableModelIds = [];
    renderModelDropdown();
  }

  async function applyProviderUrlDefault() {
    const provider = providerSelect.value;
    // Keep any custom endpoint the user saved for this provider.
    const saved = await chrome.storage.sync.get(Object.values(URL_STORAGE_KEY));
    apiUrlInput.value = saved[URL_STORAGE_KEY[provider]] || DEFAULT_URLS[provider] || '';
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
    if (url.includes(PROVIDER.DEEPSEEK)) return PROVIDER.DEEPSEEK;
    if (url.includes(PROVIDER.OPENAI)) return PROVIDER.OPENAI;
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
    modelDropdown.classList.remove(CSS_CLASS.hidden);
  }

  function closeModelDropdown() {
    modelFilterActive = false;
    modelDropdown.classList.add(CSS_CLASS.hidden);
  }

  modelDropdownToggle.addEventListener('click', () => {
    if (modelDropdown.classList.contains(CSS_CLASS.hidden)) {
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

  // --- Actions -------------------------------------------------------------

  translateBtn.addEventListener('click', async () => {
    if (!(await saveSettings())) return;

    const activeTab = await getActiveTab();
    if (!activeTab) return;

    try {
      await sendMessageToContentScript(activeTab.id, {
        action: ACTION.TOGGLE_TRANSLATION,
        targetLanguage: targetLanguageSelect.value
      });
      updateUI(true, false);
      window.close();
    } catch (error) {
      showStatus(t('statusRefreshPage', undefined, MESSAGES.pageNotReady), STATUS_VARIANT.ERROR);

    }
  });

  restoreBtn.addEventListener('click', async () => {
    const activeTab = await getActiveTab();
    if (!activeTab) return;

    try {
      await sendMessageToContentScript(activeTab.id, {
        action: ACTION.RESTORE_TRANSLATION
      });
      updateUI(false, false);
      window.close();
    } catch (error) {
      showStatus(t('statusRefreshPage', undefined, MESSAGES.pageNotReady), STATUS_VARIANT.ERROR);

    }
  });

  testConnectionBtn.addEventListener('click', testConnection);

  refreshModelsBtn.addEventListener('click', async () => {
    if (!(await saveSettings())) return;

    setBusy(refreshModelsBtn, true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: ACTION.GET_MODELS,
        settings: await getSettingsObject()
      });

      if (response && response.success && response.models && response.models.length > 0) {
        const modelIds = response.models.map((model) => model.id);
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
      showStatus(t('statusRefreshFailed', [errorText(error)], `Failed: ${errorText(error)}`), 'error');

    } finally {
      setBusy(refreshModelsBtn, false);
    }
  });

  async function getActiveTab() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return activeTab && activeTab.id ? activeTab : null;
  }

  async function getSettingsObject() {
    const stored = await chrome.storage.sync.get(Object.values(URL_STORAGE_KEY));
    const provider = providerSelect.value;
    const urls = {};
    Object.entries(URL_STORAGE_KEY).forEach(([providerId, key]) => {
      urls[key] = providerId === provider ? apiUrlInput.value : stored[key];
    });

    return {
      provider,
      ...urls,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value,
      targetLanguage: targetLanguageSelect.value
    };
  }

  function validateUrl(url) {
    const trimmedUrl = (url || '').trim();

    if (trimmedUrl === '') {
      return { valid: false, error: t('errUrlEmpty', undefined, MESSAGES.urlEmpty) };

    }

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return { valid: false, error: t('errUrlScheme', undefined, MESSAGES.urlScheme) };

    }

    try {
      const parsed = new URL(trimmedUrl);
      if (!parsed.hostname) {
        return { valid: false, error: t('errUrlHost', undefined, 'URL must have a valid hostname') };
      }
      return { valid: true, url: trimmedUrl };
    } catch (e) {
      return { valid: false, error: t('errUrlInvalid', undefined, 'Invalid URL format') };

    }
  }

  async function saveSettings() {
    const urlValidation = validateUrl(apiUrlInput.value);
    if (!urlValidation.valid) {
      showStatus(urlValidation.error, STATUS_VARIANT.ERROR);
      apiUrlInput.setAttribute('aria-invalid', 'true');
      apiUrlInput.focus();
      return false;
    }
    apiUrlInput.removeAttribute('aria-invalid');

    const provider = providerSelect.value;

    // Execution overrides are stored per provider, so merge instead of replace.
    const defaults = getExecutionDefaults(provider);
    const parallelRequests = clampNumber(parallelRequestsInput.value, MIN_PARALLEL_REQUESTS, MAX_PARALLEL_REQUESTS, defaults.parallelRequests);
    const batchSize = clampNumber(batchSizeInput.value, MIN_BATCH_SIZE, MAX_BATCH_SIZE, defaults.batchSize);
    // Reflect clamped values back so the UI matches what is stored
    parallelRequestsInput.value = parallelRequests;
    batchSizeInput.value = batchSize;

    const stored = await chrome.storage.sync.get(['executionSettings']);

    await chrome.storage.sync.set({
      provider,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value,
      targetLanguage: targetLanguageSelect.value,
      [URL_STORAGE_KEY[provider]]: urlValidation.url,
      executionSettings: {
        ...(stored.executionSettings || {}),
        [provider]: { parallelRequests, batchSize }
      }
    });
    return true;
  }

  function updateUI(translating, hasTranslations) {
    // "Restore original" must also be reachable once a translation has
    // finished, not only while it is still running.
    const showRestore = Boolean(translating || hasTranslations);
    restoreBtn.classList.toggle(CSS_CLASS.hidden, !showRestore);
    translateBtn.classList.toggle(CSS_CLASS.hidden, showRestore);
  }

  function showPageNotice(message) {
    pageNoticeText.textContent = message;
    pageNotice.classList.remove(CSS_CLASS.hidden);
  }

  function showStatus(message, variant = STATUS_VARIANT.NEUTRAL, busy = false) {
    statusMessage.className = CSS_CLASS.statusMessage;
    if (variant) statusMessage.classList.add(variant);
    statusMessage.textContent = '';

    if (busy) {
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      statusMessage.appendChild(spinner);
    }

    const text = document.createElement('span');
    text.textContent = message;
    statusMessage.appendChild(text);
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle(CSS_CLASS.spinning, busy);
    if (busy) {
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-busy');
    }
  }

  function updateConnectionIndicator(state) {
    connectionStatus.className = CSS_CLASS.statusIndicator;

    if (state === true) {
      connectionStatus.classList.add(CSS_CLASS.connected);
      statusText.textContent = CONNECTION_LABEL.online;
      connectionStatus.title = CONNECTION_TITLE.online;
    } else if (state === false) {
      connectionStatus.classList.add(CSS_CLASS.error);
      statusText.textContent = CONNECTION_LABEL.offline;
      connectionStatus.title = CONNECTION_TITLE.offline;
    } else {
      connectionStatus.classList.add(CSS_CLASS.checking);
      statusText.textContent = CONNECTION_LABEL.checking;
      connectionStatus.title = CONNECTION_TITLE.checking;
    }
  }

  function errorText(error) {
    return (error && error.message) || MESSAGES.unknownError;

  }

  async function testConnection() {
    if (!(await saveSettings())) return;

    updateConnectionIndicator(null);
    setBusy(testConnectionBtn, true);
    showStatus(MESSAGES.testing, STATUS_VARIANT.NEUTRAL, true);


    try {
      const response = await chrome.runtime.sendMessage({
        action: ACTION.GET_MODELS,
        settings: await getSettingsObject()
      });

      if (!response || !response.success) {
        throw new Error((response && response.error) || MESSAGES.unknownError);

      }

      updateConnectionIndicator(true);
      setAvailableModels(response.models.map((model) => model.id));
      showStatus(MESSAGES.connected(response.models.length), STATUS_VARIANT.SUCCESS);
    } catch (error) {
      updateConnectionIndicator(false);
      showStatus(MESSAGES.connectionFailed(errorText(error)), STATUS_VARIANT.ERROR);
    } finally {
      setBusy(testConnectionBtn, false);
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


  function sendMessageToContentScript(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // Probe the provider as soon as the popup opens so the header badge is
  // meaningful without any user interaction.
  testConnection();
});
