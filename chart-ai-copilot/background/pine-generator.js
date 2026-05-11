// pine-generator.js — Pine Script v5 生成

export function buildPinePrompt(description, context) {
  const ctx = context || {};
  return `你是一位 TradingView Pine Script v5 專家。請根據以下需求生成完整的 Pine Script v5 程式碼。

需求描述：${description}
${ctx.symbol ? `當前標的：${ctx.symbol}` : ''}
${ctx.timeframe ? `當前時框：${ctx.timeframe}` : ''}

要求：
1. 必須以 //@version=5 開頭
2. 程式碼必須完整可執行，不能省略任何部分
3. 包含清楚的中文注釋解釋邏輯
4. 若有不確定的參數，用 // TODO: 標注建議值
5. 若有語法問題無法解決，用 // ERROR: 說明問題
6. 只輸出程式碼，不要輸出 markdown \`\`\` 包裹，不要輸出解釋文字

程式碼：`;
}
