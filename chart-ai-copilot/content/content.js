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

  async function getLatestSettings(fallback) {
    try {
      const resp = await sendMessagePromise({ type: 'GET_SETTINGS' });
      if (resp && resp.ok && resp.settings) return resp.settings;
    } catch (_) {}
    return fallback;
  }

  async function resolveTemplateBody(settings) {
    const templates = settings.promptTemplates || [];
    const selectedId = settings.selectedTemplateId || null;
    if (!selectedId || !templates.length) return null;
    const tpl = templates.find(function(t) { return t.id === selectedId; });
    return tpl ? (tpl.body || null) : null;
  }

  async function init() {
    let settings = null;
    try {
      const response = await sendMessagePromise({ type: 'GET_SETTINGS' });
      if (response && response.ok && response.settings) {
        settings = response.settings;
      }
    } catch (_) {}

    // Detect platform adapter
    const adapter = window.__chartAI.getAdapter ? window.__chartAI.getAdapter() : null;
    const platformName = adapter ? adapter.name : null;

    // Guard: only skip on supported platform non-chart pages
    if (adapter && typeof adapter.isChartPage === 'function' && !adapter.isChartPage()) {
      return;
    }

    // ── Main analyze callback ──────────────────────────────────────────────
    window.__chartAI.setAnalyzeCallback(async () => {
      const currentSettings = await getLatestSettings(settings);
      if (!currentSettings) {
        window.__chartAI.renderError('無法讀取設定，請點擊擴充功能圖示完成設定後重試。');
        return;
      }
      window.__chartAI.setSettings(currentSettings);
      const direction = window.__chartAI.getDirection();
      const templateBody = await resolveTemplateBody(currentSettings);

      // 採集市場 context（TradingView 技術指標 + 新聞）
      const adapter = window.__chartAI.getAdapter ? window.__chartAI.getAdapter() : null;
      const contextData = {
        technicalSummary: adapter && adapter.getTechnicalAnalysisSummary ? adapter.getTechnicalAnalysisSummary() : null,
        newsHeadlines: adapter && adapter.getNewsHeadlines ? adapter.getNewsHeadlines() : []
      };

      if (window.__chartAI.isDualMode()) {
        // F-108: Dual-provider validation
        const prompt = window.__chartAI.buildPrompt(currentSettings, direction, platformName, templateBody, contextData);
        try {
          const response = await window.__chartAI.captureAndDualAnalyze(prompt, currentSettings);
          if (response && response.ok) {
            window.__chartAI.renderDualResult(response.dualResults);
          } else {
            window.__chartAI.renderError((response && response.error) || '雙驗證失敗，請重試');
          }
        } catch (err) {
          window.__chartAI.renderError(err.message || '雙驗證過程發生錯誤');
        }
      } else {
        // Standard single-provider analysis
        const prompt = window.__chartAI.buildPrompt(currentSettings, direction, platformName, templateBody, contextData);
        try {
          const response = await window.__chartAI.capture(prompt, currentSettings);
          if (response && response.ok) {
            window.__chartAI.renderResult(response.result);
          } else {
            window.__chartAI.renderError((response && response.error) || '分析失敗，請重試');
          }
        } catch (err) {
          window.__chartAI.renderError(err.message || '分析過程發生錯誤，請重試');
        }
      }
    });

    // ── F-103: Multi-TF capture callback ────────────────────────────────────
    window.__chartAI.setMultiTfCaptureCallback(async (step) => {
      try {
        const dataUrl = await window.__chartAI.captureSingle();
        window.__chartAI.onMultiTfCaptureDone(step, dataUrl);
      } catch (err) {
        window.__chartAI.onMultiTfCaptureError(err.message || '截圖失敗');
      }
    });

    // ── F-103: Multi-TF analyze callback ────────────────────────────────────
    window.__chartAI.setMultiTfAnalyzeCallback(async () => {
      const currentSettings = await getLatestSettings(settings);
      window.__chartAI.setSettings(currentSettings);
      const direction = window.__chartAI.getDirection();
      const templateBody = await resolveTemplateBody(currentSettings);

      // 採集市場 context（TradingView 技術指標 + 新聞）
      const adapter = window.__chartAI.getAdapter ? window.__chartAI.getAdapter() : null;
      const contextData = {
        technicalSummary: adapter && adapter.getTechnicalAnalysisSummary ? adapter.getTechnicalAnalysisSummary() : null,
        newsHeadlines: adapter && adapter.getNewsHeadlines ? adapter.getNewsHeadlines() : []
      };

      const prompt = window.__chartAI.buildMultiPrompt(currentSettings, direction, platformName, templateBody, contextData);
      const dataUrls = window.__chartAI.getMultiTfCaptures();

      window.__chartAI.setLoading(true);
      try {
        const response = await sendMessagePromise({
          type: 'ANALYZE_MULTI_CHART',
          payload: { dataUrls, prompt, settings: currentSettings }
        });
        if (response && response.ok) {
          window.__chartAI.exitMultiTfMode();
          window.__chartAI.renderResult(response.result);
        } else {
          window.__chartAI.renderError((response && response.error) || '多時框分析失敗，請重試');
          window.__chartAI.setLoading(false);
        }
      } catch (err) {
        window.__chartAI.renderError(err.message || '多時框分析過程發生錯誤');
        window.__chartAI.setLoading(false);
      }
    });

    // ── Batch scan callback ──────────────────────────────────────────────────
    if (window.__chartAI.setBatchCallback) {
      window.__chartAI.setBatchCallback(async (symbols, delayMs) => {
        if (window.__chartAI.executeBatchScan) {
          const currentSettings = await getLatestSettings(settings);
          window.__chartAI.executeBatchScan(symbols, delayMs, currentSettings);
        }
      });
    }

    // ── Alert watcher ────────────────────────────────────────────────────────
    if (window.__chartAI.alertWatcher) {
      window.__chartAI.alertWatcher.init();
    }
  }

  function isHostInDOM() {
    return !!document.getElementById('chart-ai-copilot-root');
  }

  function handleRouteChange() {
    if (!isHostInDOM()) {
      if (window.__chartAI.createSidebar) window.__chartAI.createSidebar();
      init();
    }
  }

  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    handleRouteChange();
  };

  window.addEventListener('popstate', handleRouteChange);

  init();
})();
