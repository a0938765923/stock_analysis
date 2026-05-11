// briefing.js — 每日市場簡報生成
// 注意：此模組依賴 getProfile、buildProfilePromptSection（來自 profile.js）
// 以及 sendTelegramMessage、formatBriefingMessage（來自 telegram.js）
// 這些函式由 service-worker.js 在 import 後注入，或直接由 service-worker.js 呼叫此模組的 factory

import { getProfile, buildProfilePromptSection } from './profile.js';
import { sendTelegramMessage, formatBriefingMessage } from './telegram.js';

export function buildBriefingPrompt(symbol, profile) {
  const profileSection = buildProfilePromptSection(profile);
  return `${profileSection ? profileSection + '\n\n' : ''}請分析 ${symbol} 的市場現況，提供今日關鍵支撐/壓力和趨勢方向。
以 JSON 格式回覆：{"direction":"long或short或neutral","trend":"趨勢描述","key_level":"關鍵價位","risk_note":"風險提示"}
只輸出 JSON，不要其他文字。`;
}

export async function generateDailyBriefing(settings, callProviderTextFn) {
  const tg = settings?.telegram;
  if (!tg?.botToken || !tg?.chatId) {
    return { ok: false, error: 'Telegram Bot Token 或 Chat ID 未設定' };
  }
  const symbols = tg?.briefingSymbols;
  if (!symbols?.length) {
    return { ok: false, error: '觀察清單為空' };
  }

  const profile = await getProfile();
  const results = [];
  const errors = [];

  for (const symbol of symbols.slice(0, 10)) {
    try {
      const prompt = buildBriefingPrompt(symbol, profile);
      let parsed = { symbol, direction: 'neutral', trend: '無法取得分析', key_level: '' };

      if (typeof callProviderTextFn === 'function') {
        try {
          const resp = await callProviderTextFn(settings.provider || 'anthropic', prompt, settings);
          // callProviderText 的子函式（callAnthropicTextAnalysis 等）返回已解析的物件
          if (resp && typeof resp === 'object' && resp.direction) {
            parsed = { symbol, ...resp };
          } else if (resp && typeof resp === 'object') {
            parsed = { symbol, direction: 'neutral', trend: JSON.stringify(resp).slice(0, 100), key_level: '' };
          }
        } catch (_) {
          // AI 呼叫失敗時使用預設值
        }
      }

      results.push(parsed);
    } catch (e) {
      errors.push({ symbol, error: e.message });
    }
  }

  const message = formatBriefingMessage(new Date(), results);
  await sendTelegramMessage(
    settings.telegram.botToken,
    settings.telegram.chatId,
    message
  );

  return { ok: true, report: message, errors };
}
