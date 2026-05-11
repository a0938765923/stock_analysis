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

    return `你是一位專業的金融技術分析師，擅長閱讀 ${platform} 圖表。
${langInstr}
${directionHint ? directionHint + '\n' : ''}${buildContextSection(contextData)}
請依照以下四大理論框架進行分析：

【理論一：趨勢線理論】
1. 趨勢識別 — 從截圖中識別趨勢線（連接高點/低點），判斷上升趨勢、下降趨勢、盤整區間；識別趨勢加速、衰竭或突破跡象；評估趨勢強度（角度、EMA 排列、高低點結構）

【理論二：K線型態學】
2. K線型態 — 識別圖面上最近的 K 線組合型態（如：錘子線、射擊之星、吞噬、晨星、十字星、三角旗、頭肩頂底、雙頂雙底等），說明型態名稱、位置意義及預示方向

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

觀察要點要求：至少提供 4 個具體觀察，涵蓋四大理論（趨勢線形態、K線型態名稱、指標讀值、消息面影響），並說明各理論間是否一致或有衝突。

請嚴格以下方 JSON 格式回覆，不要包含任何 JSON 以外的文字、不要使用 markdown 代碼塊、不要輸出 <think> 標籤：

{"symbol":"從圖表識別交易對或股票代號","timeframe":"從圖表識別時間框架","trend":"主趨勢描述","direction":"long 或 short","entry_zone":"建議進場價格區間","stop_loss":"建議止損價格","stop_loss_reason":"止損位置的技術依據","tp1":"第一目標價格","tp2":"第二目標價格","rr_ratio":"風險報酬比例如 1:2.5","position_size":"建議倉位基於 ${riskPct}% 帳戶風險","holding_period":"預計持倉時間","key_points":["觀察要點1","觀察要點2","觀察要點3","觀察要點4"],"risk_warning":"主要風險因素","visible_high":從圖表右側Y軸刻度讀取的最高可視價格數字,"visible_low":從圖表右側Y軸刻度讀取的最低可視價格數字,"candlestick_patterns":["識別到的K線型態1（位置+預示）","型態2"],"technical_summary":{"overall":"綜合評級（如多偏多/看空等）","indicators":"關鍵指標讀值摘要"}}`;
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

    return `你是一位專業的金融技術分析師，擅長多時間框架分析。
${langInstr}
${directionHint ? directionHint + '\n' : ''}${buildContextSection(contextData)}
我提供了三張 ${platform} 截圖，依序為：【4H 圖表】、【1H 圖表】、【15M 圖表】。

請依照四大理論框架進行多時間框架融合分析：

【理論一：趨勢線理論】
1. 趨勢識別 — 以 4H 判斷主趨勢方向（多/空/盤），以 1H 確認中期結構一致性；識別各時框趨勢線方向與強度

【理論二：K線型態學】
2. K線型態 — 識別各時框關鍵 K 線組合型態，說明型態名稱與所在時框的意義

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

觀察要點要求：至少提供 4 個跨時框的具體觀察（含時框間的 confluence、背離或衝突信號，涵蓋趨勢線、K線型態、指標讀值）。

請嚴格以下方 JSON 格式回覆，不要包含任何 JSON 以外的文字、不要使用 markdown 代碼塊、不要輸出 <think> 標籤：

{"symbol":"從圖表識別交易對或股票代號","timeframe":"4H+1H+15M","trend":"主趨勢描述（含4H方向及1H確認）","direction":"long 或 short","entry_zone":"建議進場價格區間（基於15M精確點位）","stop_loss":"建議止損價格","stop_loss_reason":"止損位置的技術依據","tp1":"第一目標價格","tp2":"第二目標價格","rr_ratio":"風險報酬比例如 1:2.5","position_size":"建議倉位基於 ${riskPct}% 帳戶風險","holding_period":"預計持倉時間","key_points":["4H趨勢觀察","1H結構確認","15M精確進場信號","跨時框一致性說明"],"risk_warning":"主要風險因素","visible_high":從15M截圖右側Y軸刻度讀取的最高可視價格數字,"visible_low":從15M截圖右側Y軸刻度讀取的最低可視價格數字,"candlestick_patterns":["識別到的K線型態1（時框+位置+預示）","型態2"],"technical_summary":{"overall":"綜合評級（如多偏多/看空等）","indicators":"各時框關鍵指標讀值摘要"}}`;
  }

  Object.assign(window.__chartAI, {
    buildPrompt,
    buildMultiPrompt,
    applyTemplate,
    LANGUAGE_INSTRUCTIONS
  });
})();
