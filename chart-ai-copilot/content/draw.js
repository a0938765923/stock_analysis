(function () {
  'use strict';

  const OVERLAY_ID = 'chart-ai-price-overlay';
  let cleanupHandler = null;

  function removeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    if (cleanupHandler) {
      document.removeEventListener('mousedown', cleanupHandler);
      cleanupHandler = null;
    }
  }

  // Find the main chart canvas area for sizing the overlay.
  // Delegates to the platform adapter first; falls back to a viewport estimate.
  function getChartRect() {
    // Try adapter first (multi-platform support)
    const adapter = window.__chartAI && window.__chartAI.getAdapter && window.__chartAI.getAdapter();
    if (adapter) {
      const r = adapter.getChartRect();
      if (r && r.width > 200 && r.height > 200) return r;
    }
    // Fallback for unsupported platforms or when adapter returns null
    return new DOMRect(0, 0, window.innerWidth - 340, window.innerHeight);
  }

  function parsePrices(str) {
    if (!str) return [];
    // Strip currency symbols, then collapse comma-thousands separators (94,500 → 94500)
    let s = str.replace(/[$€£¥₩]/g, '');
    s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
    s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2'); // second pass for 1,234,567
    // Keep only digits, dots, hyphens; split on hyphen as range separator
    return s.replace(/[^\d.\-]/g, '')
      .split(/\-+/)
      .map(t => parseFloat(t))
      .filter(n => !isNaN(n) && n > 0);
  }

  const NS = 'http://www.w3.org/2000/svg';

  function svgLine(x1, y, x2, color, dash, strokeWidth) {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('x1', x1);
    el.setAttribute('y1', y.toFixed(1));
    el.setAttribute('x2', x2);
    el.setAttribute('y2', y.toFixed(1));
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', strokeWidth || '1.5');
    if (dash) el.setAttribute('stroke-dasharray', dash);
    el.setAttribute('opacity', '0.88');
    return el;
  }

  function svgLabel(x, y, text, color) {
    const g = document.createElementNS(NS, 'g');

    const bg = document.createElementNS(NS, 'rect');
    const w = text.length * 6.8 + 10;
    bg.setAttribute('x', x);
    bg.setAttribute('y', (y - 15).toFixed(1));
    bg.setAttribute('width', w.toFixed(0));
    bg.setAttribute('height', '15');
    bg.setAttribute('fill', 'rgba(22, 33, 62, 0.9)');
    bg.setAttribute('rx', '3');
    g.appendChild(bg);

    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', (parseFloat(x) + 5).toFixed(1));
    t.setAttribute('y', (y - 3).toFixed(1));
    t.setAttribute('fill', color);
    t.setAttribute('font-size', '11');
    t.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    t.setAttribute('font-weight', '600');
    t.textContent = text;
    g.appendChild(t);
    return g;
  }

  /**
   * Draw price lines on the TradingView chart using a user-provided price range.
   * @param {object} result  - analysis result with entry_zone, stop_loss, tp1, tp2, direction
   * @param {number} visibleHigh - price at the TOP of the current chart view
   * @param {number} visibleLow  - price at the BOTTOM of the current chart view
   */
  function drawLinesWithRange(result, visibleHigh, visibleLow) {
    removeOverlay();

    if (isNaN(visibleHigh) || isNaN(visibleLow) || visibleHigh <= visibleLow) {
      return { ok: false, reason: '頂部價格必須大於底部價格，請重新填入' };
    }

    const chartRect = getChartRect();
    const priceRange = visibleHigh - visibleLow;
    const lineX2 = chartRect.width * 0.88;

    function priceToY(price) {
      const ratio = (visibleHigh - price) / priceRange;
      const y = ratio * chartRect.height;
      // Allow a small margin so labels near the edges still show
      if (y < -20 || y > chartRect.height + 20) return null;
      return Math.max(0, Math.min(chartRect.height, y));
    }

    const isLong = result.direction === 'long';
    const entryColor = isLong ? '#00c853' : '#ef5350';

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed',
      left: chartRect.left + 'px',
      top: chartRect.top + 'px',
      width: chartRect.width + 'px',
      height: chartRect.height + 'px',
      pointerEvents: 'none',
      zIndex: '2147483646',
      overflow: 'hidden'
    });

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', chartRect.width);
    svg.setAttribute('height', chartRect.height);

    let linesDrawn = 0;

    // Entry zone — shade the band if a range is given
    const entryPrices = parsePrices(result.entry_zone);
    if (entryPrices.length >= 2) {
      const y0 = priceToY(entryPrices[0]);
      const y1 = priceToY(entryPrices[entryPrices.length - 1]);
      if (y0 !== null && y1 !== null) {
        const band = document.createElementNS(NS, 'rect');
        band.setAttribute('x', 0);
        band.setAttribute('y', Math.min(y0, y1).toFixed(1));
        band.setAttribute('width', lineX2);
        band.setAttribute('height', Math.abs(y1 - y0).toFixed(1));
        band.setAttribute('fill', isLong ? 'rgba(0,200,83,0.08)' : 'rgba(244,67,54,0.08)');
        svg.appendChild(band);
        svg.appendChild(svgLine(0, y0, lineX2, entryColor, '4,3', '1'));
        svg.appendChild(svgLine(0, y1, lineX2, entryColor, '4,3', '1'));
        svg.appendChild(svgLabel('8', Math.min(y0, y1), `進場區 ${result.entry_zone}`, entryColor));
        linesDrawn += 2;
      }
    } else if (entryPrices.length === 1) {
      const y = priceToY(entryPrices[0]);
      if (y !== null) {
        svg.appendChild(svgLine(0, y, lineX2, entryColor, '6,3', '1.5'));
        svg.appendChild(svgLabel('8', y, `進場 ${result.entry_zone}`, entryColor));
        linesDrawn++;
      }
    }

    // Stop loss
    const slPrices = parsePrices(result.stop_loss);
    if (slPrices.length) {
      const y = priceToY(slPrices[0]);
      if (y !== null) {
        svg.appendChild(svgLine(0, y, lineX2, '#ef5350', '8,4', '2'));
        svg.appendChild(svgLabel('8', y, `停損 ${result.stop_loss}`, '#ef5350'));
        linesDrawn++;
      }
    }

    // TP1
    const tp1Prices = parsePrices(result.tp1);
    if (tp1Prices.length) {
      const y = priceToY(tp1Prices[0]);
      if (y !== null) {
        svg.appendChild(svgLine(0, y, lineX2, '#00d4ff', '6,3', '1.5'));
        svg.appendChild(svgLabel('8', y, `TP1 ${result.tp1}`, '#00d4ff'));
        linesDrawn++;
      }
    }

    // TP2
    const tp2Prices = parsePrices(result.tp2);
    if (tp2Prices.length) {
      const y = priceToY(tp2Prices[0]);
      if (y !== null) {
        svg.appendChild(svgLine(0, y, lineX2, '#ffb74d', '4,4', '1.5'));
        svg.appendChild(svgLabel('8', y, `TP2 ${result.tp2}`, '#ffb74d'));
        linesDrawn++;
      }
    }

    if (linesDrawn === 0) {
      return {
        ok: false,
        reason: '所有價位均超出可視範圍，請確認頂部/底部價格涵蓋進出場位置'
      };
    }

    overlay.appendChild(svg);
    document.body.appendChild(overlay);

    // Remove overlay when user interacts with the chart
    setTimeout(() => {
      cleanupHandler = (e) => {
        if (e.target && !e.target.closest('#chart-ai-copilot-root')) {
          removeOverlay();
        }
      };
      document.addEventListener('mousedown', cleanupHandler);
    }, 400);

    return { ok: true, count: linesDrawn };
  }

  window.__chartAI = window.__chartAI || {};
  Object.assign(window.__chartAI, { drawLinesWithRange, removeOverlay });
})();
