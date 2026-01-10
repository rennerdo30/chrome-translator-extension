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
  const statusDiv = document.getElementById('status');

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

  if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
    sendMessageToContentScript(tab.id, { action: 'getTranslationStatus' })
      .then(response => {
        if (response) {
          updateUI(response.isTranslating, response.hasTranslations);
        }
      })
      .catch(() => {
        // Content script might not be ready or not injected
        console.log('Content script not ready');
      });
  } else {
    statusDiv.textContent = 'Cannot translate this page';
    statusDiv.className = 'status disconnected';
    translateBtn.disabled = true;
    restoreBtn.disabled = true;
  }

  // Save settings when changed
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
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
      apiKeyInput.type = 'password';
      eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>`;
    }
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
    if (provider === 'lmstudio') {
      apiUrlInput.value = 'http://localhost:1234';
    } else if (provider === 'ollama') {
      apiUrlInput.value = 'http://localhost:11434';
    } else if (provider === 'openai') {
      apiUrlInput.value = 'https://api.openai.com';
    }
  }

  // Button event listeners
  translateBtn.addEventListener('click', async () => {
    await saveSettings();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) return;

    try {
      await sendMessageToContentScript(tab.id, {
        action: 'toggleTranslation',
        targetLanguage: targetLanguageSelect.value
      });

      // Update UI immediately
      updateUI(true, false);

      // Close popup
      window.close();
    } catch (error) {
      statusDiv.textContent = 'Error: Please refresh the page';
      statusDiv.className = 'status disconnected';
    }
  });

  restoreBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) return;

    try {
      await sendMessageToContentScript(tab.id, {
        action: 'toggleTranslation',
        targetLanguage: targetLanguageSelect.value
      });

      // Update UI immediately
      updateUI(false, false);

      // Close popup
      window.close();
    } catch (error) {
      statusDiv.textContent = 'Error: Please refresh the page';
      statusDiv.className = 'status disconnected';
    }
  });

  testConnectionBtn.addEventListener('click', testConnection);

  refreshModelsBtn.addEventListener('click', async () => {
    await saveSettings();
    refreshModelsBtn.textContent = '...';

    try {
      const settings = await getSettingsObject();
      const response = await chrome.runtime.sendMessage({
        action: 'getModels',
        settings: settings
      });

      if (response.success && response.models.length > 0) {
        // If we have models, pick the first one or show a list
        // For now, let's just pick the first one's ID
        const modelId = response.models[0].id;
        modelNameInput.value = modelId;
        saveSettings();
        statusDiv.textContent = `Found ${response.models.length} models. Selected: ${modelId}`;
        statusDiv.className = 'status connected';
      } else {
        statusDiv.textContent = 'No models found loaded';
        statusDiv.className = 'status disconnected';
      }
    } catch (error) {
      statusDiv.textContent = `Failed to fetch models: ${error.message}`;
      statusDiv.className = 'status disconnected';
    } finally {
      refreshModelsBtn.textContent = '↻';
    }
  });

  async function getSettingsObject() {
    return {
      provider: providerSelect.value,
      lmStudioUrl: providerSelect.value === 'lmstudio' ? apiUrlInput.value : (await chrome.storage.sync.get('lmStudioUrl')).lmStudioUrl,
      ollamaUrl: providerSelect.value === 'ollama' ? apiUrlInput.value : (await chrome.storage.sync.get('ollamaUrl')).ollamaUrl,
      openaiUrl: providerSelect.value === 'openai' ? apiUrlInput.value : (await chrome.storage.sync.get('openaiUrl')).openaiUrl,
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

  async function testConnection() {
    await saveSettings();
    const dot = document.getElementById('connectionDot');
    statusDiv.textContent = 'Testing connection...';
    statusDiv.className = 'status-message';

    try {
      const settings = await getSettingsObject();

      // Use background script to test connection to avoid CORS issues in popup
      const response = await chrome.runtime.sendMessage({
        action: 'getModels',
        settings: settings
      });

      if (response.success) {
        statusDiv.textContent = `Connected! Found ${response.models.length} model(s)`;
        statusDiv.className = 'status-message success';
        dot.className = 'status-dot connected';
        dot.title = 'Connected';
      } else {
        throw new Error(response.error || 'Connection failed');
      }
    } catch (error) {
      statusDiv.textContent = `Connection failed: ${error.message}`;
      statusDiv.className = 'status-message error';
      dot.className = 'status-dot disconnected';
      dot.title = 'Disconnected';
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