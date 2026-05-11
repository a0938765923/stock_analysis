// telegram.js — Telegram Bot API 封裝

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) throw new Error('Telegram Bot Token 或 Chat ID 未設定');

  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Telegram API 錯誤 ${resp.status}: ${err.description || resp.statusText}`);
  }
  const data = await resp.json();
  return data.result?.message_id;
}

export async function testTelegramConnection(botToken, chatId) {
  await sendTelegramMessage(botToken, chatId, '✅ <b>chart-ai-copilot</b> 連線成功！\n您將在此接收 TradingView 警報與每日市場簡報。');
  return { success: true };
}

export function formatAlertMessage(payload, aiSummary) {
  const ts = new Date(payload.timestamp).toLocaleString('zh-TW', { hour12: false });
  let msg = `🔔 <b>TradingView 警報</b>\n`;
  msg += `📊 標的：<b>${payload.symbol || 'UNKNOWN'}</b>\n`;
  msg += `⏰ ${ts}\n`;
  if (payload.message) msg += `📝 ${payload.message.slice(0, 200)}\n`;
  if (aiSummary) msg += `\n🤖 <b>AI 簡析：</b>${aiSummary}`;
  return msg;
}

export function formatBriefingMessage(date, symbolReports) {
  const dateStr = date.toLocaleDateString('zh-TW', { weekday: 'short', month: 'numeric', day: 'numeric' });
  let msg = `📅 <b>${dateStr} 每日市場簡報</b>\n`;
  msg += `——————————————\n`;

  const MAX_LENGTH = 3800;
  for (const r of symbolReports) {
    const dirEmoji = r.direction === 'long' ? '🟢' : r.direction === 'short' ? '🔴' : '🟡';
    const block = `\n${dirEmoji} <b>${r.symbol}</b>\n` +
      (r.trend ? `趨勢：${r.trend}\n` : '') +
      (r.entry_zone ? `進場：${r.entry_zone}\n` : '') +
      (r.key_level ? `關鍵位：${r.key_level}\n` : '');
    if (msg.length + block.length > MAX_LENGTH) {
      msg += `\n...（其餘 ${symbolReports.length - symbolReports.indexOf(r)} 個標的已省略）`;
      break;
    }
    msg += block;
  }
  msg += `\n——————————————\n🤖 <i>由 chart-ai-copilot 生成</i>`;
  return msg;
}
