/* Popup UI for the AI Translator extension. */

// --- Constants -------------------------------------------------------------

const PROVIDER = {
  LM_STUDIO: 'lmstudio',
  OLLAMA: 'ollama',
  OPENAI: 'openai'
};

const DEFAULT_URLS = {
  [PROVIDER.LM_STUDIO]: 'http://localhost:1234',
  [PROVIDER.OLLAMA]: 'http://localhost:11434',
  [PROVIDER.OPENAI]: 'https://api.openai.com'
};

// storage key that holds the endpoint of each provider
const URL_STORAGE_KEY = {
  [PROVIDER.LM_STUDIO]: 'lmStudioUrl',
  [PROVIDER.OLLAMA]: 'ollamaUrl',
  [PROVIDER.OPENAI]: 'openaiUrl'
};

const SETTINGS_KEYS = [
  'provider',
  'lmStudioUrl',
  'ollamaUrl',
  'openaiUrl',
  'apiKey',
  'targetLanguage',
  'model'
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
  modelSelected: (model) => `Model set to ${model}.`,
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
  const providerSelect = document.getElementById('provider');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const eyeIcon = document.getElementById('eyeIcon');
  const modelNameInput = document.getElementById('modelName');
  const refreshModelsBtn = document.getElementById('refreshModels');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const translateBtn = document.getElementById('translateBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const testConnectionBtn = document.getElementById('testConnection');
  const statusMessage = document.getElementById('status');
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');
  const pageNotice = document.getElementById('pageNotice');
  const pageNoticeText = document.getElementById('pageNoticeText');

  const settings = await chrome.storage.sync.get(SETTINGS_KEYS);

  providerSelect.value = settings.provider || DEFAULT_PROVIDER;
  updateProviderUI();
  apiUrlInput.value =
    settings[URL_STORAGE_KEY[providerSelect.value]] || DEFAULT_URLS[providerSelect.value] || '';
  apiKeyInput.value = settings.apiKey || '';
  modelNameInput.value = settings.model || '';
  targetLanguageSelect.value = settings.targetLanguage || DEFAULT_TARGET_LANGUAGE;

  // Reflect what the content script is currently doing on the active tab.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

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
    showPageNotice(MESSAGES.unsupportedPage);
    translateBtn.disabled = true;
    restoreBtn.disabled = true;
  }

  // --- Settings persistence ------------------------------------------------

  providerSelect.addEventListener('change', async () => {
    updateProviderUI();
    await applyProviderUrlDefault();
    await saveSettings();
  });
  apiUrlInput.addEventListener('change', saveSettings);
  apiKeyInput.addEventListener('change', saveSettings);
  modelNameInput.addEventListener('change', saveSettings);
  targetLanguageSelect.addEventListener('change', saveSettings);

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
    const needsApiKey = providerSelect.value === PROVIDER.OPENAI;
    apiKeyGroup.classList.toggle(CSS_CLASS.hidden, !needsApiKey);
  }

  async function applyProviderUrlDefault() {
    const provider = providerSelect.value;
    // Keep any custom endpoint the user saved for this provider.
    const saved = await chrome.storage.sync.get(Object.values(URL_STORAGE_KEY));
    apiUrlInput.value = saved[URL_STORAGE_KEY[provider]] || DEFAULT_URLS[provider] || '';
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
      showStatus(MESSAGES.pageNotReady, STATUS_VARIANT.ERROR);
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
      showStatus(MESSAGES.pageNotReady, STATUS_VARIANT.ERROR);
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
        const modelId = response.models[0].id;
        modelNameInput.value = modelId;
        await saveSettings();
        showStatus(
          MESSAGES.modelSelected(modelId),
          STATUS_VARIANT.SUCCESS
        );
      } else {
        showStatus(MESSAGES.noModels, STATUS_VARIANT.ERROR);
      }
    } catch (error) {
      showStatus(MESSAGES.modelLookupFailed(errorText(error)), STATUS_VARIANT.ERROR);
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
      return { valid: false, error: MESSAGES.urlEmpty };
    }

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return { valid: false, error: MESSAGES.urlScheme };
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (!parsed.hostname) {
        return { valid: false, error: MESSAGES.urlHost };
      }
      return { valid: true, url: trimmedUrl };
    } catch (error) {
      return { valid: false, error: MESSAGES.urlInvalid };
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
    await chrome.storage.sync.set({
      provider,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value,
      targetLanguage: targetLanguageSelect.value,
      [URL_STORAGE_KEY[provider]]: urlValidation.url
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
      showStatus(MESSAGES.connected(response.models.length), STATUS_VARIANT.SUCCESS);
    } catch (error) {
      updateConnectionIndicator(false);
      showStatus(MESSAGES.connectionFailed(errorText(error)), STATUS_VARIANT.ERROR);
    } finally {
      setBusy(testConnectionBtn, false);
    }
  }

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
