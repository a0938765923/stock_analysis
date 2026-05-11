(function() {
  window.__chartAI = window.__chartAI || {};
  window.__chartAI._adapters = window.__chartAI._adapters || {};
  const _binanceAdapter = {
    name: 'Binance',
    hostname: 'binance.com',
    priority: 10,
    isChartPage() {
      return window.location.pathname.startsWith('/trade/') ||
             window.location.pathname.includes('/en/trade/') ||
             window.location.pathname.includes('/futures/');
    },
    getChartRect() {
      const selectors = [
        '[data-testid="trading-chart-container"]',
        '.chartContainer',
        '#chart-container',
        '.bn-chart-container',
        'canvas'  // last resort
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 200 && r.height > 200) return r;
        }
      }
      return null;
    },
    getSymbol() {
      const m = window.location.pathname.match(/\/trade\/([A-Z0-9_]+)/i) ||
                window.location.pathname.match(/\/futures\/([A-Z0-9_]+)/i);
      return m ? m[1].replace('_', '') : null;
    },
    getTimeframe() {
      const el = document.querySelector('[class*="intervalButton--active"]') ||
                 document.querySelector('[class*="interval"] button[class*="active"]');
      return el ? el.textContent.trim() : null;
    }
  };

  window.__chartAI._adapters.binance = _binanceAdapter;
  // Binance.US uses the same adapter logic
  window.__chartAI._adapters.binanceUS = Object.assign({}, _binanceAdapter, {
    name: 'Binance US',
    hostname: 'binance.us'
  });
})();
