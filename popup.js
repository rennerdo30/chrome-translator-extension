document.addEventListener('DOMContentLoaded', async () => {
  // Element references
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
    'apiKey',
    'targetLanguage',
    'model'
  ]);

  providerSelect.value = settings.provider || 'lmstudio';
  updateProviderUI();

  // Set initial URL based on provider
  if (providerSelect.value === 'lmstudio') {
    apiUrlInput.value = settings.lmStudioUrl || 'http://localhost:1234';
  } else if (providerSelect.value === 'ollama') {
    apiUrlInput.value = settings.ollamaUrl || 'http://localhost:11434';
  } else if (providerSelect.value === 'openai') {
    apiUrlInput.value = settings.openaiUrl || 'https://api.openai.com';
  }

  apiKeyInput.value = settings.apiKey || '';
  modelNameInput.value = settings.model || '';
  targetLanguageSelect.value = settings.targetLanguage || 'English';

  // Check current translation status
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

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
  providerSelect.addEventListener('change', () => {
    updateProviderUI();
    updateUrlInputDefault();
    saveSettings();
  });
  apiUrlInput.addEventListener('change', saveSettings);
  apiKeyInput.addEventListener('change', saveSettings);
  modelNameInput.addEventListener('change', saveSettings);
  targetLanguageSelect.addEventListener('change', saveSettings);

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
    if (provider === 'openai') {
      apiKeyGroup.classList.remove('hidden');
    } else {
      apiKeyGroup.classList.add('hidden');
    }
  }

  function updateUrlInputDefault() {
    const provider = providerSelect.value;
    const defaults = {
      lmstudio: 'http://localhost:1234',
      ollama: 'http://localhost:11434',
      openai: 'https://api.openai.com'
    };
    apiUrlInput.value = defaults[provider] || '';
  }

  // Translate button
  translateBtn.addEventListener('click', async () => {
    await saveSettings();
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
    await saveSettings();

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
        const modelId = response.models[0].id;
        modelNameInput.value = modelId;
        saveSettings();
        showStatus(`Found ${response.models.length} model(s). Selected: ${modelId}`, 'success');
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
    const stored = await chrome.storage.sync.get(['lmStudioUrl', 'ollamaUrl', 'openaiUrl']);
    return {
      provider: providerSelect.value,
      lmStudioUrl: providerSelect.value === 'lmstudio' ? apiUrlInput.value : stored.lmStudioUrl,
      ollamaUrl: providerSelect.value === 'ollama' ? apiUrlInput.value : stored.ollamaUrl,
      openaiUrl: providerSelect.value === 'openai' ? apiUrlInput.value : stored.openaiUrl,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value,
      targetLanguage: targetLanguageSelect.value
    };
  }

  async function saveSettings() {
    const settings = {
      provider: providerSelect.value,
      apiKey: apiKeyInput.value,
      model: modelNameInput.value,
      targetLanguage: targetLanguageSelect.value
    };

    // Save URL for the specific provider
    if (providerSelect.value === 'lmstudio') {
      settings.lmStudioUrl = apiUrlInput.value;
    } else if (providerSelect.value === 'ollama') {
      settings.ollamaUrl = apiUrlInput.value;
    } else if (providerSelect.value === 'openai') {
      settings.openaiUrl = apiUrlInput.value;
    }

    await chrome.storage.sync.set(settings);
  }

  function updateUI(translating, hasTranslations) {
    isTranslating = translating;

    if (translating) {
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
    await saveSettings();
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
