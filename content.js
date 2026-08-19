// Per-provider execution defaults (kept in sync with popup.js).
// Local servers process one request at a time, so parallel requests only
// queue up; cloud APIs handle concurrency and larger batches well.
const PROVIDER_EXECUTION_DEFAULTS = {
  lmstudio: { parallelRequests: 1, batchSize: 10 },
  ollama: { parallelRequests: 1, batchSize: 10 },
  openai: { parallelRequests: 4, batchSize: 20 },
  deepseek: { parallelRequests: 4, batchSize: 20 }
};
const FALLBACK_EXECUTION_DEFAULTS = { parallelRequests: 1, batchSize: 10 };
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 50;
const MIN_PARALLEL_REQUESTS = 1;
const MAX_PARALLEL_REQUESTS = 10;
const BATCH_DELAY_MS = 50; // Pause between batches per worker so the UI can update
const COMPLETION_NOTICE_DURATION_MS = 3000;
const DYNAMIC_SCAN_DEBOUNCE_MS = 800; // Collect DOM mutations before translating them
// Extension-owned elements that must never be picked up as page content
const OWN_UI_SELECTOR = '.lm-translated, .lm-progress-container, .lm-hover-tooltip';

let isTranslating = false;
let shouldStopTranslation = false;
let originalTexts = new Map();
let translatedTexts = new Map();
// Per-run counters used to tell the user how much came from cache vs. was
// (re)translated because the source text was new or changed
let cacheStats = { restored: 0, translated: 0 };
// Monotonic id for translation entries (initial run and dynamic additions)
let nextEntryIndex = 0;
// Dynamic content observation (SPAs, infinite scroll, lazy loading)
let mutationObserver = null;
let pendingDynamicNodes = new Set();
let dynamicScanTimer = null;
let activeTargetLanguage = null;

// Auto-translate: if the user enabled this site, translate on load. Combined
// with the translation cache this makes browsing feel like the site ships a
// locale for the target language — cached segments render instantly, only
// new or changed text hits the API.
async function maybeAutoTranslate() {
  try {
    const settings = await chrome.storage.sync.get(['autoTranslateSites', 'targetLanguage']);
    const sites = settings.autoTranslateSites || [];
    if (!sites.includes(location.hostname) || isTranslating) {
      return;
    }
    console.log(`Auto-translate enabled for ${location.hostname}, translating...`);
    shouldStopTranslation = false;
    translatePage(settings.targetLanguage || 'English', true);
  } catch (error) {
    console.warn('Auto-translate check failed:', error);
  }
}

maybeAutoTranslate();

// Timings and sizes for the in-page UI, kept in one place.
// (The progress panel's auto-dismiss delay is COMPLETION_NOTICE_DURATION_MS.)
const TOAST_DISMISS_DELAY_MS = 4000;
const TOOLTIP_OFFSET_PX = 6;
const TOOLTIP_VIEWPORT_MARGIN_PX = 8;

const IN_PAGE_TEXT = {
  noTranslatableText: 'No translatable text found on this page.',
  translating: 'Translating page…',
  done: 'Done',
  complete: 'Translation complete.',
  stopTranslation: 'Stop translation',
  translatingNewContent: 'Translating new content…',
  batchProgress: (completed, total) =>
    `${formatNumber(completed)} / ${formatNumber(total)} batches`,
  batchProgressWithCache: (completed, total, restored) =>
    `${formatNumber(completed)} / ${formatNumber(total)} batches · ${formatNumber(restored)} from cache`,
  completeWithCache: (restored, translated) =>
    `Done — ${formatNumber(restored)} from cache, ${formatNumber(translated)} newly translated`
};

function formatNumber(value) {
  return new Intl.NumberFormat(navigator.language).format(value);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleTranslation') {
    toggleTranslation(request.targetLanguage);
    sendResponse({ success: true, isTranslating });
  } else if (request.action === 'restoreTranslation') {
    // Explicit restore: works after a translation finished, when the
    // toggle would otherwise start a new translation run.
    shouldStopTranslation = true;
    restoreOriginalText();
    sendResponse({ success: true, isTranslating });
  } else if (request.action === 'getTranslationStatus') {
    sendResponse({ isTranslating, hasTranslations: translatedTexts.size > 0 });
  } else if (request.action === 'imageTranslationStarted') {
    showImageOverlay(request.srcUrl, 'Translating image...', { loading: true });
    sendResponse({ success: true });
  } else if (request.action === 'imageTranslationResult') {
    handleImageTranslationResult(request);
    sendResponse({ success: true });
  } else if (request.action === 'ping') {
    // Used to check if content script is loaded
    sendResponse({ pong: true });
  }
  return true; // Keep channel open for async responses
});

