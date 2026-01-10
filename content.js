let isTranslating = false;
let shouldStopTranslation = false;
let originalTexts = new Map();
let translatedTexts = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleTranslation') {
    toggleTranslation(request.targetLanguage);
  } else if (request.action === 'getTranslationStatus') {
    sendResponse({ isTranslating, hasTranslations: translatedTexts.size > 0 });
  }
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
    alert('No translatable text found on this page.');
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
        setTimeout(removeProgressUI, 3000);
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
    span.setAttribute('title', `Original: ${entry.text}`);

    try {
      originalEntry.node.parentNode.replaceChild(span, originalEntry.node);
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
      if (response.success) {
        resolve(response.translation);
      } else {
        reject(new Error(response.error));
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
      if (response.success) {
        resolve(response.translation);
      } else {
        reject(new Error(response.error));
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

  hoverTooltip = document.createElement('div');
  hoverTooltip.className = 'lm-hover-tooltip';
  hoverTooltip.textContent = originalText;

  const rect = event.target.getBoundingClientRect();
  hoverTooltip.style.left = rect.left + 'px';
  hoverTooltip.style.top = (rect.bottom + 5) + 'px';

  document.body.appendChild(hoverTooltip);
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

  progressContainer.innerHTML = `
    <div class="lm-progress-header">
      <span>Translating Page...</span>
      <button class="lm-close-btn" title="Stop Translation">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="lm-progress-bar-bg">
      <div class="lm-progress-bar-fill"></div>
    </div>
    <div class="lm-progress-status">0 / ${totalBatches} batches</div>
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

  const percentage = Math.min(100, (completed / total) * 100);
  progressBarFill.style.width = `${percentage}%`;

  if (isDone) {
    progressStatus.textContent = 'Translation Complete!';
    const header = progressContainer.querySelector('.lm-progress-header span');
    if (header) header.textContent = 'Done';
  } else {
    progressStatus.textContent = `${completed} / ${total} batches`;
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