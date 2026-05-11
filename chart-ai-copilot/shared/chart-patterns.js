(function () {
  'use strict';
  window.__chartAI = window.__chartAI || {};

  // ── Chart pattern knowledge base ─────────────────────────────────────────
  // Sources: morpher.com, liberatedstocktrader.com, samuraitradingacademy.com
  // Fields: name_zh, name_en, type (reversal/continuation/bilateral),
  //         direction (bullish/bearish/bilateral), reliability,
  //         structure (how to identify), target_method, volume_req,
  //         stop_rule, notes

  const CHART_PATTERNS = [
    // ── Reversal Patterns (反轉型態) ──────────────────────────────────────

    {
      name_zh: '頭肩頂',
      name_en: 'Head and Shoulders',
      type: 'reversal', direction: 'bearish', reliability: '89%',
      structure: '三個高峰：左肩 < 頭 > 右肩，連接兩個谷底的頸線（Neckline）',
      target_method: '從頭部最高點到頸線的距離，向下投影至頸線突破點',
      volume_req: '左肩成交量最大，頭部次之，右肩最小；跌破頸線時放量確認',
      stop_rule: '止損設於右肩頂部上方',
      notes: '最可靠的頂部反轉信號之一；右肩量縮是關鍵特徵'
    },
    {
      name_zh: '頭肩底（逆頭肩）',
      name_en: 'Inverse Head and Shoulders',
      type: 'reversal', direction: 'bullish', reliability: '89%',
      structure: '三個低谷：左肩 > 頭 < 右肩，連接兩個高點的頸線',
      target_method: '從頭部最低點到頸線的距離，向上投影至頸線突破點',
      volume_req: '突破頸線時成交量需明顯放大',
      stop_rule: '止損設於右肩最低點下方',
      notes: '底部反轉最強信號；突破頸線後常有回踩確認機會'
    },
    {
      name_zh: '雙頂（M頭）',
      name_en: 'Double Top',
      type: 'reversal', direction: 'bearish', reliability: '75-79%',
      structure: '兩個相近高點，之間形成谷底（頸線），第二頂通常稍低且量縮',
      target_method: '雙頂高度（頂部至頸線距離）向下投影至頸線跌破點',
      volume_req: '第二頂量縮，跌破頸線時放量',
      stop_rule: '止損設於任一頂部上方',
      notes: '常見頂部型態；頸線跌破才完成形態，盤中觸頂不算'
    },
    {
      name_zh: '雙底（W底）',
      name_en: 'Double Bottom',
      type: 'reversal', direction: 'bullish', reliability: '75-79%',
      structure: '兩個相近低點，之間形成反彈高點（頸線），第二底通常稍高',
      target_method: '雙底深度（底部至頸線距離）向上投影至頸線突破點',
      volume_req: '第二底量縮，突破頸線時放量',
      stop_rule: '止損設於任一底部下方',
      notes: '最常見的底部反轉型態；頸線突破前需保持耐心'
    },
    {
      name_zh: '三重頂',
      name_en: 'Triple Top',
      type: 'reversal', direction: 'bearish', reliability: '77-79%',
      structure: '三個相近的頂部高點，每次上攻均失敗後跌破支撐頸線',
      target_method: '頂部至頸線距離向下投影',
      volume_req: '每次測試頂部量縮，跌破放量',
      stop_rule: '止損設於三頂上方',
      notes: '比雙頂更強的反轉信號，多方三次嘗試均失敗'
    },
    {
      name_zh: '三重底',
      name_en: 'Triple Bottom',
      type: 'reversal', direction: 'bullish', reliability: '77-79%',
      structure: '三個相近的底部低點，空方三次攻擊均被反彈，突破頸線確認',
      target_method: '底部至頸線距離向上投影',
      volume_req: '突破頸線放量確認',
      stop_rule: '止損設於三底下方',
      notes: '強力底部型態，三次測試支撐均守住'
    },
    {
      name_zh: '上升楔形',
      name_en: 'Rising Wedge',
      type: 'reversal', direction: 'bearish', reliability: '81%',
      structure: '兩條向上傾斜的趨勢線，上線（壓力）斜率小於下線（支撐），通道逐漸收窄',
      target_method: '楔形底部寬度投影至突破點下方',
      volume_req: '形成期間量縮，跌破下線時放量',
      stop_rule: '止損設於最近一個高點上方',
      notes: '在上升趨勢末期出現時為頂部反轉；整理中出現為延續看跌'
    },
    {
      name_zh: '下降楔形',
      name_en: 'Falling Wedge',
      type: 'reversal', direction: 'bullish', reliability: '74%',
      structure: '兩條向下傾斜的趨勢線，下線（支撐）斜率小於上線（壓力），通道逐漸收窄',
      target_method: '楔形頂部寬度投影至突破點上方',
      volume_req: '形成期間量縮，突破上線時放量',
      stop_rule: '止損設於最近一個低點下方',
      notes: '下跌趨勢末期出現是底部反轉信號；突破時放量才有效'
    },
    {
      name_zh: '圓弧底（碗形底）',
      name_en: 'Rounding Bottom / Saucer',
      type: 'reversal', direction: 'bullish', reliability: '73%',
      structure: '底部緩慢圓弧型轉折，量能逐步萎縮後重新擴張，形成碗狀輪廓',
      target_method: '碗形深度（最低點至左端起點）向上投影',
      volume_req: '底部量最小，右側上揚時量逐步放大',
      stop_rule: '止損設於碗底下方',
      notes: '長期底部積累信號，常見於週線/月線；轉折溫和，信心確立慢'
    },

    // ── Continuation Patterns (延續型態) ─────────────────────────────────

    {
      name_zh: '牛旗形',
      name_en: 'Bull Flag',
      type: 'continuation', direction: 'bullish', reliability: '67-68%',
      structure: '急速上漲的旗桿（Flagpole）後，價格以小幅平行通道（旗面）向下整理',
      target_method: '旗桿高度從旗面突破點向上投影',
      volume_req: '旗桿段放量，旗面整理量縮；突破旗面時放量確認',
      stop_rule: '止損設於旗面最低點下方',
      notes: '急漲後最常見的正常整理型態；旗面不應超過旗桿的50%回撤'
    },
    {
      name_zh: '熊旗形',
      name_en: 'Bear Flag',
      type: 'continuation', direction: 'bearish', reliability: '67%',
      structure: '急速下跌的旗桿後，價格以小幅向上整理通道進行反彈',
      target_method: '旗桿高度從旗面跌破點向下投影',
      volume_req: '旗桿段放量，旗面反彈量縮；跌破旗面時放量',
      stop_rule: '止損設於旗面最高點上方',
      notes: '下跌趨勢中常見延續型態'
    },
    {
      name_zh: '牛三角旗（看多三角旗）',
      name_en: 'Bull Pennant',
      type: 'continuation', direction: 'bullish', reliability: '67%',
      structure: '急漲旗桿後，價格形成對稱收縮三角形整理（非平行通道）',
      target_method: '旗桿高度從三角旗突破點向上投影',
      volume_req: '旗桿放量，三角旗整理量縮，突破時放量',
      stop_rule: '止損設於三角旗最低點下方',
      notes: '與牛旗形相似但整理形態是收縮三角而非平行通道'
    },
    {
      name_zh: '熊三角旗（看空三角旗）',
      name_en: 'Bear Pennant',
      type: 'continuation', direction: 'bearish', reliability: '67%',
      structure: '急跌旗桿後，價格形成對稱收縮三角形反彈整理',
      target_method: '旗桿高度從三角旗跌破點向下投影',
      volume_req: '旗桿放量，三角旗量縮，跌破時放量',
      stop_rule: '止損設於三角旗最高點上方',
      notes: '熊市趨勢延續型態'
    },
    {
      name_zh: '上升三角形',
      name_en: 'Ascending Triangle',
      type: 'continuation', direction: 'bullish', reliability: '73%',
      structure: '水平壓力線（多次測試同一高點）配合上升支撐線，顯示買方逐步積累',
      target_method: '三角形最高寬度（底部至壓力線）向上投影',
      volume_req: '形成期間量縮，突破水平壓力時放量',
      stop_rule: '止損設於最後一個上升低點下方',
      notes: '水平壓力線被多次測試後突破的可靠度最高'
    },
    {
      name_zh: '下降三角形',
      name_en: 'Descending Triangle',
      type: 'continuation', direction: 'bearish', reliability: '73%',
      structure: '水平支撐線（多次測試同一低點）配合下降壓力線，顯示賣方逐步積累',
      target_method: '三角形最高寬度向下投影至支撐跌破點',
      volume_req: '形成期間量縮，跌破水平支撐時放量',
      stop_rule: '止損設於最後一個下降高點上方',
      notes: '水平支撐被多次測試後跌破效力強'
    },
    {
      name_zh: '杯把形',
      name_en: 'Cup and Handle',
      type: 'continuation', direction: 'bullish', reliability: '71%',
      structure: '圓弧形底部（杯形）後，輕微下跌整理形成把手（Handle），突破把手壓力線進場',
      target_method: '杯形深度從把手突破點向上投影',
      volume_req: '杯底量縮，把手更縮；突破把手時顯著放量',
      stop_rule: '止損設於把手最低點下方',
      notes: '看漲延續型態；把手回調不應超過杯深的50%'
    },
    {
      name_zh: '矩形箱體',
      name_en: 'Rectangle (Trading Range)',
      type: 'continuation', direction: 'bilateral', reliability: '78-80%',
      structure: '價格在水平支撐與壓力之間反覆震盪，形成矩形整理區間',
      target_method: '箱體高度從突破點向突破方向投影',
      volume_req: '箱內量縮為健康整理；突破時放量確認方向',
      stop_rule: '做多止損設於箱底下方；做空止損設於箱頂上方',
      notes: '突破方向不確定，需等待放量突破確認；突破後常有回踩確認'
    },

    // ── Bilateral / Special Patterns ─────────────────────────────────────

    {
      name_zh: '對稱三角形',
      name_en: 'Symmetrical Triangle',
      type: 'bilateral', direction: 'bilateral', reliability: '66%',
      structure: '兩條收斂趨勢線，上線向下傾斜、下線向上傾斜，多空力道均衡收縮',
      target_method: '三角形底部寬度從突破點向突破方向投影',
      volume_req: '整理期間持續量縮；突破時放量才有效',
      stop_rule: '做多止損設於三角形最低點；做空止損設於最高點',
      notes: '方向中性型態，突破前不宜預判方向；通常延續原趨勢方向突破'
    },
    {
      name_zh: '菱形頂底',
      name_en: 'Diamond Top / Bottom',
      type: 'reversal', direction: 'bilateral', reliability: '70%',
      structure: '先擴散再收縮的四邊形，形狀如菱石；出現在頂部為反轉看跌，底部為反轉看漲',
      target_method: '菱形最寬高度從突破點投影',
      volume_req: '擴散期量大，收縮期量縮，突破時放量',
      stop_rule: '止損設於菱形另一側的極端點',
      notes: '較罕見但可靠度高；常被誤認為多個三角形或頭肩型態'
    }
  ];

  function buildChartPatternsRef() {
    const reversal = CHART_PATTERNS.filter(p => p.type === 'reversal');
    const continuation = CHART_PATTERNS.filter(p => p.type === 'continuation');
    const bilateral = CHART_PATTERNS.filter(p => p.type === 'bilateral');

    const fmt = p =>
      `  ・${p.name_zh}（${p.name_en}）｜${p.direction === 'bullish' ? '看多' : p.direction === 'bearish' ? '看空' : '雙向'}｜可靠度:${p.reliability}\n` +
      `    辨識：${p.structure}\n` +
      `    目標：${p.target_method}\n` +
      `    量能：${p.volume_req}\n` +
      `    止損：${p.stop_rule}`;

    return (
      '【圖表型態（Auto Chart Patterns）參考字典】\n' +
      '請掃描圖表識別是否存在以下型態（狀態：forming=形成中 / confirmed=已完成但未突破 / breakout=已突破）：\n\n' +
      '▶ 反轉型態（Reversal Patterns）:\n' + reversal.map(fmt).join('\n\n') + '\n\n' +
      '▶ 延續型態（Continuation Patterns）:\n' + continuation.map(fmt).join('\n\n') + '\n\n' +
      '▶ 雙向型態（Bilateral Patterns）:\n' + bilateral.map(fmt).join('\n\n') + '\n\n' +
      '識別要求：①說明型態名稱（中英文）②型態狀態（forming/confirmed/breakout）③關鍵價位（頸線/支撐/壓力）④目標價計算 ⑤量能是否配合\n'
    );
  }

  Object.assign(window.__chartAI, {
    CHART_PATTERNS,
    buildChartPatternsRef
  });
})();
