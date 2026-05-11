(function() {
  window.__chartAI = window.__chartAI || {};
  window.__chartAI._adapters = window.__chartAI._adapters || {};

  function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

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
      // DOM first — more accurate after setSymbol() switches the chart
      const domSels = [
        '[data-name="legend-source-title"]',
        '[class*="pane-legend-title__description"]',
        '[class*="pane-legend-title"]',
        '[class*="legend-title"]',
      ];
      for (const sel of domSels) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.textContent.trim();
          if (text) return text;
        }
      }
      // Fallback: URL path (chart-session ID, not ideal but better than nothing)
      const m = window.location.pathname.match(/\/chart\/([^/?]+)/);
      return m ? m[1] : null;
    },

    getTimeframe() {
      const el = document.querySelector('[class*="interval-dialog-button"] [class*="value"]');
      return el ? el.textContent.trim() : null;
    },

    // ── Symbol switching (batch auto-scan) ───────────────────────────────────

    async setSymbol(symbol) {
      // Selectors for the visible search input (appears after symbol search opens)
      const INPUT_SELS = [
        '[class*="search-bar-field"] input',
        '[class*="search-bar"] input',
        '[class*="symbolSearch"] input',
        '[class*="symbol-search"] input',
        'input[data-role="search"]',
        'input[placeholder*="ymbol"]',
        'input[placeholder*="搜尋"]',
        'input[placeholder*="Search"]',
      ];

      const findInput = () => {
        for (const sel of INPUT_SELS) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) return el;
        }
        return null;
      };

      // ── Step 1: open the symbol search dialog ────────────────────────────
      let input = findInput();

      if (!input) {
        // Approach A: click the header toolbar symbol button (most reliable — confirmed ID)
        const HEADER_BTN_SELS = [
          '#header-toolbar-symbol-search',
          '[data-name="header-toolbar-symbol-search"]',
          '[id*="symbol-search"]',
        ];
        for (const sel of HEADER_BTN_SELS) {
          const el = document.querySelector(sel);
          if (el) {
            el.click();
            await _sleep(600);
            input = findInput();
            if (input) break;
          }
        }
      }

      if (!input) {
        // Approach B: keyboard shortcut '/' — blur active element first so it reaches TradingView's handler
        if (document.activeElement && document.activeElement !== document.body) {
          document.activeElement.blur();
          await _sleep(80);
        }
        const slashEvent = () => new KeyboardEvent('keydown', {
          key: '/', code: 'Slash', keyCode: 191, which: 191, bubbles: true, cancelable: true
        });
        document.dispatchEvent(slashEvent());
        window.dispatchEvent(slashEvent());
        await _sleep(800);
        input = findInput();
      }

      if (!input) {
        throw new Error('無法開啟 TradingView 符號搜尋，請確認已在圖表頁面且圖表完全載入');
      }

      // ── Step 2: fill in the symbol (React-compatible value setter) ────────
      input.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await _sleep(80);
        nativeSetter.call(input, symbol);
      } else {
        input.value = symbol;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // ── Step 3: wait for results then select first ────────────────────────
      await _sleep(800);

      // Press Enter to confirm first result
      ['keydown', 'keyup'].forEach(type => {
        input.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
        }));
      });

      // Backup: click the first visible result row
      await _sleep(400);
      const RESULT_SELS = [
        '[class*="listRow"]:first-child',
        '[class*="symbolItem"]:first-child',
        '[class*="symbol-list"] li:first-child',
        '[class*="searchItem"]:first-child',
        '[class*="result"]:first-child',
      ];
      for (const sel of RESULT_SELS) {
        const row = document.querySelector(sel);
        if (row) {
          row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          break;
        }
      }
    },

    // Poll until getSymbol() returns the target (chart has switched)
    async waitForSymbol(targetSymbol, timeoutMs) {
      const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const target = norm(targetSymbol);
      const deadline = Date.now() + (timeoutMs || 12000);

      while (Date.now() < deadline) {
        const current = norm(this.getSymbol());
        // Accept: exact match, or one is a suffix of the other (handles EXCHANGE:SYMBOL prefixes)
        if (current && target &&
            (current === target || current.endsWith(target) || target.endsWith(current))) {
          return true;
        }
        await _sleep(400);
      }
      return false;
    },

    // ── Read-only scraping helpers ────────────────────────────────────────────

    getTechnicalAnalysisSummary() {
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

        const ratingEl = container.querySelector('[class*="recommend-"]') ||
                         container.querySelector('[class*="signal"]') ||
                         container.querySelector('[class*="rating"]');
        const overall = ratingEl ? ratingEl.textContent.trim() : null;

        const counterEls = container.querySelectorAll('[class*="counter"]');
        const counts = Array.from(counterEls)
          .map(el => el.textContent.trim())
          .filter(t => /^\d+$/.test(t));

        if (!overall && counts.length === 0) return null;
        return { overall: overall || '', counts };
      } catch (_) { return null; }
    },

    getNewsHeadlines() {
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
