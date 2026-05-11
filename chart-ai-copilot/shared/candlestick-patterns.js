(function () {
  'use strict';
  window.__chartAI = window.__chartAI || {};

  // ── Candlestick pattern dictionary ──────────────────────────────────────
  // Sources: rich01.com, mitrade.com, strike.money, none.land
  // Fields: name_zh, name_en, signal (bullish/bearish/neutral),
  //         candles (1/2/3/5), position (bottom_rev/top_rev/continuation/any),
  //         reliability (高/中/低), desc

  const PATTERNS = [
    // ── Single candle ──────────────────────────────────────────────────────
    {
      name_zh: '大陽線', name_en: 'Marubozu (Bullish)', signal: 'bullish', candles: 1,
      position: 'any', reliability: '中高（65-70%）',
      desc: '無上下影線，開盤即最低、收盤即最高；買方完全掌控'
    },
    {
      name_zh: '大陰線', name_en: 'Marubozu (Bearish)', signal: 'bearish', candles: 1,
      position: 'any', reliability: '中高（65-70%）',
      desc: '無上下影線，開盤即最高、收盤即最低；賣方完全掌控'
    },
    {
      name_zh: '錘子線', name_en: 'Hammer', signal: 'bullish', candles: 1,
      position: 'bottom_rev', reliability: '中（~65%）',
      desc: '下跌趨勢末端，小實體位於上方，下影線為實體2倍以上；買方強力反攻'
    },
    {
      name_zh: '倒錘線', name_en: 'Inverted Hammer', signal: 'bullish', candles: 1,
      position: 'bottom_rev', reliability: '中（53-65%）',
      desc: '下跌趨勢末端，小實體位於下方，長上影線；買方嘗試推高'
    },
    {
      name_zh: '吊人線', name_en: 'Hanging Man', signal: 'bearish', candles: 1,
      position: 'top_rev', reliability: '中（55-60%）',
      desc: '上升趨勢末端，形狀如錘子線；賣壓開始出現，頂部警示'
    },
    {
      name_zh: '流星線', name_en: 'Shooting Star', signal: 'bearish', candles: 1,
      position: 'top_rev', reliability: '中（~57%）',
      desc: '上升趨勢末端，小實體位於下方，長上影線；買方衝高但遭大量拋售'
    },
    {
      name_zh: '十字線', name_en: 'Doji', signal: 'neutral', candles: 1,
      position: 'any', reliability: '低（50-55%，需後續確認）',
      desc: '開收盤幾乎相同，多空力量暫時均衡；是重要反轉前兆，須配合前後K線'
    },
    {
      name_zh: '蜻蜓十字', name_en: 'Dragonfly Doji', signal: 'bullish', candles: 1,
      position: 'bottom_rev', reliability: '中（55-60%）',
      desc: '開收盤在最高點，長下影線；買方大力承接，T字線形態'
    },
    {
      name_zh: '墓碑十字', name_en: 'Gravestone Doji', signal: 'bearish', candles: 1,
      position: 'top_rev', reliability: '中（~55%）',
      desc: '開收盤在最低點，長上影線；買方衝高後全數被賣壓打回，倒T字線形態'
    },
    {
      name_zh: '長腳十字線', name_en: 'Long-Legged Doji', signal: 'neutral', candles: 1,
      position: 'any', reliability: '低（48-52%）',
      desc: '上下影線均極長，開收盤居中；市場極度猶豫，等待方向突破'
    },
    {
      name_zh: '紡錘線', name_en: 'Spinning Top', signal: 'neutral', candles: 1,
      position: 'any', reliability: '低-中（56%頂部）',
      desc: '小實體，上下影線等長；多空交錯，動能衰退，趨勢休整期'
    },
    {
      name_zh: '一字線', name_en: 'Four-Price Doji', signal: 'neutral', candles: 1,
      position: 'any', reliability: '特殊（漲跌停常見）',
      desc: '開高低收全部相同；極度看多（漲停）或極度看空（跌停）的市場情緒'
    },
    {
      name_zh: '釘頭棒', name_en: 'Pin Bar', signal: 'reversal', candles: 1,
      position: 'any', reliability: '中高（60-65%，需於關鍵位）',
      desc: '影線佔K棒總長2/3以上，小實體；強烈價格拒絕，影線方向即拒絕方向'
    },

    // ── Two candle ─────────────────────────────────────────────────────────
    {
      name_zh: '多頭吞噬', name_en: 'Bullish Engulfing', signal: 'bullish', candles: 2,
      position: 'bottom_rev', reliability: '中高（~65%）',
      desc: '第二根大陽線實體完全吞沒第一根陰線實體；買方強力奪回主導'
    },
    {
      name_zh: '空頭吞噬', name_en: 'Bearish Engulfing', signal: 'bearish', candles: 2,
      position: 'top_rev', reliability: '高（~79%）',
      desc: '第二根大陰線實體完全吞沒第一根陽線實體；賣方強力奪回主導'
    },
    {
      name_zh: '穿刺線', name_en: 'Piercing Line', signal: 'bullish', candles: 2,
      position: 'bottom_rev', reliability: '中高（64-80%）',
      desc: '大陰線後，大陽線跳空低開後強勢上漲，收盤穿越前根實體中點以上'
    },
    {
      name_zh: '烏雲蓋頂', name_en: 'Dark Cloud Cover', signal: 'bearish', candles: 2,
      position: 'top_rev', reliability: '中高（60-64%）',
      desc: '大陽線後，大陰線跳空高開後快速下殺，收盤穿越前根實體中點以下'
    },
    {
      name_zh: '多頭孕線', name_en: 'Bullish Harami', signal: 'bullish', candles: 2,
      position: 'bottom_rev', reliability: '中（55-58%）',
      desc: '大陰線後出現包含於其中的小陽線；賣方力量衰退，潛在底部信號'
    },
    {
      name_zh: '空頭孕線', name_en: 'Bearish Harami', signal: 'bearish', candles: 2,
      position: 'top_rev', reliability: '低-中（~47%）',
      desc: '大陽線後出現包含於其中的小陰線；買方動能衰退，信號較弱需確認'
    },
    {
      name_zh: '鑷底', name_en: 'Tweezer Bottom', signal: 'bullish', candles: 2,
      position: 'bottom_rev', reliability: '中（~55%）',
      desc: '兩根K線最低點幾乎相同；多次測試同一支撐後反彈，雙重支撐確認'
    },
    {
      name_zh: '鑷頂', name_en: 'Tweezer Top', signal: 'bearish', candles: 2,
      position: 'top_rev', reliability: '中（~56%）',
      desc: '兩根K線最高點幾乎相同；多次測試同一壓力後回落，雙重阻力確認'
    },
    {
      name_zh: '看漲踢腳', name_en: 'Bullish Kicker', signal: 'bullish', candles: 2,
      position: 'bottom_rev', reliability: '高（強動能信號）',
      desc: '陰線後大陽線跳空向上，且兩根實體無重疊；強烈趨勢反轉動能'
    },
    {
      name_zh: '看跌踢腳', name_en: 'Bearish Kicker', signal: 'bearish', candles: 2,
      position: 'top_rev', reliability: '高（強動能信號）',
      desc: '陽線後大陰線跳空向下，且兩根實體無重疊；強烈趨勢反轉動能'
    },

    // ── Three candle ───────────────────────────────────────────────────────
    {
      name_zh: '早晨之星', name_en: 'Morning Star', signal: 'bullish', candles: 3,
      position: 'bottom_rev', reliability: '高（60-75%）',
      desc: '陰線＋小實體（含跳空）＋大陽線（收盤穿越第一根中點）；底部反轉力強'
    },
    {
      name_zh: '黃昏之星', name_en: 'Evening Star', signal: 'bearish', candles: 3,
      position: 'top_rev', reliability: '高（60-72%）',
      desc: '陽線＋小實體（含跳空）＋大陰線（收盤穿越第一根中點）；頂部反轉力強'
    },
    {
      name_zh: '早晨十字星', name_en: 'Morning Doji Star', signal: 'bullish', candles: 3,
      position: 'bottom_rev', reliability: '高（含十字線，信號更強）',
      desc: '晨星中間為十字線；多空更加均衡後買方勝出，底部確認度更高'
    },
    {
      name_zh: '黃昏十字星', name_en: 'Evening Doji Star', signal: 'bearish', candles: 3,
      position: 'top_rev', reliability: '高（60-72%）',
      desc: '暮星中間為十字線；頂部不確定性更大，隨後賣方勝出'
    },
    {
      name_zh: '白三兵', name_en: 'Three White Soldiers', signal: 'bullish', candles: 3,
      position: 'bottom_rev', reliability: '高（80-90%，理想條件下）',
      desc: '三根連續陽線，每根開盤在前根實體內，收盤創新高；買方持續加碼，強力趨勢信號'
    },
    {
      name_zh: '三烏鴉', name_en: 'Three Black Crows', signal: 'bearish', candles: 3,
      position: 'top_rev', reliability: '高（~85%，高時框更準）',
      desc: '三根連續陰線，每根開盤在前根實體內，收盤創新低；賣方持續施壓，強力下跌信號'
    },
    {
      name_zh: '三內升勢', name_en: 'Three Inside Up', signal: 'bullish', candles: 3,
      position: 'bottom_rev', reliability: '中',
      desc: '孕線後第三根陽線收盤高於第一根最高點；對多頭孕線的確認'
    },
    {
      name_zh: '三內降勢', name_en: 'Three Inside Down', signal: 'bearish', candles: 3,
      position: 'top_rev', reliability: '中',
      desc: '空頭孕線後第三根陰線收盤低於第一根最低點；對空頭孕線的確認'
    },
    {
      name_zh: '看漲棄嬰', name_en: 'Bullish Abandoned Baby', signal: 'bullish', candles: 3,
      position: 'bottom_rev', reliability: '高（在支撐位）',
      desc: '陰線後十字線跳空低開（孤立），再大陽線跳空高開；強力底部反轉'
    },
    {
      name_zh: '看跌棄嬰', name_en: 'Bearish Abandoned Baby', signal: 'bearish', candles: 3,
      position: 'top_rev', reliability: '高（在壓力位）',
      desc: '陽線後十字線跳空高開（孤立），再大陰線跳空低開；強力頂部反轉'
    },

    // ── Five candle (continuation) ─────────────────────────────────────────
    {
      name_zh: '上升三法', name_en: 'Rising Three Methods', signal: 'bullish', candles: 5,
      position: 'continuation', reliability: '中高（65-70%）',
      desc: '大陽線後三根小陰線（未破前根最低），最後一根大陽線突破新高；趨勢暫歇後延續'
    },
    {
      name_zh: '下降三法', name_en: 'Falling Three Methods', signal: 'bearish', candles: 5,
      position: 'continuation', reliability: '中高（71-75%）',
      desc: '大陰線後三根小陽線（未破前根最高），最後一根大陰線跌破新低；趨勢暫歇後延續'
    }
  ];

  // Build compact prompt reference (中英文對照 + 信號 + 可靠度 + 位置)
  function buildCandlestickRef() {
    const bullish = PATTERNS.filter(p => p.signal === 'bullish');
    const bearish = PATTERNS.filter(p => p.signal === 'bearish');
    const neutral = PATTERNS.filter(p => p.signal === 'neutral' || p.signal === 'reversal');

    const fmt = p => `  ・${p.name_zh}（${p.name_en}）${p.candles}K｜可靠度:${p.reliability}｜位置:${
      p.position === 'bottom_rev' ? '底部反轉' :
      p.position === 'top_rev'    ? '頂部反轉' :
      p.position === 'continuation' ? '趨勢延續' : '任意位置'
    }｜${p.desc}`;

    return (
      '【K線型態參考字典】識別圖表中的型態時，請使用以下標準名稱與判斷：\n\n' +
      '▶ 看多型態（Bullish）:\n' + bullish.map(fmt).join('\n') + '\n\n' +
      '▶ 看空型態（Bearish）:\n' + bearish.map(fmt).join('\n') + '\n\n' +
      '▶ 中性/反轉型態（Neutral/Reversal）:\n' + neutral.map(fmt).join('\n') + '\n\n' +
      '識別要求：①說明型態所在位置（如下跌底部/上漲頂部/整理中）②說明信號方向 ③說明可靠度 ④說明預示何種走勢\n'
    );
  }

  Object.assign(window.__chartAI, {
    CANDLESTICK_PATTERNS: PATTERNS,
    buildCandlestickRef
  });
})();
