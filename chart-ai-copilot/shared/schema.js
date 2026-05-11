(function () {
  window.__chartAI = window.__chartAI || {};

  function parseJSON(text) {
    let cleaned = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```\s*$/g, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('AI 回應無法解析為 JSON');
    }
  }

  const RESULT_FIELDS = [
    'symbol',
    'timeframe',
    'trend',
    'direction',
    'entry_zone',
    'stop_loss',
    'stop_loss_reason',
    'tp1',
    'tp2',
    'rr_ratio',
    'position_size',
    'holding_period',
    'key_points',
    'risk_warning',
    'candlestick_patterns',
    'technical_summary',
    'visible_high',
    'visible_low',
    'entry_strategy',
    'key_scenarios',
    'entry_timing',
    'chart_patterns',
    'volume_analysis'
  ];

  const SCHEMA_INSTRUCTION =
    '請嚴格以下方 JSON 格式回覆，不要包含任何 JSON 以外的文字、不要使用 markdown 代碼塊、不要輸出 <think> 標籤：\n\n' +
    '{"symbol":"交易對或股票代號","timeframe":"時間框架","trend":"主趨勢描述",' +
    '"direction":"long 或 short","entry_zone":"建議進場價格區間","stop_loss":"建議止損價格",' +
    '"stop_loss_reason":"止損位置的技術依據","tp1":"第一目標價格","tp2":"第二目標價格",' +
    '"rr_ratio":"風險報酬比例","position_size":"建議倉位","holding_period":"預計持倉時間",' +
    '"key_points":["觀察要點1","觀察要點2","觀察要點3","觀察要點4"],' +
    '"risk_warning":"主要風險因素","visible_high":最高可視價格數字,"visible_low":最低可視價格數字,' +
    '"candlestick_patterns":[{"name_zh":"中文型態名","name_en":"English Name","signal":"bullish/bearish/neutral","candles":1,"position":"bottom_rev/top_rev/continuation/any","reliability":"高/中/低","desc":"特徵與預示說明"}],' +
    '"technical_summary":{"overall":"綜合評級","indicators":"關鍵指標摘要"},' +
    '"entry_strategy":{"plan_a":{"label":"方案A標題（推薦）","recommended":true,"trigger":"觸發條件","confirmation":"確認信號","entry":"入場價格","rr_tp1":"至TP1風報比","rr_tp2":"至TP2風報比"},"plan_b":{"label":"方案B標題（備選）","recommended":false,"trigger":"觸發條件","confirmation":"確認信號","entry":"入場價格","rr":"風報比","note":"注意事項"}},' +
    '"key_scenarios":[{"condition":"情境一描述","action":"對應操作"},{"condition":"情境二描述","action":"對應操作"},{"condition":"情境三描述（止損觸發）","action":"對應操作"},{"condition":"情境四描述（突破延伸）","action":"對應操作"}],' +
    '"entry_timing":{"quality":"strong/good/moderate/wait","confluence_count":0,"signals":[{"id":"信號id如ma_golden_cross","name_zh":"信號中文名","status":"confirmed/pending/negative","detail":"從圖表觀察到的具體描述"}],"optimal_wait":"尚未成立的最關鍵信號，等待條件","invalidation":"使此進場設置失效的條件"},' +
    '"chart_patterns":[{"name_zh":"型態中文名","name_en":"Pattern Name","type":"reversal/continuation/bilateral","direction":"bullish/bearish/bilateral","status":"forming/confirmed/breakout","reliability":"可靠度如89%","key_levels":{"neckline":"頸線價位","target":"目標價","stop":"止損位"},"volume_ok":true,"note":"型態觀察說明"}],' +
    '"volume_analysis":{"profile_visible":true,"poc":"POC價格","vah":"VAH價格","val":"VAL價格","hvn":["HVN1價格","HVN2價格"],"lvn":["LVN1價格"],"current_position":"當前價格相對POC/VAH/VAL的位置描述","profile_signal":"量能分布給出的交易暗示","footprint_visible":false,"delta":"正/負/divergence/N/A","imbalance":"買方主導/賣方主導/均衡/N/A","cvd_signal":"CVD信號描述或N/A","volume_structure":"從標準量柱看出的量價結構（如縮量回調/放量突破/量價背離）"}}';

  Object.assign(window.__chartAI, {
    parseJSON,
    RESULT_FIELDS,
    SCHEMA_INSTRUCTION
  });
})();
