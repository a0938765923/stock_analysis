(function() {
  'use strict';

  window.__chartAI = window.__chartAI || {};

  // ── Helpers ──────────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function sendMsg(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp);
      });
    });
  }

  function notifyStatus(symbol, text) {
    if (window.__chartAI.onBatchItemStatus) window.__chartAI.onBatchItemStatus(symbol, text);
  }

  // ── Screenshot-based analysis (TradingView auto-switch mode) ─────────────
  //
  // For each symbol:
  //   1. Call adapter.setSymbol() → DOM-simulated symbol switch
  //   2. Poll adapter.waitForSymbol() until legend updates
  //   3. Extra render wait (indicators, volume bars)
  //   4. Capture visible tab (sidebar hidden during shot)
  //   5. Send ANALYZE_CHART → same quality as manual analysis

  async function executeBatchScreenshot(symbol, settings) {
    const adapter = window.__chartAI.getAdapter ? window.__chartAI.getAdapter() : null;
    if (!adapter || typeof adapter.setSymbol !== 'function') {
      throw new Error('此平台不支援自動切換符號');
    }

    // 1. Switch symbol
    notifyStatus(symbol, '切換圖表...');
    await adapter.setSymbol(symbol);

    // 2. Wait for chart legend to reflect new symbol
    notifyStatus(symbol, '等待圖表載入...');
    const loaded = await adapter.waitForSymbol(symbol, 12000);
    if (!loaded) {
      throw new Error(symbol + ' 圖表切換逾時（12s），請增加掃描間隔或檢查代號是否正確');
    }

    // 3. Extra wait for indicators & volume bars to fully render
    await sleep(2000);

    // 4. Build prompt (same path as manual single-chart analysis)
    const direction = window.__chartAI.getDirection ? window.__chartAI.getDirection() : 'auto';
    const contextData = {
      technicalSummary: adapter.getTechnicalAnalysisSummary ? adapter.getTechnicalAnalysisSummary() : null,
      newsHeadlines: adapter.getNewsHeadlines ? adapter.getNewsHeadlines() : []
    };
    const prompt = window.__chartAI.buildPrompt(settings, direction, adapter.name, null, contextData);

    // 5. Capture (hide sidebar so it doesn't appear in screenshot)
    notifyStatus(symbol, '截圖分析中...');
    if (window.__chartAI.hide) window.__chartAI.hide();
    await sleep(80);

    let dataUrl;
    try {
      const capResp = await sendMsg({ type: 'CAPTURE_TAB' });
      if (!capResp || !capResp.ok) throw new Error((capResp && capResp.error) || '截圖失敗');
      dataUrl = capResp.dataUrl;
    } finally {
      if (window.__chartAI.show) window.__chartAI.show();
    }

    // 6. Send for AI analysis (ANALYZE_CHART — same as clicking 分析 button)
    const resp = await sendMsg({
      type: 'ANALYZE_CHART',
      payload: { dataUrl, prompt, settings }
    });
    if (resp && resp.ok) return resp.result;
    throw new Error((resp && resp.error) || '截圖分析失敗');
  }

  // ── Text-only analysis (fallback for non-TradingView pages) ──────────────
  //
  // AI answers based on training knowledge only — no live chart data.

  async function executeBatchText(symbol, settings) {
    const lang = settings.language || settings.lang || 'zh-TW';
    const direction = window.__chartAI.getDirection ? window.__chartAI.getDirection() : 'auto';
    const prompt = buildBatchPrompt(symbol, settings.timeframe || 'daily', lang, direction);
    const resp = await sendMsg({ type: 'ANALYZE_TEXT', payload: { symbol, prompt, settings } });
    if (resp && resp.ok) return resp.result;
    throw new Error((resp && resp.error) || '文字分析失敗');
  }

  function buildBatchPrompt(symbol, timeframe, lang, direction) {
    const LANG = {
      'zh-TW': '請以繁體中文回應。',
      'zh-CN': '请以简体中文回应。',
      'ja':    '日本語で回答してください。',
      'es':    'Responde en español.',
      'en':    'Respond in English.'
    };
    const langInstr = LANG[lang] || LANG['zh-TW'];
    const dirInstr = direction === 'long'  ? '（傾向尋找做多機會）'
                   : direction === 'short' ? '（傾向尋找做空機會）'
                   : '';

    return langInstr + '\n\n' +
      '你是一位專業技術分析師。請對 ' + symbol + ' 進行技術分析' + dirInstr + '。\n\n' +
      '基於最新的技術指標和價格走勢，提供：\n' +
      '1. 市場偏向（看多/看空/中性）\n' +
      '2. 關鍵支撐與阻力位\n' +
      '3. 進場區間\n' +
      '4. 停損位\n' +
      '5. 獲利目標（TP1、TP2）\n' +
      '6. 風報比\n' +
      '7. 一句話摘要\n\n' +
      (window.__chartAI.SCHEMA_INSTRUCTION || '請用JSON格式回應');
  }

  // ── Main batch runner ─────────────────────────────────────────────────────

  async function executeBatchScan(symbols, delayMs, settings) {
    const adapter = window.__chartAI.getAdapter ? window.__chartAI.getAdapter() : null;
    const useScreenshot = !!(adapter && typeof adapter.setSymbol === 'function');

    const max = settings.batchScanMaxSymbols || 20;
    const list = symbols.slice(0, max);
    const results = [];
    let aborted = false;

    window.__chartAI._batchAbort = function() { aborted = true; };

    // Tell sidebar which mode we're running in
    if (window.__chartAI.onBatchModeDetected) {
      window.__chartAI.onBatchModeDetected(useScreenshot ? 'screenshot' : 'text');
    }

    for (let i = 0; i < list.length; i++) {
      if (aborted) break;
      const symbol = list[i].trim().toUpperCase();
      if (!symbol) continue;

      if (window.__chartAI.onBatchItemStart) {
        window.__chartAI.onBatchItemStart(i, symbol, list.length);
      }

      try {
        const result = useScreenshot
          ? await executeBatchScreenshot(symbol, settings)
          : await executeBatchText(symbol, settings);

        results.push({ symbol, result, state: 'done' });
        if (window.__chartAI.onBatchItemDone) window.__chartAI.onBatchItemDone(i, symbol, result, null);
      } catch (err) {
        results.push({ symbol, result: null, state: 'error', error: err.message });
        if (window.__chartAI.onBatchItemDone) window.__chartAI.onBatchItemDone(i, symbol, null, err.message);
      }

      if (i < list.length - 1 && !aborted) {
        await sleep(delayMs != null ? delayMs : 5000);
      }
    }

    if (window.__chartAI.onBatchComplete) window.__chartAI.onBatchComplete(results);
  }

  Object.assign(window.__chartAI, {
    executeBatchScan,
    abortBatchScan: function() {
      if (window.__chartAI._batchAbort) window.__chartAI._batchAbort();
    }
  });
})();
