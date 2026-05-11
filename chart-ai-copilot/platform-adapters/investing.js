(function() {
  window.__chartAI = window.__chartAI || {};
  window.__chartAI._adapters = window.__chartAI._adapters || {};
  window.__chartAI._adapters.investing = {
    name: 'Investing.com',
    hostname: 'investing.com',
    priority: 10,
    isChartPage() {
      return window.location.pathname.includes('/charts/') ||
             window.location.pathname.includes('-chart') ||
             !!document.querySelector('#technicalStudiesWidget');
    },
    getChartRect() {
      const selectors = [
        '#js-chart-grid-default-container',
        '#technicalStudiesWidget',
        'div[class*="chart-container"]',
        '.chart-gui-wrapper'  // investing.com embeds full TV library
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
      const meta = document.querySelector('meta[name="instrument_id"]');
      if (meta) return meta.getAttribute('content');
      const h1 = document.querySelector('h1.float_lang_base_1, [class*="instrumentName"]');
      return h1 ? h1.textContent.trim() : null;
    },
    getTimeframe() {
      const el = document.querySelector('[class*="interval-dialog-button"] [class*="value"]') ||
                 document.querySelector('[class*="activeInterval"]');
      return el ? el.textContent.trim() : null;
    }
  };
})();
