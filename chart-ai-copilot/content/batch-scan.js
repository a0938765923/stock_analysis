(function() {
  'use strict';

  window.__chartAI = window.__chartAI || {};

  // Optional batch callback registered by content.js
  var _batchCallback = null;

  function setBatchCallback(fn) {
    _batchCallback = fn;
  }

  function delay(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  async function executeBatchScan(symbols, delayMs, settings) {
    var max = settings.batchScanMaxSymbols || 20;
    var list = symbols.slice(0, max);
    var results = [];
    var aborted = false;

    // Store abort function
    window.__chartAI._batchAbort = function() { aborted = true; };

    for (var i = 0; i < list.length; i++) {
      if (aborted) break;
      var symbol = list[i].trim().toUpperCase();
      if (!symbol) continue;

      // Notify UI: this symbol is now analyzing
      if (window.__chartAI.onBatchItemStart) {
        window.__chartAI.onBatchItemStart(i, symbol, list.length);
      }

      try {
        var lang = settings.language || settings.lang || 'zh-TW';
        var direction = window.__chartAI.getDirection ? window.__chartAI.getDirection() : 'auto';
        var prompt = buildBatchPrompt(symbol, settings.timeframe || 'daily', lang, direction);

        var result = await sendBatchMessage({ symbol: symbol, prompt: prompt, settings: settings });
        results.push({ symbol: symbol, result: result, state: 'done' });

        if (window.__chartAI.onBatchItemDone) {
          window.__chartAI.onBatchItemDone(i, symbol, result, null);
        }
      } catch (err) {
        results.push({ symbol: symbol, result: null, state: 'error', error: err.message });
        if (window.__chartAI.onBatchItemDone) {
          window.__chartAI.onBatchItemDone(i, symbol, null, err.message);
        }
      }

      if (i < list.length - 1 && !aborted) {
        await delay(delayMs != null ? delayMs : 3000);
      }
    }

    if (window.__chartAI.onBatchComplete) {
      window.__chartAI.onBatchComplete(results);
    }
  }

  function buildBatchPrompt(symbol, timeframe, lang, direction) {
    var LANG = {
      'zh-TW': '請以繁體中文回應。',
      'zh-CN': '请以简体中文回应。',
      'ja':    '日本語で回答してください。',
      'es':    'Responde en español.',
      'en':    'Respond in English.'
    };
    var langInstr = LANG[lang] || LANG['zh-TW'];
    var dirInstr = direction === 'long'  ? '（傾向尋找做多機會）'
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

  function sendBatchMessage(payload) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'ANALYZE_TEXT', payload: payload }, function(response) {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.ok) {
          resolve(response.result);
        } else {
          reject(new Error((response && response.error) || '分析失敗'));
        }
      });
    });
  }

  Object.assign(window.__chartAI, {
    executeBatchScan: executeBatchScan,
    abortBatchScan: function() {
      if (window.__chartAI._batchAbort) window.__chartAI._batchAbort();
    },
    setBatchCallback: setBatchCallback
  });
})();
