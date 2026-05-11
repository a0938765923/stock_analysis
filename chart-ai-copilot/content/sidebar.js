(function () {
  'use strict';

  let host = null;
  let shadow = null;
  let analyzeCallback = null;
  let multiTfCaptureCallback = null;
  let multiTfAnalyzeCallback = null;
  let batchCallback = null;

  let currentResult = null;
  let currentLotInfo = null;
  let isHistoryView = false;
  let multiTfMode = false;
  let multiTfStep = 0;
  let multiTfCaptures = [];
  let isDualMode = false;
  let autoDrawEnabled = false;
  let storedSettings = null;
  let currentTab = 'analysis'; // 'analysis' | 'batch' | 'memory'
  let batchResults = [];
  let batchRunning = false;
  let pineResult = null; // 生成的 Pine Script 結果

  const CSS_URL = chrome.runtime.getURL('content/content.css');
  const HISTORY_KEY = 'chart_ai_history';
  const HISTORY_MAX = 50;

  // ── History storage helpers ──────────────────────────────────────────────

  async function saveHistory(result) {
    try {
      const stored = await chrome.storage.local.get(HISTORY_KEY);
      const list = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
      list.unshift({ ts: Date.now(), result });
      if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
      await chrome.storage.local.set({ [HISTORY_KEY]: list });
    } catch (_) {}
  }

  async function loadHistory() {
    try {
      const stored = await chrome.storage.local.get(HISTORY_KEY);
      return Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
    } catch (_) {
      return [];
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTs(ts) {
    return new Date(ts).toLocaleString('zh-TW', { hour12: false });
  }

  // ── F-107: Lot size calculation ──────────────────────────────────────────

  function computeLotInfo(result, settings) {
    if (!settings || !(settings.accountBalance > 0)) return null;

    const capitalRisk = settings.accountBalance * ((settings.riskPct || 1) / 100);
    const currency = settings.accountCurrency || 'USD';

    const entryRaw = (result.entry_zone || '').replace(/[^\d.,\- ]/g, '').trim();
    const slRaw = (result.stop_loss || '').replace(/[^\d.\-]/g, '').trim();

    const entryParts = entryRaw.split(/[-,]/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
    const entryPrice = entryParts.length ? entryParts.reduce((a, b) => a + b, 0) / entryParts.length : NaN;
    const slPrice = parseFloat(slRaw);

    const info = { capitalRisk: capitalRisk.toFixed(2), currency };

    if (!isNaN(entryPrice) && !isNaN(slPrice) && entryPrice > 0 && slPrice > 0) {
      const slDistance = Math.abs(entryPrice - slPrice);
      if (slDistance > 0) {
        const stdLot = capitalRisk / (slDistance * 100000);
        info.stdLot = stdLot.toFixed(3);
        info.miniLot = (stdLot * 10).toFixed(2);
        info.microLot = Math.round(stdLot * 100);
      }
    }

    return info;
  }

  // ── Copy text builder ────────────────────────────────────────────────────

  function buildCopyText(result) {
    const directionText = result.direction === 'long' ? '做多 LONG' : '做空 SHORT';
    const keyPointsStr = Array.isArray(result.key_points)
      ? result.key_points.join('; ')
      : (result.key_points || '');

    return [
      `【${result.symbol || ''} ${result.timeframe || ''} ${directionText}】`,
      `進場：${result.entry_zone || ''} | 停損：${result.stop_loss || ''} | TP1：${result.tp1 || ''} | TP2：${result.tp2 || ''}`,
      `風報比：${result.rr_ratio || ''} | 倉位：${result.position_size || ''}`,
      `趨勢：${result.trend || ''}`,
      `停損原因：${result.stop_loss_reason || ''}`,
      `要點：${keyPointsStr}`,
      `風險：${result.risk_warning || ''}`
    ].join('\n');
  }

  // ── Entry strategy & key scenarios HTML builders ─────────────────────────

  function buildStrategyHtml(strategy) {
    if (!strategy || (!strategy.plan_a && !strategy.plan_b)) return '';

    function planHtml(plan, isRec) {
      if (!plan) return '';
      const rrRows = isRec
        ? (plan.rr_tp1 ? `<div class="strategy-plan-row"><span class="strategy-label">R:R (TP1)</span><span class="strategy-rr">${escapeHtml(plan.rr_tp1)}</span></div>` : '') +
          (plan.rr_tp2 ? `<div class="strategy-plan-row"><span class="strategy-label">R:R (TP2)</span><span class="strategy-rr strategy-rr--good">${escapeHtml(plan.rr_tp2)}</span></div>` : '')
        : (plan.rr ? `<div class="strategy-plan-row"><span class="strategy-label">R:R</span><span class="strategy-rr">${escapeHtml(plan.rr)}</span></div>` : '');
      return `
        <div class="strategy-plan${isRec ? ' strategy-plan--rec' : ' strategy-plan--alt'}">
          <div class="strategy-plan-header">
            <span class="strategy-plan-title">${escapeHtml(plan.label || '')}</span>
            ${isRec ? '<span class="strategy-badge strategy-badge--rec">推薦 ✅</span>' : '<span class="strategy-badge strategy-badge--alt">備選</span>'}
          </div>
          <div class="strategy-plan-row"><span class="strategy-label">觸發條件</span><span class="strategy-value">${escapeHtml(plan.trigger || '')}</span></div>
          <div class="strategy-plan-row"><span class="strategy-label">確認信號</span><span class="strategy-value">${escapeHtml(plan.confirmation || '')}</span></div>
          <div class="strategy-plan-row"><span class="strategy-label">入場價</span><span class="strategy-price">${escapeHtml(plan.entry || '')}</span></div>
          ${rrRows}
          ${!isRec && plan.note ? `<div class="strategy-plan-note">⚠ ${escapeHtml(plan.note)}</div>` : ''}
        </div>`;
    }

    return `
      <div class="result-section strategy-section">
        <span class="result-label">執行策略</span>
        <div class="strategy-plans">
          ${planHtml(strategy.plan_a, true)}
          ${planHtml(strategy.plan_b, false)}
        </div>
      </div>`;
  }

  function buildScenariosHtml(scenarios) {
    if (!Array.isArray(scenarios) || !scenarios.length) return '';
    return `
      <div class="result-section">
        <span class="result-label">關鍵情境</span>
        <div class="scenario-list">
          ${scenarios.map(s => `
            <div class="scenario-item">
              <div class="scenario-condition">${escapeHtml(s.condition || '')}</div>
              <div class="scenario-action">→ ${escapeHtml(s.action || '')}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── Entry timing HTML builder ────────────────────────────────────────────

  function buildEntryTimingHtml(timing) {
    if (!timing) return '';

    const qualityMap = {
      strong:   { label: '強力買點', cls: 'timing-strong',   icon: '🟢' },
      good:     { label: '良好買點', cls: 'timing-good',     icon: '🟡' },
      moderate: { label: '謹慎考慎', cls: 'timing-moderate', icon: '🟠' },
      wait:     { label: '等待時機', cls: 'timing-wait',     icon: '🔴' }
    };
    const q = qualityMap[timing.quality] || qualityMap['wait'];

    const statusIcon = s => s === 'confirmed' ? '✅' : s === 'pending' ? '⏳' : '❌';
    const statusCls  = s => s === 'confirmed' ? 'signal-confirmed' : s === 'pending' ? 'signal-pending' : 'signal-negative';

    const catLabels = {
      trend: '趨勢', momentum: '動量', volatility: '波動', volume: '量能', price_action: '價格結構'
    };

    // Group signals by category using the knowledge base
    const allSignals = window.__chartAI && window.__chartAI.ENTRY_SIGNALS ? window.__chartAI.ENTRY_SIGNALS : [];
    const signalMap  = {};
    if (Array.isArray(timing.signals)) {
      for (const s of timing.signals) signalMap[s.id] = s;
    }

    // Build rows: confirmed first, then pending, then negative
    const rows = Array.isArray(timing.signals) ? timing.signals.map(s => `
      <div class="signal-row ${statusCls(s.status)}">
        <span class="signal-icon">${statusIcon(s.status)}</span>
        <div class="signal-body">
          <span class="signal-name">${escapeHtml(s.name_zh || s.id || '')}</span>
          ${s.detail ? `<span class="signal-detail">${escapeHtml(s.detail)}</span>` : ''}
        </div>
      </div>`).join('') : '';

    const count = typeof timing.confluence_count === 'number' ? timing.confluence_count : '';

    return `
      <div class="result-section entry-timing-section">
        <div class="timing-header">
          <span class="result-label">買進時機</span>
          <span class="timing-badge ${q.cls}">${q.icon} ${q.label}${count !== '' ? `（${count} 信號確認）` : ''}</span>
        </div>

        ${rows ? `<div class="signal-list">${rows}</div>` : ''}

        ${timing.optimal_wait ? `
        <div class="timing-wait-box">
          <span class="timing-wait-label">⏳ 等待條件</span>
          <span class="timing-wait-text">${escapeHtml(timing.optimal_wait)}</span>
        </div>` : ''}

        ${timing.invalidation ? `
        <div class="timing-invalid-box">
          <span class="timing-invalid-label">⛔ 失效條件</span>
          <span class="timing-invalid-text">${escapeHtml(timing.invalidation)}</span>
        </div>` : ''}
      </div>`;
  }

  // ── Chart patterns HTML builder ──────────────────────────────────────────

  function buildChartPatternsHtml(patterns) {
    if (!Array.isArray(patterns) || !patterns.length) return '';
    const typeLabel = t => t === 'reversal' ? '反轉' : t === 'continuation' ? '延續' : '雙向';
    const dirLabel  = d => d === 'bullish' ? '看多' : d === 'bearish' ? '看空' : '雙向';
    const dirCls    = d => d === 'bullish' ? 'cp-badge--bull' : d === 'bearish' ? 'cp-badge--bear' : 'cp-badge--neutral';
    const statusLabel = s => s === 'forming' ? '形成中' : s === 'confirmed' ? '已完成' : s === 'breakout' ? '已突破' : s;
    const statusCls   = s => s === 'breakout' ? 'cp-status--breakout' : s === 'confirmed' ? 'cp-status--confirmed' : 'cp-status--forming';

    const items = patterns.map(p => {
      const levels = p.key_levels || {};
      const levelsHtml = [
        levels.neckline && levels.neckline !== 'N/A' ? `頸線 ${escapeHtml(levels.neckline)}` : '',
        levels.target   ? `目標 ${escapeHtml(levels.target)}` : '',
        levels.stop     ? `止損 ${escapeHtml(levels.stop)}` : ''
      ].filter(Boolean).join(' · ');

      return `
        <div class="cp-item">
          <div class="cp-item-header">
            <span class="cp-name">${escapeHtml(p.name_zh || '')}${p.name_en ? ` <span class="cp-name-en">${escapeHtml(p.name_en)}</span>` : ''}</span>
            <span class="cp-badge ${dirCls(p.direction)}">${dirLabel(p.direction)}</span>
            <span class="cp-status ${statusCls(p.status)}">${statusLabel(p.status)}</span>
          </div>
          <div class="cp-meta">
            <span>${escapeHtml(typeLabel(p.type))}型態</span>
            ${p.reliability ? `<span>可靠度 ${escapeHtml(p.reliability)}</span>` : ''}
            ${p.volume_ok != null ? `<span>${p.volume_ok ? '✅ 量能配合' : '⚠ 量能不足'}</span>` : ''}
          </div>
          ${levelsHtml ? `<div class="cp-levels">${levelsHtml}</div>` : ''}
          ${p.note ? `<div class="cp-note">${escapeHtml(p.note)}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="result-section cp-section">
        <span class="result-label">圖表型態</span>
        <div class="cp-list">${items}</div>
      </div>`;
  }

  // ── Volume analysis HTML builder ─────────────────────────────────────────

  function buildVolumeAnalysisHtml(va) {
    if (!va) return '';

    const hasProfile = va.profile_visible &&
      (va.poc || va.vah || va.val);
    const hasFootprint = va.footprint_visible &&
      (va.delta || va.imbalance || va.cvd_signal);

    const profileRows = hasProfile ? [
      va.poc && va.poc !== 'N/A' ? `<div class="va-row"><span class="va-label">POC</span><span class="va-price va-price--poc">${escapeHtml(va.poc)}</span></div>` : '',
      va.vah && va.vah !== 'N/A' ? `<div class="va-row"><span class="va-label">VAH</span><span class="va-price">${escapeHtml(va.vah)}</span></div>` : '',
      va.val && va.val !== 'N/A' ? `<div class="va-row"><span class="va-label">VAL</span><span class="va-price">${escapeHtml(va.val)}</span></div>` : '',
      Array.isArray(va.hvn) && va.hvn.length ? `<div class="va-row"><span class="va-label">HVN</span><span class="va-value">${va.hvn.map(escapeHtml).join(' / ')}</span></div>` : '',
      Array.isArray(va.lvn) && va.lvn.length ? `<div class="va-row"><span class="va-label">LVN</span><span class="va-value">${va.lvn.map(escapeHtml).join(' / ')}</span></div>` : ''
    ].filter(Boolean).join('') : '';

    const footprintRows = hasFootprint ? [
      va.delta && va.delta !== 'N/A' ? `<div class="va-row"><span class="va-label">Delta</span><span class="va-value">${escapeHtml(va.delta)}</span></div>` : '',
      va.imbalance && va.imbalance !== 'N/A' ? `<div class="va-row"><span class="va-label">失衡</span><span class="va-value">${escapeHtml(va.imbalance)}</span></div>` : '',
      va.cvd_signal && va.cvd_signal !== 'N/A' ? `<div class="va-row"><span class="va-label">CVD</span><span class="va-value">${escapeHtml(va.cvd_signal)}</span></div>` : ''
    ].filter(Boolean).join('') : '';

    const hasAny = profileRows || footprintRows || va.volume_structure || va.current_position || va.profile_signal;
    if (!hasAny) return '';

    return `
      <div class="result-section va-section">
        <span class="result-label">量能分析</span>
        ${va.volume_structure ? `<div class="va-structure">${escapeHtml(va.volume_structure)}</div>` : ''}
        ${profileRows ? `
          <div class="va-group">
            <div class="va-group-title">Volume Profile</div>
            ${profileRows}
            ${va.current_position ? `<div class="va-row"><span class="va-label">位置</span><span class="va-value">${escapeHtml(va.current_position)}</span></div>` : ''}
            ${va.profile_signal ? `<div class="va-signal">${escapeHtml(va.profile_signal)}</div>` : ''}
          </div>` : ''}
        ${footprintRows ? `
          <div class="va-group">
            <div class="va-group-title">Order Flow</div>
            ${footprintRows}
          </div>` : ''}
      </div>`;
  }

  // ── Result card HTML builder ─────────────────────────────────────────────

  function buildResultCardHtml(result, timestamp, lotInfo) {
    const directionClass = result.direction === 'long' ? 'badge-long' : 'badge-short';
    const directionText = result.direction === 'long' ? '做多 LONG' : '做空 SHORT';

    const keyPointsHtml = Array.isArray(result.key_points) && result.key_points.length
      ? `<ul class="key-points">${result.key_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
      : '';

    const patternsHtml = (() => {
      if (!Array.isArray(result.candlestick_patterns) || !result.candlestick_patterns.length) return '';
      const items = result.candlestick_patterns.map(p => {
        if (typeof p === 'string') return `<li>${escapeHtml(p)}</li>`;
        const sigClass = p.signal === 'bullish' ? 'pattern-badge--bull' :
                         p.signal === 'bearish' ? 'pattern-badge--bear' : 'pattern-badge--neutral';
        const sigText  = p.signal === 'bullish' ? '看多' :
                         p.signal === 'bearish' ? '看空' : '中性';
        const posText  = p.position === 'bottom_rev' ? '底部反轉' :
                         p.position === 'top_rev'    ? '頂部反轉' :
                         p.position === 'continuation' ? '趨勢延續' : '';
        return `<li class="pattern-item">
          <div class="pattern-header">
            <span class="pattern-name">${escapeHtml(p.name_zh || '')}${p.name_en ? ` <span class="pattern-en">${escapeHtml(p.name_en)}</span>` : ''}</span>
            <span class="pattern-badge ${sigClass}">${sigText}</span>
            ${p.candles ? `<span class="pattern-candle">${p.candles}K</span>` : ''}
          </div>
          ${posText || p.reliability ? `<div class="pattern-meta">${posText ? `<span>📍 ${escapeHtml(posText)}</span>` : ''}${p.reliability ? `<span>可靠度: ${escapeHtml(p.reliability)}</span>` : ''}</div>` : ''}
          ${p.desc ? `<div class="pattern-desc">${escapeHtml(p.desc)}</div>` : ''}
        </li>`;
      }).join('');
      return `<ul class="pattern-list">${items}</ul>`;
    })();

    const techSummaryHtml = result.technical_summary
      ? `<span class="result-value">${escapeHtml(result.technical_summary.overall || '')}${result.technical_summary.indicators ? ' — ' + escapeHtml(result.technical_summary.indicators) : ''}</span>`
      : '';

    let lotHtml = '';
    if (lotInfo) {
      const lotDetail = lotInfo.stdLot
        ? `<span class="lot-item">標準手（外匯）：<strong>${lotInfo.stdLot} lot</strong></span>
           <span class="lot-item">迷你手：${lotInfo.miniLot} / 微型手：${lotInfo.microLot}</span>`
        : '';
      lotHtml = `
        <div class="result-section lot-info-section">
          <span class="result-label">資金計算</span>
          <div class="lot-info">
            <span class="lot-item">風險金額：<strong>${escapeHtml(lotInfo.capitalRisk)} ${escapeHtml(lotInfo.currency)}</strong></span>
            ${lotDetail}
          </div>
        </div>`;
    }

    return `
      <div class="result-card">
        <div class="result-row symbol-row">
          <span class="badge badge-symbol">${escapeHtml(result.symbol)}</span>
          <span class="badge badge-timeframe">${escapeHtml(result.timeframe)}</span>
          <span class="badge ${directionClass}">${directionText}</span>
        </div>

        <div class="result-row">
          <span class="result-label">趨勢</span>
          <span class="result-value">${escapeHtml(result.trend)}</span>
        </div>

        <div class="result-row">
          <span class="result-label">進場區間</span>
          <span class="result-value">${escapeHtml(result.entry_zone)}</span>
        </div>

        <div class="result-row">
          <span class="result-label">停損</span>
          <span class="result-value">${escapeHtml(result.stop_loss)}</span>
        </div>

        <div class="result-row">
          <span class="result-label">停損原因</span>
          <span class="result-value">${escapeHtml(result.stop_loss_reason)}</span>
        </div>

        <div class="result-row">
          <span class="result-label">TP1</span>
          <span class="result-value">${escapeHtml(result.tp1)}</span>
        </div>

        <div class="result-row">
          <span class="result-label">TP2</span>
          <span class="result-value">${escapeHtml(result.tp2)}</span>
        </div>

        <div class="result-row rr-ratio-row">
          <span class="result-label">風報比</span>
          <span class="rr-ratio">${escapeHtml(result.rr_ratio)}</span>
        </div>

        <div class="result-row">
          <span class="result-label">建議倉位</span>
          <span class="result-value">${escapeHtml(result.position_size)}</span>
        </div>

        <div class="result-row">
          <span class="result-label">持倉週期</span>
          <span class="result-value">${escapeHtml(result.holding_period)}</span>
        </div>

        ${keyPointsHtml ? `
        <div class="result-section">
          <span class="result-label">關鍵要點</span>
          ${keyPointsHtml}
        </div>` : ''}

        ${patternsHtml ? `
        <div class="result-section">
          <span class="result-label">K線型態</span>
          ${patternsHtml}
        </div>` : ''}

        ${techSummaryHtml ? `
        <div class="result-section">
          <span class="result-label">指標總評</span>
          ${techSummaryHtml}
        </div>` : ''}

        ${buildEntryTimingHtml(result.entry_timing)}

        ${buildStrategyHtml(result.entry_strategy)}

        ${buildScenariosHtml(result.key_scenarios)}

        ${buildChartPatternsHtml(result.chart_patterns)}

        ${buildVolumeAnalysisHtml(result.volume_analysis)}

        ${lotHtml}

        ${result.risk_warning ? `<div class="risk-warning">&#9888; ${escapeHtml(result.risk_warning)}</div>` : ''}

        ${result._fallbackWarning ? `<div class="risk-warning" style="background:rgba(0,212,255,0.07);border-color:rgba(0,212,255,0.3);color:#00d4ff;">&#9432; ${escapeHtml(result._fallbackWarning)}</div>` : ''}

        <div class="timestamp">${escapeHtml(timestamp)} · 僅供參考，非投資建議</div>

        <div class="result-actions">
          <button class="mark-btn" id="markBtn">&#128205; 標記圖表</button>
          <button class="copy-btn" id="copyBtn">複製</button>
        </div>
      </div>
    `;
  }

  // ── Template selector ────────────────────────────────────────────────────

  async function loadTemplateSelector() {
    const { promptTemplates } = await chrome.storage.local.get('promptTemplates');
    const sel = shadow && shadow.getElementById('templateSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">預設分析</option>';
    (promptTemplates || []).forEach(function (t) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.isDefault) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function getSelectedTemplateId() {
    const sel = shadow && shadow.getElementById('templateSelect');
    return sel ? (sel.value || null) : null;
  }

  // ── Tab switching ────────────────────────────────────────────────────────

  function switchTab(tabName) {
    if (!shadow) return;
    currentTab = tabName;
    const isAnalysis = tabName === 'analysis';
    const isBatch = tabName === 'batch';
    const isMemory = tabName === 'memory';

    const tabAnalysis = shadow.getElementById('tabAnalysis');
    const tabBatch = shadow.getElementById('tabBatch');
    const tabMemory = shadow.getElementById('tabMemory');
    if (tabAnalysis) tabAnalysis.classList.toggle('sidebar-tab--active', isAnalysis);
    if (tabBatch) tabBatch.classList.toggle('sidebar-tab--active', isBatch);
    if (tabMemory) tabMemory.classList.toggle('sidebar-tab--active', isMemory);

    // Analysis panel components: templateBar + toolbar + resultsArea + pine-section
    const templateBar = shadow.getElementById('templateBar');
    const toolbar = shadow.querySelector('.toolbar');
    const resultsArea = shadow.getElementById('resultsArea');
    const pineSection = shadow.querySelector('.pine-section');
    const batchPanel = shadow.getElementById('batchPanel');
    const memoryPanel = shadow.getElementById('memoryPanel');

    if (templateBar) templateBar.style.display = isAnalysis ? '' : 'none';
    if (toolbar) toolbar.style.display = isAnalysis ? '' : 'none';
    if (resultsArea) resultsArea.style.display = isAnalysis ? '' : 'none';
    if (pineSection) pineSection.style.display = isAnalysis ? '' : 'none';
    if (batchPanel) batchPanel.style.display = isBatch ? 'flex' : 'none';
    if (memoryPanel) memoryPanel.style.display = isMemory ? '' : 'none';

    if (isMemory) loadMemoryPanel();
  }

  // ── Batch scan UI helpers ────────────────────────────────────────────────

  function renderBatchItemPending(symbol) {
    const div = document.createElement('div');
    div.className = 'batch-item batch-item--pending';
    div.setAttribute('data-symbol', symbol);
    div.innerHTML = `
      <span class="batch-item-symbol">${escapeHtml(symbol)}</span>
      <span class="batch-item-status">等待中...</span>
    `;
    return div;
  }

  function updateBatchItemAnalyzing(symbol) {
    if (!shadow) return;
    const item = shadow.querySelector(`.batch-item[data-symbol="${CSS.escape(symbol)}"]`);
    if (!item) return;
    item.className = 'batch-item batch-item--analyzing';
    item.innerHTML = `
      <span class="batch-item-symbol">${escapeHtml(symbol)}</span>
      <span class="batch-item-status">分析中...</span>
    `;
  }

  // Called by batch-scan.js for granular status during screenshot mode
  function updateBatchItemStatus(symbol, statusText) {
    if (!shadow) return;
    const item = shadow.querySelector(`.batch-item[data-symbol="${CSS.escape(symbol)}"]`);
    if (!item) return;
    const statusEl = item.querySelector('.batch-item-status');
    if (statusEl) statusEl.textContent = statusText;
  }

  // Called once at scan start so the header shows 📸 or 📝 mode
  function onBatchModeDetected(mode) {
    if (!shadow) return;
    const header = shadow.querySelector('.batch-results-header');
    if (!header) return;
    let badge = header.querySelector('.batch-mode-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'batch-mode-badge';
      header.insertBefore(badge, header.firstChild);
    }
    if (mode === 'screenshot') {
      badge.textContent = '📸 截圖模式';
      badge.style.cssText = 'font-size:10px;color:#00e676;background:rgba(0,230,118,0.1);border:1px solid rgba(0,230,118,0.3);border-radius:8px;padding:1px 7px;margin-right:6px;flex-shrink:0;';
    } else {
      badge.textContent = '📝 文字模式';
      badge.style.cssText = 'font-size:10px;color:#ffd740;background:rgba(255,215,64,0.1);border:1px solid rgba(255,215,64,0.3);border-radius:8px;padding:1px 7px;margin-right:6px;flex-shrink:0;';
    }
  }

  function updateBatchItemDone(symbol, result) {
    if (!shadow) return;
    const item = shadow.querySelector(`.batch-item[data-symbol="${CSS.escape(symbol)}"]`);
    if (!item) return;

    if (result && result.direction) {
      const isLong = result.direction === 'long';
      const dirClass = isLong ? 'batch-item--long' : 'batch-item--short';
      const badgeClass = isLong ? 'badge-long' : 'badge-short';
      const badgeText = isLong ? '做多' : '做空';
      const summary = escapeHtml(result.trend || result.entry_zone || '');

      item.className = `batch-item batch-item--done ${dirClass}`;
      item.innerHTML = `
        <span class="batch-item-symbol">${escapeHtml(symbol)}</span>
        <span class="batch-item-badge ${badgeClass}">${badgeText}</span>
        <span class="batch-item-summary">${summary}</span>
        <button class="batch-item-expand" data-symbol="${escapeHtml(symbol)}">&#9658;</button>
      `;
    } else {
      item.className = 'batch-item batch-item--error';
      item.innerHTML = `
        <span class="batch-item-symbol">${escapeHtml(symbol)}</span>
        <span class="batch-item-status error-text">分析失敗</span>
      `;
    }
  }

  function updateBatchItemError(symbol) {
    if (!shadow) return;
    const item = shadow.querySelector(`.batch-item[data-symbol="${CSS.escape(symbol)}"]`);
    if (!item) return;
    item.className = 'batch-item batch-item--error';
    item.innerHTML = `
      <span class="batch-item-symbol">${escapeHtml(symbol)}</span>
      <span class="batch-item-status error-text">分析失敗</span>
    `;
  }

  function startBatchScan() {
    if (!shadow) return;
    const input = shadow.getElementById('batchSymbolsInput');
    const delaySelect = shadow.getElementById('batchDelaySelect');
    const maxSelect = shadow.getElementById('batchMaxSelect');

    if (!input) return;

    const rawText = input.value || '';
    const allSymbols = rawText
      .split('\n')
      .map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return s.length > 0; });

    const maxCount = parseInt((maxSelect && maxSelect.value) || '20', 10);
    const symbols = allSymbols.slice(0, maxCount);
    const delayMs = parseInt((delaySelect && delaySelect.value) || '5000', 10);

    if (!symbols.length) return;

    // Reset results
    batchResults = [];
    batchRunning = true;

    const startBtn = shadow.getElementById('batchStartBtn');
    if (startBtn) startBtn.disabled = true;

    const batchResultsDiv = shadow.getElementById('batchResults');
    if (batchResultsDiv) batchResultsDiv.style.display = '';

    const progressText = shadow.getElementById('batchProgressText');
    if (progressText) progressText.textContent = `0 / ${symbols.length}`;

    const exportBtn = shadow.getElementById('batchExportBtn');
    if (exportBtn) exportBtn.style.display = 'none';

    // Render all items as pending
    const batchItems = shadow.getElementById('batchItems');
    if (batchItems) {
      batchItems.innerHTML = '';
      symbols.forEach(function (sym) {
        batchItems.appendChild(renderBatchItemPending(sym));
      });
    }

    // Delegate to content.js via callback
    if (batchCallback) {
      batchCallback(symbols, delayMs);
    }
  }

  function abortBatchScan() {
    batchRunning = false;
    if (!shadow) return;
    const startBtn = shadow.getElementById('batchStartBtn');
    if (startBtn) startBtn.disabled = false;

    const progressText = shadow.getElementById('batchProgressText');
    if (progressText) {
      const current = progressText.textContent.split('/')[0].trim();
      const total = progressText.textContent.split('/')[1] ? progressText.textContent.split('/')[1].trim() : '?';
      progressText.textContent = `${current} / ${total} (已停止)`;
    }
  }

  function exportBatchCsv() {
    if (!batchResults.length) return;
    const headers = ['symbol', 'direction', 'trend', 'entry_zone', 'stop_loss', 'tp1', 'tp2', 'rr_ratio', 'risk_warning'];
    const rows = batchResults.map(function (r) {
      return headers.map(function (h) {
        const val = r[h] != null ? String(r[h]) : '';
        return '"' + val.replace(/"/g, '""') + '"';
      }).join(',');
    });
    const csv = [headers.join(',')].concat(rows).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch_scan_' + Date.now() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Sidebar creation ─────────────────────────────────────────────────────

  function createSidebar() {
    if (document.getElementById('chart-ai-copilot-root')) return;
    host = document.createElement('div');
    host.id = 'chart-ai-copilot-root';
    Object.assign(host.style, {
      position: 'fixed',
      right: '0',
      top: '0',
      width: '340px',
      height: '100vh',
      zIndex: '2147483647',
      overflow: 'hidden',
      transition: 'width 0.2s ease'
    });

    shadow = host.attachShadow({ mode: 'open' });

    // Block keyboard events from reaching the host page (e.g. TradingView shortcuts)
    ['keydown', 'keyup', 'keypress'].forEach(evt =>
      host.addEventListener(evt, e => e.stopPropagation(), true)
    );

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    shadow.appendChild(link);

    const container = document.createElement('div');
    container.className = 'sidebar-container';
    container.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-title">&#128202; Chart AI Copilot</span>
        <button class="collapse-btn" id="collapseBtn" title="收合">&#11157;</button>
      </div>
      <div class="sidebar-body" id="sidebarBody">
        <div class="sidebar-tabs" id="sidebarTabs">
          <button class="sidebar-tab sidebar-tab--active" id="tabAnalysis" data-tab="analysis">分析</button>
          <button class="sidebar-tab" id="tabBatch" data-tab="batch">批量掃描</button>
          <button class="sidebar-tab" id="tabMemory" data-tab="memory">&#129504; 記憶</button>
        </div>
        <div class="template-bar" id="templateBar">
          <select class="template-select" id="templateSelect">
            <option value="">預設分析</option>
          </select>
        </div>
        <div class="toolbar">
          <select class="direction-select" id="directionSelect">
            <option value="auto">自動</option>
            <option value="long">做多</option>
            <option value="short">做空</option>
          </select>
          <button class="history-btn" id="historyBtn" title="歷史紀錄">&#128336;</button>
          <button class="multi-tf-btn" id="multiTfBtn" title="多時框分析（4H+1H+15M）">多框</button>
          <button class="dual-btn" id="dualBtn" title="雙 Provider 驗證">雙驗</button>
          <button class="auto-draw-btn" id="autoDrawBtn" title="自動畫線：分析完成後自動標記進場/停損/目標線">&#9999;</button>
          <button class="analyze-btn" id="analyzeBtn">分析</button>
        </div>
        <div class="results" id="resultsArea">
          <p class="placeholder-text">點擊「分析」開始分析目前圖表</p>
        </div>
        <div class="pine-section">
          <button class="pine-toggle-btn" id="pineToggleBtn">&#127795; Pine Script 生成</button>
          <div id="pinePanel" class="pine-panel" style="display:none;">
            <textarea id="pineDescInput" class="pine-desc-input" rows="3"
              placeholder="用自然語言描述策略，例：RSI 14 低於 30 且 EMA 20 上穿 EMA 50 時買入，止損 2%，目標 4%"></textarea>
            <button id="pineGenerateBtn" class="pine-generate-btn">&#9889; 生成程式碼</button>
            <div id="pineResult" style="display:none;">
              <pre id="pineCode" class="pine-code"></pre>
              <div class="pine-actions">
                <button id="pineCopyBtn" class="pine-copy-btn">&#128203; 複製</button>
                <button id="pineInjectBtn" class="pine-inject-btn">&#128229; 填入 TV Editor</button>
              </div>
              <div id="pineStatus" class="pine-status"></div>
            </div>
          </div>
        </div>
        <div class="batch-panel" id="batchPanel" style="display:none;">
          <div class="batch-input-area">
            <textarea class="batch-symbols-input" id="batchSymbolsInput"
              placeholder="輸入交易對，每行一個：&#10;BTCUSDT&#10;ETHUSDT&#10;EURUSD"
              rows="6"></textarea>
            <div class="batch-settings-row">
              <label class="batch-label">間隔</label>
              <select class="batch-delay-select" id="batchDelaySelect">
                <option value="3000">3秒</option>
                <option value="5000">5秒</option>
                <option value="8000">8秒</option>
                <option value="10000">10秒</option>
              </select>
              <label class="batch-label">上限</label>
              <select class="batch-max-select" id="batchMaxSelect">
                <option value="5">5個</option>
                <option value="10">10個</option>
                <option value="20" selected>20個</option>
              </select>
            </div>
            <button class="batch-start-btn" id="batchStartBtn">&#9654; 開始批量分析</button>
          </div>
          <div class="batch-results" id="batchResults" style="display:none;">
            <div class="batch-results-header">
              <span class="batch-progress-text" id="batchProgressText">0 / 0</span>
              <button class="batch-abort-btn" id="batchAbortBtn">停止</button>
              <button class="batch-export-btn" id="batchExportBtn" style="display:none;">匯出 CSV</button>
            </div>
            <div class="batch-items" id="batchItems"></div>
          </div>
        </div>
        <div id="memoryPanel" class="memory-panel" style="display:none;">
          <div class="memory-section">
            <h4 class="memory-section-title">交易偏好</h4>

            <div class="memory-field-group">
              <label class="memory-label">方向偏好</label>
              <div class="memory-radio-group">
                <label><input type="radio" name="memDirection" value="long"> 做多</label>
                <label><input type="radio" name="memDirection" value="short"> 做空</label>
                <label><input type="radio" name="memDirection" value="both" checked> 雙向</label>
              </div>
            </div>

            <div class="memory-field-group">
              <label class="memory-label">交易風格</label>
              <select id="memTimeframe" class="memory-select">
                <option value="scalping">超短線</option>
                <option value="daytrading">日內交易</option>
                <option value="swingtrading" selected>波段交易</option>
                <option value="investing">長線投資</option>
              </select>
            </div>

            <div class="memory-field-group">
              <label class="memory-label">偏好指標</label>
              <div class="memory-checkbox-grid">
                <label><input type="checkbox" name="memIndicator" value="RSI"> RSI</label>
                <label><input type="checkbox" name="memIndicator" value="MACD"> MACD</label>
                <label><input type="checkbox" name="memIndicator" value="EMA"> EMA</label>
                <label><input type="checkbox" name="memIndicator" value="SMA"> SMA</label>
                <label><input type="checkbox" name="memIndicator" value="Bollinger"> Bollinger</label>
                <label><input type="checkbox" name="memIndicator" value="VWAP"> VWAP</label>
                <label><input type="checkbox" name="memIndicator" value="ATR"> ATR</label>
                <label><input type="checkbox" name="memIndicator" value="Stochastic"> Stoch</label>
              </div>
            </div>

            <div class="memory-field-group">
              <label class="memory-label">風險承受</label>
              <div class="memory-radio-group">
                <label><input type="radio" name="memRisk" value="low"> 保守</label>
                <label><input type="radio" name="memRisk" value="medium" checked> 中等</label>
                <label><input type="radio" name="memRisk" value="high"> 積極</label>
              </div>
            </div>
          </div>

          <div class="memory-section">
            <h4 class="memory-section-title">備注 &amp; 附加指示</h4>
            <label class="memory-label">交易備注</label>
            <textarea id="memNotes" class="memory-textarea" rows="3" placeholder="例：只做波段，不做日內..."></textarea>
            <label class="memory-label">附加 AI 指示 (最多 500 字)</label>
            <textarea id="memCustomPrompt" class="memory-textarea" rows="3" placeholder="例：分析時優先考慮成交量訊號..."></textarea>
          </div>

          <div class="memory-actions">
            <button id="memSaveBtn" class="memory-save-btn">&#128190; 儲存記憶</button>
            <button id="memClearBtn" class="memory-clear-btn">&#128465; 清除記憶</button>
          </div>
          <div id="memStatus" class="memory-status"></div>
        </div>
      </div>
      <div class="collapsed-icon" id="collapsedIcon" style="display:none;">
        <button class="expand-btn" id="expandBtn" title="展開">&#9776;</button>
      </div>
    `;

    shadow.appendChild(container);

    // Collapse / expand
    shadow.getElementById('collapseBtn').addEventListener('click', function () {
      host.style.width = '40px';
      container.querySelector('.sidebar-header').style.display = 'none';
      shadow.getElementById('sidebarBody').style.display = 'none';
      shadow.getElementById('collapsedIcon').style.display = 'flex';
    });

    shadow.getElementById('expandBtn').addEventListener('click', function () {
      host.style.width = '340px';
      container.querySelector('.sidebar-header').style.display = 'flex';
      shadow.getElementById('sidebarBody').style.display = 'block';
      shadow.getElementById('collapsedIcon').style.display = 'none';
    });

    // Tab switching
    shadow.getElementById('tabAnalysis').addEventListener('click', function () {
      switchTab('analysis');
    });
    shadow.getElementById('tabBatch').addEventListener('click', function () {
      switchTab('batch');
    });
    shadow.getElementById('tabMemory').addEventListener('click', function () {
      switchTab('memory');
    });

    // Analyze
    shadow.getElementById('analyzeBtn').addEventListener('click', function () {
      if (analyzeCallback) {
        analyzeCallback();
      } else {
        renderError('初始化未完成，請重新整理頁面後再試。');
      }
    });

    // History toggle
    shadow.getElementById('historyBtn').addEventListener('click', function () {
      if (multiTfMode) return;
      if (isHistoryView) {
        showCurrentResult();
      } else {
        showHistoryView();
      }
    });

    // Multi-TF toggle
    shadow.getElementById('multiTfBtn').addEventListener('click', function () {
      if (multiTfMode) {
        exitMultiTfMode();
      } else {
        enterMultiTfMode();
      }
    });

    // Dual mode toggle
    shadow.getElementById('dualBtn').addEventListener('click', function () {
      isDualMode = !isDualMode;
      const dualBtn = shadow.getElementById('dualBtn');
      if (dualBtn) {
        dualBtn.classList.toggle('dual-btn--active', isDualMode);
        dualBtn.title = isDualMode
          ? '雙驗證模式已開啟（點擊關閉）'
          : '雙 Provider 驗證';
      }
    });

    // Auto-draw toggle
    shadow.getElementById('autoDrawBtn').addEventListener('click', function () {
      autoDrawEnabled = !autoDrawEnabled;
      const btn = shadow.getElementById('autoDrawBtn');
      if (btn) {
        btn.classList.toggle('auto-draw-btn--active', autoDrawEnabled);
        btn.title = autoDrawEnabled
          ? '自動畫線已開啟（點擊關閉）'
          : '自動畫線：分析完成後自動標記進場/停損/目標線';
      }
    });

    // Batch start
    shadow.getElementById('batchStartBtn').addEventListener('click', function () {
      startBatchScan();
    });

    // Batch abort
    shadow.getElementById('batchAbortBtn').addEventListener('click', function () {
      abortBatchScan();
    });

    // Batch export
    shadow.getElementById('batchExportBtn').addEventListener('click', function () {
      exportBatchCsv();
    });

    // Pine Script toggle
    shadow.getElementById('pineToggleBtn').addEventListener('click', function () {
      const panel = shadow.getElementById('pinePanel');
      if (!panel) return;
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });

    // Pine generate
    shadow.getElementById('pineGenerateBtn').addEventListener('click', function () {
      handlePineGenerate();
    });

    // Pine copy
    shadow.getElementById('pineCopyBtn').addEventListener('click', function () {
      if (!pineResult || !pineResult.code) return;
      navigator.clipboard.writeText(pineResult.code).then(function () {
        const btn = shadow.getElementById('pineCopyBtn');
        if (btn) { btn.textContent = '已複製 ✓'; setTimeout(function () { btn.textContent = '&#128203; 複製'; }, 2000); }
      }).catch(function () {});
    });

    // Pine inject
    shadow.getElementById('pineInjectBtn').addEventListener('click', function () {
      handlePineInject();
    });

    // Memory save
    shadow.getElementById('memSaveBtn').addEventListener('click', function () {
      handleMemSave();
    });

    // Memory clear
    shadow.getElementById('memClearBtn').addEventListener('click', function () {
      handleMemClear();
    });

    // Batch items delegated click (expand button)
    shadow.getElementById('batchItems').addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('batch-item-expand')) {
        const sym = e.target.getAttribute('data-symbol');
        const found = batchResults.find(function (r) { return r.symbol === sym; });
        if (found) {
          // Toggle expanded detail below the row
          const item = e.target.closest('.batch-item');
          if (!item) return;
          const existing = item.nextElementSibling;
          if (existing && existing.classList.contains('batch-item-detail')) {
            existing.remove();
            e.target.innerHTML = '&#9658;';
          } else {
            const detail = document.createElement('div');
            detail.className = 'batch-item-detail';
            detail.style.cssText = 'padding:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:0 0 6px 6px;font-size:11px;color:#bbb;line-height:1.6;';
            detail.innerHTML = buildResultCardHtml(found, formatTs(Date.now()), null);
            item.insertAdjacentElement('afterend', detail);
            e.target.innerHTML = '&#9660;';
          }
        }
      }
    });

    // Delegated click handler for results area
    shadow.getElementById('resultsArea').addEventListener('click', function (e) {
      // Mark button (F-201)
      if (e.target && e.target.id === 'markBtn') {
        handleMark(e.target);
        return;
      }

      // Calibration confirm
      if (e.target && e.target.id === 'calConfirmBtn') {
        handleCalConfirm();
        return;
      }

      // Calibration cancel
      if (e.target && e.target.id === 'calCancelBtn') {
        handleCalCancel();
        return;
      }

      // Copy button
      if (e.target && e.target.id === 'copyBtn') {
        handleCopy(e.target);
        return;
      }

      // Wizard capture buttons
      if (e.target && e.target.classList && e.target.classList.contains('capture-step-btn')) {
        const step = parseInt(e.target.dataset.step, 10);
        if (!isNaN(step) && multiTfCaptureCallback) {
          e.target.disabled = true;
          e.target.textContent = '截圖中...';
          multiTfCaptureCallback(step);
        }
        return;
      }

      // Wizard analyze button
      if (e.target && e.target.id === 'wizardAnalyzeBtn') {
        if (multiTfAnalyzeCallback) multiTfAnalyzeCallback();
        return;
      }

      // Wizard cancel button
      if (e.target && e.target.id === 'wizardCancelBtn') {
        exitMultiTfMode();
        return;
      }

      // History item header (expand/collapse)
      const historyItemHeader = e.target.closest('.history-item-header');
      if (historyItemHeader) {
        const item = historyItemHeader.closest('.history-item');
        if (item) {
          const detail = item.querySelector('.history-item-detail');
          if (detail) {
            const isOpen = item.classList.toggle('history-item--open');
            detail.style.display = isOpen ? 'block' : 'none';
          }
        }
        return;
      }

      // Back button
      if (e.target && e.target.id === 'historyBackBtn') {
        showCurrentResult();
      }
    });

    // Load template selector after DOM is ready
    loadTemplateSelector();

    // Listen for storage changes to refresh template list
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes.promptTemplates) {
        loadTemplateSelector();
      }
    });

    document.body.appendChild(host);
  }

  // ── Mark / calibration handlers (F-201) ─────────────────────────────────

  function handleMark(btn) {
    if (!currentResult || !shadow) return;
    const resultsArea = shadow.getElementById('resultsArea');

    // Toggle: if form already open, close it
    const existingForm = resultsArea.querySelector('.cal-form');
    if (existingForm) {
      existingForm.remove();
      btn.innerHTML = '&#128205; 標記圖表';
      btn.disabled = false;
      return;
    }

    // Auto-draw when AI already returned the visible price range
    const autoHigh = parseFloat(currentResult.visible_high);
    const autoLow  = parseFloat(currentResult.visible_low);
    if (!isNaN(autoHigh) && !isNaN(autoLow) && autoHigh > autoLow) {
      const res = window.__chartAI.drawLinesWithRange(currentResult, autoHigh, autoLow);
      if (res && res.ok) {
        btn.textContent = '✅ 已標記（點圖表消除）';
        btn.disabled = true;
        setTimeout(() => {
          btn.innerHTML = '&#128205; 標記圖表';
          btn.disabled = false;
        }, 4000);
        return;
      }
    }

    // Fallback: show manual calibration form
    const form = document.createElement('div');
    form.className = 'cal-form';
    form.innerHTML = `
      <p class="cal-hint">請輸入 Y 軸可視範圍的頂部與底部價格（直接讀取圖表右側刻度）：</p>
      <div class="cal-row">
        <label class="cal-label">頂部價格</label>
        <input class="cal-input" id="calTop" type="number" step="any" placeholder="例如 1.2850">
      </div>
      <div class="cal-row">
        <label class="cal-label">底部價格</label>
        <input class="cal-input" id="calBot" type="number" step="any" placeholder="例如 1.2600">
      </div>
      <div class="cal-row cal-row--actions">
        <button class="cal-confirm-btn" id="calConfirmBtn">&#128205; 確認標記</button>
        <button class="cal-cancel-btn" id="calCancelBtn">取消</button>
      </div>
    `;

    const resultCard = resultsArea.querySelector('.result-card');
    if (resultCard) {
      resultCard.appendChild(form);
    } else {
      resultsArea.appendChild(form);
    }
    btn.textContent = '取消';
  }

  function handleCalConfirm() {
    if (!currentResult || !shadow) return;
    const resultsArea = shadow.getElementById('resultsArea');
    const calForm = resultsArea.querySelector('.cal-form');
    if (!calForm) return;

    const topInput = calForm.querySelector('#calTop');
    const botInput = calForm.querySelector('#calBot');
    const top = parseFloat(topInput && topInput.value);
    const bot = parseFloat(botInput && botInput.value);

    if (isNaN(top) || isNaN(bot) || top <= bot) {
      let errEl = calForm.querySelector('.cal-error');
      if (!errEl) {
        errEl = document.createElement('p');
        errEl.className = 'cal-error';
        calForm.insertBefore(errEl, calForm.querySelector('.cal-row--actions'));
      }
      errEl.textContent = (isNaN(top) || isNaN(bot))
        ? '請填入頂部與底部價格'
        : '頂部價格必須大於底部價格';
      return;
    }

    const res = window.__chartAI.drawLinesWithRange(currentResult, top, bot);
    const markBtn = resultsArea.querySelector('#markBtn');

    if (res && res.ok) {
      calForm.remove();
      if (markBtn) {
        markBtn.textContent = '✅ 已標記（點圖表消除）';
        markBtn.disabled = true;
        setTimeout(function () {
          markBtn.innerHTML = '&#128205; 標記圖表';
          markBtn.disabled = false;
        }, 4000);
      }
    } else {
      let errEl = calForm.querySelector('.cal-error');
      if (!errEl) {
        errEl = document.createElement('p');
        errEl.className = 'cal-error';
        calForm.insertBefore(errEl, calForm.querySelector('.cal-row--actions'));
      }
      errEl.textContent = (res && res.reason) || '標記失敗，請重試';
    }
  }

  function handleCalCancel() {
    if (!shadow) return;
    const resultsArea = shadow.getElementById('resultsArea');
    const calForm = resultsArea.querySelector('.cal-form');
    if (calForm) calForm.remove();
    const markBtn = resultsArea.querySelector('#markBtn');
    if (markBtn) {
      markBtn.innerHTML = '&#128205; 標記圖表';
      markBtn.disabled = false;
    }
  }

  // ── Copy handler ─────────────────────────────────────────────────────────

  function handleCopy(btn) {
    if (!currentResult) return;
    const text = buildCopyText(currentResult);
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = '已複製 ✓';
      btn.classList.add('copy-btn--done');
      setTimeout(function () {
        btn.textContent = '複製';
        btn.classList.remove('copy-btn--done');
      }, 2000);
    }).catch(function () {
      btn.textContent = '複製失敗';
      setTimeout(function () { btn.textContent = '複製'; }, 2000);
    });
  }

  // ── History view ─────────────────────────────────────────────────────────

  async function showHistoryView() {
    if (!shadow) return;
    isHistoryView = true;
    const historyBtn = shadow.getElementById('historyBtn');
    if (historyBtn) historyBtn.classList.add('history-btn--active');

    const resultsArea = shadow.getElementById('resultsArea');
    resultsArea.innerHTML = '<p class="placeholder-text">載入歷史紀錄中...</p>';

    const list = await loadHistory();

    if (!list.length) {
      resultsArea.innerHTML = `
        <div class="history-view">
          <div class="history-toolbar">
            <button class="back-btn" id="historyBackBtn">&#8592; 返回</button>
            <span class="history-title">分析歷史</span>
          </div>
          <p class="placeholder-text">尚無歷史紀錄</p>
        </div>`;
      return;
    }

    const itemsHtml = list.map(function (entry, idx) {
      const r = entry.result;
      const directionText = r.direction === 'long' ? '做多' : '做空';
      const directionClass = r.direction === 'long' ? 'badge-long' : 'badge-short';
      const cardHtml = buildResultCardHtml(r, formatTs(entry.ts), null);
      return `
        <div class="history-item" data-idx="${idx}">
          <div class="history-item-header">
            <span class="history-item-time">${escapeHtml(formatTs(entry.ts))}</span>
            <span class="badge badge-symbol" style="font-size:10px;padding:1px 6px;">${escapeHtml(r.symbol || '-')}</span>
            <span class="badge badge-timeframe" style="font-size:10px;padding:1px 5px;">${escapeHtml(r.timeframe || '-')}</span>
            <span class="badge ${directionClass}" style="font-size:10px;padding:1px 5px;">${directionText}</span>
            <span class="history-item-chevron">&#9660;</span>
          </div>
          <div class="history-item-detail" style="display:none;">${cardHtml}</div>
        </div>`;
    }).join('');

    resultsArea.innerHTML = `
      <div class="history-view">
        <div class="history-toolbar">
          <button class="back-btn" id="historyBackBtn">&#8592; 返回</button>
          <span class="history-title">分析歷史（${list.length} 筆）</span>
        </div>
        ${itemsHtml}
      </div>`;
  }

  function showCurrentResult() {
    if (!shadow) return;
    isHistoryView = false;
    const historyBtn = shadow.getElementById('historyBtn');
    if (historyBtn) historyBtn.classList.remove('history-btn--active');

    const resultsArea = shadow.getElementById('resultsArea');
    if (currentResult) {
      const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
      resultsArea.innerHTML = buildResultCardHtml(currentResult, timestamp, currentLotInfo);
    } else {
      resultsArea.innerHTML = '<p class="placeholder-text">點擊「分析」開始分析目前圖表</p>';
    }
  }

  // ── Multi-TF wizard ──────────────────────────────────────────────────────

  function enterMultiTfMode() {
    multiTfMode = true;
    multiTfStep = 0;
    multiTfCaptures = [];
    isHistoryView = false;

    const multiTfBtn = shadow.getElementById('multiTfBtn');
    const analyzeBtn = shadow.getElementById('analyzeBtn');
    const historyBtn = shadow.getElementById('historyBtn');
    if (multiTfBtn) multiTfBtn.classList.add('multi-tf-btn--active');
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (historyBtn) historyBtn.classList.remove('history-btn--active');

    renderMultiTfWizard();
  }

  function exitMultiTfMode() {
    multiTfMode = false;
    multiTfStep = 0;
    multiTfCaptures = [];

    const multiTfBtn = shadow.getElementById('multiTfBtn');
    const analyzeBtn = shadow.getElementById('analyzeBtn');
    if (multiTfBtn) multiTfBtn.classList.remove('multi-tf-btn--active');
    if (analyzeBtn) analyzeBtn.disabled = false;

    showCurrentResult();
  }

  function renderMultiTfWizard() {
    if (!shadow) return;
    const resultsArea = shadow.getElementById('resultsArea');

    const STEPS = [
      { tf: '4H', label: '切換到 4H 圖表後截圖' },
      { tf: '1H', label: '切換到 1H 圖表後截圖' },
      { tf: '15M', label: '切換到 15M 圖表後截圖' }
    ];

    const stepsHtml = STEPS.map(function (s, i) {
      const done = i < multiTfStep;
      const active = i === multiTfStep;
      const stateClass = done
        ? 'wizard-step--done'
        : (active ? 'wizard-step--active' : 'wizard-step--pending');

      const numOrCheck = done ? '✓' : String(i + 1);

      return `
        <div class="wizard-step ${stateClass}">
          <span class="step-num">${numOrCheck}</span>
          <span class="step-label">${s.tf}：${s.label}</span>
          ${done
            ? '<span class="step-done-icon">✅</span>'
            : `<button class="capture-step-btn" data-step="${i}" ${active ? '' : 'disabled'}>截圖</button>`
          }
        </div>`;
    }).join('');

    const allDone = multiTfStep >= 3;

    resultsArea.innerHTML = `
      <div class="multi-tf-wizard">
        <div class="wizard-title">&#128202; 多時框融合分析</div>
        <div class="wizard-hint">依序截取 3 個時框，AI 將進行跨時框交叉驗證</div>
        ${stepsHtml}
        <div class="wizard-actions">
          <button class="wizard-analyze-btn" id="wizardAnalyzeBtn" ${allDone ? '' : 'disabled'}>
            ${allDone ? '&#128640; 開始融合分析' : `等待截圖（${multiTfStep}/3）`}
          </button>
          <button class="wizard-cancel-btn" id="wizardCancelBtn">取消</button>
        </div>
      </div>`;
  }

  function onMultiTfCaptureDone(step, dataUrl) {
    multiTfCaptures[step] = dataUrl;
    multiTfStep = step + 1;
    renderMultiTfWizard();
  }

  function onMultiTfCaptureError(message) {
    if (!shadow) return;
    const resultsArea = shadow.getElementById('resultsArea');
    const errDiv = document.createElement('div');
    errDiv.className = 'error-msg';
    errDiv.style.margin = '8px 0';
    errDiv.textContent = '截圖失敗：' + message;
    const wizard = resultsArea.querySelector('.multi-tf-wizard');
    if (wizard) {
      wizard.insertBefore(errDiv, wizard.querySelector('.wizard-actions'));
    }
    // Re-enable the failed step button
    renderMultiTfWizard();
  }

  function getMultiTfCaptures() {
    return multiTfCaptures.slice();
  }

  // ── Dual result renderer ─────────────────────────────────────────────────

  function providerLabel(p) {
    if (p === 'anthropic') return 'Anthropic Claude';
    if (p === 'minimax') return 'MiniMax';
    if (p === 'custom') return '自訂 Provider';
    return p;
  }

  function renderDualResult(dualResults) {
    if (!shadow) return;
    setLoading(false);
    isHistoryView = false;

    const r1 = dualResults[0];
    const r2 = dualResults[1];
    const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });

    let consensusHtml = '';
    if (r1.result && r2.result) {
      if (r1.result.direction !== r2.result.direction) {
        consensusHtml = `
          <div class="dual-discrepancy">
            &#9888; 方向分歧！${escapeHtml(providerLabel(r1.provider))} 建議${r1.result.direction === 'long' ? '做多' : '做空'}，
            ${escapeHtml(providerLabel(r2.provider))} 建議${r2.result.direction === 'long' ? '做多' : '做空'}。
            建議觀望或使用更高時框確認趨勢後再決策。
          </div>`;
      } else {
        consensusHtml = `
          <div class="dual-agreement">
            &#10003; 兩個 Provider 方向一致（${r1.result.direction === 'long' ? '做多' : '做空'}），信心加成。
          </div>`;
      }
    }

    const panel1Html = r1.result
      ? buildResultCardHtml(r1.result, timestamp, computeLotInfo(r1.result, storedSettings))
      : `<div class="error-msg">&#9888; ${escapeHtml(r1.error || '分析失敗')}</div>`;

    const panel2Html = r2.result
      ? buildResultCardHtml(r2.result, timestamp, computeLotInfo(r2.result, storedSettings))
      : `<div class="error-msg">&#9888; ${escapeHtml(r2.error || '分析失敗')}</div>`;

    const resultsArea = shadow.getElementById('resultsArea');
    resultsArea.innerHTML = `
      <div class="dual-result">
        ${consensusHtml}
        <div class="dual-panel-label">&#9679; ${escapeHtml(providerLabel(r1.provider))}</div>
        ${panel1Html}
        <div class="dual-panel-label">&#9679; ${escapeHtml(providerLabel(r2.provider))}</div>
        ${panel2Html}
      </div>`;

    currentResult = (r1.result || r2.result) || null;
    currentLotInfo = currentResult ? computeLotInfo(currentResult, storedSettings) : null;

    if (currentResult) saveHistory(currentResult);
  }

  // ── Memory panel handlers ────────────────────────────────────────────────

  async function loadMemoryPanel() {
    if (!window.__chartAI || !window.__chartAI.profileMemory) return;
    const profile = await window.__chartAI.profileMemory.getProfile();
    if (!shadow) return;

    // Direction
    const dir = (profile.style && profile.style.direction) || 'both';
    const dirRadio = shadow.querySelector('input[name="memDirection"][value="' + dir + '"]');
    if (dirRadio) dirRadio.checked = true;

    // Timeframe
    const tfSel = shadow.getElementById('memTimeframe');
    if (tfSel && profile.style && profile.style.timeframe) tfSel.value = profile.style.timeframe;

    // Indicators
    const indChecks = shadow.querySelectorAll('input[name="memIndicator"]');
    const prefInds = (profile.style && profile.style.preferredIndicators) || [];
    indChecks.forEach(function (cb) {
      cb.checked = prefInds.indexOf(cb.value) !== -1;
    });

    // Risk
    const risk = (profile.style && profile.style.riskTolerance) || 'medium';
    const riskRadio = shadow.querySelector('input[name="memRisk"][value="' + risk + '"]');
    if (riskRadio) riskRadio.checked = true;

    // Notes
    const notesEl = shadow.getElementById('memNotes');
    if (notesEl) notesEl.value = profile.tradingNotes || '';

    // Custom prompt
    const promptEl = shadow.getElementById('memCustomPrompt');
    if (promptEl) promptEl.value = (profile.aiPreferences && profile.aiPreferences.customSystemPrompt) || '';
  }

  async function handleMemSave() {
    if (!shadow) return;
    const direction = (shadow.querySelector('input[name="memDirection"]:checked') || {}).value || 'both';
    const timeframe = (shadow.getElementById('memTimeframe') || {}).value || 'swingtrading';
    const indicators = [].slice.call(shadow.querySelectorAll('input[name="memIndicator"]:checked'))
      .map(function (el) { return el.value; });
    const riskTolerance = (shadow.querySelector('input[name="memRisk"]:checked') || {}).value || 'medium';
    const tradingNotes = (shadow.getElementById('memNotes') || {}).value || '';
    const customSystemPrompt = ((shadow.getElementById('memCustomPrompt') || {}).value || '').slice(0, 500);

    const profile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      style: { direction: direction, timeframe: timeframe, preferredIndicators: indicators, riskTolerance: riskTolerance },
      aiPreferences: { customSystemPrompt: customSystemPrompt },
      watchlist: [],
      tradingNotes: tradingNotes,
    };

    if (window.__chartAI && window.__chartAI.profileMemory) {
      await window.__chartAI.profileMemory.saveProfile(profile);
    }

    const statusEl = shadow.getElementById('memStatus');
    if (statusEl) {
      statusEl.textContent = '✅ 已儲存';
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    }
  }

  async function handleMemClear() {
    if (!shadow) return;
    // Reset form to defaults
    const dirRadio = shadow.querySelector('input[name="memDirection"][value="both"]');
    if (dirRadio) dirRadio.checked = true;
    const tfSel = shadow.getElementById('memTimeframe');
    if (tfSel) tfSel.value = 'swingtrading';
    shadow.querySelectorAll('input[name="memIndicator"]').forEach(function (cb) { cb.checked = false; });
    const riskRadio = shadow.querySelector('input[name="memRisk"][value="medium"]');
    if (riskRadio) riskRadio.checked = true;
    const notesEl = shadow.getElementById('memNotes');
    if (notesEl) notesEl.value = '';
    const promptEl = shadow.getElementById('memCustomPrompt');
    if (promptEl) promptEl.value = '';

    // Save cleared profile
    if (window.__chartAI && window.__chartAI.profileMemory) {
      const empty = Object.assign({}, window.__chartAI.profileMemory.DEFAULT_PROFILE, { updatedAt: '' });
      await window.__chartAI.profileMemory.saveProfile(empty);
    }

    const statusEl = shadow.getElementById('memStatus');
    if (statusEl) {
      statusEl.textContent = '🗑 已清除';
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    }
  }

  // ── Pine Script handlers ─────────────────────────────────────────────────

  async function handlePineGenerate() {
    if (!shadow) return;
    const descInput = shadow.getElementById('pineDescInput');
    const desc = descInput ? descInput.value.trim() : '';
    if (!desc) return;

    const btn = shadow.getElementById('pineGenerateBtn');
    if (btn) { btn.textContent = '⏳ 生成中...'; btn.disabled = true; }

    // Get current chart context from adapter
    const adapter = window.__chartAI && window.__chartAI.getAdapter ? window.__chartAI.getAdapter() : null;
    const context = {
      symbol: (adapter && adapter.getSymbol) ? (adapter.getSymbol() || '') : '',
      timeframe: (adapter && adapter.getTimeframe) ? (adapter.getTimeframe() || '') : '',
    };

    chrome.runtime.sendMessage({ type: 'GENERATE_PINE', payload: { description: desc, context: context } }, function (resp) {
      if (btn) { btn.textContent = '⚡ 生成程式碼'; btn.disabled = false; }
      if (!shadow) return;
      if (resp && resp.ok) {
        const codeEl = shadow.getElementById('pineCode');
        const resultEl = shadow.getElementById('pineResult');
        if (codeEl) codeEl.textContent = resp.code;
        if (resultEl) resultEl.style.display = '';
        pineResult = resp;
      } else {
        const statusEl = shadow.getElementById('pineStatus');
        if (statusEl) statusEl.textContent = '❌ 生成失敗：' + ((resp && resp.error) || '未知錯誤');
      }
    });
  }

  function handlePineInject() {
    if (!pineResult || !pineResult.code) return;
    const requestId = Date.now().toString();
    window.postMessage({ type: '__CHART_AI_INJECT_PINE__', code: pineResult.code, requestId: requestId }, '*');

    var timeoutId = null;

    function cleanup() {
      window.removeEventListener('message', onResult);
      if (timeoutId) clearTimeout(timeoutId);
    }

    function onResult(event) {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== '__CHART_AI_INJECT_PINE_RESULT__') return;
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (!shadow) return;
      const statusEl = shadow.getElementById('pineStatus');
      if (!statusEl) return;
      if (event.data.success) {
        const methodLabels = {
          cm5: 'CM5',
          cm6: 'CM6',
          cm6_execcommand: 'DOM 模擬',
          clipboard_fallback: '已複製到剪貼簿（請手動貼入 TV Editor）'
        };
        statusEl.textContent = '✅ ' + (methodLabels[event.data.method] || '已填入');
      } else if (event.data.error === 'editor_not_found') {
        statusEl.textContent = '❌ 找不到 Pine Editor，請先在 TradingView 開啟 Pine Script 編輯器';
      } else {
        statusEl.textContent = '❌ 填入失敗：' + event.data.error;
      }
    }
    window.addEventListener('message', onResult);

    // 5 秒 timeout：若 pine-injector.js 未回應（非 TradingView 頁面或注入失敗）
    timeoutId = setTimeout(function () {
      cleanup();
      if (!shadow) return;
      const statusEl = shadow.getElementById('pineStatus');
      if (statusEl) statusEl.textContent = '❌ 填入逾時，請確認此頁面為 TradingView 並已開啟 Pine Editor';
    }, 5000);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  function hide() {
    if (host) host.style.display = 'none';
  }

  function show() {
    if (host) host.style.display = '';
  }

  function setLoading(bool) {
    if (!shadow) return;
    const btn = shadow.getElementById('analyzeBtn');
    const resultsArea = shadow.getElementById('resultsArea');

    if (btn && !multiTfMode) btn.disabled = bool;

    if (bool) {
      isHistoryView = false;
      const historyBtn = shadow.getElementById('historyBtn');
      if (historyBtn) historyBtn.classList.remove('history-btn--active');
      resultsArea.innerHTML = `
        <div class="spinner-wrapper" id="loadingSpinner">
          <div class="spinner"></div>
          <span>AI 分析中...</span>
        </div>`;
    }
  }

  function renderResult(result) {
    if (!shadow) return;
    setLoading(false);
    currentResult = result;
    currentLotInfo = computeLotInfo(result, storedSettings);
    isHistoryView = false;
    multiTfMode = false;

    const multiTfBtn = shadow.getElementById('multiTfBtn');
    const analyzeBtn = shadow.getElementById('analyzeBtn');
    const historyBtn = shadow.getElementById('historyBtn');
    if (multiTfBtn) multiTfBtn.classList.remove('multi-tf-btn--active');
    if (analyzeBtn) analyzeBtn.disabled = false;
    if (historyBtn) historyBtn.classList.remove('history-btn--active');

    const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
    const resultsArea = shadow.getElementById('resultsArea');
    resultsArea.innerHTML = buildResultCardHtml(result, timestamp, currentLotInfo);

    saveHistory(result);

    // Auto-draw lines if enabled and AI returned visible price range
    if (autoDrawEnabled && window.__chartAI && window.__chartAI.drawLinesWithRange) {
      const autoHigh = parseFloat(result.visible_high);
      const autoLow  = parseFloat(result.visible_low);
      if (!isNaN(autoHigh) && !isNaN(autoLow) && autoHigh > autoLow) {
        window.__chartAI.drawLinesWithRange(result, autoHigh, autoLow);
        const markBtn = resultsArea.querySelector('#markBtn');
        if (markBtn) {
          markBtn.textContent = '✅ 已自動標記（點圖表消除）';
          markBtn.disabled = true;
          setTimeout(function () {
            if (markBtn) { markBtn.innerHTML = '&#128205; 標記圖表'; markBtn.disabled = false; }
          }, 5000);
        }
      }
    }
  }

  function renderError(message) {
    if (!shadow) return;
    setLoading(false);
    const resultsArea = shadow.getElementById('resultsArea');
    resultsArea.innerHTML = `<div class="error-msg">&#9888; ${escapeHtml(message)}</div>`;
  }

  function getDirection() {
    if (!shadow) return 'auto';
    const sel = shadow.getElementById('directionSelect');
    return sel ? sel.value : 'auto';
  }

  function setAnalyzeCallback(fn) {
    analyzeCallback = fn;
  }

  function setMultiTfCaptureCallback(fn) {
    multiTfCaptureCallback = fn;
  }

  function setMultiTfAnalyzeCallback(fn) {
    multiTfAnalyzeCallback = fn;
  }

  function setSettings(s) {
    storedSettings = s;
  }

  function getIsDualMode() {
    return isDualMode;
  }

  // ── Batch scan public API ────────────────────────────────────────────────

  function setBatchCallback(fn) {
    batchCallback = fn;
  }

  // Called by batch-scan.js when a symbol starts: onBatchItemStart(index, symbol, total)
  function onBatchItemStart(index, symbol, total) {
    updateBatchItemAnalyzing(symbol);
  }

  // Called by batch-scan.js when a symbol finishes: onBatchItemDone(index, symbol, result, errorMsg)
  function onBatchItemDone(index, symbol, result, errorMsg) {
    if (!shadow) return;
    const progressText = shadow.getElementById('batchProgressText');

    // Store result in flat form so exportBatchCsv can read top-level fields
    if (result && result.direction) {
      const flat = Object.assign({ symbol: result.symbol || symbol }, result);
      batchResults.push(flat);
    } else {
      batchResults.push({ symbol: symbol, _error: true, error: errorMsg });
    }

    if (progressText) {
      const parts = progressText.textContent.split('/');
      const total = parts[1] ? parts[1].trim().replace(/[^0-9]/g, '') : '?';
      progressText.textContent = `${batchResults.length} / ${total}`;
    }

    // Update the item row in the UI
    if (errorMsg) {
      updateBatchItemError(symbol);
    } else {
      updateBatchItemDone(symbol, result);
    }
  }

  function onBatchComplete(results) {
    if (!shadow) return;
    batchRunning = false;

    const startBtn = shadow.getElementById('batchStartBtn');
    if (startBtn) startBtn.disabled = false;

    const exportBtn = shadow.getElementById('batchExportBtn');
    if (exportBtn) exportBtn.style.display = '';

    // Flatten the {symbol, result, state, error} objects from batch-scan.js
    // into the flat structure that exportBatchCsv expects
    if (results && Array.isArray(results)) {
      batchResults = results.map(function (r) {
        if (r.result && r.result.direction) {
          return Object.assign({ symbol: r.symbol }, r.result);
        }
        return { symbol: r.symbol, _error: true, error: r.error };
      });
    }
  }

  function setBatchResults(results) {
    batchResults = results || [];
  }

  // Only inject sidebar on known chart platforms
  if (window.__chartAI && window.__chartAI.getAdapter && window.__chartAI.getAdapter()) {
    createSidebar();
  }

  window.__chartAI = window.__chartAI || {};
  Object.assign(window.__chartAI, {
    createSidebar,
    hide,
    show,
    setLoading,
    renderResult,
    renderError,
    renderDualResult,
    getDirection,
    setAnalyzeCallback,
    setMultiTfCaptureCallback,
    setMultiTfAnalyzeCallback,
    setSettings,
    isDualMode: getIsDualMode,
    onMultiTfCaptureDone,
    onMultiTfCaptureError,
    getMultiTfCaptures,
    exitMultiTfMode,
    getSelectedTemplateId,
    setBatchCallback,
    onBatchItemStart,
    onBatchItemDone,
    onBatchItemStatus: updateBatchItemStatus,
    onBatchModeDetected,
    onBatchComplete,
    setBatchResults
  });
})();
