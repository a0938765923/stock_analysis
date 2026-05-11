(function () {
  window.__chartAI = window.__chartAI || {};

  const LANGUAGE_INSTRUCTIONS = {
    'en':    'Respond in English.',
    'zh-TW': '請以繁體中文回應，使用正確的金融術語。',
    'zh-CN': '请以简体中文回应，使用正确的金融术语。',
    'ja':    '日本語で回答してください。正確な金融用語を使用してください。',
    'es':    'Responde en español, utilizando terminología financiera correcta.'
  };

  function applyTemplate(templateBody, vars) {
    return (templateBody || '')
      .replace(/\{\{symbol\}\}/g,    vars.symbol    || '')
      .replace(/\{\{timeframe\}\}/g, vars.timeframe || '')
      .replace(/\{\{platform\}\}/g,  vars.platform  || '')
      .replace(/\{\{direction\}\}/g, vars.direction || '');
  }

  function buildContextSection(ctx) {
    if (!ctx) return '';
    const parts = [];
    if (ctx.technicalSummary && ctx.technicalSummary.overall) {
      const counts = ctx.technicalSummary.counts && ctx.technicalSummary.counts.length >= 3
        ? `（買入:${ctx.technicalSummary.counts[0]} 中立:${ctx.technicalSummary.counts[1]} 賣出:${ctx.technicalSummary.counts[2]}）`
        : '';
      parts.push(`TradingView 技術指標總評：${ctx.technicalSummary.overall}${counts}`);
    }
    if (Array.isArray(ctx.newsHeadlines) && ctx.newsHeadlines.length > 0) {
      parts.push('最新消息面：\n' + ctx.newsHeadlines.map((h, i) => `  ${i+1}. ${h}`).join('\n'));
    }
    return parts.length ? '\n=== 參考資料（請納入分析但不要複述）===\n' + parts.join('\n') + '\n' : '';
  }

  function buildPrompt(settings, direction, platformName, templateBody, contextData) {
    // Resolve language — support both `language` (new) and `lang` (legacy) fields
    const lang = settings.language || settings.lang || 'zh-TW';
    const langInstr = LANGUAGE_INSTRUCTIONS[lang] || LANGUAGE_INSTRUCTIONS['zh-TW'];
    const platform = platformName || 'the chart';

    let directionHint = '';
    if (direction === 'long') {
      directionHint = '分析方向偏向做多（Long），請重點評估多頭進場機會。';
    } else if (direction === 'short') {
      directionHint = '分析方向偏向做空（Short），請重點評估空頭進場機會。';
    }

    const riskPct = settings.riskPct != null ? settings.riskPct : 1;

    if (templateBody) {
      const expanded = applyTemplate(templateBody, {
        symbol: '{{由AI從截圖識別}}',
        timeframe: '{{由AI從截圖識別}}',
        platform: platform,
        direction: direction === 'long' ? '做多' : direction === 'short' ? '做空' : '自動判斷'
      });
      const schemaInstr = window.__chartAI.SCHEMA_INSTRUCTION || '';
      return langInstr + '\n\n' + expanded + (schemaInstr ? '\n\n' + schemaInstr : '');
    }

    const candlestickRef   = window.__chartAI.buildCandlestickRef   ? window.__chartAI.buildCandlestickRef()   : '';
    const entryTimingRef   = window.__chartAI.buildEntryTimingRef   ? window.__chartAI.buildEntryTimingRef()   : '';
    const chartPatternsRef = window.__chartAI.buildChartPatternsRef ? window.__chartAI.buildChartPatternsRef() : '';
    const volumeAnalysisRef = window.__chartAI.buildVolumeAnalysisRef ? window.__chartAI.buildVolumeAnalysisRef() : '';

    return `你是一位專業的金融技術分析師，擅長閱讀 ${platform} 圖表。
${langInstr}
${directionHint ? directionHint + '\n' : ''}${buildContextSection(contextData)}${candlestickRef ? '\n' + candlestickRef + '\n' : ''}${entryTimingRef ? '\n' + entryTimingRef + '\n' : ''}${chartPatternsRef ? '\n' + chartPatternsRef + '\n' : ''}${volumeAnalysisRef ? '\n' + volumeAnalysisRef + '\n' : ''}
請依照以下四大理論框架進行分析：

【理論一：趨勢線理論】
1. 趨勢識別 — 從截圖中識別趨勢線（連接高點/低點），判斷上升趨勢、下降趨勢、盤整區間；識別趨勢加速、衰竭或突破跡象；評估趨勢強度（角度、EMA 排列、高低點結構）

【理論二：K線型態學】
2. K線型態 — 對照上方【K線型態參考字典】，識別圖面上最近 1-3 根K線的型態，使用字典中的標準中英文名稱，說明：①型態名稱（中英文）②出現在趨勢中的位置 ③信號方向 ④可靠度 ⑤預示走勢

【理論三：消息面參考】
3. 消息面 — 若有提供新聞標題，評估其對當前走勢的影響（正面/負面/中性）；若無新聞資料，從圖表結構推斷市場情緒

【理論四：技術指標】
4. 指標分析 — 若有 TradingView 技術指標摘要資料，將其納入評估；從圖表識別可見指標（RSI 超買超賣、MACD 交叉、布林通道位置等）

【綜合應用】
5. 關鍵價位 — 識別最近的支撐與壓力區，優先以量價密集區、前高前低、趨勢線穿越點為依據
6. 進場邏輯 — 綜合四大理論，說明建議進場區間的技術依據
7. 止損設定 — 說明止損位置的技術依據（結構破壞點、波段低點/高點等），必須有具體理由
8. 目標位計算 — TP1 設為最近阻力/支撐，TP2 設為延伸目標，計算 RR ratio
9. 倉位建議 — 基於帳戶風險 ${riskPct}%，依 entry zone 至 stop loss 距離計算建議倉位（以合約或比例表示）
10. 風險提示 — 列出此交易設定的主要風險因素（最少 2 項），包含各理論間的衝突信號
11. 入場策略 — 提供兩種具體執行方案：方案A（推薦）為保守入場（等待回調至最佳區間或反轉確認），方案B（備選）為積極入場（突破確認追入）；每個方案須包含：觸發條件、確認信號、具體入場價、分別計算至TP1和TP2的風報比（方案A），或單一風報比與注意事項（方案B）
12. 關鍵情境 — 列出 4 個關鍵市場情境及對應操作：①當前位置直接延續（錯過情境）②最佳入場觸發（最佳做多/做空機會）③止損結構失效（應止損離場情境）④延伸突破情境（上方/下方空間打開）
13. 買進時機評估 — 對照上方【買進時機信號參考字典】，逐一評估每個信號在圖表中的狀態（confirmed/pending/negative），計算 confluence_count，並給出整體 quality 評級、最重要的待確認信號（optimal_wait）及失效條件（invalidation）
14. 圖表型態與量能分析 — ①對照上方【圖表型態參考字典】，識別圖面上是否存在任何型態（forming/confirmed/breakout），說明型態名稱、關鍵價位（頸線/目標/止損）、量能是否配合；②對照上方【量價分析參考字典】，若截圖顯示 Volume Profile 直方圖請識別 POC/VAH/VAL/HVN/LVN 具體價位，分析成交量結構，若有 Footprint/Delta 資訊請說明

觀察要點要求：至少提供 4 個具體觀察，涵蓋四大理論（趨勢線形態、K線型態名稱、指標讀值、消息面影響），並說明各理論間是否一致或有衝突。

請嚴格以下方 JSON 格式回覆，不要包含任何 JSON 以外的文字、不要使用 markdown 代碼塊、不要輸出 <think> 標籤：

{"symbol":"從圖表識別交易對或股票代號","timeframe":"從圖表識別時間框架","trend":"主趨勢描述","direction":"long 或 short","entry_zone":"建議進場價格區間","stop_loss":"建議止損價格","stop_loss_reason":"止損位置的技術依據","tp1":"第一目標價格","tp2":"第二目標價格","rr_ratio":"風險報酬比例如 1:2.5","position_size":"建議倉位基於 ${riskPct}% 帳戶風險","holding_period":"預計持倉時間","key_points":["觀察要點1","觀察要點2","觀察要點3","觀察要點4"],"risk_warning":"主要風險因素","visible_high":從圖表右側Y軸刻度讀取的最高可視價格數字,"visible_low":從圖表右側Y軸刻度讀取的最低可視價格數字,"candlestick_patterns":[{"name_zh":"中文型態名如錘子線","name_en":"Hammer","signal":"bullish","candles":1,"position":"bottom_rev","reliability":"中（~65%）","desc":"下跌末端出現，長下影線，買方強力反攻"}],"technical_summary":{"overall":"綜合評級（如多偏多/看空等）","indicators":"關鍵指標讀值摘要"},"entry_strategy":{"plan_a":{"label":"方案A標題（推薦）","recommended":true,"trigger":"觸發入場的市場條件（如價格跌至哪個區間）","confirmation":"確認入場的技術信號（如K線型態+位置）","entry":"具體入場價格","rr_tp1":"至TP1的風報比如1.69:1","rr_tp2":"至TP2的風報比如2.43:1"},"plan_b":{"label":"方案B標題（備選）","recommended":false,"trigger":"觸發條件（如突破某價位）","confirmation":"確認信號（如收線站穩+量能）","entry":"入場價格","rr":"風報比如2.0:1","note":"重要注意事項（如倉位控制建議）"}},"key_scenarios":[{"condition":"情境一：當前位置直接延續","action":"對應操作（如錯過最佳入場，不追價，等待回調）"},{"condition":"情境二：最佳入場區出現反轉信號","action":"對應操作（最佳做多機會，果斷入場）"},{"condition":"情境三：跌破關鍵止損位","action":"對應操作（結構失效，暫停計劃，重新評估）"},{"condition":"情境四：突破上方壓力位","action":"對應操作（上行空間打開，考慮方案B或等待回踩）"}],"entry_timing":{"quality":"strong/good/moderate/wait","confluence_count":已confirmed信號的數量,"signals":[{"id":"信號id如ma_golden_cross","name_zh":"均線黃金交叉","status":"confirmed/pending/negative","detail":"從圖表觀察到的具體描述，如20MA已上穿60MA且放量"}],"optimal_wait":"尚未成立的最關鍵信號及等待條件","invalidation":"使此整體進場設置失效的具體條件"},"chart_patterns":[{"name_zh":"型態中文名","name_en":"Pattern Name","type":"reversal/continuation/bilateral","direction":"bullish/bearish/bilateral","status":"forming/confirmed/breakout","reliability":"可靠度如89%","key_levels":{"neckline":"頸線價位或N/A","target":"目標價","stop":"止損位"},"volume_ok":true,"note":"型態觀察說明"}],"volume_analysis":{"profile_visible":false,"poc":"POC價格或N/A","vah":"VAH價格或N/A","val":"VAL價格或N/A","hvn":[],"lvn":[],"current_position":"當前價格相對量能分布的位置描述","profile_signal":"量能分布給出的交易暗示","footprint_visible":false,"delta":"N/A","imbalance":"N/A","cvd_signal":"N/A","volume_structure":"從標準量柱看出的量價結構（如縮量回調/放量突破/量價背離）"}}`;
  }

  function buildMultiPrompt(settings, direction, platformName, templateBody, contextData) {
    const lang = settings.language || settings.lang || 'zh-TW';
    const langInstr = LANGUAGE_INSTRUCTIONS[lang] || LANGUAGE_INSTRUCTIONS['zh-TW'];
    const platform = platformName || 'the chart';

    let directionHint = '';
    if (direction === 'long') {
      directionHint = '分析方向偏向做多（Long），請重點評估多頭進場機會。';
    } else if (direction === 'short') {
      directionHint = '分析方向偏向做空（Short），請重點評估空頭進場機會。';
    }

    const riskPct = settings.riskPct != null ? settings.riskPct : 1;

    if (templateBody) {
      const expanded = applyTemplate(templateBody, {
        symbol: '{{由AI從截圖識別}}',
        timeframe: '4H+1H+15M',
        platform: platform,
        direction: direction === 'long' ? '做多' : direction === 'short' ? '做空' : '自動判斷'
      });
      const schemaInstr = window.__chartAI.SCHEMA_INSTRUCTION || '';
      return langInstr + '\n\n' + expanded + (schemaInstr ? '\n\n' + schemaInstr : '');
    }

    const candlestickRef   = window.__chartAI.buildCandlestickRef   ? window.__chartAI.buildCandlestickRef()   : '';
    const entryTimingRef   = window.__chartAI.buildEntryTimingRef   ? window.__chartAI.buildEntryTimingRef()   : '';
    const chartPatternsRef = window.__chartAI.buildChartPatternsRef ? window.__chartAI.buildChartPatternsRef() : '';
    const volumeAnalysisRef = window.__chartAI.buildVolumeAnalysisRef ? window.__chartAI.buildVolumeAnalysisRef() : '';

    return `你是一位專業的金融技術分析師，擅長多時間框架分析。
${langInstr}
${directionHint ? directionHint + '\n' : ''}${buildContextSection(contextData)}${candlestickRef ? '\n' + candlestickRef + '\n' : ''}${entryTimingRef ? '\n' + entryTimingRef + '\n' : ''}${chartPatternsRef ? '\n' + chartPatternsRef + '\n' : ''}${volumeAnalysisRef ? '\n' + volumeAnalysisRef + '\n' : ''}
我提供了三張 ${platform} 截圖，依序為：【4H 圖表】、【1H 圖表】、【15M 圖表】。

請依照四大理論框架進行多時間框架融合分析：

【理論一：趨勢線理論】
1. 趨勢識別 — 以 4H 判斷主趨勢方向（多/空/盤），以 1H 確認中期結構一致性；識別各時框趨勢線方向與強度

【理論二：K線型態學】
2. K線型態 — 對照上方【K線型態參考字典】，識別各時框最近 1-3 根K線的型態，使用字典中的標準中英文名稱，說明：①型態所在時框 ②型態名稱（中英文）③出現在趨勢中的位置 ④信號方向 ⑤可靠度 ⑥各時框型態是否互相印證或矛盾

【理論三：消息面參考】
3. 消息面 — 若有提供新聞標題，評估其對多時框走勢的影響；若無，從結構推斷市場情緒

【理論四：技術指標】
4. 指標分析 — 整合各時框可見指標讀值（RSI、MACD、布林等），識別跨時框指標的 confluence 或背離

【綜合多時框應用】
5. 關鍵價位 — 綜合 3 個時框的支撐壓力，找出多個時框共識的最強區
6. 進場邏輯 — 以 15M 精確進場點，確認與更高時框方向一致，綜合四大理論說明依據
7. 止損設定 — 依 15M 結構設止損，確保不與 1H/4H 結構矛盾
8. 目標位計算 — TP1/TP2 參考 4H 關鍵阻力/支撐延伸
9. 倉位建議 — 基於帳戶風險 ${riskPct}%，依 entry 至 SL 距離計算
10. 風險提示 — 說明三個時框若出現背離時的處理原則，包含各理論間的衝突信號
11. 入場策略 — 提供兩種具體執行方案：方案A（推薦）為保守入場（等待回調至最佳區間或15M反轉確認），方案B（備選）為積極入場（突破確認追入）；每個方案須包含：觸發條件、確認信號、具體入場價、分別計算至TP1和TP2的風報比
12. 關鍵情境 — 列出 4 個關鍵市場情境及對應操作：①當前位置直接延續②最佳入場觸發③止損結構失效④延伸突破情境
13. 買進時機評估 — 對照上方【買進時機信號參考字典】，優先以 4H 圖表判斷中長期信號，以 15M 判斷短期進場信號，逐一評估各信號狀態，計算 confluence_count 並給出整體買進時機 quality
14. 圖表型態與量能分析 — ①對照上方【圖表型態參考字典】，識別各時框是否存在任何型態（forming/confirmed/breakout），說明型態名稱、關鍵價位、量能是否配合；②對照上方【量價分析參考字典】，若截圖顯示 Volume Profile 直方圖請識別 POC/VAH/VAL/HVN/LVN 具體價位（優先從 15M 圖讀取），分析成交量結構，若有 Footprint/Delta 資訊請說明

觀察要點要求：至少提供 4 個跨時框的具體觀察（含時框間的 confluence、背離或衝突信號，涵蓋趨勢線、K線型態、指標讀值）。

請嚴格以下方 JSON 格式回覆，不要包含任何 JSON 以外的文字、不要使用 markdown 代碼塊、不要輸出 <think> 標籤：

{"symbol":"從圖表識別交易對或股票代號","timeframe":"4H+1H+15M","trend":"主趨勢描述（含4H方向及1H確認）","direction":"long 或 short","entry_zone":"建議進場價格區間（基於15M精確點位）","stop_loss":"建議止損價格","stop_loss_reason":"止損位置的技術依據","tp1":"第一目標價格","tp2":"第二目標價格","rr_ratio":"風險報酬比例如 1:2.5","position_size":"建議倉位基於 ${riskPct}% 帳戶風險","holding_period":"預計持倉時間","key_points":["4H趨勢觀察","1H結構確認","15M精確進場信號","跨時框一致性說明"],"risk_warning":"主要風險因素","visible_high":從15M截圖右側Y軸刻度讀取的最高可視價格數字,"visible_low":從15M截圖右側Y軸刻度讀取的最低可視價格數字,"candlestick_patterns":[{"name_zh":"中文型態名","name_en":"English Name","signal":"bullish/bearish/neutral","candles":1,"position":"bottom_rev","reliability":"可靠度","desc":"所在時框+位置+預示說明"}],"technical_summary":{"overall":"綜合評級（如多偏多/看空等）","indicators":"各時框關鍵指標讀值摘要"},"entry_strategy":{"plan_a":{"label":"方案A標題（推薦）","recommended":true,"trigger":"觸發條件","confirmation":"確認信號（含具體時框）","entry":"入場價格","rr_tp1":"至TP1風報比","rr_tp2":"至TP2風報比"},"plan_b":{"label":"方案B標題（備選）","recommended":false,"trigger":"觸發條件","confirmation":"確認信號","entry":"入場價格","rr":"風報比","note":"注意事項"}},"key_scenarios":[{"condition":"情境一：當前位置直接延續","action":"對應操作"},{"condition":"情境二：最佳入場區觸發","action":"對應操作"},{"condition":"情境三：止損結構失效","action":"對應操作"},{"condition":"情境四：突破延伸","action":"對應操作"}],"entry_timing":{"quality":"strong/good/moderate/wait","confluence_count":已confirmed信號的數量,"signals":[{"id":"信號id","name_zh":"信號中文名","status":"confirmed/pending/negative","detail":"各時框觀察到的具體描述"}],"optimal_wait":"最關鍵待確認信號","invalidation":"失效條件"},"chart_patterns":[{"name_zh":"型態中文名","name_en":"Pattern Name","type":"reversal/continuation/bilateral","direction":"bullish/bearish/bilateral","status":"forming/confirmed/breakout","reliability":"可靠度如89%","key_levels":{"neckline":"頸線價位或N/A","target":"目標價","stop":"止損位"},"volume_ok":true,"note":"型態觀察說明（含所在時框）"}],"volume_analysis":{"profile_visible":false,"poc":"POC價格或N/A","vah":"VAH價格或N/A","val":"VAL價格或N/A","hvn":[],"lvn":[],"current_position":"當前價格相對量能分布的位置描述","profile_signal":"量能分布給出的交易暗示","footprint_visible":false,"delta":"N/A","imbalance":"N/A","cvd_signal":"N/A","volume_structure":"從標準量柱看出的量價結構（如縮量回調/放量突破/量價背離）"}}`;
  }

  Object.assign(window.__chartAI, {
    buildPrompt,
    buildMultiPrompt,
    applyTemplate,
    LANGUAGE_INSTRUCTIONS
  });
})();
