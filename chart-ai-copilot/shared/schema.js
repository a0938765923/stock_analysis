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
    'visible_low'
  ];

  const SCHEMA_INSTRUCTION =
    '請嚴格以下方 JSON 格式回覆，不要包含任何 JSON 以外的文字、不要使用 markdown 代碼塊、不要輸出 <think> 標籤：\n\n' +
    '{"symbol":"交易對或股票代號","timeframe":"時間框架","trend":"主趨勢描述",' +
    '"direction":"long 或 short","entry_zone":"建議進場價格區間","stop_loss":"建議止損價格",' +
    '"stop_loss_reason":"止損位置的技術依據","tp1":"第一目標價格","tp2":"第二目標價格",' +
    '"rr_ratio":"風險報酬比例","position_size":"建議倉位","holding_period":"預計持倉時間",' +
    '"key_points":["觀察要點1","觀察要點2","觀察要點3","觀察要點4"],' +
    '"risk_warning":"主要風險因素","visible_high":最高可視價格數字,"visible_low":最低可視價格數字,' +
    '"candlestick_patterns":["K線型態1","K線型態2"],' +
    '"technical_summary":{"overall":"綜合評級","indicators":"關鍵指標摘要"}}';

  Object.assign(window.__chartAI, {
    parseJSON,
    RESULT_FIELDS,
    SCHEMA_INSTRUCTION
  });
})();