// --- Image translation overlay ----------------------------------------------

const imageOverlays = new Map(); // srcUrl -> overlay element

function handleImageTranslationResult(result) {
  if (result.error) {
    showImageOverlay(result.srcUrl, `Image translation failed: ${result.error}`, { error: true });
  } else if (result.noText) {
    showImageOverlay(result.srcUrl, 'No readable text found in this image.');
  } else {
    showImageOverlay(result.srcUrl, result.translation, { original: result.extractedText });
  }
}

function findImageForSrc(srcUrl) {
  for (const img of document.querySelectorAll('img')) {
    if (img.currentSrc === srcUrl || img.src === srcUrl) {
      return img;
    }
  }
  return null;
}

function showImageOverlay(srcUrl, text, options = {}) {
  removeImageOverlay(srcUrl);

  const overlay = document.createElement('div');
  overlay.className = 'lm-image-overlay';
  if (options.error) overlay.classList.add('lm-image-overlay-error');
  if (options.loading) overlay.classList.add('lm-image-overlay-loading');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'lm-image-overlay-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => removeImageOverlay(srcUrl));
  overlay.appendChild(closeBtn);

  const textEl = document.createElement('div');
  textEl.className = 'lm-image-overlay-text';
  textEl.textContent = text;
  if (options.original) {
    textEl.title = `Original: ${options.original}`;
  }
  overlay.appendChild(textEl);

  const img = findImageForSrc(srcUrl);
  if (img) {
    const rect = img.getBoundingClientRect();
    overlay.style.position = 'absolute';
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.bottom + window.scrollY + 4}px`;
    overlay.style.maxWidth = `${Math.max(rect.width, 220)}px`;
  } else {
    // Image not found in the DOM (e.g. CSS background) — show as a corner toast
    overlay.classList.add('lm-image-overlay-floating');
  }

  document.body.appendChild(overlay);
  imageOverlays.set(srcUrl, overlay);
}

function removeImageOverlay(srcUrl) {
  const existing = imageOverlays.get(srcUrl);
  if (existing && existing.parentNode) {
    existing.remove();
  }
  imageOverlays.delete(srcUrl);
}

function toggleTranslation(targetLanguage) {
  // Restore if a run is in progress OR the page currently shows translations
  if (isTranslating || translatedTexts.size > 0) {
    shouldStopTranslation = true;
    stopDynamicObserver();
    restoreOriginalText();
  } else {
    shouldStopTranslation = false;
    translatePage(targetLanguage);
  }
}

// --- Dynamic content observation -------------------------------------------
// Pages keep changing after load (SPAs, infinite scroll, lazy loading). While
// translations are active we watch for added nodes and run them through the
// same dedupe/cache/translate pipeline — silently, without the progress UI.

function startDynamicObserver() {
  if (mutationObserver) return;

  mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      // In-place text updates (SPA routers/frameworks often reuse text nodes)
      if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent && parent.closest(OWN_UI_SELECTOR)) continue;
        pendingDynamicNodes.add(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        // Ignore our own spans/UI and anything inside them
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (element && (element.closest(OWN_UI_SELECTOR))) continue;
        pendingDynamicNodes.add(node);
      }
    }
    if (pendingDynamicNodes.size > 0) {
      scheduleDynamicScan();
    }
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  console.log('Dynamic content observer started');
}

function stopDynamicObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
    console.log('Dynamic content observer stopped');
  }
  pendingDynamicNodes.clear();
  if (dynamicScanTimer) {
    clearTimeout(dynamicScanTimer);
    dynamicScanTimer = null;
  }
}

function scheduleDynamicScan() {
  if (dynamicScanTimer) return;
  dynamicScanTimer = setTimeout(() => {
    dynamicScanTimer = null;
    processDynamicNodes();
  }, DYNAMIC_SCAN_DEBOUNCE_MS);
}

async function processDynamicNodes() {
  // Translation was stopped/restored in the meantime
  if (shouldStopTranslation || !mutationObserver) {
    pendingDynamicNodes.clear();
    return;
  }
  // Initial run still in progress — try again shortly to avoid double work
  if (isTranslating) {
    scheduleDynamicScan();
    return;
  }

  const nodes = [...pendingDynamicNodes];
  pendingDynamicNodes.clear();

  const seenTextNodes = new Set();
  const textNodes = [];
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const candidates = node.nodeType === Node.TEXT_NODE ? [node] : getTextNodes(node);
    for (const textNode of candidates) {
      if (seenTextNodes.has(textNode)) continue;
      seenTextNodes.add(textNode);
      const parent = textNode.parentElement;
      if (!parent || parent.closest(OWN_UI_SELECTOR)) continue;
      textNodes.push(textNode);
    }
  }

  const textEntries = collectTextEntries(textNodes, activeTargetLanguage);
  if (textEntries.length === 0) return;

  console.log(`Dynamic content: translating ${textEntries.length} new text node(s)`);
  await translateEntries(textEntries, activeTargetLanguage, true);
}

// Minimum lengths for translatable text. CJK scripts (Chinese ideographs,
// Japanese kana, Korean hangul) pack whole words into 1-3 characters, so the
// Latin minimum would wrongly skip short headings like 情報 or 手続き.
const MIN_TEXT_LENGTH = 4;
const MIN_TEXT_LENGTH_CJK = 1;
const CJK_CHAR_REGEX = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯]/;

function meetsMinimumLength(text) {
  const minLength = CJK_CHAR_REGEX.test(text) ? MIN_TEXT_LENGTH_CJK : MIN_TEXT_LENGTH;
  return text.length >= minLength;
}

// Collect translatable entries from a list of text nodes, registering each in originalTexts
function collectTextEntries(textNodes, targetLanguage) {
  const textEntries = [];
  for (const node of textNodes) {
    const text = node.textContent.trim();
    if (meetsMinimumLength(text) && !isIgnoredText(text) && !isLikelyTargetLanguage(text, targetLanguage)) {
      const index = nextEntryIndex++;
      originalTexts.set(index, { node, text });
      textEntries.push({ index, text, node });
    }
  }
  return textEntries;
}

async function translatePage(targetLanguage, isAuto = false) {
  isTranslating = true;
  activeTargetLanguage = targetLanguage;

  const textEntries = collectTextEntries(getTextNodes(document.body), targetLanguage);

  if (textEntries.length === 0) {
    console.log('No text to translate');
    if (isAuto) {
      // SPA shells often load empty and render content moments later —
      // keep watching so that content gets translated when it arrives
      startDynamicObserver();
    } else {
      showToast(IN_PAGE_TEXT.noTranslatableText);
    }
    isTranslating = false;
    return;
  }

  // Keep translating content that appears later (SPAs, lazy loading, ...)
  startDynamicObserver();

  cacheStats = { restored: 0, translated: 0 };
  await translateEntries(textEntries, targetLanguage, false);
}

// Shared pipeline for initial page runs and dynamically added content:
// dedupe identical strings, restore cache hits, batch-translate the misses.
async function translateEntries(textEntries, targetLanguage, isDynamic) {
  // Group identical strings so each unique text is translated (and cached) once
  const entriesByText = new Map();
  for (const entry of textEntries) {
    if (!entriesByText.has(entry.text)) {
      entriesByText.set(entry.text, []);
    }
    entriesByText.get(entry.text).push(entry);
  }
  const uniqueTexts = [...entriesByText.keys()];

  // Restore whatever the cache already knows; anything new or changed on the
  // page is a cache miss and gets (re)translated below
  let cached = {};
  try {
    cached = await requestCachedTranslations(uniqueTexts, targetLanguage);
  } catch (error) {
    console.warn('Cache lookup failed, translating everything:', error);
  }

  const workItems = [];

  for (const text of uniqueTexts) {
    if (cached[text]) {
      entriesByText.get(text).forEach(entry => applyTranslation(entry, cached[text]));
      cacheStats.restored++;
    } else {
      workItems.push({ text, entries: entriesByText.get(text) });
    }
  }

  console.log(`Translation cache: ${uniqueTexts.length - workItems.length}/${uniqueTexts.length} unique segments restored, ${workItems.length} new/changed to translate${isDynamic ? ' (dynamic content)' : ''}`);

  if (shouldStopTranslation) {
    if (!isDynamic) {
      restoreOriginalText();
    }
    return;
  }

  if (workItems.length === 0) {
    if (!isDynamic) {
      // Fully served from cache — seamless restore, just tell the user briefly
      showCompletionNotice(`Restored ${cacheStats.restored} segments from cache`);
      isTranslating = false;
    }
    addHoverListeners();
    return;
  }

  await processBatches(workItems, targetLanguage, isDynamic);
}

function restoreOriginalText() {
  isTranslating = false;
  stopDynamicObserver();
  removeProgressUI();

  originalTexts.forEach(({ node, text, originalNode }) => {
    if (node && node.parentNode) {
      try {
        if (originalNode) {
          node.parentNode.replaceChild(originalNode, node);
        } else {
          node.textContent = text;
          node.classList.remove('lm-translated');
        }
      } catch (error) {
        console.warn('Failed to restore node, node may have been removed:', error);
      }
    }
  });

  removeHoverListeners();

  // Clear maps to prevent memory leaks
  originalTexts.clear();
  translatedTexts.clear();
}

function getTextNodes(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.parentElement.tagName === 'SCRIPT' ||
          node.parentElement.tagName === 'STYLE' ||
          node.parentElement.tagName === 'NOSCRIPT' ||
          node.parentElement.isContentEditable) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  return textNodes;
}

function isIgnoredText(text) {
  // Whitespace-only or number/punctuation-only content; the minimum length
  // is handled by meetsMinimumLength() (script-aware for CJK)
  return /^[\s\n\r]*$/.test(text) ||
    /^[0-9\s\-\.\/\(\)]*$/.test(text);
}

// Simple client-side language detection to filter obvious target language text
function isLikelyTargetLanguage(text, targetLanguage) {
  const lang = targetLanguage.toLowerCase();

  // English detection
  if (lang === 'english') {
    const englishWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use', 'her', 'way', 'many', 'come', 'could', 'time', 'very', 'when', 'much', 'know', 'take', 'than', 'only', 'think', 'also', 'back', 'after', 'first', 'well', 'year', 'work', 'such', 'make', 'even', 'here', 'good', 'this', 'give', 'most', 'us'];
    const words = text.toLowerCase().split(/[\s,.]+/);
    const englishWordCount = words.filter(word => englishWords.includes(word)).length;
    return englishWordCount > words.length * 0.4; // Increased threshold to 40%
  }

  // Add more language detection as needed
  return false;
}

function clampSetting(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function getExecutionSettings() {
  try {
    const stored = await chrome.storage.sync.get(['provider', 'executionSettings']);
    const provider = stored.provider || 'lmstudio';
    const defaults = PROVIDER_EXECUTION_DEFAULTS[provider] || FALLBACK_EXECUTION_DEFAULTS;
    const overrides = (stored.executionSettings && stored.executionSettings[provider]) || {};
    return {
      parallelRequests: clampSetting(overrides.parallelRequests, MIN_PARALLEL_REQUESTS, MAX_PARALLEL_REQUESTS, defaults.parallelRequests),
      batchSize: clampSetting(overrides.batchSize, MIN_BATCH_SIZE, MAX_BATCH_SIZE, defaults.batchSize)
    };
  } catch (error) {
    console.warn('Failed to read execution settings, using defaults:', error);
    return { ...FALLBACK_EXECUTION_DEFAULTS };
  }
}

async function processBatches(workItems, targetLanguage, isDynamic = false) {
  const { parallelRequests, batchSize } = await getExecutionSettings();

  const batches = [];
  for (let i = 0; i < workItems.length; i += batchSize) {
    batches.push(workItems.slice(i, i + batchSize));
  }

  console.log(`Processing ${batches.length} batches (${workItems.length} unique texts, batch size ${batchSize}, ${parallelRequests} parallel request(s))`);

  // Show progress for dynamic additions too — only pure cache restores are silent
  createProgressUI(batches.length, isDynamic ? IN_PAGE_TEXT.translatingNewContent : IN_PAGE_TEXT.translating);

  let completedBatches = 0;
  let nextBatchIndex = 0;

  // Worker pool: each worker pulls the next unprocessed batch until none are
  // left or the user stops the translation. With parallelRequests = 1 this
  // degrades to the previous sequential behavior.
  const worker = async () => {
    while (!shouldStopTranslation) {
      const index = nextBatchIndex++;
      if (index >= batches.length) return;

      try {
        await processBatch(batches[index], targetLanguage, index);
      } catch (error) {
        console.error(`Batch ${index} failed even after retry`, error);
      }

      completedBatches++;
      updateProgressUI(completedBatches, batches.length);

      // Small delay to let UI update and not freeze browser
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  };

  const workerCount = Math.min(parallelRequests, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (isDynamic) {
    if (shouldStopTranslation) {
      removeProgressUI();
    } else {
      updateProgressUI(batches.length, batches.length, true);
      scheduleProgressRemoval();
    }
    addHoverListeners();
    return;
  }

  if (shouldStopTranslation) {
    console.log('Translation stopped by user');
    restoreOriginalText(); // Restore if stopped by user
  } else {
    console.log('Page translation completed');
    updateProgressUI(batches.length, batches.length, true);
    scheduleProgressRemoval();
  }
  addHoverListeners();
  isTranslating = false;
}

// Apply a translated unique text to every page occurrence and remember it for caching
function applyBatchTranslations(batch, translations, targetLanguage) {
  const cacheEntries = [];

  batch.forEach((item, i) => {
    const translation = translations[i];
    if (translation && translation !== item.text) {
      item.entries.forEach(entry => applyTranslation(entry, translation));
      cacheEntries.push({ text: item.text, translation });
      cacheStats.translated++;
    }
  });

  storeCachedTranslationsInBackground(cacheEntries, targetLanguage);
}

function processBatch(batch, targetLanguage, batchIndex) {
  const textsToTranslate = batch.map(item => item.text);
  const combinedText = textsToTranslate.join('\n<<<LM_SEPARATOR>>>\n');

  return translateBatchText(combinedText, targetLanguage)
    .then(translatedBatch => {
      const translations = translatedBatch.split('<<<LM_SEPARATOR>>>').map(t => t.trim());

      if (translations.length !== batch.length) {
        console.warn(`Batch ${batchIndex} mismatch: got ${translations.length} translations for ${batch.length} texts. Retrying individually.`);
        return fallbackIndividualTranslation(batch, targetLanguage);
      }

      applyBatchTranslations(batch, translations, targetLanguage);
    })
    .catch(error => {
      console.error(`Translation error for batch ${batchIndex}:`, error);
      // Retry once before falling back
      return retryBatch(batch, targetLanguage, batchIndex);
    });
}

function retryBatch(batch, targetLanguage, batchIndex) {
  console.log(`Retrying batch ${batchIndex}...`);
  const textsToTranslate = batch.map(item => item.text);
  const combinedText = textsToTranslate.join('\n<<<LM_SEPARATOR>>>\n');

  return translateBatchText(combinedText, targetLanguage)
    .then(translatedBatch => {
      const translations = translatedBatch.split('<<<LM_SEPARATOR>>>').map(t => t.trim());
      if (translations.length !== batch.length) {
        return fallbackIndividualTranslation(batch, targetLanguage);
      }
      applyBatchTranslations(batch, translations, targetLanguage);
    })
    .catch(() => {
      return fallbackIndividualTranslation(batch, targetLanguage);
    });
}

function applyTranslation(entry, translation) {
  const originalEntry = originalTexts.get(entry.index);
  if (originalEntry && originalEntry.node && originalEntry.node.parentNode) {
    translatedTexts.set(entry.index, translation);

    const span = document.createElement('span');
    span.textContent = translation;
    span.classList.add('lm-translated');
    span.setAttribute('data-original', entry.text);

    try {
      originalEntry.node.parentNode.replaceChild(span, originalEntry.node);
      // Hover preview is available immediately, not only once the whole
      // page has finished translating.
      span.addEventListener('mouseenter', showOriginalText);
      span.addEventListener('mouseleave', hideOriginalText);
      originalTexts.set(entry.index, { node: span, text: entry.text, originalNode: originalEntry.node });
    } catch (error) {
      console.warn('Failed to replace node, node may have been removed:', error);
    }
  }
}

function fallbackIndividualTranslation(batch, targetLanguage) {
  const promises = batch.map(item =>
    translateText(item.text, targetLanguage)
      .then(translation => ({ item, translation }))
      .catch(error => {
        console.error('Individual translation failed:', error);
        return null;
      })
  );

  return Promise.all(promises).then(results => {
    const cacheEntries = [];
    results.filter(result => result).forEach(({ item, translation }) => {
      if (translation && translation !== item.text) {
        item.entries.forEach(entry => applyTranslation(entry, translation));
        cacheEntries.push({ text: item.text, translation });
        cacheStats.translated++;
      }
    });
    storeCachedTranslationsInBackground(cacheEntries, targetLanguage);
  });
}

async function translateBatchText(combinedText, targetLanguage) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'translateBatch',
      text: combinedText,
      targetLanguage: targetLanguage
    }, (response) => {
      // Check for chrome runtime errors first
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Message sending failed'));
        return;
      }
      // Validate response exists
      if (!response) {
        reject(new Error('No response from background script'));
        return;
      }
      if (response.success) {
        resolve(response.translation);
      } else {
        reject(new Error(response.error || 'Unknown translation error'));
      }
    });
  });
}

function requestCachedTranslations(texts, targetLanguage) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'getCachedTranslations',
      texts: texts,
      targetLanguage: targetLanguage
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Message sending failed'));
        return;
      }
      if (!response || !response.success) {
        reject(new Error((response && response.error) || 'Cache lookup failed'));
        return;
      }
      resolve(response.translations || {});
    });
  });
}

// Fire-and-forget: a failed cache write must never break the translation flow
function storeCachedTranslationsInBackground(entries, targetLanguage) {
  if (!entries || entries.length === 0) return;
  try {
    chrome.runtime.sendMessage({
      action: 'storeCachedTranslations',
      entries: entries,
      targetLanguage: targetLanguage
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to store translations in cache:', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.warn('Failed to store translations in cache:', error);
  }
}

async function translateText(text, targetLanguage) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'translate',
      text: text,
      targetLanguage: targetLanguage
    }, (response) => {
      // Check for chrome runtime errors first
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Message sending failed'));
        return;
      }
      // Validate response exists
      if (!response) {
        reject(new Error('No response from background script'));
        return;
      }
      if (response.success) {
        resolve(response.translation);
      } else {
        reject(new Error(response.error || 'Unknown translation error'));
      }
    });
  });
}

let hoverTooltip = null;

function addHoverListeners() {
  document.querySelectorAll('.lm-translated').forEach(element => {
    if (element && element.addEventListener) {
      element.addEventListener('mouseenter', showOriginalText);
      element.addEventListener('mouseleave', hideOriginalText);
    }
  });
}

function removeHoverListeners() {
  document.querySelectorAll('.lm-translated').forEach(element => {
    if (element && element.removeEventListener) {
      element.removeEventListener('mouseenter', showOriginalText);
      element.removeEventListener('mouseleave', hideOriginalText);
    }
  });
  if (hoverTooltip && hoverTooltip.parentNode) {
    hoverTooltip.remove();
    hoverTooltip = null;
  }
}

function showOriginalText(event) {
  const originalText = event.target.getAttribute('data-original');
  if (!originalText) return;

  hideOriginalText();

  hoverTooltip = document.createElement('div');
  hoverTooltip.className = 'lm-hover-tooltip';
  hoverTooltip.textContent = originalText;
  document.body.appendChild(hoverTooltip);

  // Keep the tooltip inside the viewport: flip above the text when there is
  // no room below, and clamp horizontally.
  const rect = event.target.getBoundingClientRect();
  const tooltipRect = hoverTooltip.getBoundingClientRect();
  const margin = TOOLTIP_VIEWPORT_MARGIN_PX;

  const fitsBelow =
    rect.bottom + TOOLTIP_OFFSET_PX + tooltipRect.height + margin <= window.innerHeight;
  const top = fitsBelow
    ? rect.bottom + TOOLTIP_OFFSET_PX
    : Math.max(margin, rect.top - TOOLTIP_OFFSET_PX - tooltipRect.height);

  const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
  const left = Math.min(Math.max(margin, rect.left), maxLeft);

  hoverTooltip.style.left = `${left}px`;
  hoverTooltip.style.top = `${top}px`;
}

function hideOriginalText() {
  if (hoverTooltip) {
    hoverTooltip.remove();
    hoverTooltip = null;
  }
}

// Progress UI
let progressContainer = null;
let progressBarFill = null;
let progressStatus = null;
let progressRemovalTimer = null;

function scheduleProgressRemoval() {
  if (progressRemovalTimer) clearTimeout(progressRemovalTimer);
  progressRemovalTimer = setTimeout(removeProgressUI, COMPLETION_NOTICE_DURATION_MS);
}

function createProgressUI(totalBatches, title = IN_PAGE_TEXT.translating) {
  if (progressContainer) removeProgressUI();
  // A stale auto-hide timer from a previous run must not remove the new UI
  if (progressRemovalTimer) {
    clearTimeout(progressRemovalTimer);
    progressRemovalTimer = null;
  }

  progressContainer = document.createElement('div');
  progressContainer.className = 'lm-progress-container';
  progressContainer.setAttribute('role', 'status');
  progressContainer.setAttribute('aria-live', 'polite');

  progressContainer.innerHTML = `
    <div class="lm-progress-header">
      <!-- Filled via textContent below so a caller-supplied title stays inert. -->
      <span></span>
      <button type="button" class="lm-close-btn" title="${IN_PAGE_TEXT.stopTranslation}" aria-label="${IN_PAGE_TEXT.stopTranslation}">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="lm-progress-bar-bg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="lm-progress-bar-fill"></div>
    </div>
    <div class="lm-progress-status">${IN_PAGE_TEXT.batchProgress(0, totalBatches)}</div>
  `;

  document.body.appendChild(progressContainer);

  // Set via textContent (not innerHTML interpolation) to keep the markup inert
  progressContainer.querySelector('.lm-progress-header span').textContent = title;

  progressBarFill = progressContainer.querySelector('.lm-progress-bar-fill');
  progressStatus = progressContainer.querySelector('.lm-progress-status');

  const closeBtn = progressContainer.querySelector('.lm-close-btn');
  closeBtn.addEventListener('click', () => {
    shouldStopTranslation = true;
    removeProgressUI();
    // Optionally restore original text? Or just stop?
    // For now, just stop new translations.
  });
}

function updateProgressUI(completed, total, isDone = false) {
  if (!progressContainer) return;

  // total can legitimately be 0 for an empty run; avoid rendering NaN%.
  const percentage = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  progressBarFill.style.width = `${percentage}%`;

  const progressBar = progressContainer.querySelector('.lm-progress-bar-bg');
  if (progressBar) {
    progressBar.setAttribute('aria-valuenow', String(Math.round(percentage)));
  }

  if (isDone) {
    progressStatus.textContent = cacheStats.restored > 0
      ? IN_PAGE_TEXT.completeWithCache(cacheStats.restored, cacheStats.translated)
      : IN_PAGE_TEXT.complete;
    const header = progressContainer.querySelector('.lm-progress-header span');
    if (header) header.textContent = IN_PAGE_TEXT.done;
  } else {
    progressStatus.textContent = cacheStats.restored > 0
      ? IN_PAGE_TEXT.batchProgressWithCache(completed, total, cacheStats.restored)
      : IN_PAGE_TEXT.batchProgress(completed, total);
  }
}

// Brief non-blocking notice reusing the progress UI (e.g. full cache restore)
function showCompletionNotice(message) {
  createProgressUI(1);
  updateProgressUI(1, 1, true);
  if (progressStatus) progressStatus.textContent = message;
  scheduleProgressRemoval();
}

function removeProgressUI() {
  if (progressRemovalTimer) {
    clearTimeout(progressRemovalTimer);
    progressRemovalTimer = null;
  }
  if (progressContainer && progressContainer.parentNode) {
    progressContainer.remove();
  }
  progressContainer = null;
  progressBarFill = null;
  progressStatus = null;
}

// Non-blocking replacement for alert(): a dismissible in-page toast that
// matches the progress panel.
let toastElement = null;
let toastTimer = null;

function showToast(message) {
  hideToast();

  toastElement = document.createElement('div');
  toastElement.className = 'lm-toast';
  toastElement.setAttribute('role', 'status');
  toastElement.setAttribute('aria-live', 'polite');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'lm-toast-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML =
    '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>';

  const text = document.createElement('span');
  text.textContent = message;

  toastElement.appendChild(icon);
  toastElement.appendChild(text);
  document.body.appendChild(toastElement);

  toastTimer = window.setTimeout(hideToast, TOAST_DISMISS_DELAY_MS);
}

function hideToast() {
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastElement) {
    toastElement.remove();
    toastElement = null;
  }
}