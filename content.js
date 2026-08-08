let isTranslating = false;
let shouldStopTranslation = false;
let originalTexts = new Map();
let translatedTexts = new Map();

// Timings and sizes for the in-page UI, kept in one place.
const PROGRESS_DISMISS_DELAY_MS = 3000;
const TOAST_DISMISS_DELAY_MS = 4000;
const TOOLTIP_OFFSET_PX = 6;
const TOOLTIP_VIEWPORT_MARGIN_PX = 8;

const IN_PAGE_TEXT = {
  noTranslatableText: 'No translatable text found on this page.',
  translating: 'Translating page…',
  done: 'Done',
  complete: 'Translation complete.',
  stopTranslation: 'Stop translation',
  batchProgress: (completed, total) =>
    `${formatNumber(completed)} / ${formatNumber(total)} batches`
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
  } else if (request.action === 'ping') {
    // Used to check if content script is loaded
    sendResponse({ pong: true });
  }
  return true; // Keep channel open for async responses
});

function toggleTranslation(targetLanguage) {
  if (isTranslating) {
    shouldStopTranslation = true;
    restoreOriginalText();
  } else {
    shouldStopTranslation = false;
    translatePage(targetLanguage);
  }
}

function translatePage(targetLanguage) {
  isTranslating = true;

  const textNodes = getTextNodes(document.body);
  const textEntries = [];

  // Collect and filter text nodes
  textNodes.forEach((node, index) => {
    const text = node.textContent.trim();
    if (text.length > 3 && !isIgnoredText(text) && !isLikelyTargetLanguage(text, targetLanguage)) {
      originalTexts.set(index, { node, text });
      textEntries.push({ index, text, node });
    }
  });

  if (textEntries.length === 0) {
    console.log('No text to translate');
    showToast(IN_PAGE_TEXT.noTranslatableText);
    isTranslating = false;
    return;
  }

  // Process in batches
  processBatches(textEntries, targetLanguage);
}

function restoreOriginalText() {
  isTranslating = false;
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
  return /^[\s\n\r]*$/.test(text) ||
    /^[0-9\s\-\.\/\(\)]*$/.test(text) ||
    text.length < 3;
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

function processBatches(textEntries, targetLanguage) {
  const BATCH_SIZE = 10; // Process 10 text chunks at once
  const batches = [];

  for (let i = 0; i < textEntries.length; i += BATCH_SIZE) {
    batches.push(textEntries.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches with ${textEntries.length} total texts`);

  createProgressUI(batches.length);

  let completedBatches = 0;

  // Process sequentially or with limited concurrency to avoid overwhelming the local model
  // Using a simple sequential approach for now to be safe and update progress accurately

  const processNextBatch = async (index) => {
    if (index >= batches.length || shouldStopTranslation) {
      if (shouldStopTranslation) {
        console.log('Translation stopped by user');
        restoreOriginalText(); // Restore if stopped by user
      } else {
        console.log('Page translation completed');
        updateProgressUI(batches.length, batches.length, true);
        setTimeout(removeProgressUI, PROGRESS_DISMISS_DELAY_MS);
      }
      addHoverListeners();
      isTranslating = false;
      return;
    }

    try {
      await processBatch(batches[index], targetLanguage, index);
    } catch (error) {
      console.error(`Batch ${index} failed even after retry`, error);
    }

    completedBatches++;
    updateProgressUI(completedBatches, batches.length);

    // Small delay to let UI update and not freeze browser
    setTimeout(() => processNextBatch(index + 1), 50);
  };

  processNextBatch(0);
}

function processBatch(batch, targetLanguage, batchIndex) {
  const textsToTranslate = batch.map(entry => entry.text);
  const combinedText = textsToTranslate.join('\n<<<LM_SEPARATOR>>>\n');

  return translateBatchText(combinedText, targetLanguage)
    .then(translatedBatch => {
      const translations = translatedBatch.split('<<<LM_SEPARATOR>>>').map(t => t.trim());

      if (translations.length !== batch.length) {
        console.warn(`Batch ${batchIndex} mismatch: got ${translations.length} translations for ${batch.length} texts. Retrying individually.`);
        return fallbackIndividualTranslation(batch, targetLanguage);
      }

      batch.forEach((entry, i) => {
        const translation = translations[i];
        if (translation && translation !== entry.text) {
          applyTranslation(entry, translation);
        }
      });
    })
    .catch(error => {
      console.error(`Translation error for batch ${batchIndex}:`, error);
      // Retry once before falling back
      return retryBatch(batch, targetLanguage, batchIndex);
    });
}

function retryBatch(batch, targetLanguage, batchIndex) {
  console.log(`Retrying batch ${batchIndex}...`);
  const textsToTranslate = batch.map(entry => entry.text);
  const combinedText = textsToTranslate.join('\n<<<LM_SEPARATOR>>>\n');

  return translateBatchText(combinedText, targetLanguage)
    .then(translatedBatch => {
      const translations = translatedBatch.split('<<<LM_SEPARATOR>>>').map(t => t.trim());
      if (translations.length !== batch.length) {
        return fallbackIndividualTranslation(batch, targetLanguage);
      }
      batch.forEach((entry, i) => {
        const translation = translations[i];
        if (translation && translation !== entry.text) {
          applyTranslation(entry, translation);
        }
      });
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
  const promises = batch.map(entry =>
    translateText(entry.text, targetLanguage)
      .then(translation => ({ entry, translation }))
      .catch(error => {
        console.error('Individual translation failed:', error);
        return null;
      })
  );

  return Promise.all(promises).then(results => {
    results.filter(result => result).forEach(({ entry, translation }) => {
      applyTranslation(entry, translation);
    });
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

function createProgressUI(totalBatches) {
  if (progressContainer) removeProgressUI();

  progressContainer = document.createElement('div');
  progressContainer.className = 'lm-progress-container';
  progressContainer.setAttribute('role', 'status');
  progressContainer.setAttribute('aria-live', 'polite');

  progressContainer.innerHTML = `
    <div class="lm-progress-header">
      <span>${IN_PAGE_TEXT.translating}</span>
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
    progressStatus.textContent = IN_PAGE_TEXT.complete;
    const header = progressContainer.querySelector('.lm-progress-header span');
    if (header) header.textContent = IN_PAGE_TEXT.done;
  } else {
    progressStatus.textContent = IN_PAGE_TEXT.batchProgress(completed, total);
  }
}

function removeProgressUI() {
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