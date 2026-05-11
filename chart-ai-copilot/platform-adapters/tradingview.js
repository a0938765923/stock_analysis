(function() {
  window.__chartAI = window.__chartAI || {};
  window.__chartAI._adapters = window.__chartAI._adapters || {};
  window.__chartAI._adapters.tradingview = {
    name: 'TradingView',
    hostname: 'tradingview.com',
    priority: 10,
    isChartPage() {
      return window.location.pathname.startsWith('/chart') ||
             !!document.querySelector('div[class*="chart-gui-wrapper"]');
    },
    getChartRect() {
      const selectors = [
        'div[class*="chart-gui-wrapper"]',
        'div[class*="layout__area--center"]',
        'div[class*="chart-container"]',
        '.chart-container'
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
      const m = window.location.pathname.match(/\/chart\/([^/]+)/);
      if (m) return m[1];
      const el = document.querySelector('[class*="pane-legend-title"]');
      return el ? el.textContent.trim() : null;
    },
    getTimeframe() {
      const el = document.querySelector('[class*="interval-dialog-button"] [class*="value"]');
      return el ? el.textContent.trim() : null;
    },
    getTechnicalAnalysisSummary() {
      // 嘗試從 TradingView Technical Analysis 面板提取指標摘要
      try {
        const panelSelectors = [
          '[class*="technicalAnalysis"]',
          '[class*="technical-analysis"]',
          '[class*="speedometer"]',
        ];
        let container = null;
        for (const sel of panelSelectors) {
          container = document.querySelector(sel);
          if (container) break;
        }
        if (!container) return null;

        // 整體評級
        const ratingEl = container.querySelector('[class*="recommend-"]') ||
                         container.querySelector('[class*="signal"]') ||
                         container.querySelector('[class*="rating"]');
        const overall = ratingEl ? ratingEl.textContent.trim() : null;

        // Buy/Neutral/Sell 計數
        const counterEls = container.querySelectorAll('[class*="counter"]');
        const counts = Array.from(counterEls)
          .map(el => el.textContent.trim())
          .filter(t => /^\d+$/.test(t));

        if (!overall && counts.length === 0) return null;

        return { overall: overall || '', counts };
      } catch (_) { return null; }
    },
    getNewsHeadlines() {
      // 嘗試從 TradingView 新聞 widget 提取標題
      try {
        const linkSelectors = [
          '[class*="news-widget"] a[href]',
          '[class*="newsBar"] a[href]',
          '[class*="news-list"] a[href]',
          '[class*="newsFeed"] a[href]',
          '[class*="news-item"] a[href]',
        ];
        const headlines = [];
        for (const sel of linkSelectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            const text = el.textContent.trim();
            if (text.length > 10 && !headlines.includes(text)) {
              headlines.push(text);
              if (headlines.length >= 5) break;
            }
          }
          if (headlines.length > 0) break;
        }
        return headlines;
      } catch (_) { return []; }
    }
  };
})();
