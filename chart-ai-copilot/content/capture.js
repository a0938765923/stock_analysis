(function () {
  'use strict';

  function sendMessagePromise(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Capture the visible tab and send it for analysis.
   * prompt is pre-built by the caller (content.js) via buildPrompt(settings, direction, platformName, templateBody).
   */
  async function captureAndAnalyze(prompt, settings) {
    window.__chartAI.hide();
    await new Promise((resolve) => setTimeout(resolve, 80));

    let dataUrl;
    try {
      const captureResponse = await sendMessagePromise({ type: 'CAPTURE_TAB' });
      if (!captureResponse || !captureResponse.ok || !captureResponse.dataUrl) {
        throw new Error(captureResponse.error || '截圖失敗，請重試');
      }
      dataUrl = captureResponse.dataUrl;
    } finally {
      window.__chartAI.show();
    }

    window.__chartAI.setLoading(true);

    try {
      const analyzeResponse = await sendMessagePromise({
        type: 'ANALYZE_CHART',
        payload: { dataUrl, prompt, settings }
      });
      return analyzeResponse;
    } finally {
      window.__chartAI.setLoading(false);
    }
  }

  async function captureSingle() {
    window.__chartAI.hide();
    await new Promise((resolve) => setTimeout(resolve, 80));
    try {
      const response = await sendMessagePromise({ type: 'CAPTURE_TAB' });
      if (!response || !response.ok || !response.dataUrl) {
        throw new Error(response && response.error ? response.error : '截圖失敗，請重試');
      }
      return response.dataUrl;
    } finally {
      window.__chartAI.show();
    }
  }

  async function captureAndDualAnalyze(prompt, settings) {
    window.__chartAI.hide();
    await new Promise((resolve) => setTimeout(resolve, 80));

    let dataUrl;
    try {
      const captureResponse = await sendMessagePromise({ type: 'CAPTURE_TAB' });
      if (!captureResponse || !captureResponse.ok || !captureResponse.dataUrl) {
        throw new Error(captureResponse && captureResponse.error ? captureResponse.error : '截圖失敗，請重試');
      }
      dataUrl = captureResponse.dataUrl;
    } finally {
      window.__chartAI.show();
    }

    window.__chartAI.setLoading(true);

    try {
      const analyzeResponse = await sendMessagePromise({
        type: 'DUAL_ANALYZE_CHART',
        payload: { dataUrl, prompt, settings }
      });
      return analyzeResponse;
    } finally {
      window.__chartAI.setLoading(false);
    }
  }

  window.__chartAI = window.__chartAI || {};
  window.__chartAI.capture = captureAndAnalyze;
  window.__chartAI.captureSingle = captureSingle;
  window.__chartAI.captureAndDualAnalyze = captureAndDualAnalyze;
})();
