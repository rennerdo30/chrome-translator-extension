// Offscreen document: hosts the bundled Tesseract.js OCR engine.
// The service worker sends 'offscreenOcr' messages with an image data URL;
// this document extracts the text and responds with it.

// Language training data is fetched (and cached by the browser) from the
// official tessdata CDN — it is data, not code, so it complies with MV3.
const TESSDATA_CDN = 'https://tessdata.projectnaptha.com/4.0.0';
const DEFAULT_OCR_LANGUAGES = 'eng';

let workerPromise = null;
let workerLanguages = null;

async function getOcrWorker(languages) {
  if (workerPromise && workerLanguages === languages) {
    return workerPromise;
  }

  // Language set changed — replace the worker
  if (workerPromise) {
    try {
      const oldWorker = await workerPromise;
      await oldWorker.terminate();
    } catch (error) {
      console.warn('Failed to terminate previous OCR worker:', error);
    }
  }

  workerLanguages = languages;
  workerPromise = Tesseract.createWorker(languages.split('+').filter(Boolean), 1, {
    workerPath: chrome.runtime.getURL('vendor/tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('vendor/tesseract'),
    langPath: TESSDATA_CDN,
    workerBlobURL: false, // Blob workers are blocked by the extension CSP
    logger: m => {
      if (m.status && m.progress !== undefined) {
        console.debug(`OCR ${m.status}: ${Math.round(m.progress * 100)}%`);
      }
    }
  });
  return workerPromise;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'offscreenOcr') {
    return;
  }

  (async () => {
    try {
      const worker = await getOcrWorker(request.languages || DEFAULT_OCR_LANGUAGES);
      const { data } = await worker.recognize(request.imageDataUrl);
      sendResponse({ success: true, text: (data.text || '').trim() });
    } catch (error) {
      console.error('OCR failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for the async response
});
