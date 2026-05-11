(function () {
  'use strict';

  window.__chartAI = window.__chartAI || {};

  const DEFAULT_PROFILE = {
    version: 1,
    updatedAt: '',
    style: {
      direction: 'both',         // 'long' | 'short' | 'both'
      timeframe: 'swingtrading', // 'scalping' | 'daytrading' | 'swingtrading' | 'investing'
      preferredIndicators: [],   // 最多 10 個
      riskTolerance: 'medium',   // 'low' | 'medium' | 'high'
    },
    aiPreferences: {
      customSystemPrompt: ''     // 最多 2000 字元
    },
    watchlist: [],               // 最多 30 個 { symbol: string }
    tradingNotes: ''             // 最多 1000 字元
  };

  async function getProfile() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (resp) => {
        resolve((resp && resp.ok) ? resp.profile : Object.assign({}, DEFAULT_PROFILE));
      });
    });
  }

  async function saveProfile(profile) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', payload: { profile } }, (resp) => {
        resolve(resp);
      });
    });
  }

  function buildProfilePromptSection(profile) {
    if (!profile || !profile.updatedAt) return '';

    const directionMap = { long: '偏向做多', short: '偏向做空', both: '多空皆可' };
    const tfMap = { scalping: '超短線', daytrading: '日內', swingtrading: '波段', investing: '長線投資' };
    const riskMap = { low: '保守', medium: '中等', high: '積極' };

    const parts = [];
    const s = profile.style || {};

    if (s.direction && s.direction !== 'both') parts.push(`方向偏好：${directionMap[s.direction] || s.direction}`);
    if (s.timeframe) parts.push(`交易風格：${tfMap[s.timeframe] || s.timeframe}`);
    if (s.preferredIndicators?.length) parts.push(`偏好指標：${s.preferredIndicators.join(', ')}`);
    if (s.riskTolerance) parts.push(`風險承受：${riskMap[s.riskTolerance] || s.riskTolerance}`);
    if (profile.tradingNotes) parts.push(`交易備注：${profile.tradingNotes.slice(0, 200)}`);

    if (!parts.length) return '';

    let section = '=== 用戶交易偏好（請參考但不強制遵守）===\n' + parts.join('\n');
    if (profile.aiPreferences?.customSystemPrompt) {
      section += '\n=== 附加 AI 指示 ===\n' + profile.aiPreferences.customSystemPrompt.slice(0, 2000);
    }
    return section;
  }

  Object.assign(window.__chartAI, {
    profileMemory: { getProfile, saveProfile, buildProfilePromptSection, DEFAULT_PROFILE }
  });
})();
