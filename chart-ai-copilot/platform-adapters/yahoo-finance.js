(function() {
  window.__chartAI = window.__chartAI || {};
  window.__chartAI._adapters = window.__chartAI._adapters || {};
  window.__chartAI._adapters.yahooFinance = {
    name: 'Yahoo Finance',
    hostname: 'finance.yahoo.com',
    priority: 10,
    isChartPage() {
      return /\/quote\/[A-Z]/.test(window.location.pathname);
    },
    getChartRect() {
      const selectors = [
        '[data-testid="chart-container"]',
        '.highcharts-container',
        '[class*="chart"] canvas',
        '.chartWrapper'
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
      const m = window.location.pathname.match(/\/quote\/([^/]+)/);
      return m ? m[1] : null;
    },
    getTimeframe() {
      const el = document.querySelector('[data-testid="time-range-tab"][aria-selected="true"]') ||
                 document.querySelector('[class*="timeRange"] button[class*="active"]');
      return el ? el.textContent.trim() : null;
    }
  };
})();
