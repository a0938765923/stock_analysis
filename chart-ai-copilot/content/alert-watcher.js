(function () {
  'use strict';

  window.__chartAI = window.__chartAI || {};

  const TOAST_SELECTORS = [
    '[data-name="alert-popup"]',
    '[data-name="alert-notification"]',
    '[role="alert"]',
    '[class*="alertToast"]',
    '[class*="alert-toast"]',
    '[class*="notification"][class*="popup"]',
    '[class*="toast"][class*="alert"]',
  ];

  let _observer = null;
  const _recentMessages = new Map(); // text → timestamp，去重用

  function matchAlertElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    for (const sel of TOAST_SELECTORS) {
      try {
        if (node.matches(sel)) return node;
        const found = node.querySelector(sel);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }

  function handleAlertNode(el) {
    const text = (el.textContent || '').trim().slice(0, 500);
    if (!text) return;

    // 5 秒去重
    const now = Date.now();
    if (_recentMessages.has(text) && now - _recentMessages.get(text) < 5000) return;
    _recentMessages.set(text, now);
    // 清理舊記錄
    for (const [k, v] of _recentMessages) {
      if (now - v > 30000) _recentMessages.delete(k);
    }

    const symbolMatch = text.match(/\b([A-Z]{2,10}(?:USDT?|USD|BTC|ETH|EUR|JPY|GBP)?)\b/);
    const payload = {
      symbol: el.dataset?.symbol || symbolMatch?.[1] || 'UNKNOWN',
      message: text,
      timestamp: now,
    };

    chrome.runtime.sendMessage({ type: 'ALERT_DETECTED', payload }, () => {});
  }

  function init() {
    if (_observer) return;
    _observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          const alertEl = matchAlertElement(node);
          if (alertEl) handleAlertNode(alertEl);
        }
      }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function stop() {
    if (_observer) { _observer.disconnect(); _observer = null; }
  }

  window.__chartAI.alertWatcher = { init, stop };
})();
