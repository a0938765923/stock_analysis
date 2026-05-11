(function () {
  'use strict';
  window.__chartAI = window.__chartAI || {};

  // ── Entry timing signal knowledge base ──────────────────────────────────
  // Sources: rich01.com, quantpass.org, oanda.com, mitrade.com, pocket.tw
  // Fields: id, category, name_zh, name_en, condition, buy_signal, reliability,
  //         notes (optional)

  const ENTRY_SIGNALS = [
    // ── 趨勢類 (Trend) ───────────────────────────────────────────────────
    {
      id: 'ma_golden_cross',
      category: 'trend',
      name_zh: '均線黃金交叉',
      name_en: 'MA Golden Cross',
      condition: '短期均線（20MA）由下向上突破長期均線（60MA）',
      buy_signal: '趨勢由空轉多確認信號，適合中線進場',
      reliability: '中（落後指標，需等交叉後確認）',
      notes: '搭配成交量放大效果更佳；震盪行情容易出現假信號'
    },
    {
      id: 'ma_bullish_alignment',
      category: 'trend',
      name_zh: '多頭均線排列',
      name_en: 'Bullish MA Alignment',
      condition: '收盤價 > 20MA > 60MA > 120MA，均線依序向上發散',
      buy_signal: '趨勢延續最強確認，適合趨勢追蹤進場',
      reliability: '高（多頭排列期間成功率較高）',
      notes: '均線開口越大代表趨勢越強；回調至20MA附近是追多好時機'
    },
    {
      id: 'price_above_ma20',
      category: 'trend',
      name_zh: '股價站上20MA',
      name_en: 'Price Above 20MA',
      condition: '收盤價重新站回20日均線之上',
      buy_signal: '短期由弱轉強信號，動能回歸',
      reliability: '中（需配合量能確認）',
      notes: '20MA是最常用的短線趨勢分界線'
    },
    {
      id: 'downtrend_break',
      category: 'trend',
      name_zh: '跌勢趨勢線突破',
      name_en: 'Downtrend Line Break',
      condition: '價格向上突破連接數個高點的下降趨勢線，且收盤站穩',
      buy_signal: '下降趨勢終結，多空易位信號',
      reliability: '中高（收盤確認比盤中突破可靠）',
      notes: '突破後若有量能配合，可信度大幅提升'
    },

    // ── 動量類 (Momentum) ─────────────────────────────────────────────────
    {
      id: 'macd_golden_cross',
      category: 'momentum',
      name_zh: 'MACD黃金交叉',
      name_en: 'MACD Golden Cross',
      condition: 'MACD快線（DIF）由下向上突破慢線（DEA/Signal）',
      buy_signal: '動能由空轉多，柱狀圖由負翻正更佳',
      reliability: '中（零軸以下交叉比零軸以上更強）',
      notes: '零軸下方的黃金交叉代表底部反轉動能；零軸上方代表趨勢延續'
    },
    {
      id: 'macd_histogram_positive',
      category: 'momentum',
      name_zh: 'MACD柱狀圖翻正',
      name_en: 'MACD Histogram Positive',
      condition: 'MACD柱狀圖由負值翻轉為正值（由紅轉綠）',
      buy_signal: '買方動能超越賣方，短期上漲動能確認',
      reliability: '中（需搭配快線位置判斷）',
      notes: '柱狀圖持續擴大代表動能加速；柱狀圖縮小為動能衰退警示'
    },
    {
      id: 'macd_bullish_divergence',
      category: 'momentum',
      name_zh: 'MACD底背離',
      name_en: 'MACD Bullish Divergence',
      condition: '股價創新低，但MACD未同步創新低（指標底部墊高）',
      buy_signal: '賣方力量衰退，底部反轉前兆，為強力反轉信號',
      reliability: '高（底背離為最可靠的反轉信號之一）',
      notes: '背離需在明顯趨勢後出現才有效；可搭配RSI背離雙重確認'
    },
    {
      id: 'rsi_above_50',
      category: 'momentum',
      name_zh: 'RSI回升至50以上',
      name_en: 'RSI Cross Above 50',
      condition: 'RSI由50以下回升，向上突破50中性線',
      buy_signal: '多空力量由平衡轉為買方主導，趨勢強勢確認',
      reliability: '中高（結合方向趨勢使用效果更好）',
      notes: 'RSI>50為強勢市場；RSI>70為超買但趨勢強勁時可繼續持有'
    },
    {
      id: 'rsi_oversold_recovery',
      category: 'momentum',
      name_zh: 'RSI超賣回升',
      name_en: 'RSI Oversold Recovery',
      condition: 'RSI由30以下（超賣區）回升，向上突破30',
      buy_signal: '超賣狀態解除，潛在反彈信號',
      reliability: '中（下跌趨勢中RSI可長期維持低位，需配合趨勢判斷）',
      notes: 'RSI<30為超賣但不等於立即反彈；需等回升穿越30確認'
    },
    {
      id: 'rsi_bullish_divergence',
      category: 'momentum',
      name_zh: 'RSI底背離',
      name_en: 'RSI Bullish Divergence',
      condition: '股價創新低，RSI卻未同步創新低（指標低點墊高）',
      buy_signal: '下跌動能減弱，底部反轉信號',
      reliability: '高（與MACD底背離同時出現時信號最強）',
      notes: '背離從信號出現到反轉可能有時間差，需耐心等待確認K線'
    },
    {
      id: 'kd_golden_cross_oversold',
      category: 'momentum',
      name_zh: 'KD低檔黃金交叉',
      name_en: 'KD Golden Cross in Oversold',
      condition: 'KD值<20（超賣區），K值由下向上穿越D值',
      buy_signal: '超賣反彈最佳信號，成功率高於高位交叉',
      reliability: '中高（KD<20的黃金交叉比KD>80的黃金交叉更可靠）',
      notes: 'KD在低檔鈍化後出現交叉，反彈力道通常更強；參數建議(9,3)'
    },
    {
      id: 'kd_bullish_divergence',
      category: 'momentum',
      name_zh: 'KD底背離',
      name_en: 'KD Bullish Divergence',
      condition: '股價創新低，KD指標低點卻未同步創新低',
      buy_signal: '下跌末期賣壓衰退信號，與RSI背離同時出現效力加倍',
      reliability: '中高',
      notes: '需在明顯下跌趨勢後出現，盤整期間的背離意義較小'
    },

    // ── 波動類 (Volatility / Bollinger) ─────────────────────────────────
    {
      id: 'bb_lower_touch_bounce',
      category: 'volatility',
      name_zh: '布林下軌觸撐反彈',
      name_en: 'Bollinger Lower Band Bounce',
      condition: '股價觸及布林通道下軌後出現反彈K線，未收盤跌破',
      buy_signal: '統計上股價回到通道內機率高，超賣支撐反彈',
      reliability: '中（下跌趨勢中下軌可能被持續跌破，需配合其他指標）',
      notes: '搭配RSI超賣或K線反轉型態（錘子線）效果更佳'
    },
    {
      id: 'bb_squeeze_breakout',
      category: 'volatility',
      name_zh: '布林通道收縮後向上突破',
      name_en: 'Bollinger Squeeze Breakout',
      condition: '布林帶寬長期收縮（低波動整理），之後股價向上突破上軌並放量',
      buy_signal: '醞釀已久的趨勢啟動信號，突破方向即為新趨勢方向',
      reliability: '高（低波動後的突破通常有延續性）',
      notes: '帶寬收縮越久，突破後的走勢往往越強；需確認收盤站上上軌'
    },
    {
      id: 'bb_cross_midline',
      category: 'volatility',
      name_zh: '股價收復布林中線',
      name_en: 'Price Reclaim BB Midline',
      condition: '股價由下方重新站回布林通道中線（20MA）之上並收盤確認',
      buy_signal: '短期多空力量重新轉向，趨勢偏多確認',
      reliability: '中（收盤確認比盤中穿越可靠）',
      notes: '與MA站上20MA信號重疊，是最常見的加碼確認時機'
    },

    // ── 量能類 (Volume) ──────────────────────────────────────────────────
    {
      id: 'volume_breakout',
      category: 'volume',
      name_zh: '突破放量',
      name_en: 'Volume Breakout',
      condition: '股價突破關鍵壓力位（前高/均線/趨勢線），同時成交量顯著大於20日均量',
      buy_signal: '有效突破確認，資金積極進場背書',
      reliability: '高（無量突破容易假突破；放量突破可信度高）',
      notes: '突破量至少為20日均量的1.5倍以上；外資/機構放量意義更強'
    },
    {
      id: 'shrink_pullback_expand_up',
      category: 'volume',
      name_zh: '縮量回調後放量上攻',
      name_en: 'Shrink Pullback + Volume Expansion',
      condition: '上漲後縮量健康回調（賣盤少），再度放量向上突破',
      buy_signal: '籌碼穩定的回調買進機會，趨勢延續信號',
      reliability: '高（是最健康的回調進場模式）',
      notes: '縮量回調說明持股人不急於賣出，反轉向上時買盤積極'
    },
    {
      id: 'volume_divergence',
      category: 'volume',
      name_zh: '量價背離',
      name_en: 'Volume Price Divergence',
      condition: '股價持續下跌但成交量萎縮（賣盤力道不足）',
      buy_signal: '賣方興趣下降，空方力量衰竭，底部可能臨近',
      reliability: '中（需配合K線反轉型態確認）',
      notes: '底部的量縮反映恐慌賣壓已近尾聲；一旦放量上漲即確認底部'
    },

    // ── 價格結構類 (Price Action) ─────────────────────────────────────────
    {
      id: 'support_hold_bounce',
      category: 'price_action',
      name_zh: '支撐位守住反彈',
      name_en: 'Support Hold & Bounce',
      condition: '股價回調至關鍵支撐區（前高、均線、整數關卡）後守住並反彈',
      buy_signal: '支撐有效確認，回調買進機會',
      reliability: '中高（多次守住的支撐位更可靠）',
      notes: '第一次測試支撐最可靠；多次測試後容易被跌破'
    },
    {
      id: 'resistance_breakout_retest',
      category: 'price_action',
      name_zh: '突破後回踩確認',
      name_en: 'Breakout Retest',
      condition: '股價突破前高壓力位後，回踩至突破位附近（原壓力變支撐）守住並再上漲',
      buy_signal: '最可靠的追多時機之一，原壓力轉支撐確認',
      reliability: '高（突破後回踩是最低風險的入場點）',
      notes: '回踩深度不應超過突破幅度的50%；搭配縮量回踩更理想'
    },
    {
      id: 'higher_low_formation',
      category: 'price_action',
      name_zh: '底部墊高結構',
      name_en: 'Higher Low Formation',
      condition: '多次低點逐步墊高，形成上升的低點結構（更高的低點）',
      buy_signal: '買方逐步介入，多頭結構形成，每個低點都是潛在進場機會',
      reliability: '高（與更高的高點共同確認上升趨勢）',
      notes: '底部墊高是判斷趨勢轉多最可靠的價格結構'
    }
  ];

  // Confluence scoring thresholds
  const CONFLUENCE_LEVELS = [
    { min: 6, quality: 'strong',   label: '強力買點',   color: '#00c853' },
    { min: 4, quality: 'good',     label: '良好買點',   color: '#76ff03' },
    { min: 2, quality: 'moderate', label: '謹慎考慮',   color: '#ffab40' },
    { min: 0, quality: 'wait',     label: '等待時機',   color: '#ef5350' }
  ];

  function getConflLevel(count) {
    return CONFLUENCE_LEVELS.find(l => count >= l.min) || CONFLUENCE_LEVELS[CONFLUENCE_LEVELS.length - 1];
  }

  // Build compact prompt reference
  function buildEntryTimingRef() {
    const categories = {
      trend:        '趨勢類',
      momentum:     '動量類',
      volatility:   '波動類（布林通道）',
      volume:       '量能類',
      price_action: '價格結構類'
    };

    let out = '【買進時機信號參考字典】請評估圖表中以下每個信號是否成立：\n\n';
    for (const [cat, label] of Object.entries(categories)) {
      const sigs = ENTRY_SIGNALS.filter(s => s.category === cat);
      out += `▶ ${label}：\n`;
      for (const s of sigs) {
        out += `  ・[${s.id}] ${s.name_zh}（${s.name_en}）\n`;
        out += `    條件：${s.condition}\n`;
        out += `    信號：${s.buy_signal}\n`;
        out += `    可靠度：${s.reliability}\n`;
        if (s.notes) out += `    備註：${s.notes}\n`;
      }
      out += '\n';
    }

    out += '評估要求：\n';
    out += '1. 對每個信號給出 "confirmed"（已成立）、"pending"（接近成立，條件差一步）、或 "negative"（未成立/偏空）\n';
    out += '2. 計算已 confirmed 的信號數量作為 confluence_count\n';
    out += '3. 根據 confluence_count 評定整體買進時機質量：\n';
    out += '   6+ → "strong"（強力買點）\n';
    out += '   4-5 → "good"（良好買點）\n';
    out += '   2-3 → "moderate"（謹慎考慮）\n';
    out += '   0-1 → "wait"（等待時機）\n';
    out += '4. 說明最重要的待確認信號（optimal_wait）和使本次設置失效的條件（invalidation）\n';

    return out;
  }

  Object.assign(window.__chartAI, {
    ENTRY_SIGNALS,
    CONFLUENCE_LEVELS,
    getConflLevel,
    buildEntryTimingRef
  });
})();
