// profile.js — 用戶交易風格記憶

const PROFILE_KEY = 'chart_ai_profile';

const DEFAULT_PROFILE = {
  version: 1,
  updatedAt: '',
  style: {
    direction: 'both',
    timeframe: 'swingtrading',
    preferredIndicators: [],
    riskTolerance: 'medium',
  },
  aiPreferences: {
    customSystemPrompt: ''
  },
  watchlist: [],
  tradingNotes: ''
};

export async function getProfile() {
  const stored = await chrome.storage.local.get(PROFILE_KEY);
  return Object.assign({}, DEFAULT_PROFILE, stored[PROFILE_KEY] || {});
}

export async function saveProfile(profile) {
  if (!profile || typeof profile !== 'object') throw new Error('無效的 profile 格式');
  // 限制欄位長度
  const cleaned = {
    ...DEFAULT_PROFILE,
    ...profile,
    style: { ...DEFAULT_PROFILE.style, ...(profile.style || {}) },
    aiPreferences: {
      customSystemPrompt: (profile.aiPreferences?.customSystemPrompt || '').slice(0, 2000)
    },
    tradingNotes: (profile.tradingNotes || '').slice(0, 1000),
    watchlist: (profile.watchlist || []).slice(0, 30),
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [PROFILE_KEY]: cleaned });
  return cleaned;
}

export function buildProfilePromptSection(profile) {
  if (!profile || !profile.updatedAt) return '';

  const dirMap = { long: '偏向做多', short: '偏向做空', both: '多空皆可' };
  const tfMap = { scalping: '超短線', daytrading: '日內', swingtrading: '波段', investing: '長線' };
  const riskMap = { low: '保守', medium: '中等', high: '積極' };

  const s = profile.style || {};
  const parts = [];
  if (s.direction && s.direction !== 'both') parts.push(`方向偏好：${dirMap[s.direction] || s.direction}`);
  if (s.timeframe) parts.push(`交易風格：${tfMap[s.timeframe] || s.timeframe}`);
  if (s.preferredIndicators?.length) parts.push(`偏好指標：${s.preferredIndicators.join(', ')}`);
  if (s.riskTolerance) parts.push(`風險承受：${riskMap[s.riskTolerance] || s.riskTolerance}`);
  if (profile.tradingNotes) parts.push(`備注：${profile.tradingNotes.slice(0, 200)}`);

  if (!parts.length) return '';

  let section = '=== 用戶交易偏好（請參考但不強制遵守）===\n' + parts.join('\n');
  if (profile.aiPreferences?.customSystemPrompt) {
    section += '\n=== 附加指示 ===\n' + profile.aiPreferences.customSystemPrompt.slice(0, 500);
  }
  return section;
}
